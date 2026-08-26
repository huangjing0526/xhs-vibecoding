const EXTENSION_VERSION = "1.2.0";
const DEBUG_LOG_ENABLED = false;
const SETTINGS_KEY = "doubaoDolaHelperSettings";
const DEFAULT_SETTINGS = {
  enabled: true,
  watermarkEnabled: true
};

const TARGET_HOSTS = ["doubao.com", "dola.com"];

/**
 * 内容工作台的本机地址。next dev 默认 3000；换端口就改这里，
 * 并同步把新端口加进 manifest.json 的 host_permissions，否则 fetch 会被扩展权限挡掉。
 */
const WORKBENCH_ORIGIN = "http://127.0.0.1:3000";
/** 单个片子的体积上限，超了多半是抓错了资源，不往工作台推。 */
const MAX_CLIP_BYTES = 200 * 1024 * 1024;
const QAAB_SALT_HEX = "4dd4c2e6b83162090e52b3c7a6733ba4"
  + "1cb2462b829ab58a196b39db57177524"
  + "f49baf7f08e8d68d26a72e37c1a95a2f"
  + "1f05a51892aef2949732b62a38aadd58";

let currentSettings = { ...DEFAULT_SETTINGS };

function debugLog(...args) {
  if (DEBUG_LOG_ENABLED) {
    console.log(`[Doubao Dola Helper ${EXTENSION_VERSION}]`, ...args);
  }
}

loadSettings().then(() => refreshBadges());
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[SETTINGS_KEY]) {
    return;
  }
  currentSettings = normalizeSettings(changes[SETTINGS_KEY].newValue);
  refreshBadges();
});

chrome.runtime.onInstalled.addListener(refreshBadges);
chrome.runtime.onStartup.addListener(refreshBadges);

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await safeGetTab(tabId);
  if (tab && isTargetUrl(tab.url)) {
    setBadge(tabId, currentSettings.enabled ? "ON" : "OFF");
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab.url;
  if (isTargetUrl(url)) {
    setBadge(tabId, currentSettings.enabled ? "ON" : "OFF");
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab && tab.id) {
    await sendToTab(tab.id, { type: "SHOW_PANEL" });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) {
    return false;
  }

  if (message.type === "CHAIN_RESPONSE" && typeof message.body === "string") {
    const tabId = sender?.tab?.id;
    if (tabId) {
      handleChainResponse(tabId, message).catch((error) => {
        console.warn("chain response handling failed:", error.message || error);
      });
    }
    return false;
  }

  if (message.type === "DOWNLOAD_MEDIA" && isHttpUrl(message.url)) {
    chrome.downloads.download({ url: message.url, saveAs: false })
      .then(() => sendResponse({ success: true }))
      .catch((error) => {
        console.warn("download failed:", error);
        sendResponse({ success: false, message: "下载失败" });
      });
    return true;
  }

  if (message.type === "LIST_WORKBENCH_PROJECTS") {
    listWorkbenchProjects()
      .then((projects) => sendResponse({ success: true, projects }))
      .catch((error) => sendResponse({ success: false, message: describeWorkbenchError(error) }));
    return true;
  }

  if (message.type === "SEND_TO_WORKBENCH") {
    sendClipToWorkbench(message)
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, message: describeWorkbenchError(error) }));
    return true;
  }

  if (message.type === "GET_SETTINGS") {
    loadSettings()
      .then((settings) => sendResponse({ settings }))
      .catch(() => sendResponse({ settings: { ...DEFAULT_SETTINGS } }));
    return true;
  }

  if (message.type === "SET_SETTINGS" && message.settings) {
    saveSettings(message.settings)
      .then((settings) => {
        if (sender?.tab?.id) {
          setBadge(sender.tab.id, settings.enabled ? "ON" : "OFF");
        }
        broadcastSettings(settings);
        sendResponse({ settings });
      })
      .catch(() => sendResponse({ settings: currentSettings }));
    return true;
  }

  return false;
});

async function handleChainResponse(tabId, message) {
  const settings = await loadSettings();
  if (!settings.enabled || !settings.watermarkEnabled) {
    return;
  }

  const source = String(message.host || "").includes("dola.com") ? "dola" : "doubao";
  debugLog("chain response", { tabId, source, url: message.url });
  await extractAndReportMedia(tabId, message.sourceKey, message.body, source);
}

async function loadSettings() {
  try {
    const stored = await chrome.storage.local.get(SETTINGS_KEY);
    currentSettings = normalizeSettings(stored[SETTINGS_KEY]);
  } catch {
    currentSettings = { ...DEFAULT_SETTINGS };
  }
  return currentSettings;
}

async function saveSettings(nextSettings) {
  currentSettings = normalizeSettings(nextSettings);
  await chrome.storage.local.set({ [SETTINGS_KEY]: currentSettings });
  await refreshBadges();
  return currentSettings;
}

function normalizeSettings(value) {
  return {
    enabled: value?.enabled !== false,
    watermarkEnabled: value?.watermarkEnabled !== false
  };
}

async function broadcastSettings(settings) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id && isTargetUrl(tab.url)) {
      sendToTab(tab.id, { type: "SETTINGS_UPDATED", settings }).catch(() => {});
    }
  }
}

async function refreshBadges() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id && isTargetUrl(tab.url)) {
      setBadge(tab.id, currentSettings.enabled ? "ON" : "OFF");
    }
  }
}

async function safeGetTab(tabId) {
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    return null;
  }
}

function isTargetUrl(url) {
  if (!isHttpUrl(url)) {
    return false;
  }

  try {
    const { hostname } = new URL(url);
    return TARGET_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

async function extractAndReportMedia(tabId, sourceKey, body, source) {
  let items = [];
  try {
    const json = JSON.parse(body);
    if (source === "doubao") {
      items = await extractDoubaoItems(json, body);
    } else {
      items = extractDolaItems(json);
    }
  } catch (error) {
    console.warn(`${source} chain parse failed:`, error.message || error);
  }

  if (items.length) {
    await sendToTab(tabId, {
      type: "MEDIA_FOUND",
      sourceKey,
      items
    });
  } else {
    await sendToTab(tabId, {
      type: "MEDIA_STATUS",
      sourceKey,
      text: "未提取到资源"
    });
  }
}

async function extractDoubaoItems(json, rawBody) {
  const items = [];
  const seenUrls = new Set();

  for (const url of findImageOriRawUrls(json)) {
    addItem(items, seenUrls, "image", url);
  }

  for (const fallbackApi of findDoubaoFallbackApis(json, rawBody)) {
    const videoUrl = await getDoubaoVideoUrlFromFallbackApi(fallbackApi);
    addItem(items, seenUrls, "video", videoUrl);
  }

  return items;
}

function findDoubaoFallbackApis(json, rawBody) {
  const apis = new Set();

  for (const value of findValuesByKey(json, "fallback_api")) {
    addFallbackApi(apis, value);
  }

  const patterns = [
    /fallback_api\\":\\"(.*?)\\"/g,
    /"fallback_api"\s*:\s*"([^"]+)"/g
  ];

  for (const pattern of patterns) {
    let match = pattern.exec(rawBody);
    while (match) {
      addFallbackApi(apis, decodeJsonEscapedFragment(match[1]));
      match = pattern.exec(rawBody);
    }
  }

  return Array.from(apis);
}

function addFallbackApi(apis, value) {
  if (typeof value !== "string" || !value) {
    return;
  }

  const url = decodeJsonEscapedFragment(value);
  if (isHttpUrl(url)) {
    apis.add(url);
  }
}

function decodeJsonEscapedFragment(value) {
  let text = value;
  for (let index = 0; index < 3; index += 1) {
    try {
      const decoded = JSON.parse(`"${text.replace(/"/g, '\\"')}"`);
      if (decoded === text) {
        break;
      }
      text = decoded;
    } catch {
      break;
    }
  }
  return text.replace(/\\u0026/g, "&").replace(/\\\//g, "/");
}

async function getDoubaoVideoUrlFromFallbackApi(fallbackApi) {
  try {
    const url = replaceQueryParams(fallbackApi, {
      channel: "no",
      codec_type: "8",
      logo_type: "unwatermarked"
    });
    const response = await fetch(url, {
      method: "GET",
      credentials: "omit",
      headers: {
        "accept": "application/json,text/plain,*/*"
      }
    });
    const payload = await response.json();
    const data = getVideoData(payload);
    const token = pickMainUrlToken(data);
    if (!token) {
      return "";
    }
    return await decodeMainUrl(token, findKeySeedDeep(payload));
  } catch (error) {
    console.warn("doubao fallback_api failed:", error.message || error);
    return "";
  }
}

function replaceQueryParams(url, params) {
  const parsedUrl = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    parsedUrl.searchParams.set(key, value);
  }
  return parsedUrl.toString();
}

function getVideoData(payload) {
  const videoInfo = payload?.video_info || payload?.data?.video_info || payload;
  const data = videoInfo?.data || videoInfo;
  return data && typeof data === "object" ? data : {};
}

function pickMainUrlToken(data) {
  const videoList = data?.video_list;
  const entries = videoList && typeof videoList === "object" && Object.keys(videoList).length
    ? Object.values(videoList)
    : [data];
  let best = null;

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const token = entry.main_url || entry.play_url || "";
    if (typeof token !== "string" || !token.trim()) {
      continue;
    }
    const score = Number(entry.bitrate || entry.real_bitrate || 0)
      + Number(entry.vwidth || entry.width || 0) * Number(entry.vheight || entry.height || 0);
    if (!best || score > best.score) {
      best = { token: token.trim(), score };
    }
  }

  return best ? best.token : "";
}

function findKeySeedDeep(value, depth = 0) {
  if (depth > 10 || value == null) {
    return "";
  }

  if (typeof value === "string") {
    let match = value.match(/(?:^|[?&])key_seed=([^&"'<>\\\s]+)/i);
    if (match) {
      return decodeURIComponent(match[1]);
    }
    match = value.match(/["']key_seed["']\s*:\s*["']([^"']+)/i);
    return match ? decodeURIComponent(match[1]) : "";
  }

  if (typeof value !== "object") {
    return "";
  }

  if (typeof value.key_seed === "string" && value.key_seed.trim()) {
    return value.key_seed.trim();
  }

  for (const item of Object.values(value)) {
    const hit = findKeySeedDeep(item, depth + 1);
    if (hit) {
      return hit;
    }
  }

  return "";
}

async function decodeMainUrl(token, keySeed = "") {
  if (isHttpUrl(token)) {
    return token;
  }

  const plainUrl = tryDecodeBase64Url(token);
  if (plainUrl) {
    return plainUrl;
  }

  if (token.startsWith("qAAB") && keySeed) {
    return await decodeQaabToken(token, keySeed);
  }

  return "";
}

function tryDecodeBase64Url(token) {
  const bytes = base64DecodeLoose(token);
  if (!bytes) {
    return "";
  }
  const text = asciiUrlFromBytes(bytes);
  return isHttpUrl(text) ? text : "";
}

function base64DecodeLoose(text) {
  const input = String(text || "").trim();
  const variants = [
    input,
    input.replace(/[$@#]/g, (char) => ({ "$": "_", "@": "/", "#": "." }[char])),
    input.replace(/[$@#]/g, (char) => ({ "$": "+", "@": "/", "#": "=" }[char]))
  ];
  const seen = new Set();

  for (const candidate of variants) {
    if (!candidate || seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    try {
      const normalized = padBase64(candidate).replace(/-/g, "+").replace(/_/g, "/");
      const binary = atob(normalized);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return bytes;
    } catch {
      // Try the next variant.
    }
  }

  return null;
}

function padBase64(text) {
  const pad = (4 - (text.length % 4)) % 4;
  return text + "=".repeat(pad);
}

function asciiUrlFromBytes(bytes) {
  if (!bytes || !bytes.length) {
    return "";
  }
  for (const byte of bytes) {
    if (byte !== 9 && byte !== 10 && byte !== 13 && (byte < 32 || byte > 126)) {
      return "";
    }
  }
  return new TextDecoder().decode(bytes);
}

async function decodeQaabToken(token, keySeed) {
  const data = base64DecodeLoose(token);
  const seed = base64DecodeLoose(keySeed);
  if (!data || !seed) {
    return "";
  }

  const digest1 = await crypto.subtle.digest("SHA-512", seed.slice(0, 32));
  const salt = hexToBytes(QAAB_SALT_HEX);
  const digest2Input = concatBytes(new Uint8Array(digest1), salt);
  const digest2 = new Uint8Array(await crypto.subtle.digest("SHA-512", digest2Input));
  const key = digest2.slice(0, 16);
  const iv = digest2.slice(16, 32);
  const attempts = [];

  if (data.length >= 4 && data[0] === 0xa8 && data[1] === 0x00 && data[2] === 0x01 && data[3] === 0x00) {
    attempts.push({ payload: data.slice(4), key, iv });
    attempts.push({ payload: data.slice(4), key: iv, iv: key });
    if (data.length > 36) {
      attempts.push({ payload: data.slice(36), key, iv: data.slice(20, 36) });
      attempts.push({ payload: data.slice(36), key, iv });
    }
  } else {
    attempts.push({ payload: data, key, iv });
  }

  for (const attempt of attempts) {
    const url = await decryptAesCbcUrl(attempt.payload, attempt.key, attempt.iv);
    if (url) {
      return url;
    }
  }

  return "";
}

async function decryptAesCbcUrl(payload, keyBytes, ivBytes) {
  if (!payload.length || payload.length % 16 !== 0) {
    return "";
  }

  try {
    const key = await crypto.subtle.importKey("raw", keyBytes, "AES-CBC", false, ["decrypt"]);
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv: ivBytes }, key, payload));
    const direct = asciiUrlFromBytes(plain);
    if (isHttpUrl(direct)) {
      return direct;
    }
    const stripped = stripPkcs7(plain);
    const url = asciiUrlFromBytes(stripped);
    return isHttpUrl(url) ? url : "";
  } catch {
    return "";
  }
}

function stripPkcs7(bytes) {
  if (!bytes || !bytes.length) {
    return new Uint8Array();
  }
  const pad = bytes[bytes.length - 1];
  if (pad < 1 || pad > 16 || pad > bytes.length) {
    return bytes;
  }
  for (let index = bytes.length - pad; index < bytes.length; index += 1) {
    if (bytes[index] !== pad) {
      return bytes;
    }
  }
  return bytes.slice(0, bytes.length - pad);
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function concatBytes(first, second) {
  const bytes = new Uint8Array(first.length + second.length);
  bytes.set(first, 0);
  bytes.set(second, first.length);
  return bytes;
}

function extractDolaItems(json) {
  const items = [];
  const seenUrls = new Set();

  for (const url of findImageOriRawUrls(json)) {
    addItem(items, seenUrls, "image", url);
  }

  for (const encodedUrl of findDolaEncodedVideoUrls(json)) {
    const url = decodeBase64Url(encodedUrl);
    addItem(items, seenUrls, "video", url);
  }

  return items;
}

function findDolaEncodedVideoUrls(json) {
  const values = [];
  for (const value of findValuesByKey(json, "man_url")) {
    values.push(value);
  }
  for (const value of findValuesByKey(json, "main_url")) {
    values.push(value);
  }
  return values;
}

function findImageOriRawUrls(value) {
  const urls = [];
  walkJsonAndStrings(value, (node) => {
    if (node && typeof node === "object" && !Array.isArray(node)) {
      const image = node.image_ori_raw;
      if (image && typeof image === "object" && isHttpUrl(image.url)) {
        urls.push(image.url);
      }
    }
  });
  return urls;
}

function findValuesByKey(value, targetKey) {
  const values = [];
  walkJsonAndStrings(value, (node) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(node, targetKey)) {
      values.push(node[targetKey]);
    }
  });
  return values;
}

function walkJsonAndStrings(value, visitor, seen = new Set()) {
  if (value == null) {
    return;
  }

  if (typeof value === "string") {
    const parsed = parseJsonString(value);
    if (parsed !== null) {
      walkJsonAndStrings(parsed, visitor, seen);
    }
    return;
  }

  if (typeof value !== "object" || seen.has(value)) {
    return;
  }

  seen.add(value);
  visitor(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      walkJsonAndStrings(item, visitor, seen);
    }
    return;
  }

  for (const key of Object.keys(value)) {
    walkJsonAndStrings(value[key], visitor, seen);
  }
}

function parseJsonString(text) {
  const trimmed = text.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function addItem(items, seenUrls, type, url) {
  if (!isHttpUrl(url) || seenUrls.has(url)) {
    return;
  }
  seenUrls.add(url);
  items.push({ type, url });
}

function decodeBase64Url(value) {
  if (typeof value !== "string" || !value) {
    return "";
  }

  if (isHttpUrl(value)) {
    return value;
  }

  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const decoded = fromBase64Utf8(padded);
    return isHttpUrl(decoded) ? decoded : "";
  } catch {
    return "";
  }
}

function fromBase64Utf8(base64Text) {
  const binary = atob(base64Text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * 工作台没开着是最常见的失败，fetch 抛的是干巴巴的 "Failed to fetch"。
 * 这里翻成人能看懂的话，省得每次都去翻扩展的 console。
 */
function describeWorkbenchError(error) {
  const raw = (error && error.message) || String(error || "");
  if (/failed to fetch|networkerror|load failed/i.test(raw)) {
    return `连不上内容工作台（${WORKBENCH_ORIGIN}），先把 npm run dev 跑起来`;
  }
  return raw || "送到工作台失败";
}

/**
 * 读工作台返回的 { code, data, message } 信封，非 0 一律当失败抛出去。
 * 信封契约的所有者在工作台侧的 app/api/feishu/_utils.ts（apiOk / apiBadRequest）；
 * 扩展是无构建的裸 JS，导不进那边的 TS，所以这里只能照着实现一份。
 */
async function readEnvelope(response) {
  if (!response.ok) {
    throw new Error(`工作台返回 ${response.status}`);
  }
  const payload = await response.json();
  if (!payload || payload.code !== 0) {
    throw new Error((payload && payload.message) || "工作台拒绝了这次请求");
  }
  return payload.data || {};
}

/** 拉视频工厂的项目列表，面板用它填「送到哪个项目」的下拉。 */
async function listWorkbenchProjects() {
  const response = await fetch(`${WORKBENCH_ORIGIN}/api/video-factory/project`, { cache: "no-store" });
  const data = await readEnvelope(response);
  return (data.projects || []).map((project) => ({
    id: project.id,
    title: project.title || "未命名项目",
    shotCount: (project.storyboard && project.storyboard.shots && project.storyboard.shots.length) || 0
  }));
}

/**
 * 把页面上抓到的无水印片推给视频工厂，挂到指定项目的指定镜头。
 * 先在后台把字节取下来再转发，而不是把地址交给工作台自己下——
 * 那个地址带着豆包的会话签名，出了浏览器就取不到了。
 */
async function sendClipToWorkbench(message) {
  const { url, projectId, shotOrder, durationSec } = message || {};
  // 只留 fetch 前必须的这一条；镜号范围、项目 id 合法性由工作台判，
  // readEnvelope 会把它的中文报错原样冒泡上来，不在这儿再抄一份规则
  if (!isHttpUrl(url)) {
    throw new Error("资源地址不合法");
  }

  const media = await fetch(url, { cache: "no-store" });
  if (!media.ok) {
    throw new Error(`取视频失败（${media.status}）`);
  }

  // 有 content-length 就先看一眼，别把整个超大文件拉完再拒
  const declaredBytes = Number(media.headers.get("content-length"));
  if (declaredBytes > MAX_CLIP_BYTES) {
    throw new Error(`视频超过 ${Math.round(MAX_CLIP_BYTES / 1024 / 1024)}MB，没往工作台推`);
  }

  const blob = await media.blob();
  if (!blob.size) {
    throw new Error("取回来的视频是空的");
  }
  // 分块响应没有 content-length，兜底再判一次
  if (blob.size > MAX_CLIP_BYTES) {
    throw new Error(`视频超过 ${Math.round(MAX_CLIP_BYTES / 1024 / 1024)}MB，没往工作台推`);
  }

  const form = new FormData();
  form.append("projectId", String(projectId || ""));
  form.append("shotOrder", String(shotOrder));
  form.append("provider", "doubao");
  if (Number(durationSec) > 0) {
    form.append("durationSec", String(durationSec));
  }
  // 文件名只为了过工作台那边的 .mp4 后缀校验；真正的落盘路径由服务端的 clipPath() 决定
  form.append("clipFile", blob, "clip.mp4");

  const response = await fetch(`${WORKBENCH_ORIGIN}/api/video-factory/clip`, { method: "POST", body: form });
  await readEnvelope(response);
}

function isHttpUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

async function sendToTab(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    console.warn("send panel message failed:", error.message || error);
  }
}

function setBadge(tabId, text) {
  chrome.action.setBadgeText({ tabId, text }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ tabId, color: "#166534" }).catch(() => {});
}
