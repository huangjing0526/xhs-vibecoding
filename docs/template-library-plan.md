> 冻结 content-ops 的历史设计参考；当前整合范围与约束以 `content-ops-integration-plan.md` 为准。

# 模板库改造方案

版本：v0.1
日期：2026-08-05
目标：把工作台从「单一垂类的内容管线」改造为「模板驱动的产出工具」，用户选一个模板、填几个参数就能出成品。首批模板：模特图、视频背景图、穿搭视频、探店视频。

关联文档：

- `docs/content-workbench-refactor-plan.md`（多平台改造方案，本方案与之正交：那份解决「投哪里」，本方案解决「产什么」）
- `docs/research/social-content-platforms-benchmark-2026-07.md`（其中 P2「AI 生成平台桥接」被本方案提到 P0）

## 1. 结论

### 1.1 现状缺口

代码里已有「模板」一词，但只存在于两个渲染环节，且都是信息图/口播路子：

| 位置 | 现有模板 | 产出方式 |
| --- | --- | --- |
| `lib/imageWorkflow.ts` `CONTENT_IMAGE_TEMPLATES` | flowchart / architecture / checklist / timeline / comparison / steps | canvas 代码绘制 |
| `lib/videoWorkflow.ts` `VideoFormat` | talking_head / flash_cards / screen_recording / story | Remotion 图文快闪 + edge-tts |

这两者是**排版样式**，而目标模板是**产出配方**——包含用什么输入、调哪个引擎、出什么规格、套哪套 prompt。首批四个模板对能力的要求：

| 模板 | 需要的引擎 | 现状 |
| --- | --- | --- |
| 模特图 | 图生图（服装平铺 → 模特上身） | 无 AI 生图接入 |
| 视频背景图 | 文生图 + 比例适配 | 同上 |
| 穿搭视频 | 脚本 + 素材组装 | 脚本层可复用，成片层缺 |
| 探店视频 | 拍摄脚本 + 分镜 + 组装 | 同上 |

### 1.2 三条已定决策

1. **接入 AI 生图/生视频模型**——模特图、背景图代码画不出，必须接模型。
2. **模板直达入口**——选模板 → 填参数 → 出成品，不强制走素材库/选题池长链路。
3. **现有 AI Coding 垂类降级为模板包之一**——`ContentLane`、道库评分、术语库从全局硬编码收进 `ai-coding` 包。

## 2. 核心抽象

### 2.1 模板定义

新增 `lib/templates/types.ts`。一个模板就是一份声明式配置，**加模板 = 加一份配置，不改 UI 代码**——这是「快速接入不同模板」成立的前提。

```ts
export type EngineId = "t2i" | "i2i" | "canvas" | "remotion" | "t2v" | "script-only";
export type OutputKind = "image" | "video" | "script";

export interface TemplateInputField {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "image" | "images" | "number";
  required?: boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  hint?: string;
}

export interface TemplateDefinition {
  id: string;                     // "model-shot"
  packId: string;                 // "ecommerce"
  name: string;                   // "模特图"
  description: string;            // 一句话说明产出什么
  previewUrl: string;             // 画廊卡片预览
  outputKind: OutputKind;
  engine: EngineId;
  aspect: AspectId;
  inputs: TemplateInputField[];   // 驱动表单自动渲染
  promptTemplate: string;         // 插值 inputs 的引擎 prompt
  outputCount?: number;           // 一次出几张，默认 1
}
```

### 2.2 引擎层

新增 `lib/generation/`，与 `lib/workflowAi.ts` 同构——按环境变量探测服务商、首个命中者生效、无 Key 降级 mock 而非报错：

```ts
// lib/generation/index.ts
export async function runEngine(
  template: TemplateDefinition,
  inputs: Record<string, unknown>
): Promise<GeneratedAsset[]>
```

| 引擎 | 实现 | 状态 |
| --- | --- | --- |
| `t2i` / `i2i` | `lib/generation/imageGen.ts`，新建 | 待接 |
| `canvas` | 转调现有 `lib/imageWorkflow.ts` | 已有 |
| `remotion` | 转调现有 `services/video-renderer` | 已有 |
| `t2v` | `lib/generation/videoGen.ts`，新建 | Phase 2 |
| `script-only` | 转调 `lib/workflowAi.ts` 出脚本 | 已有 |

#### 2.2.1 生图服务商

接入 5 家：Seedream（字节/火山方舟）、即梦（字节）、可灵（快手）、gpt-image（OpenAI）、Nano Banana（Google）。

**接口必须是异步任务制。** 可灵是提交任务 → 轮询 taskId 的形态，与 Seedream / Nano Banana 的同步返回不同。统一成任务模型、同步服务商包一层「立即完成的任务」，比反过来让异步服务商假装同步要干净；否则前端结果页在 P1 接可灵时必然返工。

```ts
// lib/generation/imageGen.ts
export type ImageProviderId = "seedream" | "jimeng" | "kling" | "gpt-image" | "nano-banana";

export interface ImageJobRequest {
  prompt: string;
  refImages?: string[];      // i2i 的参考图
  aspect: AspectId;
  count: number;
}

export interface ImageJob {
  jobId: string;
  provider: ImageProviderId;
  status: "pending" | "running" | "done" | "error";
  assets?: GeneratedAsset[];
  error?: string;
}

export interface ImageProvider {
  id: ImageProviderId;
  label: string;
  supports: { t2i: boolean; i2i: boolean };
  isConfigured(): boolean;                        // 按各自 env 判定
  submit(req: ImageJobRequest): Promise<ImageJob>;
  poll?(jobId: string): Promise<ImageJob>;        // 同步服务商不实现
}
```

**服务商选择策略**：不沿用 `lib/workflowAi.ts` 的「首个命中者生效」。5 家能力与画风差异大，全局探测会绑架模板——模特图适合 Seedream、背景图适合 Nano Banana，不该由 env 顺序决定。改为三级：

1. 模板声明有序候选 `preferredProviders: ImageProviderId[]`
2. 运行时取第一个 `isConfigured()` 且支持所需 `t2i`/`i2i` 的
3. 用户可在参数表单里显式覆盖

全部未配置时降级 mock，与现有 AI 层一致——不静默换家。

各家鉴权形态不同（火山引擎签名、可灵 JWT、Google API Key），差异全部收在各自 provider 实现内，不外泄到引擎层。

### 2.3 模板包

```
lib/templates/
  types.ts          抽象定义
  registry.ts       包与模板注册表
  packs/
    ecommerce.ts    模特图、视频背景图
    lifestyle.ts    穿搭视频、探店视频
    ai-coding.ts    现有 6 个信息图 + 4 个视频格式迁移
```

包是用户可见的分组维度（画廊按包分栏），也是垂类知识的收纳边界。

### 2.4 真人参考图与合规提示

模特图允许上传真人参考图做换装——效果显著优于纯 prompt 描述模特，代价是引入肖像权责任。模板定义增加一个标记，只有声明了它的模板才走这套提示：

```ts
export interface TemplateDefinition {
  // ...
  /** 参考图可能含真人肖像，需在上传前出示合规提示。 */
  portraitConsent?: boolean;
}
```

三个提示位：

| 位置 | 内容 |
| --- | --- |
| 上传控件旁 | 常驻一行说明：参考图须为本人或已获授权的肖像 |
| 首次上传前 | 一次性确认勾选，记在 localStorage，不每次打断 |
| 结果页 / 下载文件 | 标注 AI 生成 |

提示文案要点：确保已获肖像权人授权、不要上传公众人物或他人照片、产物为 AI 生成不得用于误导性用途、**参考图会被留存以便重新生成**。

**只做提示，不做拦截**——不加人脸检测、不加自动拒绝。

**参考图留存**：留存，以便换 prompt / 换服务商重新生成时不必重传。这带来两个后果需在实现时兑现：

- 留存事实必须写进上传前的提示文案（已列入上文要点），不能默默存下肖像数据
- 留存位置不能是 `/out` 那种对外开放的静态目录——产物可以公开访问，真人参考图不行。这使产物存储（待定项 2）必须区分「可公开的产物」与「私有的参考图」两类，不能用同一个桶同一套权限

## 3. 入口与交互

`WorkbenchShell` 的 `WorkbenchAreaId` 新增 `templates`，置于 `leadItems` 顶部（在「工作台」之上），成为新用户的默认落点。

```
模板画廊  →  参数表单  →  生成中  →  结果页
（按包分栏）  （inputs   （进度/  （预览、下载、
              自动渲染）   可取消）   重生成、存回素材库）
```

结果页的「存回素材库」是模板直达与现有管线的唯一衔接点，可选而非强制。

新增接口，遵循 `{ code, data, message }`：

- `GET  /api/templates` — 返回注册表（供画廊渲染）
- `POST /api/templates/generate` — 执行模板，返回产物

## 4. 分期

| 阶段 | 内容 | 产出可验证点 |
| --- | --- | --- |
| **P0 框架** | 抽象层 + 注册表 + 画廊 UI + 表单自动渲染 + 把现有 6 个信息图模板迁进 `ai-coding` 包 | 画廊能跑通「选模板 → 出图」，零新引擎 |
| **P1 生图** | 异步任务模型 + 5 家 provider + 模特图（含肖像合规提示）+ 视频背景图 | 上传服装图出模特上身图 |
| **P2 视频** | 穿搭视频 + 探店视频（脚本 + 分镜 + 素材组装） | 出可直接发布的竖版成片 |
| **P3 解耦** | `ContentLane`、道库评分、术语库从全局收进 `ai-coding` 包 | 删掉一个包不影响其他包 |

P0 先跑通框架再接引擎，是为了让「加模板」的成本在接第一个真实引擎前就被验证——如果加模板还要改 UI，整个方案的价值就没了。

## 5. 待定项

已定：生图服务商 5 家（见 2.2.1）、真人参考图换装 + 合规提示 + 参考图留存（见 2.4）。

以下不阻塞 P0 开工，但 P1 前需定：

1. **产物与参考图存储**——现在 canvas 产物走 `/out` 静态目录，生图产物量大且需持久化。因 2.4 决定留存真人参考图，此项须拆成公开产物与私有参考图两类权限，不能共用一套。
2. **比例扩展**——`lib/targets.ts` 的 `AspectId` 目前只有 `3:4`，需补 `9:16`、`1:1`、`16:9`。
