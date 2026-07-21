# 内容生产工作台

把开发日报、问题记录、AI Coding 术语沉淀成可发布的内容，跑通「素材 → 选题 → 草稿 → 封面/配图/视频 → 质检 → 发布 → 数据复盘」的完整闭环。飞书多维表格作为内容数据库。

> **改造中**：本项目正在从「小红书内容工作台」改造为平台无关的内容生产工作台，首批覆盖小红书、视频号、抖音、TikTok、Facebook。
> 方案见 [`docs/content-workbench-refactor-plan.md`](docs/content-workbench-refactor-plan.md)。当前代码仍以小红书为唯一发布目标。

## 管线

```text
素材库 / 术语库
      ↓  内容卡片生成 + 道库评分
   选题池
      ↓  草稿生成
   草稿库  ──→ 封面方案 / 内容配图 / 视频方案
      ↓  发布前质检
   已发布
      ↓
 数据复盘表
```

## 快速开始

```bash
npm install
cp .env.example .env.local   # 补齐飞书 + AI 配置
npm run dev                  # http://localhost:3000
```

未配置飞书时自动进入 **demo 模式**，用 `lib/demoWorkflow.ts` 的样例数据渲染完整界面。
未配置 AI Key 时自动降级到 **mock**，各接口返回规则兜底结果而非报错。

## 配置

### AI 服务商

按环境变量存在与否自动探测，**首个命中者生效**（`lib/workflowAi.ts`）：

| 优先级 | 服务商 | 环境变量 | 默认模型 |
| --- | --- | --- | --- |
| 1 | Gemini | `GEMINI_API_KEY` | `gemini-2.5-flash` |
| 2 | 硅基流动 | `SILICONFLOW_API_KEY` | `Qwen/Qwen2.5-7B-Instruct` |
| 3 | OpenAI | `OPENAI_API_KEY` | `gpt-4o-mini` |
| 4 | Anthropic | `ANTHROPIC_API_KEY` | `claude-sonnet-4-5-20251001` |
| 5 | 自定义 | `CUSTOM_API_KEY` + `CUSTOM_API_BASE` | `gpt-3.5-turbo` |
| 6 | mock | — | 返回规则兜底结果 |

指定 `forceProvider` 时若该商 Key 缺失，会降级到 mock 而**不会静默切换到别家**——避免道库评分这类对模型敏感的任务被悄悄换模型。

### 飞书

```env
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
FEISHU_BASE_APP_TOKEN=appxxx

FEISHU_MATERIAL_TABLE_ID=tblxxx
FEISHU_GLOSSARY_TABLE_ID=tblxxx
FEISHU_TOPIC_TABLE_ID=tblxxx
FEISHU_DRAFT_TABLE_ID=tblxxx
FEISHU_REVIEW_TABLE_ID=tblxxx
```

飞书应用需开通多维表格读写权限，并加入对应表格的协作者。国际版 Lark 需设 `FEISHU_API_BASE=https://open.larksuite.com`。

### 表结构

| 表 | 环境变量 | 核心字段 |
|---|---|---|
| 素材库 | `FEISHU_MATERIAL_TABLE_ID` | 素材ID、来源类型、日期、原文摘要、核心事件、踩坑点、可复用方法、关联术语、状态 |
| 术语库 | `FEISHU_GLOSSARY_TABLE_ID` | 术语、一句话解释、常见误区、真实案例、可收藏资产、适合标题角度 |
| 选题池 | `FEISHU_TOPIC_TABLE_ID` | 选题ID、来源素材、关联术语、栏目、目标读者、读者痛点、核心观点、真实案例、可收藏资产、标题候选、封面文案、正文结构、评论引导、预计收藏价值、状态、质量分、命中道、偏爆偏哑、封面* |
| 草稿库 | `FEISHU_DRAFT_TABLE_ID` | 笔记ID、选题ID、最终标题、封面文案、正文、配图建议、话题标签、评论引导、发布状态、写前评分、审后评分、质检问题、相似风险、封面* |
| 数据复盘表 | `FEISHU_REVIEW_TABLE_ID` | 笔记ID、标题、阅读量、点赞量、收藏量、评论量、分享量、72小时结论、问题归因、下一步动作、复盘备注 |

> 字段名即 schema——读写映射在 `lib/xhsWorkflow.ts` 的 `normalize*` / `map*ToFeishuFields` 中以中文字符串字面量定义。

### 本地文档入库

```env
LOCAL_DOCS_SOURCE_DIR=/path/to/docs/06-协作记录
XHS_TOPIC_POOL_DIR=/path/to/内容库
```

扫描 `reports/daily/`（日报周报）、`reports/issues/`（问题记录）写入素材库；`学习资料/`、`process/Vibe-*` 写入术语库。

## 界面

单页应用，9 个区域分三组（`components/workflow/WorkflowDashboard.tsx` 的 `AREAS`）：

- **工作台**：默认落地页，选一篇笔记从选题写到发布
- **内容流程**：素材库、封面与配图、视频脚本、发布检查、数据复盘（按流水线先后排列）
- **AI 工具**：爆款优化、对标拆解、视频去水印（随时可调，不打断主流程）

## API

所有接口统一返回 `{ code, data, message }`（`app/api/feishu/_utils.ts`），`/api/cover` 除外——它直接返回 PNG 字节。

```bash
# 读飞书
curl "http://localhost:3000/api/feishu/sync?table=material&status=待提炼"

# 素材 → 选题
curl -X POST localhost:3000/api/feishu/content-cards \
  -H "Content-Type: application/json" -d '{"count":5,"writeBack":true}'

# 选题 → 草稿
curl -X POST localhost:3000/api/feishu/drafts \
  -H "Content-Type: application/json" -d '{"count":3,"writeBack":true}'

# 生成封面方案
curl -X POST localhost:3000/api/feishu/covers \
  -H "Content-Type: application/json" \
  -d '{"sourceType":"draft","recordId":"recxxx","writeBack":true}'

# 数据复盘
curl -X POST localhost:3000/api/feishu/review \
  -H "Content-Type: application/json" -d '{"writeBack":true}'
```

## 道库脚本

小红书内容线由 Claude 在会话内生成，替代接口里的 Gemini 生成——质量更高、不耗 API Key、不花 API 成本；代价是 Claude 必须在场，这在 48 小时人工审稿窗口下可以接受。详见 `scripts/daoku/README.md`。

```bash
npm run daoku:pull     # 拉未评分选题 → JSON
npm run daoku:write    # 评分结果写回飞书
npm run daoku:dedup    # 按内容签名去重（默认 dry-run，--apply 才删）
npm run xhs:pull       # 拉 materials|topics|drafts 各阶段数据
npm run xhs:write      # 写回对应表
```

脚本自带独立飞书客户端和 `.env` 解析（`scripts/daoku/_feishu.mjs`），不依赖 `npm run dev`，也不引用 `lib/`——**改字段名需手工同步**。

## 视频渲染

`services/video-renderer` 是独立 Express 服务（Remotion + edge-tts），**不随 Cloudflare 部署**，需本地 Node + headless Chromium。

```bash
cd services/video-renderer && npm install && npm start   # :8787
```

`/api/video/render` 是纯代理，目标由 `VIDEO_RENDERER_URL` 指定（默认 `http://localhost:8787`）。输出 1080×1920 (9:16) H.264/AAC，时长由配音音频决定。

## 技术栈

- **框架**：Next.js 15 + React 19
- **样式**：Tailwind CSS
- **AI**：OpenAI SDK（兼容 Gemini/硅基流动/自定义）+ Anthropic SDK
- **封面**：Satori + resvg-wasm（服务端）/ Canvas（客户端）
- **视频**：Remotion + msedge-tts
- **部署**：Cloudflare Workers（`@opennextjs/cloudflare`）

## 项目结构

```text
app/
  api/feishu/       飞书读写 + 各生成接口
  api/cover/        Satori → PNG
  api/video/render  代理到 video-renderer
  page.tsx          → WorkflowDashboard
components/workflow/  当前应用
lib/
  xhsWorkflow.ts    领域类型 + 飞书映射 + prompts（核心）
  feishu.ts         Bitable REST 客户端
  workflowAi.ts     AI 调用唯一入口
  qualityCheck.ts   发布前质检（纯函数）
  daoku.ts          道库评分标准
docs/               PRD + 改造方案
scripts/daoku/      Claude 会话内生产管线
services/video-renderer/  Remotion 渲染服务
```

## 开发

```bash
npm run dev
npm run build
npm run cf:deploy    # Cloudflare
```

## License

MIT
