> 冻结 content-ops 的历史设计参考；当前整合范围与约束以 `content-ops-integration-plan.md` 为准。

# 对标采集与爆款分析方案（P0 + P1）

版本：v0.1
日期：2026-08-04
项目：`content-ops`（原 `xhs-vibecoding`）

关联文档：

- `docs/content-workbench-refactor-plan.md`（多平台改造，本方案是它的前置补充，不冲突）
- `docs/research/social-content-platforms-benchmark-2026-07.md`（竞品调研）
- `docs/xhs-workflow-roadmap.md`（阶段 C 已确认允许联网抓取，本方案沿用该结论）

## 1. 背景与结论

### 1.1 目标形态

内容生产平台的完整链路是：

```text
对标账号 → 爆款分析 → 脚本生成 → 图片生成 → 视频生成 → 发布分发
```

### 1.2 现状实测（2026-08-04，读代码得出）

| 环节 | 现状 | 证据 |
| --- | --- | --- |
| 对标账号 | ❌ **纯空壳** | `BloggerResearch.tsx:49` `useState(DEMO_BLOGGER_PROFILES)`；组件零 `fetch`；无任何 blogger 相关 API 路由 |
| 爆款分析 | 🟡 单条能拆，拆完即丢 | `/api/video/extract` 可用；`scriptAnalysisToDistillation` 只被 `VideoExtractPanel.tsx:171` 调用，产物进 `WorkflowDashboard.tsx:298` 的 `useState`，**不落库，刷新即丢** |
| 脚本生成（图文） | ✅ 完整 | `content-cards` → `drafts` 链路通 |
| 脚本生成（视频） | ❌ 从零 | `lib/videoWorkflow.ts` 159 行只有类型与兜底，无路由、无 AI 调用、无持久化 |
| 图片生成 | 🟡 模板渲染非生成式 | Satori / Canvas 画卡片 |
| 视频生成 | 🟡 单模板 | Remotion 仅 `FlashCards` 一个 composition |
| 发布 | 🟡 只写状态 | `publish` 仅写飞书字段 |

### 1.3 结论

**链路的第一段是断的，且断得最彻底。** 后面几段是「弱」，第一段是「无」。

竞品与开源生态的普遍起点是「给一个主题」，没有「先看对标账号真实数据、再反推选题」这一段。这既是本项目当前最大的缺口，也是差异化最明显的位置。因此 P0 + P1 优先级高于视频线（视频线见 refactor-plan Phase 4）。

## 2. 范围

### 2.1 做

- **P0**：对标账号采集落库 —— 本地采集服务 + 飞书两张新表 + `BloggerResearch` 接真数据 + 道库蒸馏持久化。
- **P1**：爆款信号打分 —— `lib/viralSignals.ts`，先分类再打分，输出「病毒潜力」分，作用于对标笔记与拆片结果。
- **汇合点**：从一条对标爆款笔记反推选题候选（P0+P1 的可见出口）。

### 2.2 不做（本方案范围外）

- 不做任务中心（长任务落库 + 断点续跑）—— 留给 P2，本方案用同步请求 + 可取消，并在 §7 写明局限。
- 不做导航重组、候选池 accept/ignore/link 交互 —— 留给 P4（对应 refactor-plan Phase 6）。
- 不做视频线 —— refactor-plan Phase 4 原样保留。
- 不改 `lib/topicScoring.ts` 的现有行为（理由见 §4.1）。
- 不解决 `fs` 与 Cloudflare Workers 的既有矛盾。
- 不新增未确认的业务限制、自动行为或硬编码上限。
- API 响应继续遵守 `{ code, data, message }`；错误提示继续用中文友好文案。

## 3. P0 · 对标账号采集

### 3.1 架构：新建独立采集服务，app 侧纯代理

沿用仓库**已验证过**的模式，不发明新架构：

```text
BloggerResearch.tsx → /api/blogger/* (纯代理) → services/collector (本地) → 平台
                              ↑ 与 /api/video/extract → services/video-renderer 同构
```

理由：

1. Cloudflare Workers 跑不了 Playwright / 浏览器，`wrangler.toml` 指向 Workers。这个约束已经逼出过一次同样的解法（`app/api/video/extract/route.ts:18` 的 `runtime = "nodejs"` + 转发本地服务）。
2. **不塞进 `services/video-renderer`**：采集栈是 Python + Playwright（MediaCrawler），renderer 是 Node + Remotion，无法同进程；且 renderer 的名字已经因为承载 `/extract` 而略微失真，再塞采集会彻底不诚实。
3. 新服务 `services/collector`，默认端口 `8788`，通过 `BLOGGER_COLLECTOR_URL` 指定，与 `VIDEO_EXTRACTOR_URL` 同一约定。

**错误处理照抄 `extract/route.ts:78-96`**：连不上本地服务时，不抛栈，返回中文可操作提示（「请先在 `services/collector` 运行 …」），并 `console.error` 带 action 上下文。

### 3.2 采集服务接口

```text
GET  /health                          → { ok: true }
POST /profile   { platform, homeUrl } → 账号主页信息（昵称/简介/粉丝/作品数）
POST /notes     { platform, homeUrl, limit } → 该账号最近 limit 条笔记 + 互动数据
```

`limit` 由前端传入，**不在服务端硬编上限**（遵守 §2.2）。

Cookie 策略与现有 `ytdlpCookieArgs()`（`extract.mjs:41`）一致：读用户自己的浏览器 cookie 或 cookies.txt，通过环境变量指定，服务自身不存任何凭据。

### 3.3 数据模型：飞书新增两张表

`WorkflowTableName` 从 5 扩到 7（`lib/feishu.ts:3`），`getMissingFeishuConfig` / `getFeishuTableId` 两处 `Record` 同步加键——它们是**两份手写映射**（`:43` 与 `:64`），改一处漏一处不会被 `tsc` 抓到，需一起改。

| 表 | 环境变量 | 核心字段 |
| --- | --- | --- |
| 对标账号 | `FEISHU_BLOGGER_TABLE_ID` | 账号ID、昵称、平台、主页链接、定位、简介、粉丝数、作品数、状态、最近采集时间、核心道、选题道、标题范式、正文范式、视觉范式、语气规则、边界、迁移备注 |
| 对标笔记 | `FEISHU_BLOGGER_NOTE_TABLE_ID` | 笔记ID、账号ID、标题、正文、话题标签、封面描述、链接、发布时间、阅读量、点赞量、收藏量、评论量、分享量、内容类型、信息密度、病毒潜力分、命中信号、钩子句、打分说明、互动率 |

> 实现时相对初稿的两处调整：账号表补了「简介 / 作品数 / 最近采集时间」（采集接口本就返回，落库才不丢）；笔记表的「拆解结构」去掉——脚本分段结构是拆片路径（`ScriptAnalysis`）的产物，走道库沉淀，不属于对标笔记；换成打分实际产出的「打分说明 / 互动率」。列定义的单一来源是 `lib/blogger.ts` 的映射函数。
>
> 「发布时间」存文本不存日期列：各平台格式不一（相对时间、无年份），转日期列会丢信息或报错。

三条约定，全部来自本仓库踩过的坑：

1. **枚举值也用多行文本存，不用「单选」列**。飞书对未知字段/未预设选项是**拒绝整条写入**（`FieldNameNotFound`），refactor-plan §「飞书 schema 修复」记录了 28 列缺失导致 `writeBack=true` 全线失败、且 `tsc` 与 `next build` 都抓不到的事故。
2. **建表用幂等脚本，先 dry-run，只建缺的列，不碰现有列**（沿用 Phase 2c 的做法）。
3. **道库蒸馏分列存，不存 JSON blob**。`BloggerDistillation` 的 8 个数组字段各占一列（`\n` 连接，沿用「标题候选」既有约定）。理由：飞书表是给人读和改的，`封面配置JSON` 的覆辙 refactor-plan §5.1 已明确要求避免。

### 3.4 道库蒸馏持久化

现在 `scriptAnalysisToDistillation` 的产物只进 React state。改为写入「对标账号」表对应行，`BloggerResearch` 从表里读。这样拆片沉淀的道库和手工蒸馏的道库进同一个池子，`DAOKU_OPTIONS` 才有真实来源。

### 3.5 UI 改动（最小）

`BloggerResearch.tsx` 现在是「demo 账号列表 + 手工贴样本 + 一键蒸馏」，骨架可用，替换数据源即可：

- 账号列表从飞书读，加「添加对标账号」（贴主页链接 → 采集 profile）
- 「采集最近 N 条」按钮，走 `useAbortableTasks`（可取消，与现有生成任务一致）
- 笔记列表按病毒潜力分排序（P1 产出）
- 保留手工贴样本路径 —— 采集失败时的降级出口，不删

导航只改一行：`WorkflowDashboard.tsx:126` 的 `AREAS.blogger.group` 从 `"AI 工具"` 改为 `"内容流程"` 并排到最前。理由：它是链路起点，不是「随时可调、不打断主流程」的工具。完整导航重组留 P4。

## 4. P1 · 爆款信号打分

### 4.1 与 `topicScoring.ts` 的分工（纠正）

**新增 `lib/viralSignals.ts`，不改 `lib/topicScoring.ts`。** 两者算的不是同一件事：

| | `topicScoring.ts`（现有） | `viralSignals.ts`（新增） |
| --- | --- | --- |
| 对象 | **我的**选题 | **别人的**已发布内容 |
| 问题 | 这条值不值得写 | 这条为什么爆 |
| 输入 | `ContentCard` | 对标笔记 / 拆片结果（含真实互动数据） |
| 输出 | `selectionScore` + 6 维 breakdown | `viralityScore` + 命中信号 |

`topicScoring` 的中文正则关键词（`:23` `SCENE_KEYWORDS`、`:24` `FIRSTHAND_KEYWORDS`）确实弱，但那是 refactor-plan §4.5 已登记的「英文规则失效」问题，归 Phase 5 的 `rules/en.ts` 处理，不在本方案范围内。

### 4.2 打分设计

**先分类，再打分。** 两个前置判断喂给后续 prompt：

- 内容类型：教程 / 观点 / 故事 / 测评 / 清单 / 访谈 / vlog
- 信息密度：低（水） / 中 / 高（干货密）

**八条爆款信号**，按影响力排序：

1. 钩子时刻（「秘密是…」「没人说过…」「我完全搞错了…」）
2. 情绪峰值（真实、未经设计的反应）
3. 观点炸弹（有争议、反直觉，能激发赞同/反对）
4. 认知重构（意外的事实、数据、坦白）
5. 冲突与张力
6. 可独立成卡片的金句
7. 故事高潮 / 反转
8. 立刻能用的实用价值

**关键区分：打的是「病毒潜力」不是「内容质量」。** 这两件事经常反向。落到本仓库，它正好对上 refactor-plan §4.6 标记为「小红书专属、需降级进 `xhs-post` 档案」的 `estimatedSaveValue` / `可收藏资产` —— 收藏价值是质量维度，病毒潜力是传播维度，本就该拆开，本方案顺势拆。

必须输出 `hookSentence`（前 3 秒让人停止划走的那句），它是反推选题时最有用的单个字段。

### 4.3 兜底

无 AI Key 时 `generateWorkflowJson` 走 mock（`lib/workflowAi.ts` 既有行为）。此时 `viralSignals` 降级为**纯互动数据排序**，而不是返回假分数——有真实数据可用时，规则兜底比编一个分数诚实。

**实现第 3 步时发现的约束：小红书与抖音的公开数据里没有阅读量。** 浏览量只有创作者本人后台可见，采集侧只能拿到点赞/收藏/评论/分享。这让原设计的「按互动率折算」在主平台上恒失效（缺 views → 全部 0 分）。因此兜底改成三档，逐档变弱且都在 reason 里写明用了哪档：

| 档 | 条件 | 折算依据 | 可比范围 |
| --- | --- | --- | --- |
| ① | 有阅读量 | 互动率 | 跨账号可比 |
| ② | 只有互动量（小红书/抖音常态） | 互动总量 | **仅同账号内可比** |
| ③ | 什么都没有 | 0 分 + 提示人工评估 | — |

AI 打分路径不受影响（它本来就看绝对数据 + 正文判断）。飞书「阅读量」列对采集数据会是空的，这是事实不是丢字段。

## 5. 汇合点：对标 → 选题反推

P0 采到数据、P1 打完分，必须有一个可见出口，否则数据没人用。

最小实现：对标笔记详情里加「用这条反推选题」，把 `{ 对标笔记正文 + hookSentence + 命中信号 + 所属账号道库 }` 作为上下文，走**现有** `/api/feishu/content-cards` 生成选题候选。

- 不新建生成链路，只给现有 prompt 加一段对标上下文。
- 生成的选题落进选题池，后续流程（草稿→封面→质检→发布）完全不变。

这是整个方案里唯一新增的主流程交互；其余都是补数据源和打分。

## 6. 文件清单

### 6.1 新增

```text
services/collector/                     采集服务（Python 标准库 + MediaCrawler，独立进程，不进 CF 部署）
  README.md                             装依赖、cookie 配置、启动方式、两条必读约束
  server.py                             /health /profile /notes
app/api/blogger/profile/route.ts        代理：采集账号信息
app/api/blogger/notes/route.ts          代理：采集笔记 + 触发打分
app/api/blogger/save/route.ts           写飞书（账号 / 笔记 / 道库，按业务键 upsert）
app/api/blogger/list/route.ts           读飞书（计划外新增，见下）
lib/blogger.ts                          飞书读写映射 + normalize（对标账号 / 对标笔记）
lib/collector.ts                        采集服务调用封装 + 结果归一
lib/viralSignals.ts                     分类 + 8 信号打分 + prompt + 兜底
scripts/blogger/ensure-tables.mjs       幂等建表（先 dry-run）
docs/benchmark-and-viral-analysis-plan.md  本文档
```

两处相对初稿的增补：

- **`/api/blogger/list`（计划外）**：第 4 步的 UI 要读已存的对标数据，而**不能并进 `/api/feishu/sync`**——sync 的「全量」分支会一次性读所有表，把两张新表加进去会让尚未建表的用户整个同步失败（`getFeishuTableId` 抛「缺少飞书配置」）。单独一条路由，没配就返回空列表 + 建表提示。
- **`lib/collector.ts`（计划外）**：把「调本地服务 + 归一结果 + 区分错误类型」从路由里抽出来，两条采集路由共用。其中 `CollectorUserError` 区分**业务性失败**（没装 MediaCrawler、链接格式不对、风控拦截 → 400）与**基础设施故障**（服务没起 → 500）；采集服务本身也按这个语义返回状态码。报成 500 会让前端把「你需要配置一下」显示成「服务挂了」。

### 6.2 修改

```text
lib/feishu.ts                    WorkflowTableName 5→7；两份 Record 映射同步加键
lib/bloggerWorkflow.ts           demo 数据降级为 fallback；类型补 profile 采集字段
lib/videoExtract.ts              拆片结果接入 viralSignals 打分
lib/workflowClient.ts            加 blogger 系列客户端方法（沿用现有封装风格）
components/workflow/BloggerResearch.tsx   接真数据 + 采集 + 排序 + 反推选题
components/workflow/VideoExtractPanel.tsx 沉淀道库改为落库（不再只进 state）
components/workflow/WorkflowDashboard.tsx AREAS.blogger 分组改一行 + 道库来源改读飞书
.env.example                     BLOGGER_COLLECTOR_URL + 两个 TABLE_ID + cookie 变量
README.md                        表结构表格加两行；新增采集服务启动说明
```

**不动**：`lib/topicScoring.ts`、`lib/qualityCheck.ts`、`lib/daoku.ts`、封面/配图/视频链路、所有 `scripts/daoku/*`。

## 7. 分步交付

每步可独立提交、独立验证。

| 步 | 内容 | 验证方式 |
| --- | --- | --- |
| **1** | 飞书两张表 + `lib/blogger.ts` + 建表脚本 | dry-run 看差异 → 建表 → 各写一条字段齐全记录再删 |
| **2** | `lib/viralSignals.ts`（纯函数 + prompt，无 UI） | 拿现有 demo 样本跑打分，人工看分数是否合理 |
| **3** ✅ | `services/collector` + `/api/blogger/*` 代理 | 服务未启动时报中文可操作提示；启动后能采到真实账号 |
| **4** ✅ | `BloggerResearch` 接真数据 + 按分排序 | 真机：添加账号 → 采集 → 列表按分排序 → 蒸馏落库 → 刷新仍在 |
| **5** ✅ | 拆片结果接入打分 + 沉淀落库 | 粘一条链接 → 拆解 → 有分 → 沉淀道库 → 刷新仍在 |
| **6** ✅ | 反推选题 | 选一条对标笔记 → 生成选题 → 进选题池 → 能继续走草稿 |

**六步全部完成。** 唯一未经真机验证的是 MediaCrawler 实际采集（需用户自装 + 登录态），见 §8.2。

### 第 6 步的一处设计决定：对标定角度，素材出事实

反推**不能**让模型照着对标笔记写选题——主 prompt 第 7 条明确禁止编造素材里没有的数字和经历，照搬对标案例与之直接冲突。所以 `benchmarkBlock` 里把优先级写死：

1. 只借判断路径（为什么这样切入、结构怎么铺）
2. case 和数据必须全部来自我们自己的开发日报素材，对标的案例一个都不许搬、也不许改写后使用
3. 标题可借结构，词必须换成我们素材里的真实场景
4. 接不上就老实按素材出选题，不硬凑

这与道库「借道不借皮」是同一条纪律。规则兜底路径看不懂对标笔记，因此返回消息里如实写明「对标上下文只有 AI 路径会用到」，不假装用了。

## 7.1 已识别但本次不做的清理（`/simplify` 审查产出，记录以免遗忘）

1. **列清单是两份手抄，不是单一来源。** `scripts/blogger/ensure-tables.mjs` 的 38 个列名与 `lib/blogger.ts` 的映射函数各写一份，`.mjs` 引不了 TS。已把脚本里那句失实的「单一来源在 lib/blogger.ts」改成诚实的双抄警告（原注释比没有更危险——会让人以为改一处就够）。真正的修法是把列规格抽成两边都能读的纯数据文件（`.json` + `readFileSync`），但这与仓库「字段名即 schema、映射函数里写中文字面量」的既有约定冲突，值得单独决策，不在本步顺手改。
2. **幂等建表应泛化到全部 7 张表。** Phase 2c 用过一次同样的补列脚本（补了 31 列）但没留在仓库里，现在是第二次写同一机制、仍只覆盖 2 张表。`TABLES` 结构已按可扩展形状写好，补齐其余 5 张表的列规格即可泛化——但那 5 张表的权威列清单在 `lib/xhsWorkflow.ts` 的映射函数里（各 20-30 列），抄错的代价就是本文档记录过的那次事故，需要单独一轮核对。
3. **本地服务代理逻辑抄了两遍。** `lib/collector.ts` 的 `callCollector` 与 `app/api/video/extract/route.ts` 的 fetch-to-local-service 约 25 行结构完全一致（连接失败提示、日志字段、JSON 解析兜底）。正解是抽 `lib/localService.ts`，但那要一并改 `video/extract` 的错误语义（它现在把所有非 200 都压成 400，包括服务真挂了），属于对已上线路由的行为变更，应单独一轮做并单独验证。第三个本地服务出现前必须做掉。
4. **`CollectPlatform` ↔ `TargetId` 缺映射。** 仓库现有三套平台词汇：`CollectPlatform`（`xiaohongshu`/`douyin`）、写进飞书「平台」列的中文标签、`lib/targets.ts` 的 `TargetId`（至今只有 `xhs-post`）。`viralSignals` 的两个标定常量将来要随平台档案下沉时，**没有键可查**。Phase 4 注册 douyin 目标时必须把这三套收成一处映射。
5. **MediaCrawler 的耦合点实际有三个，不是 README 说的一个**：CLI 参数（`run_mediacrawler`）、输出目录布局与「按 mtime 取最新」（`read_latest_json`）、记录字段名（`normalize_note`）。更稳的边界是把契约定在**数据**上而非命令行上——约定 adapter 把符合本项目 note 契约的 JSON 打到 stdout，随仓库发 `adapters/mediacrawler.py`，`server.py` 只认 `COLLECTOR_ADAPTER_CMD`。这样用户能脱离 app 单独跑通、单独验证。
6. **`clip` / `splitLineList` 等文本工具在仓库里已有 6-7 份副本，且分隔符已漂移出 4 个互不兼容的变体**（`/\n|、/`、`/\n|、|，/`、`/\n|\/|、|，/` 等）。这些都解析人工编辑的飞书文本列，用户键入 `，` 在一处会被分割、另一处不会。正解是抽 `lib/text.ts` 并迁移全部调用点；本次没做，因为迁移面全在本次改动之外，且 `lib/xhsWorkflow.ts` 正待按 refactor-plan Phase 2e 拆分，现在新增指向它的依赖会让那次拆分更难。

## 8. 风险与局限（需知情）

1. **采集有平台风控风险。** MediaCrawler 依赖用户自己的登录态（cookie），高频采集可能触发风控甚至影响账号。缓解：默认低频、单账号手动触发、`limit` 由用户指定、不做定时轮询。仓库已有同类先例（`YTDLP_COOKIES_FROM_BROWSER`），但**风险等级更高**——yt-dlp 拿单条视频，MediaCrawler 是遍历主页。
2. **采集是分钟级长任务，本方案不落任务中心。** 走同步请求 + `useAbortableTasks`，**刷新页面即丢进度**。这是已知局限，P2 补。因此 §3.2 的 `limit` 建议用户先从小值试。
3. **平台结构会变。** 采集脚本是易碎件，平台改版即失效。故保留 `BloggerResearch` 的手工贴样本路径作为永久降级出口，不删。
4. **打分是主观的。** `viralityScore` 是 LLM 判断，不是预测。调研文档已记录 FeedHive 同类功能第三方实测偏差可达 200-300%，**按参考区间呈现，不呈现为精确预测**。

## 9. 决策记录

| # | 决策 | 结论 |
| --- | --- | --- |
| 1 | 采集服务位置 | 新建 `services/collector`，不塞 `video-renderer`（语言栈不同 + 命名诚实） |
| 2 | 数据落地 | 飞书两张新表，不是本地文件（与全仓库「飞书即数据库」一致） |
| 3 | 道库存储 | 分列存，不存 JSON blob |
| 4 | 与 `topicScoring` 关系 | 并存，不替换 —— 「值不值得写」与「为什么爆」是两件事 |
| 5 | 打分口径 | 病毒潜力 ≠ 内容质量，两者分开 |
| 6 | 任务中心 | 本方案不做，留 P2；局限写进文档 |
| 7 | 导航重组 | 本方案只改 `blogger` 一行分组，完整重组留 P4 |
| 8 | 反推选题 | 复用现有 `content-cards` 链路加上下文，不新建生成链路 |
