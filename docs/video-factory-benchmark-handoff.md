# 视频工厂·对标复刻线 交接

日期：2026-08-28（三次接力，最后一次改了一条原则，见 §0）
分支：`feat/video-edit-route`（← `feat/shot-content` ← `feat/workbench-overhaul`）
worktree：`/Users/kp/orca/workspaces/内容工作台/video-factory-shot-content`

| 层 | 提交 | 状态 |
|---|---|---|
| 结构层：量化 + 继承 + 每镜素材 | `5877d4c`…`fa0fc43` | 已合入 `feat/workbench-overhaul` |
| 内容层：可替换实体 + 每镜画面四段 | `ac8af63` 已推 · `778be27` **未推** | 分支 `feat/shot-content`（已无 worktree 挂着） |
| 编辑通道：切片 + 工序路线 + 水印闸门 | `7752030` **未推** | 分支 `feat/video-edit-route` |

---

## 0. 一句话

三层都做完了：拆得出结构、认得出每镜画面里有什么、也判得出每一镜该怎么做出来。

⚠️ **最后一层推翻了这条线原本的一条原则**：原来是「原视频的画面与音频一概不进下游」，
现在**画面会进**——判为要走编辑通道的镜头，原片段会被切出来送进视频编辑模型换主体。
这是明着改的（`lib/videoFactory/benchmark.ts` 文件头写了理由），并配了水印闸门。
**音频仍然一概不进**：成片的口播和 BGM 全是自己的，原声只用来读节拍和转写。

---

## 1. 已完成（A/B/C 已合入主分支，D/E 还在各自分支上）

### A. 拆片时逐镜量结构

`BenchmarkShot.metrics`，拆片时由 `scripts/video-factory/shot-metrics.py` 算出：

| 字段 | 判据 |
|---|---|
| `cameraMotion` | 背景带（画面上方两角）**前半程**的帧间差。只看前半程——主体走近会占住边缘，全程测会把「人走近」误判成「机位移动」 |
| `subjectScaleRatio` | 末帧人脸宽 / 首帧人脸宽 |
| `endFaceWidth` | 末帧人脸宽占画宽，即「收在什么景别」 |
| `tempo` | 静止/运动/定格三段占比 |
| `settleJitter` | 尾段尺度极差，越小越接近干净定格 |

**测不了就标原因，绝不填假数**（`unavailable`：`no-face` / `face-too-small` / `subject-edge` / `no-model` / `too-short` / `low-snr`）。
整段量化用 try/catch 包住，挂了只是没有 metrics，不影响拆节奏。

依赖：OpenCV + YuNet ONNX。装法 `bash scripts/video-factory/fetch-models.sh`（模型不进 git）。
**必须走 `media.githubusercontent.com`**，raw 端点只给 133 字节的 LFS 指针，脚本用文件大小兜住了。

### B. 分镜表继承实测机位

三道防线：
1. 提示词逐镜写实测值，**没量到的一个字不提**（写占位符模型会当真去编）
2. 明确区分「人在动」和「镜头在动」：「主体走近 1.63×」仍填**固定**，走近写进动作提示词
3. `normalizeStoryboard` 服务端钉死——模型很爱为了「有变化」把固定改成推近

**关键取舍**：原提示词有三条通用规则（相邻不同运镜/至少 3 种/首镜不固定），
量到结构时**整组让位**。对标全片固定机位就该全片固定。

### C. 每镜可选素材

`Shot.material?: CastRef`，可选覆盖，不填继承项目级 `ProjectCast`。
首帧参考图顺序：本镜素材在前（用途「这一镜要展示的就是它」），项目级槽位在后当一致性兜底。
路由 `/api/video-factory/shot-material`，选图器复用 `CastBoard` 里泛化后的 `LibraryPicker`。

### D. 内容层：可替换实体 + 每镜画面（`ac8af63`）

看片一次拿三样东西，共用同一批帧——分三次调用等于同一叠图的 token 付三遍。

- `rhythm.cast`：`BenchmarkCastEntity`，三类（角色/产品/场景）可替换实体，各自记着出现在哪几镜。
  label 的颗粒度**停在类型和结构**（「一位女性模特」「白色长袖衬衫」），
  写到能认出具体是谁就越过了「借结构、换素材」的边界，也就换不掉了。
- `rhythm.shots[].content`：每镜四段（subject / framing / light / scene），
  主体处写成 `{角色1}` 占位符。替换是**服务端确定性字符串替换，模型不参与**——
  交给模型重新理解一遍的话，同一份对标每次改写出来的画面都不一样。
- 编号由模型定、服务端只校验不重编：占位符是它同一次写下的，改号就全成了孤儿。
- 筛查帧改成 640 宽另存。200 宽的缩略图判「有几个人」够用，判景别和色调不够，
  而那两样正是内容层要照抄的。
- 抽样上限之外的镜头标成 undescribed，不编。

### E. 编辑通道：每镜判工序，该切的切出来（`7752030`）

原来的筛查答的是「这镜能不能做」，二分。接上视频编辑模型之后这个二分不成立了，
改成答「这镜要做哪几道工序」：

```
talking      → [edit, lipsync]     换得了人，换不了口型
fine-motion  → [edit]              保留原运动只换主体就能过
crowd        → [edit]              只换前景那一位，人群留原片
identity     → []                  编辑通道下同一张参考图贯穿，不再是卡点
text         → [postfix]
```

- **是集合不是单值**。一镜既有精细动作又有包装文字，就是既要切片又要贴字；
  压成一个赢家的话，「还得贴字」这件真实待办会从统计里消失。
  `ShotRoute`（generate/edit/postfix）保留为界面用的派生视图。
- 只切要走编辑通道的那些镜头，`clip-NN.mp4`，去音轨、钉 `yuv420p`。
- **水印闸门**（`BenchmarkSource`）：拆片服务抓的默认干净，人工传的必须有人看过一眼点确认。
  不做自动检测——检测不可靠，而一个假阴性会把别人的账号 ID 编进成片且洗不掉。
  闸门守在两端：不确认不切片，`clip` 端点不确认也不给流。
  存的是事实（`origin` + `confirmedAt`）不是结论，规则改一处即对全部历史模板生效。
- **逐镜口播**（`shot.voiceover`）：whisper.cpp 转写按镜头边界切开。
  补对口型得知道这一镜原本说了什么、占了多长。段落按**中点**归属——
  按起点分会把跨切点的整句挂到只露半个字的那一镜上。
- **节拍依赖度**（`rhythm.beatSync`）：切点踩没踩鼓点，判的是「换 BGM 之后这套节奏还成不成立」，
  不是版权。详见 §2 那条坑。

### 端到端验过

**结构层**：拆一条三镜对标片 → 实测 `fixed/moving/fixed`、倍率 `0.655/1.628/2.335`（和手工量的一致）
→ 分镜表运镜 `固定/跟随/固定` 且带 `sourceShotOrder` → 首帧提示词里参考图顺序正确。

**编辑通道**（样本 `mtcd15ox-a5e30044`，30 镜 43 秒的探店片）：

| 验的什么 | 结果 |
|---|---|
| 路线判定 | 旧 report 里那 11 镜「做不出来」→ 11 镜 `edit`（5 镜带 `lipsync`）。老数据不用重看片就能重新解释 |
| 切片 | 11 段 2.7 秒切完，时长误差 ≤0.03 秒、无音轨、全 `yuv420p` |
| 闸门 | 未确认 0 段；确认后 11 段；撤销后全删且 `clip` 端点回 403 |
| 残留收敛 | 手塞两个 rhythm.json 里没有的 `clip-42/99.mp4`，同步一次后被清掉 |
| 逐镜口播 | 20/30 镜有词，临时 wav/json 已清 |
| 节拍 | 对齐 27.6%、基线 27.1% → 判「不依赖原曲」 |
| 工序集合 | 合成用例：`fine-motion + text` 的镜头同时计入 `edit` 和 `postfix` |

---

## 2. 过程中修掉的坑（别再踩）

- **metrics 被静默丢弃**：`runCommand` 返回 `stdout + "\n" + stderr`，**stderr 在后**，
  而 OpenCV 往 stderr 吐 backend 警告。按「取最后一行」拿 JSON 永远拿到警告。
  现在按内容找 JSON 行。三个单元验证全绿，串起来才暴露——所以端到端不能省。
- **缩略图 URL 塞绝对路径**：用文件全路径当缓存破坏参数，路径进了 query string 和访问日志。改成版本号计数。
- **节拍对齐不减随机基线，等于在报噪声**。第一版只报「切点落在起音点上的比例」，
  实测那条探店片是 28%——看着像「有点踩上了」。但起音点越密，随便撒的切点也越容易蒙对，
  它的随机基线正好是 27%。现在 `BenchmarkBeatSync` 把 `expectedPct` 一起存下来，
  判「绑着原曲」要同时过绝对值和超出基线 1.5 倍两关。
  ⚠️ 手上没有真正的卡点片做正例，只验过负例。
- **收敛函数对着 JSON 收敛，会留下孤儿文件**。`syncClips` 最初从 `rhythm.json` 的 `clip` 字段
  推「盘上现在有哪些片段」。但重拆会写出一份全新的、不带 `clip` 字段的 rhythm，
  照着它收敛的话上一版切下来的 mp4 没人删。改成 `readdir` 匹配 `clip-\d+\.mp4`——
  reconcile 要对着真实状态，不是对着另一份可能已被覆盖的描述。
- **「写盘前必须先同步片段」这条不变量，靠三个调用点各自记得是维持不住的**，
  新加的那个正好忘了。现在只有 `_rhythm.ts` 的 `writeRhythm` 能写，它内部先 `syncClips`。
- **节奏分段两次翻车**：先用「单帧变化超阈值」，静止段噪声累加把静 40 读成静 17；
  改带符号位移仍不够，因为**人脸框有持续 6 帧的 5% 级别跳变**。最终「带符号位移 + 持续承诺」+ 信噪比闸门。
  ⚠️ 节奏边界在 12fps 采样下仍有一到两帧不确定度，脚本注释里写明了。

---

## 3. 下一步：把编辑通道接进生产

内容层当时的三个待定项都定了，也都落地了（见 §1 D）：描述停在「结构 + 主体类型」；
拆完自动跑一次；保留 12 帧上限但把没描述到的镜头明确标出来。

现在的缺口全在**下游**——路线判出来了，但生产侧还不知道它的存在。
按依赖顺序，前两条是必须的：

1. **路线带进项目侧。** `Shot`（`types.ts`）没有路线字段，`normalizeStoryboard` 只把
   `sourceShotOrder` 带过去。接缝就是它：`shot.route` 从 `sourceShotOrder → routeByShot(rhythm)`
   派生即可，不用改数据结构。
2. **`edit` 镜头走回传通道。** `generate` / `clip` / `compose` 三个路由目前对编辑通道一无所知。
   `ShotClip.provider` 已经是每镜字段、`manual` 已在 `UPLOAD_PROVIDERS` 里，所以这条是现成的：
   界面把该镜的 `clip-NN.mp4` 和「这一镜要把 {角色1} 换成你的模特」交给人，
   人在 VACE / 可灵 / Runway 上跑完传回来。
3. **分镜提示词要分路线讲。** `buildStoryboardPrompt` 现在只对模型讲通道 A 的硬约束
   （6/10 秒档、不能指定精确动作）。走编辑通道的镜头本来就不受这些限制。
4. **对口型工序没接。** `shot.voiceover` 采集了但只在界面上展示原文，没有消费者。
5. **`beatSync` 目前纯展示**，不影响 `rhythmToPlanLines` 也不影响切点建议。

### 已经明确不做的

- **没给引擎加 `videoEdit` 能力位。** 它会是 `UPLOAD_PROVIDERS` 的第二张表，
  而 `types.ts` 里那条注释刚说过「两张表迟早给出相反的答案」。
  等真接了编辑 API，把能力表述成 `routes: ShotRoute[]` 再一次做对。
- **没复用 `services/video-renderer` 的 whisper。** 那是 `tsconfig` 排除的独立服务，
  Next 侧 import 不到；且它在 `extract.mjs` 里把 segments `join("")` 掉了时间戳，
  而这条线要的就是时间戳。代价是 ASR 配置面分叉了（服务那边支持 `ASR_PROVIDER` 可插拔 +
  硅基流动兜底，benchmark 这边只认 whisper-cpp）——**换 ASR 要改两处**，记在这儿别忘。

## 4. 另一条线：MISA 六套换装复刻（卡住）

完整记录在 `/Users/kp/Documents/Codex/2026-07-31/ji-xu/work/benchmark/README.md`。

**卡在**：grok 余额用尽（`402 Grok Build usage balance exhausted`），统一背景版只做出 4/6 段。

**最后一版方案**：不动背景只换衣服——六张首帧共用同一基准背景，逐像素相同，
跨段身份一致性做到 **0.969**（原始素材 0.766、重定位版 0.699）。

**已知短板**：`image_edit` 只吃一张输入图，给它背景就得凭文字重画衣服，
**印花细节还原不了**（红碎花从大朵红罂粟变成小碎粉花）。

**充值后第一件事**：测反向方案——拿**已审批原图**当输入，只换**背景**到基准那张。
衣服是原始像素、保真天然满分，需要模型重画的是墙/门/地板这类低频内容，比印花好复现得多。
如果成立，就能同时拿下服装保真和背景一致。

**还没定**：音频。对标片全部无音轨；grok 输出的六段电平从 −63.1 到 −31.7 dB，差 31 dB 不能直接用。
三条路：保持无声 / 保留环境音+loudnorm / 配 BGM（倾向 BGM，六个切点都是定格，鼓点可压在切点上）。

---

## 5. 协作注意

- 主仓 `feat/workbench-overhaul` 上有**并行会话**在动 ImageFactory 那条线，
  `lib/videoExtract.ts` 也在它手里改着。动主仓前先 `git status` 看清，只暂存自己任务的文件。
- 内容层那次合并走的是快进，合并前后比过那 3 个未提交文件的 SHA，一字未动。
- **编辑通道这次是在独立 worktree + 独立分支上做的**，一个主仓文件都没碰。
  接力前先看清自己在哪个 worktree：
  `video-factory-shot-content` 现在挂的是 `feat/video-edit-route`，不是 `feat/shot-content`。
- ⚠️ `778be27`（内容层的第二个提交）和 `7752030`（编辑通道）**都还没推 origin**，
  origin 上的 `feat/shot-content` 还停在 `ac8af63`。

---

## 6. 环境依赖

跑全套拆片要这些本机二进制，缺哪个就少哪一项，不会把整条拆解搞崩：

| 缺什么 | 后果 |
|---|---|
| ffmpeg / ffprobe | 拆不了，这是硬依赖 |
| OpenCV + YuNet（`scripts/video-factory/fetch-models.sh`） | 没有 `metrics`，指标标 `no-model` |
| whisper-cli + ggml 模型 | 没有逐镜口播。模型按 `WHISPER_MODEL` → `~/workspace/tools/models/whisper/ggml-small.bin` → `~/.cache/hyperframes/whisper/models/ggml-small.bin` 的顺序找 |
| 视觉模型没配 | 看片走 fallback，没有实体清单和画面描述 |
