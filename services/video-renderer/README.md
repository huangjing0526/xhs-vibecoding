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

> 主 app 通过 `app/api/video/extract` 转发到这里，环境变量 `VIDEO_EXTRACTOR_URL`（默认复用 `VIDEO_RENDERER_URL`）配在主 app 的 `.env.local`。小红书部分链接需 yt-dlp cookie，v1 先跑通抖音。

## 工作流程

1. `edge-tts`（msedge-tts）把 `plan.voiceover` 合成中文配音 mp3，并测算时长。
2. Remotion 按音频时长动态计算视频帧数（`calculateMetadata`），渲染封面屏 + 逐屏字幕 + 进度条，配上音轨。
3. 输出到 `out/`，通过静态路由回传 URL。

## 自定义

- 视觉风格：`src/FlashCards.tsx`（暖白纸感 + 普惠橙，和封面图工作流同一套识别度）。
- 音色/语速：请求里传 `voice` / `rate`。
- 想换数字人口播或文生视频，只需替换 `src/server.mjs` 里 TTS + 渲染两段，对外接口不变。
