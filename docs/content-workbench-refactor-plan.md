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

### 3.1 目录（终态）

```text
lib/targets/
  types.ts          PublishTarget / TargetKind / Locale / FieldSpec / AspectId
  index.ts          TARGETS 注册表 + getTarget() / listByLocale() / listByVideoGroup()
  geometry.ts       比例单一来源
  xhs-post.ts  xhs-video.ts  channels-video.ts
  douyin-video.ts  tiktok-video.ts  fb-reel.ts
  rules/zh.ts       中文规则包（从 qualityCheck / topicScoring / contentStrategy 抽出）
  rules/en.ts       英文规则包
  daoku/zh-xhs.ts   现有三个中文博主（从 lib/daoku.ts 迁入）
  daoku/en-*.ts     待蒸馏
```

命名用 `targets` 而非 `platforms`：键是发布目标不是平台，名字要诚实。

**这是终态，不是起点。** 上述结构随各阶段的消费方逐步长出，`lib/targets.ts` 到达一定体积后再拆成目录。Phase 1 实际落地的是单文件 37 行（见 6.Phase 1）。

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

> 本节记录 2026-07-15 初次分析时的状态；行号为当时值，部分已被 Phase 0/1 改变，见「现状」列。

| 常量 | 当时份数 | 当时位置 | 现状 |
| --- | --- | --- | --- |
| 3:4 / 1080×1440 | 4 | `lib/cover.ts`、`lib/imageWorkflow.ts`、`app/api/cover/route.tsx`（satori 调用与 `CoverComponent` 各一份） | **已收口**至 `lib/targets.ts`（Phase 1） |
| 飞书中文字段名 | 4 | `lib/xhsWorkflow.ts`、`lib/coverWorkflow.ts`、`app/api/feishu/covers/route.ts`、`scripts/*.mjs` | 未动，Phase 2 处理 |
| AI provider 探测 | 3 | `lib/workflowAi.ts:27`、`app/api/generate/route.ts`、`app/api/workflow/bootstrap/route.ts:14` | 降为 **2 份**——`/api/generate` 已随老系统删除（Phase 0）；`bootstrap` 的副本仍在 |

三份 provider 探测的优先级当时各不相同（`/api/generate` 甚至没有 Gemini）。现存两份均为 gemini 优先，但仍是两份，`bootstrap` 的 `getAIProvider()` 需与 `lib/workflowAi.ts` 手工保持同步。

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
- ~~`status: string` 无枚举，字面量散落各处，已有 bug：`lib/manualEntry.ts:146` 写 `待发`，其余写 `待发布`~~ → **已收口**（Phase 2a）：42 处字面量收进 `MATERIAL_STATUS` / `TOPIC_STATUS` / `DRAFT_STATUS`，bug 已修。类型仍是 `string`，理由见 Phase 2a。
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

### Phase 1 · 抽档案 ✅

纯重构，行为不变。

**计划变更（执行时）**：原定「`qualityCheck.ts` 先接，最安全的试验田」，实际改为先接几何（`lib/cover.ts`、`lib/imageWorkflow.ts`、`app/api/cover/route.tsx`、`CoverEditor`、`CoverStudio`）。质检接入顺延至 Phase 2。

> **勘误（2026-07-15）**：改序的理由是错的。当时依据「`git status` 有未提交改动」推断出「并发会话正在扩写 `qualityCheck.ts`」，并据此重排 Phase 1、推迟 Phase 2。该推断从未被验证，且是错的——那批改动的文件 mtime 停在 2026-06-24，是搁置三周的自有 WIP（已提交为 `812f9a1`），无任何并发写入。一次 `stat` 即可证伪。
>
> 教训：把未验证的推断当事实反复引用，比一次判断失误代价更大——它会污染其后所有基于它的决策。涉及「谁在改这个文件」时，用 mtime / worktree / reflog 求证，不要从 `git status` 有输出就外推。
>
> 先做几何这个结果本身仍然正确（几何本就该在 prompt 收口之前完成），只是当时是被一个幻觉推着做对的。

**已落地**：

- 新建 `lib/targets.ts`（37 行单文件）：`assetPx(targetId, kind)` / `assetRatioCss(targetId, kind)` / `DEFAULT_TARGET_ID`
- 5 处调用点接入，几何硬编码在 `lib/targets.ts` 之外归零
- 验证：`tsc` 通过、`next build` 通过、真机实测预览框 0.7500、canvas 1080×1440

**确立的两条纪律**（`/simplify` 审查后）：

1. **只把确有消费方读取的东西放进档案。** 初版曾加入 `9:16`、`getTarget()`、`TARGET_ORDER`、`platform`/`kind`/`locale`、`assets.video`，全部零读者，已删。尤其 `9:16`：真正的 1080×1920 在 `services/video-renderer/src/Root.tsx`，该包无法 import `@/lib`，故这行不是单一来源，而是与本体无联系的又一份副本——正是本次改造要消灭的东西。档案声明了而硬编码仍生效的字段，只是多造一份副本。
2. **渲染叶子不认识发布目标。** `generateCoverDataUrl` / `renderContentImageDataUrl` 接收 `px` 参数，不反向 import 注册表。canvas 工具不该知道「发布目标」存在。

**放弃的做法**：比例一度用 `ASPECTS[].className` 存 Tailwind 类，需把 `lib/**` 加入 `tailwind.config.ts` 的 content glob，否则 JIT 扫不到、预览框静默塌成 0 高（tsc 与 build 均不报错）。改为 `style={{ aspectRatio }}` 由 px 推导后，该配置改动整个撤销，漂移在结构上不可能发生。

**已知未覆盖**：`lib/cover.ts` / `lib/imageWorkflow.ts` 的 `draw*` 中约 45 个绝对坐标仍以 1080 宽为基准，Phase 3 处理。`lib/targets.ts` 只覆盖画布宽高，不覆盖布局坐标。

### Phase 2 · 加目标维度

最重的一步之一，拆成 5 小步，每步可独立提交、独立验证。

#### Phase 2a · status 收口 ✅

42 处字面量（11 个文件）→ `MATERIAL_STATUS` / `TOPIC_STATUS` / `DRAFT_STATUS`（`lib/xhsWorkflow.ts`）。修掉 `manualEntry.ts:146` 写 `待发` 的 bug——手工建的草稿从此不会被 `sync?status=待发布` 漏掉。

**类型仍是 `string`，不收成封闭联合。** 飞书表可由人直接编辑，`normalize*` 读到的值不受代码约束。更根本的是 `DraftNote` 一个类型服务两个方向：`normalizeDraftNote` 从人填的单元格构造它（必须接受任意字符串），`mapDraftToFeishuFields` 消费它写回（才需要封闭）。不把 5 个实体各拆成读/写变体就封不了写侧——为静态防住三个 `createManual*` 工厂里的一类笔误，代价不成比例。常量只保证代码自己写入与比较时用同一份值。

`TOPIC_STATUS` 只有一个成员是诚实的：代码只做 material→`已提炼`、draft→`已发布` 两种流转，从不把选题移出 `待写`。这反映状态机的真实空缺，不是常量写漏。

有意保留的字面量（不是漏网）：`topicPool.ts:22` 是 markdown 章节关键词、`NoteList.tsx` 的 `NoteStatus` 是 UI 派生概念、`WorkflowDashboard:481` 与 `NoteInspector:226` 是展示文案。

`scripts/daoku/gen-write.mjs` 无法引 TS 常量（.mjs，且要能脱离 dev server 独立跑），已就地建常量并在文件头写明手工同步义务。

#### Phase 2b · 拆 `WorkflowDashboard.tsx` 状态

纯前端重构，不改数据模型。必须在 2c 之前——否则 6 个目标的分支会全砸进这 1598 行 / 25 个 useState。

#### Phase 2c · 加 target 维度 ✅

实体加 target、飞书加列、笔记ID 加目标后缀（见 4.4）。

- `ContentCard.targets: string[]`（飞书「目标清单」\n 连接）、`DraftNote.target` / `ReviewMetric.target: string`（飞书「发布目标」）。
- `makeNoteId(date, topicId, target)` = `NOTE-${date}-${topicId后3}-${target}`，集中格式。复盘从草稿继承 target 与 noteId，读写同键。
- 飞书三列由脚本幂等建好（连同修复 `812f9a1` 遗留的 28 个缺失列——见下「飞书 schema 修复」）。空表，noteId 改格式零迁移。
- 一稿多投的循环点在 `drafts/route.ts`：现每条选题投 `targets[0]`，Phase 4 改为遍历 `card.targets` 各出一篇，签名已就位。

**类型是 `string` 不是 `TargetId`，与 2a 的 status 同一策略**：飞书可人工编辑，`parseTarget(s)` 只兜「空」不兜「未知」——代码尚未注册的目标（Phase 4 前手填的 `douyin-video`）原样保留，降级会在写回时静默覆盖人填的值。已验证多目标清单含未注册值可写入飞书。

**审计修掉的半成品**：初版把带后缀的 noteId 只接在兜底路径，AI 主路径 `normalizeGeneratedDraft` 仍 `unknownToText(draft.noteId, fallback.noteId)`——AI 返回的无后缀 noteId 覆盖了它，而 `buildDraftPrompt` 还明确让 AI 输出 noteId。这样一稿多投时同选题不同目标喂给 AI 的 prompt 相同 → 返回同一 noteId → 复盘照样串台，2c 的目的在主路径落空。已改为 `noteId: fallback.noteId`（与 `target` 同样「不接受 AI 覆盖」），并从 prompt schema 删掉 noteId。已实证：AI 返回无后缀 id 时两目标仍保留各自带后缀的 noteId。

**留给后续清理（记录以免遗忘）**：

- `covers/route.ts` 的 `assetAspect(DEFAULT_TARGET_ID, "cover")` 硬编缺省目标，忽略了记录实际的 target。今天对（单目标同比例），第二个目标带不同封面比例时会选错。
- `covers/route.ts` 的 `normalizeDraftFromRecord` 是 `normalizeDraftNote` 的手搓子集，现在是第二个 target 归一点，需手工保持同步——宜合并。
- `RewriteStudio.tsx` 的 `NOTE-${Date.now()}` 未走 `makeNoteId`（唯一但无后缀；因单条草稿无 fan-out，不串台）。
- `makeNoteId` 的 `topicId.slice(-3)`：两条不同选题若同日期同目标且尾 3 字符相同仍会撞（既有问题，2c 未引入也未解决）。

#### Phase 2d · 同步 `scripts/*.mjs` ✅

改动集中在 `gen-pull.mjs`（给 Claude 的生成指引），因为 scripts 的写入是字段透传的——`gen-write` 把 Claude 产出的 `fields` 原样写飞书，不硬编字段名，所以新字段随 JSON 自动带上，无需改写入代码。

- **topic 指引** 加「目标清单」产出字段：每条选题带打算投的目标（\n 连接），取值对齐 `lib/targets.ts` 的 TargetId，当前填 xhs-post。
- **draft 阶段** 拉取的 topic 带上「目标清单」（否则 Claude 不知道投哪），guide 加「每篇一个目标」与「笔记ID格式 = `NOTE-<日期>-<选题ID后3>-<发布目标>`，对齐 `makeNoteId`」。

**去重键对 target 天然正确，无需改**：draft 去重键是完整 noteId（含目标后缀），故 Phase 4 同选题的不同目标草稿不会误判重复；topic 去重是内容签名（不含目标），同一选题投多个目标仍算一条。`dedup-topics` / `write-scores` / `pull-topics` 不涉及 target。

noteId 格式是 `makeNoteId` 的第二份定义（.mjs 引不了 TS）。`gen-write.mjs` 头部的「字段列名与状态值均以 lib/xhsWorkflow.ts 为单一来源、必须手工同步」已覆盖这一约束。

已验证：脚本独立解析通过，gen-pull 产出的 guide 含目标指引，带目标的 topic/draft JSON 走 gen-write dry-run 去重正确、字段透传。

#### Phase 2e · `lib/xhsWorkflow.ts` → `lib/contentWorkflow.ts` — ⏸ 推迟到 Phase 3 之后

**故意放最后，且从 Phase 2 尾部再往后挪。** 改名只有在文件实质配得上新名字时才诚实。目前 prompt 人设、道库、`limitDraftContent` 的 200 字上限都还是小红书专属——那些在 Phase 3（管线参数化 / 去小红书化）才处理。在那之前改名，是给一个实质仍 100% 小红书的文件挂「通用内容」招牌，与本方案反复强调的「名字不要比实质大」自相矛盾。故 2e 挪到 Phase 3 完成后执行。

**Phase 2 数据模型部分（2a–2d）到此完整闭环**：status 收口、god component 拆分、target 维度落库、脚本管线同步，均已提交并各自端到端验证。

#### 飞书 schema 修复（2c 期间发现并处理）

做 2c 时审计「代码写入的字段 vs 飞书实际列」，发现 **28 个字段代码要写、飞书表里没有**，全部来自 `812f9a1`（搁置三周的 WIP）新增的策略字段与质检字段。实测飞书对未知字段是 **拒绝整条写入**（`FieldNameNotFound`，非忽略），所以 `812f9a1` 之后只要 `writeBack=true`，生成选题/草稿/发布都会失败——它从未对真实飞书跑过，一直没暴露。

- 选题池缺 10、草稿库缺 12、复盘表缺 6。
- 用幂等脚本补齐（先 dry-run，只建缺的，不碰现有列），全部建「多行文本」/「数字」——**沿用现有约定：枚举值也用文本存**（`偏爆偏哑` 等既有列即如此）。建「单选」会在写入未预设选项时踩同类错误。
- 加上 2c 的 3 个 target 列，共补 31 列。三表各写一条字段齐全记录并删除，端到端验证通过。
- 教训：`tsc` 和 `next build` 都发现不了「写入不存在的飞书列」——这类只有真跑写入或对比表结构能抓到。提交 `812f9a1` 时只看了代码，漏了这一层。

### Phase 3 · 管线参数化

**3a 已完成**（提前到 Phase 2 之前执行，见上方勘误）：

- 几何收单一来源 → Phase 1
- `buildCoverPlanPrompt` / `buildContentImagePrompt` 的比例由路由解析后传入，不再是 prompt 里的字面量
- prompt 与代码各写一份的上限收成常量：`COVER_TITLE_MAX_CHARS`、`NODE_TEXT_MAX_CHARS`、`MAX_CALLOUTS`

**3a 确立的界线**：

> 推导那些必须与代码保持同步的机器事实（比例、上限），不要参数化人早晚要整段重写的散文（人设）。

曾把 prompt 里的「小红书」抽成 `platformLabel(target)` 变量，已撤销。那句话是 `放在${platform}笔记正文内，帮助读者收藏和理解`——换抖音即为「放在抖音笔记正文内…帮助读者收藏」，而抖音没有笔记正文，「收藏」又是本文档 4.6 已标记为小红书专属、待降级的指标。整句在第二个目标落地时必须重写，抽出的变量随之作废。代价不在那几行，而在于让后续读者误以为 prompt 已经目标化——实际只有平台名这一个碎片动了，且是其中最不重要的部分。

**3b 待办**：

- 其余 prompt 仍硬编码「小红书」：`lib/videoWorkflow.ts:150`、`lib/daoku.ts:85`、`lib/clueIntake.ts:133`
- `limitDraftContent` 的 200 改读目标档案（依赖 Phase 2 的字段约束落地）
- 账号定位「给产品经理、独立开发者、AI Coding 新手看的真实 AI 编程实战复盘。」共 3 份（`xhsWorkflow.ts` ×2、`coverWorkflow.ts` ×1）。属账号级配置而非目标级配置，不应进目标档案，需要单独的归宿。

### Phase 3 附带发现的 bug（prompt 与代码各说各话）

根因不是几个孤立数字，而是**缺一层契约**：prompt、兜底构造、normalize、渲染器四层各自定义上限，无单一来源。

**已修**：`MAX_CALLOUTS` 3 → 2。兜底构造与渲染器早已按 2 办事（页脚把 callouts 拼成一段话、`wrapText(..., 2)` 折两行，第 3 条既画不出也无别的消费方——`/api/feishu/images` 的 `writeBack` 恒为 false），只有 prompt 与 normalize 写着 3。对齐后模型不再白写第 3 条，渲染像素零变化（已验证页脚文字逐字节相同）。

**未修**（修复会改变输出，属 Phase 3b）：

| 位置 | prompt 告诉模型 | 代码实际执行 |
| --- | --- | --- |
| `lib/coverWorkflow.ts:118` ↔ `:273` | 封面标题 ≤ 24 字 | **AI 路径完全不执行**——`coverPlanToCoverConfig` 原样透传 `plan.title`；`trimCoverTitle` 只在兜底路径生效 |
| `app/api/feishu/covers/route.ts:103` | — | `{ ...fallbackPlan, ...aiResult.result }` 裸展开，对模型输出零校验。对比 images 路径有 `normalizeContentImagePlan`。`CoverPlan` 只是 TS 接口，`generateWorkflowJson<CoverPlan>` 是类型断言而非校验 |
| `lib/imageWorkflow.ts:223` ↔ `:394` | 节点标题 ≤ 18 字 | `normalizeBlocks` 截到 **22** |
| `lib/imageWorkflow.ts` `:411` ↔ 各 `draw*` | 未提及 block 数 | normalize 留 6，`drawSteps` 只画 **4**、`drawFlowchart`/`drawTimeline` 画 5 |
| `lib/imageWorkflow.ts:226` ↔ `:461` | 未提及 callout 长度 | 静默截 **32**（`:333` 兜底另用 **28**） |

修 covers 的正解是补一个 `normalizeCoverPlan`，与「字段约束进目标档案」是同一件事，宜与 Phase 2 一并做。

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
