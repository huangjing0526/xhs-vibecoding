# VibeNote 视频渲染服务

把「视频生成」环节的 `VideoPlan`（脚本/分镜/字幕）+ edge-tts 配音，用 **Remotion** 渲染成 1080×1920 竖版「图文快闪」mp4。

> 独立的本地 Node 服务，**不进 Cloudflare 部署**（Remotion 渲染需要本机 Node + headless Chromium）。主 app 通过 `app/api/video/render` 转发到这里。

## 启动

```bash
cd services/video-renderer
npm install          # 首次会下载 Remotion 所需的 headless Chromium，较大
npm start            # 默认监听 http://localhost:8787
```

主 app 侧通过环境变量指向本服务（默认即此地址）：

```bash
# xhs-vibecoding/.env.local
VIDEO_RENDERER_URL=http://localhost:8787
```

## 接口

`POST /render`

```jsonc
{
  "plan": { /* lib/videoWorkflow.ts 的 VideoPlan，必须含 voiceover */ },
  "voice": "zh-CN-XiaoxiaoNeural",   // 可选，edge-tts 音色
  "rate": "+18%",                     // 可选，语速；不传按 plan.pace 推断
  "imageUrls": []                     // 可选，复用封面/笔记图作各屏背景
}
```

返回：

```json
{ "id": "video-xxx", "videoUrl": "http://localhost:8787/out/video-xxx.mp4", "durationSec": 23.4 }
```

`GET /health` → `{ "ok": true }`

---

`POST /extract`（链接拆片：抖音/小红书 → 无水印视频 + 口播脚本）

```jsonc
{ "url": "https://v.douyin.com/xxxxx/" }   // 纯链接；分享口令的抠取在主 app 侧完成
```

返回：

```jsonc
{
  "platform": "douyin",
  "title": "...", "desc": "...", "author": "...",
  "durationSec": 42,
  "coverUrl": "...",
  "videoUrl": "http://localhost:8787/out/extract-xxx.mp4",
  "transcript": "口播脚本（ASR 转写）",
  "transcriptNote": ""   // 转写失败/未启用时给原因，视频与文案仍可用
}
```

依赖本机二进制：`yt-dlp`（抓无水印视频 + 元信息）、`ffmpeg`（抽音频）。ASR 口播转写可插拔，配置放**本服务自己的 `.env`**（不是主 app 的 `.env.local`——那份是 Next 进程读的，本服务读不到）；`npm start` 会通过 `--env-file-if-exists=.env` 加载它：

```bash
brew install yt-dlp ffmpeg whisper-cpp
# 下载 ggml 模型（推荐 large-v3 / large-v3-turbo），然后在 services/video-renderer/.env 里配：
#   ASR_PROVIDER=whisper-cpp
#   WHISPER_BIN=whisper-cli
#   WHISPER_MODEL=/abs/path/to/ggml-large-v3.bin
#   WHISPER_LANG=zh
# 或走 API：ASR_PROVIDER=siliconflow + ASR_API_KEY（详见 .env 注释）
```

抖音（及小红书）要浏览器 cookie（哪怕未登录）才不报「Fresh cookies needed」。

⚠️ 本服务是**后台进程、脱离登录会话**，`--cookies-from-browser chrome` 拿不到 macOS 钥匙串、解不了 Chrome 加密 cookie。所以后台跑时用**导出的 cookies.txt**，在 `.env` 配 `YTDLP_COOKIES_FILE`。导出（在能访问钥匙串的交互终端里跑一次）：

```bash
# 用 yt-dlp 自带 cookie 模块把 Chrome cookie 导成 Netscape 格式
/Users/kp/.local/pipx/venvs/yt-dlp/bin/python - services/video-renderer/cookies.txt <<'PY'
import sys
from yt_dlp.cookies import extract_cookies_from_browser
class L:
    def debug(s,m):pass
    def info(s,m):pass
    def warning(s,m):pass
    def error(s,m):print("ERR:",m)
jar = extract_cookies_from_browser("chrome", logger=L())
jar.save(sys.argv[1], ignore_discard=True, ignore_expires=True)
print("saved", sum(1 for _ in jar), "cookies")
PY
```

抖音的匿名 cookie（ttwid 等）会轮换、有时效；再次报「Fresh cookies needed」时重跑上面这条刷新即可。`cookies.txt` 已 gitignore。（前台/交互式运行时也可直接用 `YTDLP_COOKIES_FROM_BROWSER=chrome`。）

抖音用户主页/搜索/发现页里的视频，URL 形如 `.../search/...?modal_id=<id>`，主 app 的 `normalizeVideoUrl` 会自动改写成 `/video/<id>` 再交给 yt-dlp。

> 主 app 通过 `app/api/video/extract` 转发到这里，环境变量 `VIDEO_EXTRACTOR_URL`（默认复用 `VIDEO_RENDERER_URL`）配在主 app 的 `.env.local`。v1 先跑通抖音，小红书为第二步。

## 工作流程

1. `edge-tts`（msedge-tts）把 `plan.voiceover` 合成中文配音 mp3，并测算时长。
2. Remotion 按音频时长动态计算视频帧数（`calculateMetadata`），渲染封面屏 + 逐屏字幕 + 进度条，配上音轨。
3. 输出到 `out/`，通过静态路由回传 URL。

## 自定义

- 视觉风格：`src/FlashCards.tsx`（暖白纸感 + 普惠橙，和封面图工作流同一套识别度）。
- 音色/语速：请求里传 `voice` / `rate`。
- 想换数字人口播或文生视频，只需替换 `src/server.mjs` 里 TTS + 渲染两段，对外接口不变。

## 整合后的生成管线与数据边界（2026-11-17）

桌面从「工具 → 一键出片」进入，移动从 `/m/t/clip` 进入；两端复用同一个 `VideoGenerationStudio` 和主 app API。旧视频工厂、`/render`、`/tts`、`/extract` 保留。

| 主 app 接口 | 本服务接口 | 用途 |
| --- | --- | --- |
| `POST /api/video/generate`，`mode: local` | `POST /local` | 图片、脚本、TTS、字幕与静态图合成 |
| 同上，`mode: avatar`、`openingSec: 0` | `POST /avatar` | 全程数字人分段生成 |
| 同上，`mode: avatar`、`openingSec > 0` | `POST /avatar` | 开场数字人，后续图片混合剪辑 |
| 同上，`mode: product` | `POST /product` | 产品图生视频，再合成配音字幕 |
| `GET /api/video/jobs/:id` | `GET /jobs/:id` | 查询进度、结果或具体错误 |

生成请求示例（仅契约说明，本次没有实际提交）：

```json
{"mode":"local","script":"你的口播脚本","images":["data:image/jpeg;base64,..."],"voice":"zh-CN-XiaoxiaoNeural"}
```

提交返回 `{code:0,data:{jobId,kind,state},message}`，查询返回 `{code:0,data:{id,kind,state,stage,step,totalSteps,result,error,...},message}`。完成态 `result` 含 `videoUrl/fileName/durationSec/segments/resolution`。内部服务维持原始 JSON 响应，主 app 兼容代理统一包装；HTTP 200 非 JSON/错误载荷也按失败返回。

- **本地合成不等于离线**：画面在本机合成，但默认 TTS 仍访问微软。数字人、产品展示还会调用百炼或硅基流动。四条管线本次只做隔离 mock 验证，没有真实语音或收费生成。
- 服务只绑定 `127.0.0.1`。`VIDEO_RENDERER_URL` 是 app 到 renderer 的地址；新生成任务的结果通过 app 的 `/api/video/media/:filename` 同源读取，手机不用连接自己的 localhost。`PUBLIC_URL` 仍供 Remotion 内部读取音频/图片，不需为新结果暴露 renderer 端口。旧 `/render`、`/tts` 的内部地址契约保持不变，此次没有开放网络。
- `out/`、`audio/`、`assets/` 是该服务自己的本机输出，全部忽略；不会迁移源端文件，也不会自动加入工作台视频项目或作品库。现有 `/api/works` 聚合逻辑不变。
- 任务仍采用源端内存机制：重启丢失上下文，已完成文件仍在，完成态任务保留约六小时。不会自动恢复或重新提交收费作业。
- 整合目录已用只读依赖链接复用既有依赖，**链接存在时不要运行 npm install**。此次未安装依赖，也未修改原依赖目录。新环境如需安装，应先在整合副本使用独立依赖目录。
- 不复制或读取源端 `.env`、Cookie。需要真实服务验证时，必须单独准备整合环境配置并由父任务核准；本任务不建表、不发布、不部署。

## 服务认证与开场预算（审查修复）

app 与 renderer 各自的运行环境必须设置相同的私有 `VIDEO_RENDERER_SERVICE_TOKEN`，示例键见仓库 `.env.example`。app 为新生成、任务查询和结果代理添加 `Authorization: Bearer <token>`；该值不发送到浏览器。此修复没有生成密钥或改写真实配置。

- `/avatar`、`/product` 缺配置返回 503，缺少或错误认证返回 401；认证成功才可进入生成路由。
- `/avatar`、`/product`、`/local`、`/tts`、`/render`、`/extract` 拒绝跨站浏览器请求（403）。app 的新建任务入口同样检查来源，防止绕过 renderer 边界。服务端 app/CLI 的无 Origin 本地 TTS/render 调用保持可用；媒体 GET/HEAD 保留供 Remotion 使用的只读 CORS。
- 查询断线只暂停查询，保留任务 ID，点「继续查询」查同一任务；不会重新创建付费任务。切换模式不会丢弃活动任务。页面卸载会中止查询和定时器，后台任务继续运行；刷新后的任务恢复仍属原有未实现能力。
- 开场切分优先沿用句子边界，超长首句按所选时长的字数估算切开。TTS 实测超过所选开场时长或平台单次上限时，在上传和付费创建之前停止，提示缩短开场或重新选择；不自动扩大预算。全程出镜管线保持不变。
