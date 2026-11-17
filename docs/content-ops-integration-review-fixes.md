# content-ops 独立审查问题修复记录

日期：2026-11-17。范围依据：`docs/content-ops-integration-plan.md` 和父任务独立审查发现的七项问题。本文记录首轮修复时点；父任务随后补充可信 Host 边界与显式停止丢失任务跟踪，并重新执行检查和浏览器验证，最终结论见 [最终整合交付说明](content-ops-integration-final.md)。真实外部系统仍未验收，不能声称生产端到端通过。

## 隔离与并发边界

- 仅修改整合工作区，未切分支、提交、部署、发布、运行付费任务、迁移数据或清理源目录。
- 未读取实际 `.env`、Cookie、原 `.local`；仅使用虚构 fixture 与新建临时目录。测试中读取的 `.local` 均为测试自己写入的隔离数据。
- 首次 `ps` 和 `kill(pid, 0)` 检查分别被权限拒绝；先处理新测试与非冲突文件。再次只读检查返回 `ESRCH` 后，才修改 renderer、jobs、文档与测试脚本。未终止 PID 84022。
- 主实现既有 staged/unstaged 变更原样保留。没有修改原根目录、备份、依赖目录或导航索引。
- 构建、类型和 lint 在 `/var/folders/cr/_tc41mmn34s6l7xf8thntsgr0000gn/T/content-ops-review-build-OVydH0` 的源码副本运行。复制时排除 `.env*`、Cookie、`.local`、Git 和 artifacts；依赖仅链接既有只读目录，运行环境使用独立 HOME。没有覆盖 5397 的旧生产构建。

## 修复与验收清单

| 项目 | 最终行为 | 自动检查证据 | 状态 |
| --- | --- | --- | --- |
| 1. 查询生命周期 | 单个串行 `setTimeout`；查询失败暂停且保留 ID/生成状态；显式继续查询同一任务；暂停时禁止重复创建；同模式无动作，活动任务不因切档丢失；cleanup 中止请求、定时器与晚到结果 | 真实抽取的 `startVideoJobPolling`，延迟请求、失败/恢复、终态、abort、回调内 cleanup；实际组件切档回调 | 自动通过；最终交互待验 |
| 2. 手机媒体结果 | 只按安全文件名构造 `/api/video/media/:filename`，忽略结果自带远程 URL；固定 renderer `/out`，禁止路径穿越与重定向；流式 Range/206、404/416、媒体 MIME；内部音频地址不变 | mock 上游 GET/Range；遍历非法路径；代理结果真实落盘、字节一致、ffprobe 有视频流；原生成失败仍为查询成功契约 | 自动通过；真实 HTTP 播放/拖动/下载待验 |
| 3. 付费入口保护 | `/avatar`、`/product` 要求共享服务 token；无配置 503，缺失/错误 401；全部 costly renderer 入口拒绝跨站浏览器；app 新建入口同样拒绝跨站；保留无 Origin 的旧 TTS/render 服务端调用与只读媒体 CORS | 执行 server 实际中间件装配和实际鉴权函数；合法/缺失/错误 token、陌生 Origin、cross-site、大小写/尾斜线；app Host/协议/代理/认证 header fixture | 自动通过；未调用真实付费服务 |
| 4. 开场时长 | 复用分段规则，超长首句按所选预算切开；合成后直接 ffprobe 文件，超过所选上限、平台上限或测量失败，在上传与付费创建前停止；全程出镜逻辑不变 | 长首句 5/10/15 秒纯函数回归；真实 6 秒 MP3、TTS 元数据谎报 1 秒，仍拒绝且 provider/upload 调用为 0；ffprobe 缺失亦拒绝 | 自动通过；真实 TTS/供应商待验 |
| 5. 未知昵称 | 有账号 ID/主页的保存账号仍可列出；昵称保持未知空值，仅展示用 ID/主页兜底；空字段及 `fields:null` 不拖垮列表 | 真实 collect→save→list 路由与字段映射 fixture，飞书 HTTP mock；检查保存/重读结果和展示函数 | 自动通过；真实飞书待验 |
| 6. 道库存储 Promise | 共享回调返回实际保存 Promise，失败向调用方 reject；成功提示与模板更新在保存完成后；保留当前会话选择；调用方 await/catch | 执行实际共享组件回调，延迟成功、失败、调用方异常处理；已有隔离保存测试检查实际 JSON | 自动通过；最终 UI 提示待验 |
| 7. 证据目录 | runner 与两个写文件测试均确保目录存在，不删除既有日志 | 新临时工作区最初无 artifacts，运行完整 runner 并检查实际 JSON/MP4；子运行只跳过自身递归测试 | 自动通过 |

## RED → GREEN 与质量复查

所有新增行为测试均在对应修改前运行。初始 RED 执行原组件生命周期/回调与实际路由、脚本、中间件；最终轮询测试直接导入生产 helper。测试不以源字符串或正则断言代替行为。AST 仅用于执行组件实际闭包与 server 实际中间件装配，不检查源码拼写。

- `artifacts/content-ops-integration/review-red-confirmed.log`：查询错误、同档切换、远程结果 URL、无认证中间件、长首句、开场付费调用、昵称丢失、Promise 提前完成、无 artifacts 导致 ENOENT。初次探索日志 `review-red-initial.log` 另保留；其中监听 EPERM 是环境失败，未作为产品 RED。
- `review-red-app-origin.log`：app 可绕过 renderer 来源边界；随后补源检查。
- `review-red-audit.log`：独立复查新增的 LAN/内部 URL 来源误判、`fields:null`、TTS 估时不能证明真实时长，均先失败再修复。
- `review-red-cleanup.log`：状态回调内清理后仍发第二次查询（`2 !== 1`）；增加入口与回调后的 abort 检查后通过。
- `review-final-tests-after-cleanup.log` 和 `.exit`：最后 41/41，通过，退出 0，无跳过。初期及中间 GREEN 原始日志均保留。
- 复查了复用、异常传播、状态保护、串行请求、媒体流/路径边界。开场切分复用既有分段函数，实测复用既有 ffprobe 函数；未做广泛重构。
- 独立只读审查由 `/root/review_fixes_audit` 完成，并在最终两行 abort 防护后再次复核；未发现剩余代码阻塞。独立结论另存 `artifacts/content-ops-integration/review-independent-audit.md`。

## 最终检查

| 检查 | 结果 | 原始日志 |
| --- | --- | --- |
| `npm run test:integration` | 41/41；退出 0 | `review-final-tests-after-cleanup.log/.exit` |
| `tsc --noEmit --incremental false` | 退出 0 | `review-after-cleanup-types.log/.exit` |
| `npm run lint` | 退出 0；仅原 `CoverEditor.tsx:117`、`ImageUploader.tsx:89` 的两条 img 警告 | `review-after-cleanup-lint.log/.exit` |
| `npm run build` | 退出 0；51 个静态页面生成完成，媒体代理路由已包含 | `review-after-cleanup-build.log/.exit` |
| renderer 全部 `.mjs`：`node --check` | 全部退出 0 | `review-final-renderer-syntax.log/.exit` |
| renderer `src/index.ts/Root.tsx/FlashCards.tsx/ClipReel.tsx` 类型 | 退出 0 | `review-final-service-source-types.log/.exit` |
| 上述服务检查另包含 `remotion.config.ts` | 退出 2，既有缺依赖 `@remotion/cli/config`（TS2307）；没有安装或修改只读依赖 | `review-final-service-types.log/.exit` |
| `git diff --check` | 退出 0 | 最后检查汇总 JSON |

类型命令使用已有 TypeScript，renderer 使用 `--noEmit --skipLibCheck --jsx react-jsx --moduleResolution bundler --module esnext --target es2022 --esModuleInterop`。最终 helper 改动后重跑了 app 类型、lint 和生产构建；renderer 源码在其通过检查后未再改动。

## 本轮实际修改文件

`.env.example`、`QUESTIONS.md`；`app/api/bloggers/route.ts`；`app/api/video/generate/route.ts`、`jobs/[id]/route.ts`、新 `media/[filename]/route.ts`；`components/workflow/BloggerResearch.tsx`、`VideoGenerationStudio.tsx`、`WorkflowDashboard.tsx`；`lib/integration/renderer.ts`、新 `lib/videoJobPolling.ts`、`lib/workflowClient.ts`；`scripts/test-content-ops-integration.mjs`；`services/video-renderer/README.md`、`src/server.mjs`、新 `requestAuth.mjs`、`script.mjs`、`hybridPipeline.mjs`、`tts.mjs`；`tests/content-ops-integration/flows.test.mjs`、`renderer.test.mjs`、新 `review-regressions.test.mjs`；本报告与对应证据。

`lib/bloggerFeishu.ts` 经过检查，最终没有增加本轮变更；主实现已有的指标映射保留。未修改 package、Root.tsx 或导航索引。

## 配置后果、决策与待验项

- 新示例键 `VIDEO_RENDERER_SERVICE_TOKEN` 必须由 app 和 renderer 的运行环境配置相同值。只更新示例与 README，未生成密钥或写真实配置。未配置时云端付费接口按要求关闭；这不表示获得生产配置访问权限。
- `QUESTIONS.md` 新增五项决策：断线只恢复查询；付费认证与旧本地兼容边界；按安全文件名同源读取；超所选时长付费前拒绝；可选清理和缓存/selectedTopic 问题留存。未引入新价格、业务总量限制、schema 或迁移。
- 可选的竞争蒸馏实现删除、Feishu 序列化器清理、重复指标映射复用均未执行。移动缓存保留数据与 Demo 回退、stale selectedTopic 仍是残余项，未声称修复。
- Chrome DevTools 因现有 profile 被占用不能连接，沙箱监听回环端口为 EPERM。没有终止现有浏览器/服务。已实际查看父任务修复前的 `parent-mobile-clip.png`，确认沿用当前组件；它不作为修复后的视觉证据。
- 父任务需重启最终隔离构建，在桌面及手机布局检查：任务查询失败→暂停→同 ID 恢复；暂停/运行期间不能新建或切档；完成/失败状态；长昵称/主页展示；道库延迟保存与失败提示；媒体播放、Range 拖动和实际下载文件。用受控 fixture/mock，不能为此提交付费任务。
- 未验证真实飞书、采集、网络 TTS、Remotion 视听质量或云端付费供应商。fixture 使用真实磁盘、ffmpeg/ffprobe、实际路由/生命周期/映射/中间件，外部边界为 mock；不等同于真实外部集成成功。
