# 豆包下载器

豆包 / Dola 网页端的 Chrome / Edge 扩展（Manifest V3），用于提取**你自己生成**的无水印图片、视频资源，支持预览、勾选和批量下载。

> 本版基于一个 MIT 基座去壳改造：**移除了卡密验证层，不再连任何外部服务器，全程纯本地运行**。仅供个人管理自己拥有版权的内容。

## 工作原理

不是对画面做后期去水印，而是观察页面接口响应，从数据里取原始/无水印资源地址：

- **观察方式**：`page-hook.js` 在页面 MAIN world 包裹 `fetch` / `XMLHttpRequest`，只读取 `/im/chain/single` 响应的一份副本，不改写任何响应。因此**不需要 `debugger` 权限**，浏览器也不会弹「已开始调试此浏览器」的横条。
- **图片**：读接口里的 `image_ori_raw.url`（本就是无水印原图）。
- **视频**：拿到接口里的 `fallback_api`，改写查询参数 `channel=no&codec_type=8&logo_type=unwatermarked` 重新请求，再用响应里的 `key_seed` 本地解密 `main_url` token，得到无水印视频地址。

因此它只对**当前登录账号在页面里新生成/打开**的内容生效——靠读你自己的接口响应，无法处理别人的水印成品。

## 安装

1. 打开 `chrome://extensions`（Edge 用 `edge://extensions`）。
2. 打开右上角「开发者模式」。
3. 点「加载已解压的扩展程序」，选择本文件夹（`tools/doubao-downloader`）。
4. 打开豆包或 Dola 页面，插件角标显示 `ON` 即接管成功。

修改代码后，在扩展页点插件的「重新加载」，再刷新豆包页面即可。

## 使用

1. 打开豆包 / Dola 页面（其它站点不注入）。
2. 正常生成或打开一次图片 / 视频结果。
3. 页面右下角出现「豆包下载器」入口，点开或点浏览器插件图标唤起面板。
4. 面板内预览、单个下载、勾选下载、全部下载，可按日期筛选。

面板和右下角入口都能拖动，位置存本地、刷新后保持；双击标题栏让面板回到正中。

顶部两个开关：`启用`（总开关）、`去水印`（无水印提取）。开关状态存本地。

## 结构

```text
manifest.json                    扩展配置
page-hook.js                     MAIN world：包裹 fetch / XHR，只读 chain/single 响应
content-panel.js                 页面浮动下载器 UI（Shadow DOM，样式对齐内容工作台 token）
service-worker.js                后台：解析、解密、下载、开关
icons/                           扩展图标（含可编辑 SVG 源文件）
doubao-skill-pack-response.json  历史遗留：15 秒配置快照，当前无代码引用
dola-skill-pack-response.json    历史遗留：同上
```

## 维护

依赖豆包 / Dola 当前接口路径和字段。若面板抓不到资源，按顺序排查：

1. `page-hook.js` 的 `CHAIN_PATH`（`/im/chain/single`）是否还是当前接口路径。
2. 该接口是否仍走 `fetch` / `XHR`——若改成 SSE 或 WebSocket，hook 需要相应扩展。
3. 视频无水印三参数 `channel / codec_type / logo_type` 是否仍生效。

依赖字段：图片 `image_ori_raw.url`；视频 `fallback_api → main_url/play_url + key_seed`。

## 免责声明

仅用于技术研究与管理你自己生成、拥有版权或已获授权的内容。请勿用于侵犯版权、绕过付费或违反平台规则，风险自负。
