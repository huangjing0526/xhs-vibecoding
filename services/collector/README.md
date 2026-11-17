# 对标账号采集服务

小红书 / 抖音 / TikTok 账号主页 → 账号信息 + 最近 N 条笔记（含互动数据）。

独立本地服务，**不随 Cloudflare 部署**。app 侧的 `/api/blogger/*` 只是代理，与 `services/video-renderer` 同一模式——采集要 Playwright 真实浏览器和你自己的登录态，Workers 跑不了。

**两个抓取后端，按平台分派**，因为 MediaCrawler 不支持 TikTok（它只有 xhs/dy/ks/bili/wb/tieba/zhihu）：

| 平台 | 后端 | 需要装 |
|---|---|---|
| 小红书 / 抖音 | MediaCrawler | 见下方「接真实采集」，步骤较多 |
| TikTok | yt-dlp | `brew install yt-dlp`，拆片服务本来就依赖它 |

两个后端互不影响：只装 yt-dlp 也能采 TikTok，不必先把 MediaCrawler 配通。

## 快速开始

```bash
cd services/collector
python3 server.py            # :8788
```

**零依赖即可启动**：`/health` 和各种错误提示不需要装任何东西。真实采集才需要对应后端。

```bash
curl localhost:8788/health
# {"ok": true, "mediacrawlerConfigured": false, "ytdlpAvailable": true}
```

两个标志分别对应两个后端：`mediacrawlerConfigured` 管小红书/抖音，`ytdlpAvailable` 管 TikTok。

## 接真实采集

抓取委托给 [MediaCrawler](https://github.com/NanmiCoder/MediaCrawler)，本服务只负责调它并把结果归一成本项目的契约。

**它要求 Python ≥ 3.11**（`pyproject.toml` 的 `requires-python`），macOS 自带的是 3.9，需要另装：

```bash
brew install python@3.12

git clone https://github.com/NanmiCoder/MediaCrawler.git ~/MediaCrawler
cd ~/MediaCrawler
/usr/local/opt/python@3.12/bin/python3.12 -m venv venv

# ⚠ 不要用 pip install -e .：MediaCrawler 的 pyproject.toml 里写的是 `author`
# （合法键是 `authors`），setuptools 会直接报 "must not contain {'author'} properties"。
# 它本来是给 uv 用的（仓库里有 uv.lock），uv 不校验这个键。
# 我们只需要 `python main.py`，并不需要把它装成包，所以直接装依赖列表即可：
python - <<'EOF' > /tmp/mc-deps.txt
import re, pathlib
txt = pathlib.Path("pyproject.toml").read_text()
block = re.search(r"^dependencies = \[(.*?)^\]", txt, re.S | re.M).group(1)
print("\n".join(re.findall(r'"([^"]+)"', block)))
EOF
./venv/bin/pip install -r /tmp/mc-deps.txt
./venv/bin/playwright install chromium
```

（或者装 `uv` 后直接 `uv sync`，那是它官方的方式。）

然后在 `services/collector/.env`（或直接用环境变量）里配：

```env
MEDIACRAWLER_DIR=/Users/you/MediaCrawler
MEDIACRAWLER_PYTHON=/Users/you/MediaCrawler/venv/bin/python
MEDIACRAWLER_LOGIN_TYPE=cookie      # 首次可用 qrcode 扫码登录
MEDIACRAWLER_COOKIES=...            # 从浏览器导出的 cookie 串
```

启动时读 `.env`：

```bash
set -a && source .env && set +a && python3 server.py
```

## 接口

| 方法 | 路径 | 入参 | 出参 |
|---|---|---|---|
| GET | `/health` | — | `{ ok, mediacrawlerConfigured, ytdlpAvailable }` |
| POST | `/profile` | `{ platform, homeUrl }` | `{ profile }` |
| POST | `/notes` | `{ platform, homeUrl, limit }` | `{ profile, notes, collected }` |

`platform` 取 `xiaohongshu` / `douyin` / `tiktok`。`homeUrl` 必须是**个人主页**链接：

- 小红书 `https://www.xiaohongshu.com/user/profile/<24位ID>`
- 抖音 `https://www.douyin.com/user/<sec_uid>`
- TikTok `https://www.tiktok.com/@<handle>`（`vm.tiktok.com` 的分享短链指向单条视频，不是主页，用不了）

失败一律返回 `{ "error": "中文可操作提示" }`，业务性失败用 400（没装 MediaCrawler、链接不对、风控拦截），只有服务自身异常才 500。

## ⚠ 两件必须知道的事

**1. 小红书/抖音拿不到阅读量，这不是 bug；TikTok 能拿到。**

小红书和抖音的公开数据里**没有浏览量**——只有创作者本人在自己后台能看到。采集侧只能拿到点赞 / 收藏 / 评论 / 分享，所以这两个平台的 `metrics.views` 恒为空，飞书「阅读量」列会是空的。

`lib/viralSignals.ts` 的兜底打分对此有专门的降级档：有阅读量按互动率折算（跨账号可比），没有就按互动总量折算（**只在同一个账号内可比**）。AI 打分路径不受影响，它本来就是看绝对数据 + 正文判断的。

TikTok 是例外：它公开播放量，`views` 有真值，兜底打分走的是互动率那一档，点赞/收藏/评论/分享也都齐。所以 TikTok 账号的兜底分和小红书/抖音账号**不要横向比**——档位不同。

**2. 契约已对 MediaCrawler `2a8063a`（2026-08）实跑核对过。**

本服务用到的 9 个参数——`--platform` `--lt` `--type` `--creator_id` `--cookies` `--save_data_option` `--save_data_path` `--get_comment` `--crawler_max_notes_count`——全部存在且被接受。

换版本后如果参数名变了**不会静默失败**：typer 会报 `No such option: --xxx`，本服务原样透传到错误提示里。耦合点只有 `run_mediacrawler()` 一个函数，也可以用 `MEDIACRAWLER_ARGS` 追加参数而不改代码。

两处 MediaCrawler 默认值本服务已主动覆盖：

- `CRAWLER_MAX_NOTES_COUNT = 15` → 由请求的 `limit` 传入。不传的话用户填 20 会**静默只拿到 15 条**。
- `ENABLE_GET_COMMENTS = True` → 关掉。我们只用笔记正文和互动数，抓评论会为每条笔记多打一轮请求，白白拉长耗时并放大风控敞口。需要时 `MEDIACRAWLER_ARGS=--get_comment true`。

MediaCrawler 自身的 `HEADLESS = False` 与 `SAVE_LOGIN_STATE = True` 保持默认：前者让扫码登录时浏览器可见，后者让登录态持久化、不必每次重扫。

## TikTok（yt-dlp 后端）

只需要 `brew install yt-dlp`，不用登录、不用 cookie，实测公开主页直接能抓。耦合点只有 `run_ytdlp()` 一个函数。

几个已实测的边界：

- **用 `--flat-playlist`**。TikTok 的列表接口本身就带 stats，flat 模式照样回 view/like/comment/repost/save，只少了 formats 与 subtitles——正好是这里不用的两项。实测 15 条：flat 3.2s，非 flat 20.7s（每条视频多打一次请求）。别为了「拿全字段」去掉它，字段本来就是全的。
- **必须有条数上限**。不传 `limit` 时用 `DEFAULT_NOTE_LIMIT = 15`；不设上限的话 yt-dlp 会把**整个账号**翻完，几百条视频会跑到超时。
- **粉丝数拿不到**。yt-dlp 的 TikTok extractor 不回 `channel_follower_count`（实测恒为 None），飞书「粉丝数」列对 TikTok 账号会一直是空的。代码里保留了这个映射，它哪天补上就自动生效。互动数（播放/点赞/收藏/评论/分享）不受影响，都是齐的。
- **昵称取 `channel` 不是 `uploader`**。前者是显示名（`Khabane lame`），后者是 handle（`khaby.lame`），handle 在主页链接里已经有了。
- **话题从文案里抽**。yt-dlp 不单独给 tags 字段，`#xxx` 由本服务用正则解析。
- 国内网络到不了 TikTok 时设 `YTDLP_PROXY`；风控要求登录时设 `YTDLP_COOKIES_FILE`（Netscape 格式的 cookies.txt）。

## 风控与合规

- 采集用的是**你自己的登录态**，高频采集可能触发平台风控，甚至影响账号。
- 本服务只在你手动触发时采集，不做定时轮询；`limit` 由调用方指定，服务端不设默认上限。
- 建议先用小的 `limit` 试，确认稳定后再加。
- 服务自身不存储任何凭据，cookie 只通过环境变量传给 MediaCrawler 子进程。

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `8788` | 监听端口 |
| `MEDIACRAWLER_DIR` | — | MediaCrawler 仓库根目录，不配则只能起服务不能采集 |
| `MEDIACRAWLER_PYTHON` | `python3` | 跑 MediaCrawler 的解释器，通常指向它的 venv |
| `MEDIACRAWLER_LOGIN_TYPE` | `cookie` | `cookie` / `qrcode` |
| `MEDIACRAWLER_COOKIES` | — | cookie 串 |
| `MEDIACRAWLER_ARGS` | — | 追加给 MediaCrawler 的额外参数（空格分隔） |
| `MEDIACRAWLER_TIMEOUT_SEC` | `300` | 单次采集超时 |
| `YTDLP_BIN` | `yt-dlp` | TikTok 后端用的 yt-dlp 可执行文件 |
| `YTDLP_PROXY` | — | 透传给 yt-dlp 的 `--proxy`，如 `http://127.0.0.1:7890` |
| `YTDLP_COOKIES_FILE` | — | Netscape 格式 cookies.txt，风控要求登录时才需要 |
| `YTDLP_TIMEOUT_SEC` | `300` | 单次 TikTok 采集超时 |

## 整合入口与兼容约定（2026-11-17）

桌面「工具 → 对标拆解」上方的「账号采集」支持读取账号、采集笔记、分析信号和显式保存；原手动录入与道库蒸馏仍保留。采集预览不会自动写飞书，没有现有对标表配置时保存按钮禁用。

- `POST /api/blogger/profile`：`{platform,homeUrl}`，返回 `{profile}`。
- `POST /api/blogger/notes`：`{platform,homeUrl,limit?,score?}`，返回 `{profile,notes}`。未提供数量时沿用源采集服务的默认批次，不新增产品上限。
- `POST /api/blogger/save`：`{profile?,notes?,distillation?}`，账号/笔记使用现有「账号ID/笔记ID」upsert；未知的昵称、简介、定位不清空既有值。请求内重复业务键取最后一条，按飞书原生批量大小分批，不限制采集总量。
- `/api/blogger/list` 保留旧响应形状 `{profiles,notes,distillations,configured}`；与主线 `/api/bloggers` 读取同一套账号/样本表。旧 `/api/blogger/distill` 直接委托主线 `/api/daoku/distill`，保留槽位。
- 道库保存在整合目录 `.local/daoku`，兼容保存会补齐旧调用缺少的名字、时间和基座槽位；传入的自定义槽位原样保留。不会把道库写回飞书旧道库列，也不会自动导入旧飞书道库。
- 本 Python 服务保留原始 JSON 契约，主 app 路由统一包装为 `{code,data,message}`；服务只绑定 `127.0.0.1`。
- `scripts/blogger/ensure-tables.mjs` 只保留为历史手工维护工具，**本整合不运行它（包括 dry-run），不自动创建/补列**。应用只配置已经存在且字段兼容的表；缺失的表/列需另行批准处理。
- 此次只运行 `ast.parse` 和纯函数 fixture 测试，没有启动 MediaCrawler、yt-dlp、扫码或真实采集，没有读取源配置/登录态。
