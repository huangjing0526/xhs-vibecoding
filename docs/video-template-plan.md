> 冻结 content-ops 的历史设计参考；当前整合范围与约束以 `content-ops-integration-plan.md` 为准。

# 视频模板方案

版本：v0.1
日期：2026-08-06
目标：让「生成出来的视频可用」——把已经在积累的爆款拆解结果，变成能直接驱动出片的配方。

关联文档：

- `docs/template-library-plan.md`（模板库改造方案）。**本方案是其 P2「视频」那一格的详细设计**，并向核心抽象补两块该方案未展开的配置：脚本骨架与分镜绑定。
- `docs/benchmark-and-viral-analysis-plan.md`（对标与爆款信号）——本方案消费它的产出。

## 1. 结论

### 1.1 成片「可用」的瓶颈不在模型

一条 AI 生成的短视频能不能发，按影响权重排：

| 因素 | 权重 | 现状 |
| --- | --- | --- |
| 脚本结构（钩子、骨架、收尾） | 最高 | 用户面对空白输入框自己写 |
| 分镜绑定（哪句话配哪个画面） | 高 | 图片平均分时长，与内容无关 |
| 节奏（在哪切、字幕怎么断） | 中 | 字幕已按字数分配各段配音时长，够用 |
| 画面模型画质 | 最低 | 现有模型已够用 |

好脚本 + 静态图能发；烂脚本 + 完美数字人没人看完 3 秒。**要补的是前两项，两项都是结构化配方能解决的，不是模型权重能解决的。**

### 1.2 断点：拆出来的模板没有回流到出片端

已经在积累的配方资产：

| 来源 | 产出 | 字段 |
| --- | --- | --- |
| 链接拆片 | `ScriptAnalysis` | `hook`、`structure[]`（阶段名/作用/原文）、`reusableTemplate`、`style`、`painPoint` |
| 对标拆解 | `BloggerDistillation` | `titlePatterns`、`contentPatterns`、`toneRules`、`boundaries` |
| 爆款信号 | `ViralAnalysis` | `hookSentence`、`hitSignals` |

**这些产出目前没有一个流向「一键出片」**。`app/m/t/clip` 只接收一段用户手写的脚本；桌面 `VideoStudio` 虽然吃 `bloggerDistillation`，但移动端出片链路传的是 `null`。用户拆了一堆爆款、攒了一身道库，真出片时还得从零写脚本——这是「生成不出可用视频」的直接原因。

### 1.3 明确不做：训练 / 微调模型

- 百炼与硅基流动都只提供官方权重，**API 不接受自定义权重**，训了也用不上；自部署需要的显存远超现有机器（14B 模型 12GB 起，当前是 Intel i5 + AMD 4GB）。
- 且瓶颈不在画质（见 1.1）。

「训练」应理解为**用拆片持续沉淀配方**，而不是训模型——这条路项目已经在走，只是缺最后一段回流。

## 2. 核心抽象

### 2.1 视频模板 = 现有 `TemplateDefinition` + 三块新配置

沿用 `lib/templates/types.ts` 已确立的原则：**加模板 = 加一份配置，不改 UI 代码**。视频模板在现有结构上追加：

```ts
// lib/templates/types.ts 追加分支，穷尽 switch 会强制补引擎实现
export type TemplateEngineConfig =
  | { engine: "canvas"; templateType: ContentImageTemplateType }
  | { engine: "video"; skeleton: ScriptSkeleton; shots: ShotBinding[]; videoDefaults: VideoDefaults };
```

#### 脚本骨架

```ts
export interface ScriptStage {
  id: string;            // "hook" | "pain" | "method" | "cta"
  name: string;          // 「钩子」，UI 上展示
  purpose: string;       // 这一段要达成什么，同时作为写作指令的一部分
  /** 有 AI 时给模型的写作要求 */
  instruction: string;
  /** 无 AI 时的兜底：{{变量}} 直接替换，与 createFallbackVideoPlan 同款降级 */
  fallbackText: string;
  /** 这一段大约几秒。决定分镜时长与费用，不是硬约束 */
  targetSec: number;
}

export interface ScriptSkeleton {
  stages: ScriptStage[];
  /** 整条目标时长，用于校验各段之和是否离谱 */
  targetSec: number;
}
```

#### 分镜绑定

```ts
export type ShotSource =
  | { kind: "avatar" }                                    // 人物出镜，按秒付费
  | { kind: "userImage"; slot: string }                   // 用户上传的某组图，slot 对应表单字段
  | { kind: "generated"; promptTemplate: string }         // 图生视频，prompt 由模板给
  | { kind: "textCard" };                                 // 纯文字板，零成本

export interface ShotBinding {
  /** 绑到骨架里的哪一段 */
  stageId: string;
  source: ShotSource;
}
```

**关键点：`ScriptStage.targetSec` + `ShotBinding.stageId` 让每个分镜的时长由脚本结构决定，而不是把图片平均分给整条时长。** 这直接对接已实现的 `ClipReel` 每屏显式 `durationSec`——渲染层不用改。

#### 出片默认参数

```ts
export interface VideoDefaults {
  voice: string;
  resolution: "480P" | "720P";
  /** 默认开场出镜秒数，0 = 不用数字人 */
  openingSec: number;
  /** 图生视频的负向提示，稳定产出用 */
  negativePrompt?: string;
}
```

同一句 prompt 模板反复用，产出一致性远高于让用户自由发挥——这是模板对画面层的主要价值。

### 2.2 脚本生成

新增 `lib/generation/videoScript.ts`，接进现有 `runEngine` 的 switch：

```
values（用户填的变量）+ skeleton + 可选道库
   → 有 AI：一次 generateWorkflowJson，按 stage 逐段产出
   → 无 AI：fallbackText 变量替换
   → VideoScript { stages: [{ stageId, text, estimatedSec }] }
```

道库注入是可选增强：把绑定博主的 `toneRules` / `contentPatterns` 作为风格约束拼进 prompt。**注意 `boundaries` 字段要作为负向约束传入**，否则生成的内容可能越过该账号的人设边界。

无 AI 时必须仍能出一份可编辑的初稿——与 `createFallbackVideoPlan`、封面/配图的降级策略保持一致，不能在这里变成硬失败。

### 2.3 关键架构建议：三条产线收敛成一条

当前渲染服务有三个并列端点，但它们其实是**同一条产线的三种配置**：

| 端点 | 本质 |
| --- | --- |
| `/local` | 所有分镜都是 `userImage` |
| `/avatar`（openingSec > 0） | 第一镜是 `avatar`，其余 `userImage` |
| `/product` | 所有分镜都是 `generated` |

建议收敛成单一入口 `POST /compose`，接受一个 shot 列表：

```jsonc
{
  "shots": [
    { "source": {"kind":"avatar"}, "text": "开场那句", "sec": 5 },
    { "source": {"kind":"generated","prompt":"..."}, "text": "第二段", "sec": 8 },
    { "source": {"kind":"userImage","image":"data:..."}, "text": "第三段", "sec": 10 },
    { "source": {"kind":"textCard"}, "text": "收尾", "sec": 4 }
  ],
  "voice": "zh-CN-XiaoxiaoNeural",
  "resolution": "480P"
}
```

收益：

1. **三个 pipeline 收敛成一个**，各自的分段/配音/拼接逻辑不再三处维护；
2. 模板可以**自由组合**分镜类型（开场真人 + 中段生成画面 + 结尾文字板），这是现在三选一做不到的；
3. **费用按 shot 类型累加，天然可预估**，也为公开跑时的预扣费提供准确依据。

代价：一次中等规模重构。现有三个端点保留为 `/compose` 的薄封装，前端不受影响。

**这是本方案里唯一需要动已实现代码的地方，也是最值得做的一处。**

### 2.4 从拆片沉淀模板

`ScriptAnalysis.structure[]` 的 `{ stage, purpose, text }` 与 `ScriptStage` 的 `{ name, purpose, fallbackText }` 天然对应。所以：

```
拆一条爆款 → 得到 structure[] → 一键「存为我的模板」
   → 自动填充 stages（text 作为 fallbackText 的初稿）
   → 用户改改变量名和分镜绑定 → 下次出片直接选
```

这一步把**拆片 → 道库 → 模板 → 出片**闭成环，是整个方案的价值所在。

## 3. 存储

| 类型 | 存哪 | 说明 |
| --- | --- | --- |
| 内置模板 | 代码常量，与 `AI_CODING_PACK` 同构 | 随版本发布 |
| 用户模板 | 飞书新表「视频模板」 | 与项目其余数据一致 |

建表沿用 `scripts/blogger/ensure-tables.mjs` 的幂等模式（未配环境变量则建表并打印 table_id，缺列只补不改）。

⚠ 该脚本头部记录的坑必须遵守：**字段清单在 `.mjs` 与 lib 层 TS 是两份手抄**，漏一列会导致写回被飞书整条拒绝，而 `tsc` 和 `next build` 都抓不到。新增表时两边必须同步改。

## 4. 入口与交互

出片页（`app/m/t/clip`）顶部加一层「选模板」：

```
选模板 → 表单只填变量（我的产品/痛点/受众）
      → 生成脚本初稿（分段展示，逐段可编辑）
      → 分镜面板：每段显示「用什么画面 · 几秒 · 费用」，可改类型
      → 出片
```

不选模板时保持现在的自由输入，**不强制走模板**——与模板库方案「模板直达、不强制长链路」的原则一致。

分镜面板要显式展示每段的费用来源（哪几秒在烧钱），这既是成本透明，也是引导用户把 `avatar` 只用在开场。

## 5. 成本模型

按 shot 类型累加，模板默认配置直接决定单条成本：

| shot 类型 | 单价 |
| --- | --- |
| `avatar` | 0.5 元/秒（480P） |
| `generated` | 0.1 元/秒（百炼 flash，5 秒/段） |
| `userImage` / `textCard` | 0（只耗本机渲染，实测 1 秒成片 ≈ 1.18 秒 CPU） |

内置模板一律以「开场 5 秒 avatar + 其余零成本」为默认配置，单条约 ¥2.5。

## 6. 分期

| 阶段 | 内容 | 可验证点 |
| --- | --- | --- |
| **P0 骨架直出脚本** | `ScriptSkeleton` 类型 + `videoScript` 引擎 + 2–3 个内置模板 + 出片页选模板 | 选模板填变量 → 出一份可编辑的分段脚本，渲染链路不动 |
| **P1 分镜绑定 + `/compose`** | `ShotBinding` 落地，三端点收敛成一条产线 | 一条视频里混用真人开场 + 生成画面 + 文字板 |
| **P2 沉淀闭环** | 拆片结果一键存为模板 + 飞书「视频模板」表 | 拆一条爆款 → 存模板 → 用它出片 |
| **P3 视觉规格模板化** | `ClipReel` 的字幕样式/配色/转场收进模板 | 同一脚本换模板出两种视觉风格 |

P0 刻意不碰渲染层：先验证「模板能不能产出好脚本」这个最高权重的假设，验证不成立时后面几期都不用做。

## 7. 待定项

不阻塞 P0，但开工前需定：

1. **首批内置模板做哪几个垂类**——需要按实际发布方向定（如：误区纠正 / 产品测评 / 教程拆解 / 探店）。这决定 `ScriptStage` 的骨架长什么样，是 P0 的直接输入。
2. **脚本生成走哪个模型**——现有 `workflowAi` 按环境变量探测，够用；若脚本质量不达标，可能需要为它单独指定更强的模型（`generateWorkflowJson` 已支持 `forceProvider`）。
3. **用户模板是否跨用户共享**——与「公开给陌生用户跑」那条线耦合（额度、权限），本方案先按单用户设计。

## 8. 与「公开跑」的关系

本方案与成本闸门（额度、邀请码、托管迁移）**正交**：模板提升的是单条产出质量，闸门解决的是谁能花多少钱。

唯一交叉点是 2.3 的 `/compose`：shot 列表让费用在提交前就能精确算出，公开跑时的**预扣费**才有准确依据。所以若两条线都要做，`/compose` 应排在额度机制之前。
