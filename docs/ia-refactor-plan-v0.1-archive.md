# 信息架构改造方案：让导航讲的故事成真

版本：v0.1（待确认，未动代码）
日期：2026-08-26
依据：本次架构审查 + `docs/workbench-taxonomy.md` + `docs/content-workbench-refactor-plan.md`
目标仓库：`/Users/kp/workspace/projects/内容工作台`

> 存档说明：本文件是 v0.1 施工方案的原文存档。2026-08-26 晚走查发现方案大部分已被实现，
> 现行文档见 `ia-refactor-plan.md`（验收清单版）。本文仅供追溯，不再维护。

## 0. 一句话

侧栏骨架不动，切两刀：**① 项目页成为全部交付的统一入口、作品库收下视频产物**（让「项目是容器、作品是全部产出」从口号变成事实）；**② 工具目录收编 needsNote 的流水线步骤**（目录里再没有点进去要"先选一篇笔记"的卡）。其余是文案统一与首页减脂。

明确不做的事：

- 不合并两套存储——图文在飞书、视频/图片在本机是既定事实，本方案只做**统一视图**
- 不动 `xhsWorkflow → contentWorkflow` 改名（多平台计划 Phase 2e 已推迟，不抢跑）
- 不改飞书表结构
- 不删任何 `AreaId`——所有区仍可被 ⌘K 和意图路由直达，只改目录与首页的**露出**

---

## 改造一：作品库收视频产物

**问题**：`AREAS.works.subtitle` 承诺"本机跑出来的**全部**产出"，实际 `WorkEntry` 定义在 `lib/imageFactory/types.ts`，`/api/image-factory/works` 只扫 `.local/image-factory/jobs/*/meta.json`。视频工厂的成片（`ShotClip`，存在各 `VideoProject` 目录里）在作品库不可见。

**方案**：统一作品模型为 discriminated union，聚合两个来源。

1. 新建 `lib/works.ts`：
   ```ts
   export type AnyWork = ImageWork | VideoWork;
   // ImageWork = 现 WorkEntry + { kind: "image" }（re-export，不搬字段）
   // VideoWork = { kind: "video"; id; projectId; projectTitle; shotOrder;
   //               provider; durationSec; resolution?; createdAt; videoUrl }
   ```
   `VideoWork` 从 `ShotClip` 派生：`videoPath` 换成受校验的取流地址（复用 `isSafeSegment` 的手法），不把绝对路径漏给前端。
2. 新 API `GET /api/works`：聚合 `listWorks()`（图片）+ 遍历 `listProjects()` 的 `clips`（视频），按 `createdAt` 倒序。删除仍走各自原端点（图片已有 `DELETE /api/image-factory/works`；视频第一期不提供删除——clip 归项目所有，删除动作留在视频工厂里，避免和"clips 以盘上为准"的所有权规则打架）。
3. 新 API `GET /api/video-factory/clip-file?project=&order=`：按 projectId + shotOrder 回视频流（现有 `frames/image` 路由是现成范式）。
4. `WorksLibrary.tsx`：顶部加「全部 / 图片 / 视频」SegmentedControl；视频卡片显示时长角标 + 所属项目名，点开内联播放；「存入资产」按钮仅图片显示（资产库现只有图片类别，视频入册是另一件事，不在本期）。

**涉及文件**：新增 `lib/works.ts`、`app/api/works/route.ts`、`app/api/video-factory/clip-file/route.ts`；修改 `components/workflow/WorksLibrary.tsx`、`lib/workflowClient.ts`（加 fetch 函数）。

---

## 改造二：项目页成为统一入口

**问题**：「项目」区只列飞书选题（`NoteList`）；`VideoProject` 有自己的服务端持久化和列表（`GET /api/video-factory/project`），却只在视频工厂内部可见。做一条视频从头到尾不经过「项目」页——taxonomy 里"项目 = 一次交付的容器"对一半的交付不成立。

**方案**（第一期做"同列可见"，不做数据合并）：

1. `projects` 区改渲染新组件 `ProjectList`（`NoteList` page variant 升级或新建）：统一列表混排两类卡片——
   - 图文笔记卡：现有内容不变（标题、状态）
   - 视频项目卡：title、更新时间、进度点（有无 skeleton / script / storyboard / clips 推出"进行到哪一步"）
   按更新时间倒序混排；顶部可选「全部 / 图文 / 视频」筛选。
2. 点视频项目 → `openArea("videoFactory")` 并传 `pendingProjectId`。`VideoFactory` 增加受控 prop 打开指定项目（`pendingRhythm` 已是现成先例，同一手法）。
3. ⌘K：「笔记」分组改名「项目」，纳入视频项目（`run: 打开对应工厂项目`）。
4. 全局「创建」按钮（AppRail 顶部 + 项目页「新建」）从单一动作改为两项菜单：**图文笔记**（现 `setAddingTopic(true)`）/ **视频项目**（`openArea("videoFactory")` + 新建项目）。
5. 为多平台 Phase 3 留位：将来"一稿多投"落地时，这个列表演化为"项目 = 容器、发布目标 = 详情页 tab"，本期不实现，但 `ProjectList` 的卡片模型按 `{ kind, id, title, updatedAt, progress }` 设计，加 kind 不返工。

**涉及文件**：修改 `components/workflow/NoteList.tsx`（或新增 `ProjectList.tsx`）、`WorkflowDashboard.tsx`（projects 区渲染、⌘K 命令表、创建菜单）、`components/workflow/AppRail.tsx`（创建按钮出菜单）、`components/workflow/VideoFactory.tsx`（受控打开项目）。

---

## 改造三：工具目录收编流水线步骤

**问题**：「视频脚本」「爆款优化」「发布检查」带 `needsNote`，从工具目录点进去撞"先选一篇笔记"空态；其中质检、封面同时又是 `pipelineSteps` 的节点——同一能力两个身份。

**方案**：

1. `lib/capabilities.ts`：把类型规则钉死——**needsNote 与 category 互斥**（和"库不带 category"同一手法，进 `satisfies` 声明）。`video` / `rewrite` / `quality` 三个区删掉 `category`，保留 `needsNote`。`TOOL_AREAS` 的推导（`filter(id => AREAS[id].category)`）自动把它们排出目录，无需改推导代码。
2. 笔记详情页成为这三个能力的唯一入口：`NoteInspector` 已有 `onOpenVideo` / `onOpenQuality` / `onOpenRewrite` 跳转，`PipelineRail` 已有质检、封面节点——**入口已存在，不用新做**，本条实际只是"目录撤卡"。
3. 意图路由不用改：`ROUTABLE_AREAS` 是排除法（基于 `NOT_A_TASK`），三个区仍可被"质检一下"这类话路由到；needsNote 的"先选一篇"提示逻辑已有。
4. 收编后目录从 10 个变 7 个，见改造五的新分区表。

**涉及文件**：仅 `lib/capabilities.ts`（约 10 行）+ taxonomy 文档同步。

---

## 改造四：统一叫「项目」

**问题**：侧栏「项目」、详情页「笔记」、⌘K 分组「笔记」、数据叫"选题"——三词一物；且"笔记"一词绑死小红书图文，与多平台方向冲突。

**方案**（纯文案，随改造二、三一起做）：

- `AREAS.note`：label「笔记」→「项目详情」，subtitle 相应调整
- ⌘K 分组「笔记」→「项目」（改造二已含）
- 详情页顶部返回按钮已叫「项目」，不动
- 「新建笔记」按钮：详情页内保留（它确实新建的是图文笔记）；全局「创建」按改造二变成两项菜单
- `EmptyNote` 等空态文案里的"笔记"改"项目"

**涉及文件**：`lib/capabilities.ts`、`WorkflowDashboard.tsx` 内零散文案。

---

## 改造五：目录分区按"产出物"重排

**问题**：taxonomy 明说"链接拆片 / 对标拆解是**模板的来源**"，目录却把它们分进「做视频」「优化与复盘」两个用途分区——分类判据和摆放打架。

**方案**：

1. `ToolCategory` 从 `"做图" | "做视频" | "优化与复盘"` 改为 `"做图" | "做视频" | "沉淀模板" | "复盘"`：

   | 分区 | 工具 |
   |---|---|
   | 做图 | 图片工厂、叠字排版 |
   | 做视频 | 视频工厂、视频去水印 |
   | 沉淀模板 | 链接拆片、对标拆解 |
   | 复盘 | 数据复盘 |

   单工具分区没问题——`toolSections()` 已会隐掉空分区，单项分区照常渲染。
2. 模板页右上现有「拆一条」（跳链接拆片），补一个「拆博主」（跳对标拆解），让"模板的来源"从模板页也够得着。

**涉及文件**：`lib/capabilities.ts`（category 字面量与 `TOOL_CATEGORY_ORDER`）、模板目录组件（补一个按钮）。

---

## 改造六：首页减脂

**问题**：「推荐 / 全部」两个 tab 只差 2 张卡；改造三、五落地后差距更小，tab 撑不住自己的存在。

**方案**：

1. 删掉 `HomeHub` 的 tab，`homeToolAreas` 去掉 `scope` 参数直接回全部未露面工具（收编后 rest ≈ 5 个：叠字排版、去水印、拆片、对标拆解、数据复盘——一屏放得下）。
2. `HOME_FEATURED` 两张大卡与场景卡保持不变；"一个区最多露一次"的现算机制原样保留。

**涉及文件**：`lib/capabilities.ts`（`homeToolAreas` 签名）、`components/home/HomeHub.tsx`。

---

## 改造七：素材页产出承接

**问题**：素材页点「生成选题」，产物落到项目页，但用户停在原地，没有承接。

**方案**：`Notice` 类型加可选 `action?: { label: string; run: () => void }`，`NoticeBar` 渲染成一个内联按钮；`handleGenerateTopics` 成功时发 `{ type: "success", message: "已生成 N 条选题", action: { label: "去项目页看", run: () => openArea("projects") } }`。

**涉及文件**：`components/workflow/types.ts`、Notice 渲染组件、`WorkflowDashboard.tsx`。

---

## 实施顺序

| 阶段 | 内容 | 改动面 | 预估 |
|---|---|---|---|
| **A** | 改造三 + 四 + 五 + 六（目录收编、文案、分区、首页） | 几乎只有 `capabilities.ts` + 文案，纯前端、零数据风险 | 半天–1 天 |
| **B** | 改造一（作品统一） | 新增 2 个 API + 1 个 lib + WorksLibrary 改造 | 1–2 天 |
| **C** | 改造二 + 七（项目统一入口、承接） | ProjectList + VideoFactory 受控入口 + 创建菜单 | 1–2 天 |

A 先行的理由：它独立、可回滚、当天见效；B/C 互不依赖，可并行也可按需只做其一。
每阶段收尾同步修订 `docs/workbench-taxonomy.md`，保证文档承诺 = 界面事实。

## 验收标准

1. 工具目录里没有任何一张卡点进去出现"先选一篇笔记"
2. 视频工厂出的每一段成片在作品库可见、可播、可溯源（项目名 + 镜号 + 引擎）
3. 视频项目在项目页可见、可点击续作；⌘K 搜项目名能搜到
4. 首页无 tab、无重复入口；`homeToolAreas` 仍保证一个区最多露一次
5. `workbench-taxonomy.md` 逐句核对无一句与界面不符

## 风险

- `WorkflowDashboard.tsx`（1781 行）是多平台计划 Phase 2b 点名要拆的文件，改造二会触碰它。**建议顺手把 note 详情段抽成组件**（约 130 行 JSX），但不强制，避免与并行会话冲突——动它之前按惯例走独立 worktree + 定向提交。
- 改造一读 `VideoProject.clips` 依赖"clips 以盘上为准"的所有权规则（`project/route.ts` 注释已钉死），聚合端点只读不写，不会破坏它。
- `capabilities.ts` 是全站单一事实源，A 阶段集中改它一次成型，避免多次触碰引并发冲突。
