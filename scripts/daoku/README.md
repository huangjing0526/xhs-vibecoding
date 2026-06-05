# Claude 内容流水线（生成 + 评分 → 写回飞书表）

整条小红书内容线由 **Claude 在会话里生成**（素材提炼 / 选题 / 正文草稿 / 道库评分），
脚本只负责飞书表的读写，替代原来各 route 的 **Gemini** 生成（route 原样保留当备用/自助按钮）。

> 为什么用 Claude 而非 Gemini：质量更高、不用配 API key、不花 API 钱；
> 代价是每步要 Claude 会话在场（符合现有 48h 人工审节奏，做不成网页自助按钮）。

## 四步流水线（素材 → 选题 → 草稿 → 评分）

prompt / 字段名的**单一来源都是 `lib/xhsWorkflow.ts`**（生成时读它，不另起炉灶）；
道库标准单一来源是 `lib/daoku.ts`。脚本不内嵌判断/生成逻辑，只搬数据。

```bash
cd xhs-vibecoding

# ① 素材：Claude 读本地开发日报/问题记录 → 智能提炼结构化素材
npm run xhs:pull -- materials --out=in.json      # 列已存在素材ID（防重）+ 字段规格
#   Claude 读 TarmeerCRM docs/06-协作记录/reports/ 原文，产出 [{fields:{素材ID,核心事件,踩坑点,可复用方法,...}}]
npm run xhs:write -- material out.json --dry-run  # 按素材ID去重，先看
npm run xhs:write -- material out.json

# ② 选题：素材+术语 → 内容卡片（buildContentCardPrompt）
npm run xhs:pull -- topics --out=in.json
npm run xhs:write -- topic out.json --mark-materials --dry-run
npm run xhs:write -- topic out.json --mark-materials   # 按内容去重 + 标已用素材为已提炼

# ③ 草稿：选题卡 → 正文（buildDraftPrompt，正文≤200字，可叠 distill-blogger 审稿）
npm run xhs:pull -- drafts --out=in.json
npm run xhs:write -- draft out.json --dry-run          # 按笔记ID去重
npm run xhs:write -- draft out.json

# ④ 评分：道库判断 → 选题表（见下方）
npm run daoku:pull -- --out=topics.json
npm run daoku:write -- scores.json
```

每步 `gen-write` 写前都自动去重（material=素材ID / topic=内容签名 / draft=笔记ID），
所有写都支持 `--dry-run` 先看。

---

## 道库评分（Claude 跑判断 → 写回飞书选题表）

让 **Claude** 用道库标准给选题打分，再把分写回飞书多维表格的选题表，
替代 `/api/feishu/content-cards/score` 那条 **Gemini** 路（那条原样保留当备用/自助按钮）。

为什么用 Claude：道库判断（三位博主的道 + 三关 + 判别力测）是细微的爆款形态判断，
是 Claude 的强项；Gemini 偏弱。代价是这步要有 Claude 会话在跑，做不成网页自助按钮。
整条流水线本来就卡人工闸口（48h 打磨 + 人工审才发），评分要 Claude 在场不算负担。

## 评分标准的单一来源

> **`lib/daoku.ts`** 是道库标准唯一来源（博主的道 / 三关 / 判别力测 / 语气分档 / 打分 JSON 结构）。
> 改判断标准只改那一处，本目录脚本只负责搬数据，不内嵌判断逻辑。

## 三步循环

```bash
cd xhs-vibecoding

# 1) 拉「待评分」候选（无质量分的）→ 文件
npm run daoku:pull -- --out=topics.json
#    --all 连已评分的一起拉（重评）；--status=待写 只看某状态

# 2) 把 topics.json 交给 Claude：
#    「按 lib/daoku.ts 道库标准给这些选题逐条打分」
#    Claude 产出 scores.json：数组 [{recordId, score(0-10), hitDao, verdict, reasons?, fixes?}]
#    verdict ∈ 偏爆 / 中性 / 偏哑

# 3) 写回飞书（先 dry-run 看一眼，再真写）
npm run daoku:write -- scores.json --dry-run
npm run daoku:write -- scores.json
```

## 去重（清掉历史重复）

选题表插入口本就按 ID+来源去重，但历史上堆了些重复。`daoku:dedup` 按
**「标题+痛点+资产+来源」四项全同**判重复、每簇留质量分最高的一条，删掉其余。

> ⚠️ 不按 `选题ID` 去重——同一个 ID 可能挂着完全不同的内容
> （实测 `TOPIC-20231027-001` 同时是 FieldConfig 审计 5/10 和 Agent 分工表 8/10），
> 按 ID 去重会误删好选题。只认内容全同，最保守。

```bash
npm run daoku:dedup            # 默认 dry-run，列出会删哪些（不删）
npm run daoku:dedup -- --apply # 真删（飞书回收站 30 天内可恢复）
```

## 字段对照（写回选题表）

| scores.json 字段 | 飞书选题表列 | 写入格式 |
|---|---|---|
| `score`（0-10 数字） | `质量分` | `"7/10"` |
| `hitDao` | `命中道` | 命中不了任何道 → `（未命中道）` |
| `verdict` | `偏爆偏哑` | `偏爆` / `中性` / `偏哑` |

`reasons` / `fixes` 不写回飞书（飞书表没这两列），只供你/Claude 过程参考。

## 依赖的环境变量（`xhs-vibecoding/.env.local`）

`FEISHU_APP_ID` · `FEISHU_APP_SECRET` · `FEISHU_BASE_APP_TOKEN` · `FEISHU_TOPIC_TABLE_ID`
（可选 `FEISHU_API_BASE`，默认 `https://open.feishu.cn`）。脚本自包含，不需要先起 `npm run dev`。
