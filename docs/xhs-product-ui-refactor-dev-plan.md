# 小红书内容生产工作台重构开发计划

版本：v0.1  
日期：2026-06-09  
关联文档：

- `docs/xhs-product-ui-refactor-prd.md`
- `docs/xhs-product-ui-refactor-ui-design.md`

## 1. 开发目标

第一阶段目标不是重写整个系统，而是在保留现有飞书闭环和内容生成能力的基础上，完成产品信息架构和 UI 工作台重构。

第一阶段完成后，用户应该可以看到并使用新的 7 个模块：

```text
博主研究 -> 内容资产 -> 选题生成 -> 爆款改写 -> 图片生成 -> 视频生成 -> 数据复盘
```

其中：

- 内容资产、选题生成、图片生成、数据复盘复用现有能力。
- 博主研究、爆款改写、视频生成先做前端工作区和规则/Demo 结果。
- 不接入自动采集。
- 不接入真实视频生成模型。
- 不新增飞书表。

## 2. 开发原则

- 保留现有 `WorkflowDashboard` 的核心数据流，避免破坏飞书同步、Demo 模式、选题生成、草稿、图片、复盘。
- 新增页面优先使用本地状态和纯函数 fallback，不先做后端持久化。
- UI 先统一为苹果极简工作台，再逐步补业务能力。
- 不修改无关文件。
- 不新增未确认的业务限制、自动行为或硬编码上限。
- API 响应继续遵守 `{ code, data, message }`。
- 错误提示继续使用中文友好文案。

## 3. 技术策略

### 3.1 保留现有能力

继续复用：

- `lib/workflowClient.ts`
- `lib/xhsWorkflow.ts`
- `lib/imageWorkflow.ts`
- `lib/coverWorkflow.ts`
- `lib/daoku.ts`
- `components/workflow/LocalDocsSyncPanel.tsx`
- `components/workflow/TopicPipeline.tsx`
- `components/workflow/DraftPipeline.tsx`
- `components/workflow/CoverStudio.tsx`
- `components/workflow/ReviewDashboard.tsx`

### 3.2 新增前端结构

建议新增：

```text
components/workflow/AppShell.tsx
components/workflow/ModuleSidebar.tsx
components/workflow/ModuleHeader.tsx
components/workflow/ContentContextPanel.tsx
components/workflow/SegmentedControl.tsx
components/workflow/QualitySignal.tsx
components/workflow/BloggerResearch.tsx
components/workflow/RewriteStudio.tsx
components/workflow/VideoStudio.tsx
```

建议新增纯前端领域函数：

```text
lib/bloggerWorkflow.ts
lib/rewriteWorkflow.ts
lib/videoWorkflow.ts
```

这些 `lib` 文件第一阶段只放类型、Demo 数据、fallback 生成逻辑，不做远程请求。

## 4. 阶段拆分

### 阶段 0：基线确认

目标：确认当前系统可运行，避免重构前后无法判断问题来源。

任务：

- 检查现有 `npm run lint` 状态。
- 检查现有 `npm run build` 状态。
- 启动 `npm run dev`，确认首页能打开。
- 记录当前已知问题，不在本阶段修复无关问题。

产出：

- 基线验证结果。
- 若已有 lint/build 失败，记录失败原因并继续做 UI 重构，但不归因到本次改动。

### 阶段 1：AppShell 和全局视觉

目标：先搭出新工作台骨架，完成 7 模块导航、顶部栏、右侧内容包。

主要文件：

- `components/workflow/AppShell.tsx`
- `components/workflow/ModuleSidebar.tsx`
- `components/workflow/ModuleHeader.tsx`
- `components/workflow/ContentContextPanel.tsx`
- `components/workflow/DashboardCards.tsx`
- `components/workflow/ContextDrawer.tsx`
- `components/workflow/WorkspaceHeader.tsx`
- `components/workflow/WorkflowDashboard.tsx`
- `app/globals.css`

任务：

- 定义新的模块类型：`bloggers | assets | topics | rewrite | images | video | review`。
- 把旧 `source | topics | drafts | covers | review` 映射到新模块。
- 左侧导航改为 7 个入口。
- 顶部栏改为苹果极简风。
- 右侧上下文改为固定内容包面板。
- 全局背景、边框、按钮、面板切换到 UI 设计文档中的 token。

验收：

- 首页第一屏是完整三栏工作台。
- 7 个模块都能点击切换。
- 现有素材、选题、草稿、图片、复盘入口仍可访问。
- Demo / Connected 状态仍显示清楚。

### 阶段 2：复用现有业务模块

目标：把旧 5 步能力稳定迁移到新信息架构中。

模块映射：

| 新模块 | 复用旧能力 |
|---|---|
| 内容资产 | `SourceWorkspace`、`LocalDocsSyncPanel` |
| 选题生成 | `TopicPipeline`、`generateContentCards` |
| 图片生成 | `CoverStudio`、封面/内容配图 |
| 数据复盘 | `ReviewDashboard`、`generateReview` |

主要文件：

- `components/workflow/WorkflowDashboard.tsx`
- `components/workflow/LocalDocsSyncPanel.tsx`
- `components/workflow/TopicPipeline.tsx`
- `components/workflow/CoverStudio.tsx`
- `components/workflow/ReviewDashboard.tsx`

任务：

- 内容资产页增加「本轮目标」控件：图文 / 视频 / 改写。
- 选题生成页增加「目标博主道库」摘要占位。
- 图片生成页只做视觉重排，不改生成逻辑。
- 数据复盘页只做视觉重排，不改复盘逻辑。

验收：

- 选择素材 -> 生成选题可用。
- 生成草稿仍可从选题进入，哪怕草稿暂不作为一级导航。
- 图片封面和内容配图仍可生成/下载。
- 数据复盘仍可生成。

### 阶段 3：新增博主研究工作区

目标：新增「博主研究」页面，第一阶段使用 Demo 数据和本地输入，不接后端。

主要文件：

- `components/workflow/BloggerResearch.tsx`
- `lib/bloggerWorkflow.ts`
- `components/workflow/WorkflowDashboard.tsx`
- `components/workflow/ContentContextPanel.tsx`

任务：

- 定义 `BloggerProfile`、`BloggerSample`、`BloggerDistillation` 类型。
- 提供内置 Demo 博主和样本。
- 支持手动新增样本的前端表单。
- 支持点击「蒸馏博主」生成 fallback 蒸馏结果。
- 将当前选中的道库同步到右侧内容包。

验收：

- 博主研究页有完整画布：博主档案、样本列表、蒸馏结果。
- 没有样本时有清楚空态。
- 蒸馏结果包含核心道、选题道、标题道、正文道、视觉道、禁区。

### 阶段 4：新增爆款改写工作区

目标：新增「爆款改写」页面，基于当前选题/草稿和博主道库生成前端 fallback 改写结果。

主要文件：

- `components/workflow/RewriteStudio.tsx`
- `lib/rewriteWorkflow.ts`
- `components/workflow/WorkflowDashboard.tsx`
- `components/workflow/ContentContextPanel.tsx`

任务：

- 定义 `RewriteResult` 类型。
- 支持改写目标：标题 / 正文 / 结构 / 全文。
- 支持风格强度：轻改 / 中改 / 重构。
- 输出 3 个标题候选、正文版本、命中道说明、风险提示。
- 支持「应用到草稿」先更新前端当前草稿状态；Connected 写回可放后续阶段。

验收：

- 有选题或草稿时可生成改写结果。
- 没有输入时显示空态，引导用户先选择选题。
- 改写结果和风险提示同屏展示。

### 阶段 5：新增视频生成工作区

目标：新增「视频生成」页面，第一阶段输出视频脚本、分镜、字幕和 Prompt，不生成成片。

主要文件：

- `components/workflow/VideoStudio.tsx`
- `lib/videoWorkflow.ts`
- `components/workflow/WorkflowDashboard.tsx`
- `components/workflow/ContentContextPanel.tsx`

任务：

- 定义 `VideoPlan` 类型。
- 支持视频形态：口播、图文快闪、教程录屏、剧情反差。
- 支持时长和节奏选项。
- 输出 Hook、口播稿、分镜表、字幕稿、封面文案、视频 Prompt。
- 增加复制按钮：口播稿、字幕、Prompt。

验收：

- 有选题或草稿时可生成视频方案。
- 视频方案能复制。
- 页面明确提示第一阶段不生成成片。

### 阶段 6：响应式和 UI 精修

目标：确保桌面、平板、移动端都可用，且符合苹果极简风。

主要文件：

- `app/globals.css`
- 所有 `components/workflow/*.tsx`

任务：

- 桌面端确认三栏布局不溢出。
- 平板端右侧上下文可折叠。
- 移动端模块导航横向滚动，右侧内容包变底部抽屉。
- 检查按钮文字不溢出。
- 检查卡片不互相嵌套。
- 清理厚黑边框、大面积强色块。

验收：

- 1440px、1280px、768px、390px 宽度下界面可用。
- 主操作始终清晰。
- 不出现文字覆盖、按钮挤压、画布溢出。

### 阶段 7：质量验证

目标：确认重构没有破坏现有流程。

验证项：

- `npm run lint`
- `npm run build`
- `npm run dev`
- 浏览器手动验证：
  - Demo 模式加载。
  - Connected 模式状态显示。
  - 内容资产页选择素材。
  - 生成选题。
  - 生成草稿。
  - 生成封面图。
  - 生成内容配图。
  - 生成复盘。
  - 博主研究 Demo 蒸馏。
  - 爆款改写 fallback。
  - 视频方案 fallback。

如果完成中大规模 UI 功能开发后，再执行 UI 检查。

## 5. 建议实施顺序

建议按以下顺序开发，避免中途页面不可用：

1. 新增类型和 Demo/fallback 函数：`bloggerWorkflow`、`rewriteWorkflow`、`videoWorkflow`。
2. 新增通用 UI 组件：`AppShell`、`ModuleSidebar`、`ModuleHeader`、`ContentContextPanel`、`SegmentedControl`。
3. 改 `WorkflowDashboard` 的模块路由，但先让旧页面能在新壳内显示。
4. 接入内容资产、选题生成、图片生成、数据复盘。
5. 新增博主研究。
6. 新增爆款改写。
7. 新增视频生成。
8. 统一视觉样式。
9. 响应式和验证。

## 6. 风险与处理

| 风险 | 影响 | 处理 |
|---|---|---|
| `WorkflowDashboard` 已经很大 | 改动容易引入回归 | 先抽 AppShell 和面板，业务逻辑保留 |
| 当前工作区已有大量未提交改动 | 容易覆盖用户改动 | 每次改动前确认文件范围，不重置、不回滚 |
| 新增 7 模块后状态管理复杂 | 右侧上下文可能不同步 | 用统一 `ContentPackage` 派生当前上下文 |
| 博主研究/改写/视频无后端 | 第一阶段数据不持久 | 明确标注 Demo/fallback，后续再做飞书表 |
| 苹果极简和工作台密度冲突 | 信息过少或过密 | 列表保留密度，详情和上下文降噪 |
| 移动端三栏不可用 | 小屏操作困难 | 移动端改成横向模块 + 底部内容包 |

## 7. 第一阶段预估改动文件

预计新增：

```text
components/workflow/AppShell.tsx
components/workflow/ModuleSidebar.tsx
components/workflow/ModuleHeader.tsx
components/workflow/ContentContextPanel.tsx
components/workflow/SegmentedControl.tsx
components/workflow/QualitySignal.tsx
components/workflow/BloggerResearch.tsx
components/workflow/RewriteStudio.tsx
components/workflow/VideoStudio.tsx
lib/bloggerWorkflow.ts
lib/rewriteWorkflow.ts
lib/videoWorkflow.ts
```

预计修改：

```text
components/workflow/WorkflowDashboard.tsx
components/workflow/DashboardCards.tsx
components/workflow/ContextDrawer.tsx
components/workflow/WorkspaceHeader.tsx
components/workflow/LocalDocsSyncPanel.tsx
components/workflow/TopicPipeline.tsx
components/workflow/CoverStudio.tsx
components/workflow/ReviewDashboard.tsx
app/globals.css
```

可选修改：

```text
app/layout.tsx
README.md
```

## 8. 明确不做的事项

第一阶段不做：

- 自动抓取小红书数据。
- 新增飞书表。
- 新增账号体系。
- 真实视频生成模型接入。
- 自动发布。
- 大规模重写 API。
- 物理删除或批量编辑等 CRUD 扩展。

## 9. 里程碑验收

### M1：新工作台骨架

- 7 个模块可切换。
- 右侧内容包可见。
- 旧核心流程可进入。

### M2：旧能力迁移完成

- 内容资产、选题生成、图片生成、数据复盘可用。
- Demo 和 Connected 不被破坏。

### M3：新增工作区完成

- 博主研究、爆款改写、视频生成有完整页面和 fallback 结果。

### M4：UI 精修完成

- 整体视觉符合苹果极简风。
- 桌面和移动端可用。
- 无明显布局溢出。

### M5：验证通过

- lint/build 通过，或记录与本次无关的既有失败。
- 手动主流程验证通过。

## 10. 待确认

1. 第一阶段是否确认只做前端工作区 + Demo/fallback，不接新后端？
2. 草稿是否继续作为选题生成后的内嵌能力，而不是一级导航？
3. 是否允许第一阶段新增 `lucide-react` 做图标？如果不允许，就先用序号和文字。
4. 「应用到草稿」第一阶段是否只更新前端状态，不写回飞书？
5. 视频方案是否需要支持导出 Markdown 文件？
