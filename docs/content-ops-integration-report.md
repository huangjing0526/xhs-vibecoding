# content-ops 整合验证报告

> 本文为首轮实施记录。后续独立审查与修复、父任务最终构建及浏览器证据以 [最终整合交付说明](content-ops-integration-final.md) 为准；下文“未验证”保留当时状态，不代表最终复查结果。

状态：全部命名模块的实现与可执行检查完成，两个独立代码复核均未发现剩余代码阻断；浏览器/外部服务未验证，不能宣称整体验收通过。未提交、未推送、未部署。

主线 `f77cb014b7ea58aefe850e60700e154c6f15c68f`；逐文件导入处置见 [整合清单](content-ops-integration-manifest.md)。批准任务单未修改，源目录与冻结备份只读；没有运行原项目服务、读取实际环境配置/Cookie/本地记录或导入真实数据。

## 实现覆盖

| 模块 | 集成结果与可达入口 | 证据/边界 |
| --- | --- | --- |
| 移动端 | `/m`、`/m/create`、`/m/works`、`/m/me` 及 clip/cover/extract/video；首页 UA 分流及桌面偏好保留 | 使用统一 bootstrap、草稿/选题、共享方案与道库 API；类型、构建、持久化 fixture；渲染交互未验 |
| 博主采集 | 原对标页新增采集区；profile/notes/save/list/distill 路由、信号分析、Python 服务全部迁入 | 与主线账号/样本表共用；无配置可预览但不能存；真实抓取未验 |
| 模板制作 | 桌面工具 `templateStudio` 与移动创作复用；registry 配方 → generation → 浏览器 canvas 下载 | 六种模板方案 mock 生成与 400 错误测试；原 `templates/index.ts` 的图片/节奏/道库目录保留；实际 PNG 下载/视觉未验 |
| 视频生成/任务 | 桌面 `videoGenerate` 与移动 clip 共用组件；generate/jobs 路由 → renderer | 实际 route 合同 mock、任务状态测试；断连/非 JSON 不假成功；真实出片未验 |
| 拆片/历史 | 主线拆片保留，补 TikTok/来源 URL/打分；历史列表、展开、保存入口 | 可选现有表；多行结构新旧编码兼容；真实飞书历史未验 |
| renderer | local/avatar/hybrid/product、ClipReel、jobs、media、providers 全部迁入；保留 /render、/tts 双通道、抖音 URL 归一化 | 四管线 TTS/供应商/Remotion mock + 真文件/ffmpeg；JS 语法和独立 TSX 类型检查；真实语音/Remotion/云未验 |
| 工作台旧能力 | 图片/视频工厂、资产/作品、发布包、统计导入复盘、道库槽位和原导航保留 | 主线源码未整文件覆盖；所有权/发布包 ZIP/统计更新/槽位回归；真实用户操作未验 |

## 验证记录

基线：`tsc --noEmit --incremental false` 退出 0；`npm run lint` 退出 0，仅原 `CoverEditor.tsx:117`、`ImageUploader.tsx:89` 的两条 `<img>` 警告。输出见 `artifacts/content-ops-integration/baseline-*.log` 和 `.exit`。

已完成首轮 `npm run build` 退出 0，所有移动和新增 API 路由已构建。行为测试最近一轮 23 项通过，独立审查已确认已知缺陷闭合；最终重跑记录见后附表。

测试不是全部 TDD：迁入原文件没有伪造先失败流程。新增兼容/缺陷的 RED 日志有 `red-blogger.log`、`red-contracts.log`、`red-review.log`、`red-upsert.log`、`red-history.log`、`red-job-contract.log`、`red-job-state.log`，分别确认指标丢失、错误状态错误、TikTok 不一致、旧字段清空、代理假成功/裸错误、重复键、多行结构丢失、缺失任务 ID/状态及合法业务失败态误判；相应 GREEN 日志已保存。旧功能和管线 fixture 属迁入后的回归覆盖。

`persisted-fixture.json` 是临时目录真实落盘后回读的虚构方案/道库。`renderer-fixture.mp4` 和 `renderer-fixture-results.json` 是本机 ffmpeg fixture 及四管线 mock 输出检查，不是实际 AI/Remotion 成片。Python 使用 `ast.parse` 与 `runpy` 纯函数 fixture，没有 pycache、网络或 crawler 子进程。

## 兼容与数据边界

- 两份冻结输入的逐文件 disposition 已先保存再写源码；排除真实 `.env*`（仅 example 可读）、Cookie、`.local`、原音视频、构建缓存、系统元数据及本机配置。
- 根与 renderer 的 `node_modules` 仅在整合内建只读复用链接，未安装、未改原依赖。没有 target 真实 `.env`。
- `/api/bloggers` 保留主线形状；`/api/blogger/*` 保留旧采集 URL 以承接独立服务，数据共用。道库仅走主线本机存储，不建/补/迁飞书表。
- 内部 renderer/Python 保留源服务原始 JSON，主 app API 统一 `{code,data,message}`。历史 `history` 是拆片历史，生成任务仍为内存 jobs。
- 生成输出不会自动导入旧作品/项目，这是源行为边界，不改变现有资产/作品存储。服务使用说明见两服务 README。
- 所有保守决定完整列在 [QUESTIONS.md](../QUESTIONS.md) 的「content-ops 整合」六项：道库存储、模板命名空间、未知字段与重复键、历史编码、生成输出归属、隔离验证。

## 未完成的真实验收与复查步骤

1. 本机启动 Next 在 `127.0.0.1:3197` 返回 `EPERM`（终端和 Node 工具各试一次）。Chrome MCP 被既有配置目录占用，CUA 浏览器宿主不可用；没有修改全局配置、关闭既有浏览器或绕过沙箱。因此没有实际截图、窄屏/焦点/溢出/下载/延迟响应交互证据。
2. 父任务可在允许回环监听的隔离环境启动 `env -i PATH="$PATH" NEXT_TELEMETRY_DISABLED=1 npm run dev -- --hostname 127.0.0.1 --port 3197`，保持无真实配置，检查桌面工具、原模板/工厂/作品/项目菜单及 `/m` 各页；检查 390px 与桌面布局、笔记选择层、模板生成与 PNG 下载、失败提示、长文本、键盘焦点。生成/采集请求须 mock，不发收费/外部请求。
3. 真飞书读写、MediaCrawler/yt-dlp 抓取、微软语音、Remotion 成片和百炼/硅基流动均未执行；真实服务与媒体质量需要另行许可/配置。当前证据不能代替这些结果。
