# 逐文件整合清单（实施前）

主线：`f77cb014b7ea58aefe850e60700e154c6f15c68f`。冻结 content-ops 仅作只读输入。先保存本清单，再修改源码。共享文件一律保留主线实现，仅增量适配，不整文件回退。

## 源端独有文件

| 文件 | 处置 |
| --- | --- |
| `.DS_Store` | 排除：系统元数据、本机设置或自动生成声明，不迁移 |
| `.claude/settings.local.json` | 排除：系统元数据、本机设置或自动生成声明，不迁移 |
| `app/api/blogger/distill/route.ts` | 迁入采集兼容入口；对标实体适配主线 bloggerFeishu，不建第二套数据 |
| `app/api/blogger/list/route.ts` | 迁入采集兼容入口；对标实体适配主线 bloggerFeishu，不建第二套数据 |
| `app/api/blogger/notes/route.ts` | 迁入采集兼容入口；对标实体适配主线 bloggerFeishu，不建第二套数据 |
| `app/api/blogger/profile/route.ts` | 迁入采集兼容入口；对标实体适配主线 bloggerFeishu，不建第二套数据 |
| `app/api/blogger/save/route.ts` | 迁入采集兼容入口；对标实体适配主线 bloggerFeishu，不建第二套数据 |
| `app/api/templates/generate/route.ts` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `app/api/templates/route.ts` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `app/api/video/generate/route.ts` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `app/api/video/history/route.ts` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `app/api/video/jobs/[id]/route.ts` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `app/icon.svg` | 保留主线品牌资源；源端图标不替换现有 favicon |
| `app/m/create/page.tsx` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `app/m/layout.tsx` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `app/m/me/page.tsx` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `app/m/page.tsx` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `app/m/t/clip/page.tsx` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `app/m/t/cover/page.tsx` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `app/m/t/extract/page.tsx` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `app/m/t/video/page.tsx` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `app/m/works/page.tsx` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `components/mobile/ChipRow.tsx` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `components/mobile/ImagePicker.tsx` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `components/mobile/MobileSection.tsx` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `components/mobile/MobileTabBar.tsx` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `components/mobile/MobileTabHeader.tsx` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `components/mobile/MobileToolPage.tsx` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `components/mobile/NotePicker.tsx` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `components/mobile/ToolIcon.tsx` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `components/mobile/notice.ts` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `components/mobile/useWorkflowData.ts` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `components/workflow/NoteList.tsx` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `components/workflow/TemplateForm.tsx` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `components/workflow/TemplateGallery.tsx` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `components/workflow/TemplateResult.tsx` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `components/workflow/TemplateStudio.tsx` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `components/workflow/useContentImagePreview.ts` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `docs/.DS_Store` | 排除：系统元数据、本机设置或自动生成声明，不迁移 |
| `docs/benchmark-and-viral-analysis-plan.md` | 迁入历史设计说明，标注仅作参考，批准任务单优先 |
| `docs/template-library-plan.md` | 迁入历史设计说明，标注仅作参考，批准任务单优先 |
| `docs/video-template-plan.md` | 迁入历史设计说明，标注仅作参考，批准任务单优先 |
| `lib/blogger.ts` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `lib/bloggerDistill.ts` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `lib/collector.ts` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `lib/compressImage.ts` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `lib/errors.ts` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `lib/generation/canvasEngine.ts` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `lib/generation/index.ts` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `lib/mobile/selection.ts` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `lib/mobile/tools.ts` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `lib/mobile/viewMode.ts` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `lib/templates/inputs.ts` | 迁入模板制作命名空间；与主线 index.ts 的道库模板分开，以显式适配复用 |
| `lib/templates/packs/ai-coding.ts` | 迁入模板制作命名空间；与主线 index.ts 的道库模板分开，以显式适配复用 |
| `lib/templates/registry.ts` | 迁入模板制作命名空间；与主线 index.ts 的道库模板分开，以显式适配复用 |
| `lib/templates/types.ts` | 迁入模板制作命名空间；与主线 index.ts 的道库模板分开，以显式适配复用 |
| `lib/videoExtractHistory.ts` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `lib/videoGen.ts` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `lib/viralSignals.ts` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `middleware.ts` | 迁入移动 UA 分流；仅首页生效，保留桌面路由 |
| `next-env.d.ts` | 排除：系统元数据、本机设置或自动生成声明，不迁移 |
| `scripts/blogger/ensure-tables.mjs` | 保留为手工维护源码；不运行、不加入自动任务，既有飞书表仅兼容，不改 schema |
| `services/collector/.env.example` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `services/collector/.gitignore` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `services/collector/README.md` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `services/collector/server.py` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `services/video-renderer/src/ClipReel.tsx` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `services/video-renderer/src/avatarPipeline.mjs` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `services/video-renderer/src/errors.mjs` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `services/video-renderer/src/hybridPipeline.mjs` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `services/video-renderer/src/jobs.mjs` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `services/video-renderer/src/localPipeline.mjs` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `services/video-renderer/src/media.mjs` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `services/video-renderer/src/productPipeline.mjs` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `services/video-renderer/src/providers/bailian.mjs` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `services/video-renderer/src/providers/http.mjs` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `services/video-renderer/src/providers/siliconflow.mjs` | 迁入并核对调用链；有冲突则以主线为准增量适配 |
| `services/video-renderer/src/script.mjs` | 迁入并核对调用链；有冲突则以主线为准增量适配 |

## 共享变更文件

| 文件 | 处置 |
| --- | --- |
| `.env.example` | 最小增量合并：保留主线行为，补迁入模块需要的导出、入口或管线 |
| `.gitignore` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `app/api/feishu/_utils.ts` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `app/api/feishu/content-cards/route.ts` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `app/api/feishu/drafts/publish/route.ts` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `app/api/feishu/drafts/route.ts` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `app/api/feishu/images/route.ts` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `app/api/feishu/review/route.ts` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `app/api/feishu/sync/route.ts` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `app/api/rewrite/inline/route.ts` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `app/api/video/extract/route.ts` | 最小增量合并：保留主线行为，补迁入模块需要的导出、入口或管线 |
| `app/api/workflow/bootstrap/route.ts` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `components/ui/Callout.tsx` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `components/ui/Field.tsx` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `components/ui/ModalOverlay.tsx` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `components/workflow/BloggerResearch.tsx` | 最小增量合并：保留主线行为，补迁入模块需要的导出、入口或管线 |
| `components/workflow/CoverStudio.tsx` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `components/workflow/NavIcon.tsx` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `components/workflow/NoteEditor.tsx` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `components/workflow/NoteInspector.tsx` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `components/workflow/QualityGate.tsx` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `components/workflow/ReviewDashboard.tsx` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `components/workflow/RewriteStudio.tsx` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `components/workflow/VideoExtractPanel.tsx` | 最小增量合并：保留主线行为，补迁入模块需要的导出、入口或管线 |
| `components/workflow/VideoStudio.tsx` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `components/workflow/WorkbenchShell.tsx` | 保留现有五区壳和路由；如需移动入口，仅增量链接 |
| `components/workflow/WorkflowDashboard.tsx` | 最小增量合并：保留主线行为，补迁入模块需要的导出、入口或管线 |
| `components/workflow/WorkflowOnboarding.tsx` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `components/workflow/types.ts` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `lib/bloggerWorkflow.ts` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `lib/contentStrategy.ts` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `lib/cover.ts` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `lib/coverWorkflow.ts` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `lib/feishu.ts` | 最小增量合并：保留主线行为，补迁入模块需要的导出、入口或管线 |
| `lib/imageWorkflow.ts` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `lib/qualityCheck.ts` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `lib/rewriteWorkflow.ts` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `lib/targets.ts` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `lib/videoExtract.ts` | 最小增量合并：保留主线行为，补迁入模块需要的导出、入口或管线 |
| `lib/videoWorkflow.ts` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `lib/workflowAi.ts` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `lib/workflowClient.ts` | 最小增量合并：保留主线行为，补迁入模块需要的导出、入口或管线 |
| `lib/xhsWorkflow.ts` | 保留主线实体类型/状态；旧枚举调用在移动适配器转换，不回退业务模型 |
| `package-lock.json` | 保留既有依赖版本；只增加集成测试脚本，不安装、不覆盖锁文件 |
| `package.json` | 保留既有依赖版本；只增加集成测试脚本，不安装、不覆盖锁文件 |
| `scripts/daoku/README.md` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `scripts/daoku/_feishu.mjs` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `scripts/import-note-stats.mjs` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `services/video-renderer/.gitignore` | 保留主线；源端修改由较新工作台实现覆盖，必要调用差异由新增模块适配 |
| `services/video-renderer/README.md` | 最小增量合并：保留主线行为，补迁入模块需要的导出、入口或管线 |
| `services/video-renderer/src/Root.tsx` | 最小增量合并：保留主线行为，补迁入模块需要的导出、入口或管线 |
| `services/video-renderer/src/extract.mjs` | 最小增量合并：保留主线行为，补迁入模块需要的导出、入口或管线 |
| `services/video-renderer/src/server.mjs` | 最小增量合并：保留主线行为，补迁入模块需要的导出、入口或管线 |
| `services/video-renderer/src/tts.mjs` | 最小增量合并：保留主线行为，补迁入模块需要的导出、入口或管线 |
| `tailwind.config.ts` | 最小增量合并：保留主线行为，补迁入模块需要的导出、入口或管线 |

## 数据、认证、本机配置和构建产物排除

目录仅识别路径边界，不遍历/读取数据记录；真实配置不读取。
- `.env.local (配置不读取)`
- `services/collector/.env (配置不读取)`
- `services/video-renderer/.env (配置不读取)`
- `services/video-renderer/cookies.txt (数据/认证/构建产物不读取)`
- `services/video-renderer/out/ (目录不读取)`
- `tsconfig.tsbuildinfo (数据/认证/构建产物不读取)`
- `.local/`、浏览器存储、飞书记录、账号认证、实际 Cookie：不复制、不导入、不改写。
- `.claude/`、`.DS_Store`、实际 `.env*`（仅 `.env.example` 可读）：不迁移。
- 原 node_modules 只读复用；仅在集成目录创建符号链接，禁止通过链接安装。

## 预计新增/修改的整合文件

- 上述迁入文件及标记“最小增量合并”的共享文件。
- `lib/capabilities.ts`、`components/workflow/NavIcon.tsx`：沿现有桌面工具注册表增加入口。
- `lib/integration/`、`tests/content-ops-integration/`、`scripts/test-content-ops-integration.mjs`：兼容边界和行为回归。
- `QUESTIONS.md`、`docs/content-ops-integration-report.md`、本清单、`artifacts/content-ops-integration/`：决定、覆盖和原始日志。
- `node_modules`（忽略的链接）：复用主线已安装依赖。

清单是迁入处置承诺，不表示未验证的功能已通过验收。最终准确文件范围见报告和 Git diff。

## 实施中的精确适配补充

- `lib/bloggerFeishu.ts` / `lib/bloggerWorkflow.ts`：只补可选采集类型和已有指标字段，不改主线实体语义。
- `components/ui/Field.tsx` / `lib/targets.ts`：补复用现有样式的 Select 和现有比例表访问器，避免复制配置。
- `scripts/daoku/_feishu.mjs`：保留主线批量更新，增量导出历史维护脚本所需函数及可选表映射；不运行维护脚本。
- `services/video-renderer/.gitignore`：同时忽略依赖链接与新增上传图片目录。
- 新增 `BloggerCollector`、`VideoExtractHistory`、`VideoGenerationStudio` 复用桌面与移动的相同业务组件；新增 `lib/integration/blogger.ts`、`renderer.ts` 收敛必要兼容边界。
- `lib/xhsWorkflow.ts`、`components/workflow/NavIcon.tsx`、`tailwind.config.ts` 最终无需改动：保留主线模型，导航由既有 `AREAS` 派生，移动端适配现有 ID；本清单中的预期合并不代表强行制造差异。

- 独立 renderer 类型检查发现主线 FlashCards 与安装版 Remotion 的 Record 约束不兼容；仅将 `FlashCardsProps` 及新 `ClipReelProps` 改为 type alias，运行逻辑不变。原基线错误另存日志。
