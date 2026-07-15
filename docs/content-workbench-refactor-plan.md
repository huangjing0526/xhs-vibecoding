# 内容生产工作台多平台改造方案

版本：v0.1
日期：2026-07-15
项目：`xhs-vibecoding`
目标：把「小红书内容闭环工作台」改造为平台无关的内容生产工作台，首批覆盖小红书、视频号、抖音、TikTok、Facebook。

关联文档：

- `docs/xhs-workflow-prd.md`（现有工作流 PRD，小红书口径）
- `docs/xhs-product-ui-refactor-prd.md`（现有 UI 重构 PRD，小红书口径）

> 说明：上述两份文档全部以小红书为口径，本方案定型后需要同步修订。

## 1. 背景与结论

### 1.1 现状

现有管线本身已经是平台无关的：

```text
素材库 -> 选题池 -> 草稿库 -> 封面/配图/视频 -> 质检 -> 发布 -> 数据复盘
```

小红书不是作为一个「平台选项」存在的，而是以参数和规则的形式渗透进了每一层：正文长度、话题标签规则、封面比例、引流词黑名单、道库标准、prompt 人设。

### 1.2 核心结论

改造的主体工作**不是「给图文管线去小红书化」，而是「把视频线从零建起来」**。

6 个发布目标里 5 个是竖视频，而视频恰恰是当前代码库最弱的部分（见 4.3）。图文侧的去耦合工作量远小于最初预估。

## 2. 目标形态

### 2.1 发布目标（6 个）

注册表的键是**发布目标**（平台 × 形态），不是平台。因为同一平台可以有多种形态（小红书既发图文也发视频），按平台建键会在加形态时返工。

| 发布目标 | 平台 | 形态 | 语言 | 视频组 |
| --- | --- | --- | --- | --- |
| `xhs-post` | 小红书 | `short-post` | zh | — |
| `xhs-video` | 小红书 | `video` | zh | 见 2.3 |
| `channels-video` | 视频号 | `video` | zh | `zh-9:16` |
| `douyin-video` | 抖音 | `video` | zh | `zh-9:16` |
| `tiktok-video` | TikTok | `video` | en | `en-9:16` |
| `fb-reel` | Facebook | `video` | en | `en-9:16` |

**6 个目标，2 种形态，2 种语言。**

### 2.2 一稿多投

一个选题 → N 篇草稿，每篇绑定一个发布目标：

```text
选题 ─┬─ xhs-post 草稿（中文图文）
      ├─ VideoPlan(zh-9:16) ──┬─ xhs-video 草稿
      │                       ├─ channels-video 草稿
      │                       └─ douyin-video 草稿
      └─ VideoPlan(en-9:16) ──┬─ tiktok-video 草稿
                              └─ fb-reel 草稿
```

**总共只渲染 2 条片**，文案各写各的。

### 2.3 视频组的推导

`videoGroup` 由 `locale + 比例` 推出，不手写——同语言同比例才能共用一条片，写死迟早对不上：

```ts
videoGroup = `${locale}-${aspect}`   // "zh-9:16" / "en-9:16"
```

**待定参数**：`xhs-video` 用 9:16 还是 3:4。

- 选 9:16 → `videoGroup: "zh-9:16"`，和视频号/抖音三投共享一条片。
- 选 3:4 → `videoGroup: "zh-3:4"`，单独渲一条（小红书原生更吃 3:4）。

架构两者都支持，属内容决策，不阻塞开发。

## 3. 架构设计

### 3.1 目录

```text
lib/targets/
  types.ts          PublishTarget / TargetKind / Locale / FieldSpec / AspectId
  index.ts          TARGETS 注册表 + getTarget() / listByLocale() / listByVideoGroup()
  geometry.ts       3:4 / 9:16 单一来源（现散在 4 处，见 4.1）
  xhs-post.ts  xhs-video.ts  channels-video.ts
  douyin-video.ts  tiktok-video.ts  fb-reel.ts
  rules/zh.ts       中文规则包（从 qualityCheck / topicScoring / contentStrategy 抽出）
  rules/en.ts       英文规则包
  daoku/zh-xhs.ts   现有三个中文博主（从 lib/daoku.ts 迁入）
  daoku/en-*.ts     待蒸馏
```

命名用 `targets` 而非 `platforms`：键是发布目标不是平台，名字要诚实。

### 3.2 PublishTarget

```ts
type TargetId = "xhs-post" | "xhs-video" | "channels-video"
              | "douyin-video" | "tiktok-video" | "fb-reel";
type PlatformId = "xhs" | "wechat-channels" | "douyin" | "tiktok" | "facebook";
type TargetKind = "short-post" | "video";
type Locale = "zh" | "en";

interface PublishTarget {
  id: TargetId;
  platform: PlatformId;
  kind: TargetKind;
  locale: Locale;
  label: string;              // "小红书图文"
  brandColor: string;

  // 字段用「有或没有」代替一堆布尔量，直接驱动 NoteEditor 渲染
  fields: {
    title: FieldSpec | null;
    coverText: FieldSpec | null;
    body: FieldSpec | null;    // 抖音/TikTok 的标题即全部文案，body 为 null
    tags: TagSpec | null;
  };

  assets: {
    cover: AspectId | null;
    contentImage: { aspect: AspectId; max: number } | null;
    video: AspectId | null;
  };

  videoGroup?: string;         // 推导值，见 2.3
  rules: RulePack;             // 取 rules/{locale}，允许目标级覆盖
  daoku: DaokuSet | null;      // null → 跳过评分，不硬编假标准
  prompt: { persona: string; toneRules: string[] };
  metrics: { available: MetricKey[]; primary: MetricKey; fieldAliases: Record<MetricKey, string[]> };
}
```

字段可空的位置值得注意：**不是标题可空，是正文可空**。抖音/TikTok 只有一段文案，脚本装在 `videoPlan` 里。

## 4. 关键发现与风险

### 4.1 关键常量被复制了 3–4 份，且互相矛盾

| 常量 | 份数 | 位置 |
| --- | --- | --- |
| 3:4 / 1080×1440 | 4 | `lib/cover.ts:207`、`lib/imageWorkflow.ts:465`、`app/api/cover/route.tsx:62,161` |
| 飞书中文字段名 | 4 | `lib/xhsWorkflow.ts`、`lib/coverWorkflow.ts:282`、`app/api/feishu/covers/route.ts`、`scripts/*.mjs` |
| AI provider 探测 | 3 | `lib/workflowAi.ts:27`、`app/api/generate/route.ts:23`、`app/api/workflow/bootstrap/route.ts:14` |

三份 provider 探测的优先级各不相同（`/api/generate` 甚至没有 Gemini）。

`scripts/*.mjs` 是第 4 份 schema 副本，且**不共享 `lib/` 代码**（TS + `@/` 别名，需要 tsx 才能引），改字段名必须手工同步。

### 4.2 老 VibeNote 系统与新系统正面冲突

`components/` 根目录 17 个组件中 **15 个是死代码**（约 3500 行），从 `app/page.tsx` 完全不可达。仅 `CoverEditor` 和 `VibeNoteLogo` 在用。

两套系统的规则直接矛盾：

| | 老系统（`lib/ai.ts`） | 新系统（`lib/xhsWorkflow.ts`） |
| --- | --- | --- |
| 正文 | 350–450 字（`ai.ts:288`） | 硬截 200 字（`xhsWorkflow.ts:880`） |
| emoji | 自然穿插，1-2 句一个（`ai.ts:270`） | 少用感叹号、少用煽动式反问（`:515`） |

必须先删，否则 Phase 1 抽档案时不知道以哪个为准。

### 4.3 视频线基本是从零建

- `lib/videoWorkflow.ts` 只有类型和兜底数据：**没有路由、没有 AI 调用、没有持久化**
- `VideoFormat` 声明 4 种，`Root.tsx` 只有 `FlashCards` 一个 composition 真能渲染
- `planToProps`（`server.mjs:42`）把 `plan.scenes[].visual` 和 `durationHint` **整个丢掉**
- TTS 写死 `zh-CN-XiaoxiaoNeural`，时长估算 `chars / 4.5`（中文字/秒）

好消息：`Root.tsx:19-20` 已输出 1080×1920，正是五个视频目标要的比例。

### 4.4 「笔记ID」必须带目标后缀，否则复盘串台

`app/api/feishu/drafts/publish/route.ts:44` 靠 `noteId` upsert 复盘行。一稿多投后一个选题有 6 篇草稿，不带后缀会互相覆盖。

改为 `NOTE-20260715-001-douyin-video`，`scripts/gen-write.mjs:49` 的去重键同步。

### 4.5 英文规则失效是静默的

所有判别逻辑是中文正则，在英文内容上不报错，只是永远不匹配，质检会**全绿通过**：

- `lib/topicScoring.ts:23` — `SCENE_KEYWORDS = /开会|周报|面试|汇报/`
- `lib/qualityCheck.ts:75` — `CTA_BLACKLIST = /加微信|私信|扫码/`
- `lib/contentStrategy.ts:70,184` — 6 条标题结构正则 + 4 条正文结构正则

长度也全按中文字符算（`Array.from()` 数字符），「标题 8–24 字」对英文无意义。

因此 `rules/en.ts` 必须在接 TikTok **之前**写好，不能「先跑起来再说」。

### 4.6 其他

- `lib/qualityCheck.ts:75` 的引流黑名单含 `公众号`——跨平台敌意规则，per-target 黑名单是必需品不是优化。
- `estimatedSaveValue` / `saveRate` / `可收藏资产` / `AssetType` / `checkAsset` 整条链路围绕「收藏」设计，是小红书专属，需降级进 `xhs-post` 档案。
- `interactionRate = (likes+saves+comments+shares)/reads`（`xhsWorkflow.ts:378`）假设五个指标都存在，需由档案声明可用指标。
- `status: string` 无枚举，~30 处字面量比较，已有 bug：`lib/manualEntry.ts:146` 写 `待发`，其余写 `待发布`。
- `components/workflow/WorkflowDashboard.tsx` 1598 行 / 25 个 useState，是所有状态的持有者。不先拆，6 个目标的分支会全砸进这一个文件。
- `lib/topicPool.ts` / `lib/localDocs.ts` 用 `fs`/`path`，在 Cloudflare Workers 上跑不了，而 `wrangler.toml` 指向 Workers。**此矛盾现已存在，本次改造不涉及**。
- `searchFeishuRecords` 的 `filter` 参数从未被使用，每次读全表。

## 5. 数据模型变更

### 5.1 飞书

| 表 | 变更 |
| --- | --- |
| `topic` | 新增「目标清单」（`\n` 连接的 TargetId，沿用「标题候选」既有约定） |
| `draft` | 新增「发布目标」（单值） |
| `review` | 新增「发布目标」（单值） |
| `videoplan` | **新表**，键 (选题ID, 视频组)，存 VideoPlan JSON |

新增 `FEISHU_VIDEOPLAN_TABLE_ID` 环境变量，`WorkflowTableName` 从 5 扩到 6。

VideoPlan 单独建表而不是塞进选题表字段，避免重蹈 `封面配置JSON` 的覆辙。

### 5.2 类型

- `lib/xhsWorkflow.ts` → `lib/contentWorkflow.ts`
- `ContentCard` 加 `targets: TargetId[]`
- `DraftNote` 加 `target: TargetId`、`videoPlanRef?: string`
- `ReviewMetric` 加 `target: TargetId`，指标改为按档案声明可选
- 新增 `type NoteStatus`，替换 `status: string`

## 6. 分阶段计划

每阶段只引入一个新维度，可独立提交、独立验证。

### Phase 0 · 清场

删除，零风险。

删除集由 `app/**` 出发的传递可达性分析确定（非人工清点），共 24 个文件。

**第 1 趟**——当前即不可达：

- 14 个孤儿组件：`ApiSettings` `ContentPreview` `DataManagement` `HistoryDrawer` `MarkdownEditor` `MarkdownUploader` `OnboardingWizard` `PersonaSettings` `PublishTimeHint` `TagRecommender` `VibeNoteLogoAlt` `VibeNoteLogoMinimal` `ViralAnalyzer` `XHSPhonePreview`
- 4 个孤儿 lib：`lib/antiAI.ts` `lib/dataManager.ts` `lib/similarity.ts` `lib/viralDiagnostic.ts`
- 2 个无调用者路由：`app/api/generate/`（仅被死组件 `ApiSettings.tsx:112` 调用）、`app/api/free-trial/`（零调用者）

**第 2 趟**——删掉 `/api/generate` 后才暴露为死代码：

- `lib/ai.ts` `lib/personalization.ts` `lib/emotionEngine.ts` `lib/markdown.ts`

**保留**：`CoverEditor`、`ImageUploader`（被 `CoverEditor.tsx:11` 引用）、`VibeNoteLogo`。

改 `README.md`（现仍是「AI 一键生成小红书爆款笔记」）。

产出：约 −3500 行，消除 4.2 的矛盾。

> **勘误（2026-07-15，实际执行时验证）**
>
> 本文档初稿依据探针报告，有两处错误，已按代码实测修正：
>
> 1. `ImageUploader` 曾被列为孤儿。实为**活代码**，`CoverEditor.tsx:11` 引用它。删除会导致编译失败。
> 2. `lib/similarity.ts` 曾被列为「新系统 `similarityRisk` 在用，需保留」。实为**孤儿**——仅 `HistoryDrawer`（孤儿）引用。新系统的 `similarityRisk` 由 `lib/topicScoring.ts:33` 的本地函数 `calcSimilarityRisk` 计算，与 `lib/similarity.ts` 无关，属同名不同物。

### Phase 1 · 抽档案

纯重构，行为不变。`xhs-post` 档案逐字复刻现有常量。

- 新建 `lib/targets/*`
- `lib/qualityCheck.ts` 先接（纯函数、客户端、无持久化，最安全的试验田）

### Phase 2 · 加目标维度

最重的一步之一。

- `lib/xhsWorkflow.ts` → `lib/contentWorkflow.ts`，实体加 target
- `status` 收枚举，修 `manualEntry.ts:146` 的 bug
- 飞书加列，笔记ID 加后缀
- 同步 `scripts/*.mjs` 四份硬编码
- **拆 `WorkflowDashboard.tsx` 状态**

### Phase 3 · 管线参数化

- 几何收单一来源：`lib/cover.ts`、`lib/imageWorkflow.ts`、`app/api/cover/route.tsx`
- prompt 从档案组装：各 `build*Prompt`
- `limitDraftContent` 的 200 改读 `target.fields.body.range`

### Phase 4 · 中文视频线 ⭐

最重的一步。VideoPlan 基本从零建。

- 新增 `videoplan` 表 + 路由 + AI 调用
- `lib/videoWorkflow.ts` 补齐
- 修 `planToProps` 丢字段（`server.mjs:42`）
- 落地 `xhs-video` / `channels-video` / `douyin-video`
- 验证 videoGroup 共享

### Phase 5 · 英文线

- `lib/targets/rules/en.ts`
- 英文字体栈（`app/api/cover/route.tsx:30` 现从 Google Fonts 拉 Noto Sans SC；`lib/cover.ts:45` 是 PingFang SC）
- `tts.mjs` 换英文嗓音 + 词数估时长
- 落地 `tiktok-video` / `fb-reel`
- 英文道库（用户蒸馏后填入）

### Phase 6 · UI 目标化

- 目标切换
- `NoteList` 按目标显示状态（现在是「一选题一草稿一状态」）
- `NoteEditor` 按 `fields` 渲染
- `NoteInspector` 分区按档案生成（现在是写死的 8 个分区）

## 7. 决策记录

| # | 决策 | 结论 |
| --- | --- | --- |
| 1 | 平台范围 | 小红书、视频号、抖音、TikTok、Facebook（知乎/B站/公众号/朋友圈不做） |
| 2 | 内容模型 | 一稿多投 |
| 3 | 老 VibeNote 系统 | 全删 |
| 4 | 飞书表结构 | 可改，加「发布目标」列 |
| 5 | 视频复用 | 同一条片，文案分开写 |
| 6 | 海外语言 | 英文，从同一选题转写 |
| 7 | 英文道库 | 用户自行蒸馏英文对标博主 |
| 8 | Facebook 形态 | 主发 Reels → `feed-post` 形态取消 |
| 9 | 注册表键 | 平台 × 形态 |

## 8. 不做的事

- 不接入自动采集
- 不接入真实视频生成模型（继续用 Remotion + edge-tts）
- 不解决 `fs` 与 Cloudflare Workers 的既有矛盾（见 4.6）
- 不优化 `searchFeishuRecords` 全表读（见 4.6）
- 不新增未确认的业务限制、自动行为或硬编码上限
- API 响应继续遵守 `{ code, data, message }`
- 错误提示继续使用中文友好文案
