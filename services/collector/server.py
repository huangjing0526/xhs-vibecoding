#!/usr/bin/env python3
"""对标账号采集服务：小红书/抖音/TikTok 账号主页 → 账号信息 + 最近 N 条笔记（含互动数据）。

⚠ 本文件必须兼容 macOS 自带的 Python 3.9——「零依赖即可启动」是它的设计前提，
不要用 3.10+ 才有的语法（如 `list | None`）。MediaCrawler 自己跑在它的 3.12 venv 里，两者无关。

为什么是独立本地服务：采集依赖 Playwright 真实浏览器和用户自己的登录态，
Cloudflare Workers 跑不了。与 services/video-renderer 同一模式——app 侧只做代理。

为什么用标准库不用 FastAPI：这个服务**零安装即可启动**，`/health` 和错误提示在没装任何
依赖时也能正常响应，方便先把链路调通再装重依赖。真正的采集才需要 MediaCrawler。

真实抓取有两个后端，按平台分派——**MediaCrawler 不支持 TikTok**（它只有
xhs/dy/ks/bili/wb/tieba/zhihu），所以 TikTok 只能另走一条路：

- 小红书 / 抖音 → MediaCrawler（github.com/NanmiCoder/MediaCrawler），用户自行 clone，MEDIACRAWLER_DIR 指路
- TikTok      → yt-dlp，拆片服务（services/video-renderer）本来就依赖它，不引入新依赖

本文件只做三件事：起 HTTP、调后端、把结果归一成本项目的契约。
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Optional

PORT = int(os.environ.get("PORT", "8788"))
MEDIACRAWLER_DIR = os.environ.get("MEDIACRAWLER_DIR", "").strip()
MEDIACRAWLER_PYTHON = os.environ.get("MEDIACRAWLER_PYTHON", "python3").strip()
# MediaCrawler 的登录方式：qrcode（扫码，首次用）/ cookie（复用已有 cookie，无人值守用）
MEDIACRAWLER_LOGIN_TYPE = os.environ.get("MEDIACRAWLER_LOGIN_TYPE", "cookie").strip()
MEDIACRAWLER_COOKIES = os.environ.get("MEDIACRAWLER_COOKIES", "").strip()
MEDIACRAWLER_TIMEOUT_SEC = int(os.environ.get("MEDIACRAWLER_TIMEOUT_SEC", "300"))

PLATFORM_TO_MC = {"xiaohongshu": "xhs", "douyin": "dy"}

YTDLP_BIN = os.environ.get("YTDLP_BIN", "yt-dlp").strip()
# TikTok 在国内直连不通，这里透传给 yt-dlp 的 --proxy，如 http://127.0.0.1:7890
YTDLP_PROXY = os.environ.get("YTDLP_PROXY", "").strip()
# 未登录也能抓公开主页，但风控收紧时需要 cookies.txt（Netscape 格式）
YTDLP_COOKIES_FILE = os.environ.get("YTDLP_COOKIES_FILE", "").strip()
YTDLP_TIMEOUT_SEC = int(os.environ.get("YTDLP_TIMEOUT_SEC", "300"))

# 不给 limit 时抓多少条。必须有上限：yt-dlp 抓 TikTok 主页默认会把**整个账号**翻完，
# 几百条视频逐条取元信息会跑到超时。15 与 MediaCrawler 的 CRAWLER_MAX_NOTES_COUNT 对齐。
DEFAULT_NOTE_LIMIT = 15

SETUP_HINT = (
    "未配置 MEDIACRAWLER_DIR，无法真实采集。请先 clone MediaCrawler "
    "(https://github.com/NanmiCoder/MediaCrawler)，装好依赖与 Playwright 浏览器，"
    "再在 services/collector/.env 里设置 MEDIACRAWLER_DIR=/path/to/MediaCrawler。"
)


class CollectError(Exception):
    """带用户可读中文提示的采集失败。"""


def parse_creator_id(platform: str, home_url: str) -> str:
    """从账号主页链接里抠出平台的创作者 ID。"""
    url = (home_url or "").strip()
    if not url:
        raise CollectError("缺少账号主页链接")

    if platform == "xiaohongshu":
        # https://www.xiaohongshu.com/user/profile/<24位十六进制>
        match = re.search(r"/user/profile/([0-9a-fA-F]{24})", url)
        if match:
            return match.group(1)
        raise CollectError("没能从链接里识别出小红书账号 ID，请用「个人主页」链接（形如 .../user/profile/xxx）")

    if platform == "douyin":
        # https://www.douyin.com/user/<sec_uid>
        match = re.search(r"/user/([A-Za-z0-9_\-]+)", url)
        if match:
            return match.group(1)
        raise CollectError("没能从链接里识别出抖音账号 ID，请用「个人主页」链接（形如 .../user/xxx）")

    if platform == "tiktok":
        # https://www.tiktok.com/@handle —— 存不带 @ 的 handle，调 yt-dlp 时再拼回去
        match = re.search(r"tiktok\.com/@([A-Za-z0-9_.]+)", url)
        if match:
            return match.group(1)
        raise CollectError(
            "没能从链接里识别出 TikTok 账号 ID，请用「个人主页」链接（形如 https://www.tiktok.com/@xxx）。"
            "vm.tiktok.com 的分享短链指向单条视频，不是主页，这里用不了"
        )

    raise CollectError(f"暂不支持的平台：{platform}（当前支持 xiaohongshu / douyin / tiktok）")


def run_mediacrawler(platform: str, creator_id: str, limit: Optional[int] = None) -> list:
    """调 MediaCrawler 抓某个创作者的作品，返回它写出的原始记录列表。

    ⚠ 这是唯一与 MediaCrawler 命令行/输出格式耦合的地方，改版本只需改这个函数，
    也可用 MEDIACRAWLER_ARGS 追加参数而不改代码。

    契约已对着 MediaCrawler 2a8063a（2026-08）核对：
    `--platform` / `--lt` / `--type` / `--save_data_option` / `--creator_id` / `--cookies`
    / `--save_data_path` 均存在（见其 cmd_arg/arg.py）。
    """
    if not MEDIACRAWLER_DIR:
        raise CollectError(SETUP_HINT)

    root = Path(MEDIACRAWLER_DIR).expanduser()
    if not (root / "main.py").exists():
        raise CollectError(f"MEDIACRAWLER_DIR 下没找到 main.py：{root}。请确认指向 MediaCrawler 仓库根目录。")

    mc_platform = PLATFORM_TO_MC[platform]
    extra = os.environ.get("MEDIACRAWLER_ARGS", "").split()

    # 每次采集用独立输出目录：MediaCrawler 按「日期」命名文件并**追加**写入，
    # 共用 data/ 会让本次结果混进同一天此前几次的记录，甚至读到别的创作者的数据。
    with tempfile.TemporaryDirectory(prefix="collector-") as out_dir:
        cmd = [
            MEDIACRAWLER_PYTHON,
            "main.py",
            "--platform", mc_platform,
            "--lt", MEDIACRAWLER_LOGIN_TYPE,
            "--type", "creator",
            "--save_data_option", "json",
            "--save_data_path", out_dir,
            "--creator_id", creator_id,
            # 不抓评论：我们只用笔记正文和互动数，抓评论会为每条笔记多打一轮请求，
            # 白白拉长耗时、放大风控敞口。需要时用 MEDIACRAWLER_ARGS=--get_comment true 打开。
            "--get_comment", "false",
            # limit 必须传给 MediaCrawler 本身：它默认只抓 15 条（CRAWLER_MAX_NOTES_COUNT），
            # 只在我们这边切片的话，用户填 20 会静默只拿到 15 条。
            *(["--crawler_max_notes_count", str(limit)] if limit and limit > 0 else []),
            *(["--cookies", MEDIACRAWLER_COOKIES] if MEDIACRAWLER_COOKIES else []),
            *extra,
        ]

        try:
            proc = subprocess.run(
                cmd, cwd=str(root), capture_output=True, text=True, timeout=MEDIACRAWLER_TIMEOUT_SEC
            )
        except FileNotFoundError:
            raise CollectError(
                f"找不到 Python 解释器 {MEDIACRAWLER_PYTHON}，请设置 MEDIACRAWLER_PYTHON 指向 MediaCrawler 的虚拟环境。"
            )
        except subprocess.TimeoutExpired:
            raise CollectError(f"采集超时（{MEDIACRAWLER_TIMEOUT_SEC}s）。可能是需要扫码登录，或平台风控拦截了请求。")

        if proc.returncode != 0:
            tail = (proc.stderr or proc.stdout or "").strip().splitlines()
            detail = tail[-1] if tail else f"退出码 {proc.returncode}"
            raise CollectError(
                f"MediaCrawler 执行失败：{detail}"
                "（若提示参数不认识，说明你装的版本与本服务的调用契约不一致，"
                "改 server.py 的 run_mediacrawler 或用 MEDIACRAWLER_ARGS 覆盖）"
            )

        # MediaCrawler 抓不到东西时**仍然退出 0**，所以「没输出」要靠下面的 read_output 判定。
        # 把它最后几行日志带过去：登录态失效、账号不存在、风控拦截在这里长得一样，
        # 没有它的原话就没法分辨。
        # 取 stderr + stdout：MediaCrawler 用 logging，正常日志走的是 stderr
        combined = f"{proc.stderr or ''}\n{proc.stdout or ''}"
        return read_output(Path(out_dir), mc_platform, combined)


def log_tail_hint(output: str, label: str, count: int = 3) -> str:
    """子进程日志的最后几行 → 中文提示尾巴；没日志就返回空串。

    登录态失效、账号不存在、风控拦截这几种失败在我们这一层长得一模一样，
    不把后端的原话带上就没法分辨，所以两个后端的「什么都没抓到」都用它。
    """
    tail = [line.strip() for line in (output or "").splitlines() if line.strip()][-count:]
    return f"；{label} 最后输出：" + " / ".join(tail) if tail else ""


def read_output(out_dir: Path, mc_platform: str, log_output: str = "") -> list:
    """读本次采集写出的内容文件。

    路径是确定的，不靠「找最新文件」：MediaCrawler 的 AsyncFileWriter 写到
    `{save_data_path}/{platform}/json/{crawler_type}_{item_type}_{date}.json`。
    早先版本在 data/ 下按 mtime 取最新，会在多次运行/多平台并存时静默读到上一次的数据。
    """
    json_dir = out_dir / mc_platform / "json"
    # 只认 contents（笔记正文），不要 comments；日期由 MediaCrawler 决定，这里不猜
    candidates = sorted(json_dir.glob("creator_contents_*.json"))
    if not candidates:
        raise CollectError(
            "MediaCrawler 跑完了但一条笔记都没抓到。"
            "常见原因：登录态失效（改用 --lt qrcode 重新扫码）、账号 ID 不对，或平台风控拦截"
            f"{log_tail_hint(log_output, 'MediaCrawler')}"
        )

    records: list = []
    for path in candidates:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise CollectError(f"读取 MediaCrawler 输出失败：{error}")
        if isinstance(payload, dict):
            payload = payload.get("data") or payload.get("items") or []
        if isinstance(payload, list):
            records.extend(payload)
    return records


def run_ytdlp(creator_id: str, limit: Optional[int] = None) -> list:
    """TikTok 后端：yt-dlp 抓某个创作者主页的最近若干条视频，返回原始记录列表。

    ⚠ 这是唯一与 yt-dlp 输出格式耦合的地方。

    用 `--flat-playlist`：TikTok 的列表接口本身就带 stats，yt-dlp 的
    `_parse_aweme_video_web(extract_flat=True)` 会把 view/like/comment/repost/save
    原样解析出来，flat 只少了 formats 与 subtitles——正好是我们不用的两项。
    实测 @khaby.lame 15 条：flat 3.2s / 非 flat 20.7s，差 6 倍，因为非 flat 会为每条视频
    多打一次请求。别为了「拿全字段」把它去掉，字段本来就是全的。
    """
    if not shutil.which(YTDLP_BIN):
        raise CollectError(
            f"找不到 yt-dlp（{YTDLP_BIN}），TikTok 采集需要它。装：brew install yt-dlp，"
            "或用 YTDLP_BIN 指定路径。"
        )

    count = limit if isinstance(limit, int) and limit > 0 else DEFAULT_NOTE_LIMIT
    cmd = [
        YTDLP_BIN,
        "--dump-json",
        "--flat-playlist",
        "--no-warnings",
        # 单条视频失效（下架/私密）不该让整次采集失败
        "--ignore-errors",
        "--playlist-end", str(count),
        *(["--proxy", YTDLP_PROXY] if YTDLP_PROXY else []),
        *(["--cookies", YTDLP_COOKIES_FILE] if YTDLP_COOKIES_FILE else []),
        f"https://www.tiktok.com/@{creator_id}",
    ]

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=YTDLP_TIMEOUT_SEC)
    except subprocess.TimeoutExpired:
        raise CollectError(
            f"TikTok 采集超时（{YTDLP_TIMEOUT_SEC}s）。常见原因：没走代理连不上 TikTok"
            "（设 YTDLP_PROXY），或采集条数太多。"
        )

    # yt-dlp 配了 --ignore-errors 时，部分失败仍会返回非 0；只要有记录就继续，
    # 一条都没有才按失败处理——退出码本身分辨不出「网络不通」和「个别视频下架」。
    records = []
    for line in (proc.stdout or "").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError as error:
            print(f"[collector] Invalid yt-dlp JSON record: {error}", file=sys.stderr)
            continue

    if not records:
        raise CollectError(
            f"没从 TikTok 账号 @{creator_id} 抓到任何视频。"
            "常见原因：账号不存在或已改名、网络到不了 TikTok（设 YTDLP_PROXY）、风控要求登录"
            f"（设 YTDLP_COOKIES_FILE）{log_tail_hint(proc.stderr, 'yt-dlp')}"
        )
    return records


def ytdlp_published_at(record: dict) -> str:
    """yt-dlp 的发布时间 → `YYYY-MM-DD`。timestamp 是 UTC 秒，upload_date 是 YYYYMMDD。"""
    stamp = record.get("timestamp")
    if isinstance(stamp, (int, float)):
        return datetime.fromtimestamp(stamp, tz=timezone.utc).strftime("%Y-%m-%d")
    date = str(record.get("upload_date") or "")
    if re.fullmatch(r"\d{8}", date):
        return f"{date[:4]}-{date[4:6]}-{date[6:]}"
    return ""


def pick(record: dict, *names, default=None):
    """按候选字段名取第一个非空值——各平台字段名不同，且 MediaCrawler 版本间有差异。"""
    for name in names:
        value = record.get(name)
        if value not in (None, "", []):
            return value
    return default


def to_int(value):
    """互动数可能是 '1.2万' / '3,456' / int，取不到就返回 None，不猜 0。"""
    if isinstance(value, (int, float)):
        return int(value)
    text = str(value or "").strip().replace(",", "")
    if not text:
        return None
    match = re.match(r"^([\d.]+)\s*(万|w|W|k|K)?$", text)
    if not match:
        return None
    number = float(match.group(1))
    unit = match.group(2)
    if unit in ("万", "w", "W"):
        number *= 10000
    elif unit in ("k", "K"):
        number *= 1000
    return int(number)


def normalize_note(record: dict) -> dict:
    """MediaCrawler 记录 → 本项目的对标笔记契约（与 lib/blogger.ts 的 BloggerNote 对齐）。

    注意 views 恒为 None：小红书与抖音**都不公开阅读量**，只有创作者本人后台可见。
    lib/viralSignals.ts 的兜底打分对此有专门的降级档。
    """
    tags = pick(record, "tag_list", "tags", default=[])
    if isinstance(tags, str):
        tags = [t for t in re.split(r"[,\s]+", tags) if t]

    return {
        "noteId": str(pick(record, "note_id", "aweme_id", "id", default="")),
        "title": str(pick(record, "title", "desc", default="")),
        "content": str(pick(record, "desc", "content", "title", default="")),
        "tags": [str(t) for t in tags][:20],
        "coverDescription": "",
        "url": str(pick(record, "note_url", "aweme_url", "url", default="")),
        "publishedAt": str(pick(record, "time", "create_time", "last_update_time", default="")),
        "metrics": {
            # views 缺席不是遗漏，见 docstring
            "likes": to_int(pick(record, "liked_count", "digg_count")),
            "saves": to_int(pick(record, "collected_count", "collect_count")),
            "comments": to_int(pick(record, "comment_count")),
            "shares": to_int(pick(record, "share_count")),
        },
    }


def normalize_profile(records: list, creator_id: str) -> dict:
    """账号信息：MediaCrawler 的 creator 模式把账号信息挂在每条记录上，取第一条。

    只回本服务**能证明**的字段。注意 noteCount 用的是本次爬到的条数，
    不是账号的作品总数——它受 limit 影响，只能当「本次采了多少」看。
    """
    first = records[0] if records else {}
    return {
        "creatorId": creator_id,
        "name": str(pick(first, "nickname", "author", default="")),
        "bio": str(pick(first, "desc", "signature", default="")),
        "followers": to_int(pick(first, "fans", "follower_count")),
        "noteCount": len(records) or None,
    }


def normalize_tiktok_note(record: dict) -> dict:
    """yt-dlp 记录 → 本项目的对标笔记契约。

    不复用 normalize_note：yt-dlp 的字段名会和它的候选列表**撞车但语义不同**，
    最典型的是 `url`——在 yt-dlp 里是视频 CDN 直链，不是网页地址（那是 webpage_url），
    混用会把一个几小时后就失效的直链写进飞书。

    与小红书/抖音的一个真实差异：TikTok **公开播放量**，所以 views 这里有真值，
    viralSignals 能算真实互动率，不必落到「按互动总量排序」的兜底档。
    """
    description = str(record.get("description") or "")
    return {
        "noteId": str(record.get("id") or ""),
        "title": str(record.get("title") or description),
        "content": description,
        # TikTok 的话题就写在文案里，yt-dlp 不单独给 tags 字段
        "tags": re.findall(r"#([^\s#]+)", description)[:20],
        "coverDescription": "",
        "url": str(record.get("webpage_url") or ""),
        "publishedAt": ytdlp_published_at(record),
        "metrics": {
            "views": to_int(record.get("view_count")),
            "likes": to_int(record.get("like_count")),
            "saves": to_int(record.get("save_count")),
            "comments": to_int(record.get("comment_count")),
            "shares": to_int(record.get("repost_count")),
        },
    }


def normalize_tiktok_profile(records: list, creator_id: str) -> dict:
    """账号信息挂在每条视频记录上，取第一条。bio 留空：yt-dlp 不回账号简介。

    昵称优先取 `channel`（显示名，如「Khabane lame」）而不是 `uploader`（handle，如「khaby.lame」）——
    与小红书/抖音那边取 nickname 对齐，homepageUrl 里已经有 handle 了。

    followers 实测恒为 None：yt-dlp 的 TikTok extractor 不回 channel_follower_count。
    保留这个映射是为了它哪天补上就能自动生效，但**现在别指望粉丝数会回填**。
    """
    first = records[0] if records else {}
    return {
        "creatorId": creator_id,
        "name": str(pick(first, "channel", "uploader", default="")),
        "bio": "",
        "followers": to_int(first.get("channel_follower_count")),
        # 与 MediaCrawler 分支同义：本次采到多少条，不是账号作品总数
        "noteCount": len(records) or None,
    }


def canonical_home_url(platform: str, creator_id: str, fallback: str) -> str:
    """规范化主页链接后再回给 app。

    TikTok 的视频页地址 `/@handle/video/<id>` 也能解析出 handle，用户直接粘视频页就能加账号——
    但那条地址不该原样写进飞书「主页链接」列，否则以后点开是单条视频而不是主页。
    小红书/抖音的链接形态本来就只有主页一种（正则要求 /user/profile/ 或 /user/），原样返回。
    """
    if platform == "tiktok" and creator_id:
        return f"https://www.tiktok.com/@{creator_id}"
    return fallback


def collect_creator(platform: str, creator_id: str, limit: Optional[int]):
    """按平台分派到对应抓取后端，返回 (profile, notes)。

    这是唯一需要知道「哪个平台走哪个后端」的地方——MediaCrawler 不支持 TikTok。
    """
    if platform == "tiktok":
        records = run_ytdlp(creator_id, limit)
        return normalize_tiktok_profile(records, creator_id), [normalize_tiktok_note(r) for r in records]

    records = run_mediacrawler(platform, creator_id, limit)
    return normalize_profile(records, creator_id), [normalize_note(r) for r in records]


def handle_profile(body: dict) -> dict:
    """只做本地解析，**不爬取**。

    「添加账号」以前会跑一次完整的 creator 爬取，就为了拿个昵称——分钟级耗时 + 一次风控敞口，
    而拿回来的 followers/noteCount 还都是从笔记里反推的。现在只校验链接、抠出 creator_id，
    昵称与粉丝数留空，由随后的「采集并打分」回填。
    """
    platform = body.get("platform") or "xiaohongshu"
    home_url = body.get("homeUrl") or ""
    creator_id = parse_creator_id(platform, home_url)
    return {
        "profile": {
            "creatorId": creator_id,
            "homeUrl": canonical_home_url(platform, creator_id, home_url),
            "name": "",
            "bio": "",
            "followers": None,
            "noteCount": None,
        }
    }


def handle_notes(body: dict) -> dict:
    platform = body.get("platform") or "xiaohongshu"
    home_url = body.get("homeUrl") or ""
    limit = body.get("limit")
    creator_id = parse_creator_id(platform, home_url)
    profile, raw_notes = collect_creator(platform, creator_id, limit if isinstance(limit, int) else None)
    profile["homeUrl"] = canonical_home_url(platform, creator_id, home_url)

    notes = [note for note in raw_notes if note["noteId"]]
    if isinstance(limit, int) and limit > 0:
        notes = notes[:limit]

    return {"profile": profile, "notes": notes, "collected": len(notes)}


ROUTES = {"/profile": handle_profile, "/notes": handle_notes}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _send(self, status: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send(200, {"ok": True})

    def do_GET(self):
        if self.path.split("?")[0] == "/health":
            # 两个后端分开报：小红书/抖音走 MediaCrawler，TikTok 走 yt-dlp，
            # 一个没配不影响另一个的平台
            self._send(
                200,
                {
                    "ok": True,
                    "mediacrawlerConfigured": bool(MEDIACRAWLER_DIR),
                    "ytdlpAvailable": bool(shutil.which(YTDLP_BIN)),
                },
            )
            return
        self._send(404, {"error": f"未知路径 {self.path}"})

    def do_POST(self):
        path = self.path.split("?")[0]
        handler = ROUTES.get(path)
        if not handler:
            self._send(404, {"error": f"未知路径 {path}"})
            return

        try:
            length = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(length) or b"{}") if length else {}
        except (ValueError, json.JSONDecodeError):
            self._send(400, {"error": "请求 JSON 格式不正确"})
            return

        try:
            self._send(200, handler(body))
        except CollectError as error:
            # 业务性失败（没装 MediaCrawler、链接不对、风控拦截）：400 + 中文可操作提示
            self._send(400, {"error": str(error)})
        except Exception as error:  # noqa: BLE001 — 兜底，不能让服务因单次请求挂掉
            print(f"[collector] 未预期错误 path={path} error={error!r}", file=sys.stderr, flush=True)
            self._send(500, {"error": f"采集服务内部错误：{error}"})

    def log_message(self, fmt, *args):
        print(f"[collector] {fmt % args}", file=sys.stderr, flush=True)


def main():
    print(f"[collector] 监听 http://localhost:{PORT}", file=sys.stderr, flush=True)
    # 两个后端分别报：只想采 TikTok 的用户不该看到「无法真实采集」——那句话只对小红书/抖音成立
    if not MEDIACRAWLER_DIR:
        print(f"[collector] 警告：小红书/抖音不可用——{SETUP_HINT}", file=sys.stderr, flush=True)
    if not shutil.which(YTDLP_BIN):
        print(
            f"[collector] 警告：TikTok 不可用——找不到 yt-dlp（{YTDLP_BIN}），装：brew install yt-dlp",
            file=sys.stderr,
            flush=True,
        )
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
