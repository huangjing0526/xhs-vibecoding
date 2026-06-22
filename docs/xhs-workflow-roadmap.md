# 小红书内容生产工作流 · 完整路线图

版本：v0.1
日期：2026-06-21
关联文档：

- `docs/xhs-workflow-prd.md`
- `docs/xhs-product-ui-refactor-prd.md`
- `docs/xhs-product-ui-refactor-dev-plan.md`

参照蓝图：工作流图「如何用 Codex 工作流自动生成小红书笔记」（6 步）。

进度：✅ 阶段 A（质检与发布兜底）· ✅ 阶段 B（复盘闭环·下次优化）· ✅ 阶段 C（X/GitHub 线索通道，已确认允许联网抓取）· ⏳ 阶段 D/E 待启动。

阶段 C 实现说明：`agent-reach` 是 Claude Code 开发期 skill，部署到 Cloudflare Workers 的 API 路由运行时无法调用，故「联网抓取」落成 API 路由内的真实 HTTP fetch（GitHub 走公开 REST API；X / 网页走通用 fetch + 正则抽正文，抓不全时降级为粘贴原文）。`agent-reach` 仍可在早间 `xhs-topic-harvest` 工作流单独使用。

---

## 0. 这份文档解决什么

把工作流图的 6 步，逐一对照当前产品的真实实现，标出「已做 / 半成品 / 缺口」，再把缺口拆成可独立交付的阶段。每个阶段都能单独上线，不依赖后续阶段。

阅读顺序：先看「§1 现状对照」拿全局，再看「§3 阶段计划」挑要做的那一段。

---

## 1. 现状对照（6 步蓝图 × 产品实现）

当前产品已从「阶段驱动」重构为「围绕一篇笔记」的三区 + 抽屉架构（`WorkbenchShell`：工作台 / 素材库 / 复盘 + cover/video/blogger/rewrite 四抽屉）。

| 蓝图阶段 | 产品现状 | 关键代码 | 评估 |
|---|---|---|---|
| ① X/GitHub 热门线索 | 本地文档扫描、飞书同步、选题池导入、手动录入素材 | `lib/localDocs.ts`、`lib/topicPool.ts`、`lib/manualEntry.ts`、`/api/local-docs/*` | ✅ 有采集；🔴 **无 X/GitHub 公开线索通道** |
| ② 工作流制作（资料→拆解→执行→质检） | 素材→生成选题→生成草稿 | `buildContentCardPrompt`、`/api/feishu/content-cards`、`/api/feishu/drafts` | ✅ 前三段完整；🔴 **「质检」段缺前端** |
| ③ 热门 Skill 复用（写作/润色/配图/卡片） | rewrite / cover / image / blogger 四抽屉 | `lib/{rewrite,cover,image,blogger}Workflow.ts` | ✅ 完整 |
| ④ 公众号/小红书/视频流 | 笔记 / 图文 / 视频 / 封面 | `NoteEditor`、`CoverStudio`、`VideoStudio` | ✅ 小红书+视频完整；🟡 **无公众号长文形态** |
| ⑤ 质检与发布兜底（事实一致/钩子重写/封面重做/标签重配/引导重写） | 发布段只有「标记发布」按钮；后端有未接 UI 的 `content-cards/score` | `NoteInspector.tsx:188`、`/api/feishu/content-cards/score` | 🔴 **最大缺口，图里着墨最多** |
| ⑥ 发布/复盘（多平台/效果回看/下次优化） | 单平台标记发布 + 复盘面板 | `publishDraft`、`ReviewDashboard`、`/api/feishu/review` | 🟡 **多平台发布缺；下次优化闭环弱** |

一句话：**4 步完整、2 步半、1 步空**。空的那步（⑤质检兜底）恰好是图里描述最细、且最契合现有「一篇笔记」架构的一块。

---

## 2. 优先级与排序逻辑

排序依据三条：① 蓝图着墨程度（用户最在意）；② 与现有架构的契合度（改动小、回归风险低）；③ 是否依赖外部系统（抓取/多平台 API 风险高）。

| 优先级 | 阶段 | 蓝图 | 理由 |
|---|---|---|---|
| **P0** | A · 质检与发布兜底 | ⑤ | 缺口最大、图里最重、纯内部、可复用已有 score 接口与抽屉架构 |
| **P1** | B · 复盘闭环·下次优化 | ⑥ | 让「质检→发布→复盘→下次优化」首尾相接，纯内部 |
| **P2** | C · X/GitHub 线索通道 | ① | 价值高但依赖外部抓取，范围大，单独成段 |
| **P3** | D · 多平台发布记录 | ⑥ | 多平台账号体系重，先做「记录」不做「真发」 |
| **P4** | E · 公众号长文形态 | ④ | 受众分叉，按需再做 |

下面只把 P0 / P1 拆到可执行；P2–P4 给方向与边界，待 P0/P1 落地后再细化。

---

## 3. 阶段计划

### 阶段 A（P0）· 质检与发布兜底

**目标**：在 NoteInspector「发布」段之前插入一道质检闸门，对齐图里 5 个兜底动作。每项给「通过 / 警告 / 不过」+ 一键修复（跳已有抽屉或内联编辑），发布按钮被未解决的硬伤拦截。

**5 维质检 ↔ 修复动作映射**：

| 蓝图动作 | 检查内容 | 判定方式 | 一键修复 |
|---|---|---|---|
| 事实一致 | 草稿主张 vs 来源素材，标出无据主张 | AI（fallback：关键词覆盖率规则） | 跳来源素材 / 进改写抽屉 |
| 钩子重写 | 标题/开头钩子强度（疑问/数字/反差/利益点） | 规则打分 | 进 rewrite 抽屉（目标=标题） |
| 封面重做 | 封面是否已生成、封面文案是否与标题一致 | 规则（`coverDataUrl` + 文案比对） | 进 cover 抽屉 |
| 标签重配 | 标签数量与「大流量+精准」组合 | 规则（数量区间 + 是否含精准长尾） | 内联编辑 / 进 rewrite |
| 引导重写 | `commentPrompt` 是否为真实讨论问题、非私域转化 | 规则（问句 + 黑名单词） | 内联编辑 |

**改动文件**：

新增：
```text
lib/qualityCheck.ts                       # 类型 + 规则兜底检查器（纯函数）+ 事实一致 AI prompt
app/api/feishu/quality/route.ts           # 跑「事实一致」AI 校验，{code,data,message} + fallback
components/workflow/QualityGate.tsx        # 第 5 个抽屉，5 维结果卡 + 一键修复入口
```

修改：
```text
components/workflow/NoteInspector.tsx      # 发布段前加「质检」入口 + 质检结论摘要
components/workflow/WorkflowDashboard.tsx  # drawer 类型加 "quality"；接 QualityGate；发布前读质检结论
lib/workflowClient.ts                      # 加 runQualityCheck() 客户端调用
```

**领域类型（lib/qualityCheck.ts 草案）**：
```ts
type QualityVerdict = "pass" | "warn" | "fail";
type QualityDimension = "fact" | "hook" | "cover" | "tags" | "cta";
interface QualityIssue {
  dimension: QualityDimension;
  verdict: QualityVerdict;
  message: string;        // 中文，用户可读
  fixHint: string;        // 一句话怎么修
  fixAction: "rewrite" | "cover" | "edit" | "source"; // 路由到哪
}
interface QualityCheckResult {
  issues: QualityIssue[];
  hardFail: boolean;      // 有 fail 即拦截发布
  checkedAt: string;
}
```

**复用点**：
- `content-cards/score` 已有的道库打分逻辑（`buildDaokuScorePrompt` / `DAOKU_SCORE_FALLBACK`）可作为「钩子/选题质量」的现成信号，质检面板直接展示，不重造。
- 修复动作全部路由到已有抽屉（rewrite/cover）或内联编辑，不新增编辑器。

**验收**：
- 选中一篇有草稿的笔记 → 发布段出现「质检」入口。
- 点质检 → 抽屉列出 5 维结论，每项有结论 + 修复入口。
- 任一维 `fail` 时，发布按钮显示「先处理 N 项硬伤」并禁用。
- Demo 模式下质检走规则 fallback，不依赖 AI key。
- 无草稿时质检入口隐藏或置灰。

**不做**：自动改写（只给入口，人来点）、历史质检留痕、批量质检。

---

### 阶段 B（P1）· 复盘闭环 · 下次优化

**目标**：让复盘从「看数据」升级到「给下一篇的可执行建议」，与阶段 A 的质检维度对齐，形成 `质检→发布→复盘→下次优化` 闭环。

**改动文件**：

修改：
```text
lib/xhsWorkflow.ts                     # buildReviewPrompt 增加「下次优化」结构化输出维度
components/workflow/ReviewDashboard.tsx# 展示「下次优化」清单 + 一键带入新笔记
app/api/feishu/review/route.ts         # ReviewResult 增加 nextActions 字段
```

**设计**：复盘结论按「选题 / 标题封面 / 内容价值 / 互动引导」四层归因（已有），每层产出 1 条「下次怎么做」的具体动作；动作语言与阶段 A 的质检维度同构（钩子/封面/标签/引导），让复盘建议能直接喂回质检关注点。

**验收**：
- 复盘面板除指标外，显示「下次优化」清单（3–5 条具体动作）。
- 每条动作标注归属层级。
- Demo 模式走 fallback。

**不做**：自动把建议写进新选题（先只展示+手动带入）。

---

### 阶段 C（P2）· X/GitHub 线索通道

**目标**：新增第三类线索入口——粘贴/抓取 X 帖子或 GitHub 仓库/Issue → AI 提炼成结构化素材 → 进素材库。补齐蓝图 ① 的「公开线索 / 评论区 / 仓库」。

**边界**（第一版）：
- 先做「粘贴链接/正文」→ 提炼，**不做自动定时抓取**。
- 抓取若做，优先复用已装的 `agent-reach` skill（支持 github / 推特），而非自研爬虫。
- 输出落到现有素材表结构（`MaterialItem`），不新增飞书表。

**改动方向**：
```text
lib/clueIntake.ts                      # X/GitHub 原文 → MaterialItem 的提炼 prompt + fallback
app/api/feishu/clues/route.ts          # 接收原文/链接，返回候选素材
components/workflow/ManualEntryForm.tsx# 素材库新增入口加「从 X/GitHub 提炼」分支
```

**验收**：粘贴一条 X 帖子或 GitHub README → 生成 1–N 条候选素材 → 可编辑后入库。

**待确认**：是否允许联网抓取（涉及 `agent-reach` / 外部请求），还是仅手动粘贴。

---

### 阶段 D（P3）· 多平台发布记录

**目标**：把单平台「标记发布」扩展为多平台发布记录（小红书 / 公众号 / 视频号 / 抖音），先做**记录与状态**，不做真实跨平台发布。

**边界**：第一版只记录「在哪些平台发了、各自链接/状态」，不接任何平台 API。复盘按平台分别回流。

**待确认**：是否需要真实发布 API（涉及账号体系，范围大）。

---

### 阶段 E（P4）· 公众号长文形态

**目标**：在「多形态产出」里补公众号长文（区别于小红书短笔记），复用素材+选题，输出长文结构+排版建议。按需启动。

---

## 4. 跨阶段约束

- 保留现有飞书闭环、Demo / Connected 双模式、选题/草稿/图片/复盘能力，不破坏回归。
- 新能力优先「本地状态 + 纯函数 fallback」，Demo 模式不依赖 AI key。
- API 响应继续 `{ code, data, message }`；错误提示中文友好。
- 不新增未确认的业务限制、自动行为、硬编码上限。
- 单点冲突文件（`WorkflowDashboard.tsx`、路由）改动前确认范围，避免覆盖并行会话。
- 不新增飞书表（阶段 A–C 均用现有表结构承载）。

---

## 5. 建议落地顺序

1. **阶段 A**（质检兜底）— 独立、价值最高、回归风险低，先做。
2. **阶段 B**（复盘闭环）— 与 A 对齐维度，紧接其后，闭环成型。
3. 阶段 A/B 上线验证后，再就 **阶段 C**（线索通道）的「是否联网抓取」做一次确认，单独排期。
4. 阶段 D/E 视实际需求再启动。

---

## 6. 待确认

1. 阶段 A 的「事实一致」是否必须走 AI，还是第一版先纯规则（关键词覆盖率）+ 可选 AI？
2. 质检结论是否需要写回飞书（留痕），还是只在前端会话内有效？
3. 阶段 C 是否允许第一版就联网抓取（`agent-reach`），还是仅手动粘贴原文？
4. 阶段 D 的多平台第一版是否就是「纯记录」，确认不接真实发布 API？
5. 是否需要把本路线图同步进 `README.md` 的功能特性清单？
