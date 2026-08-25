(function () {
  const PANEL_ID = "watermark-free-media-panel";
  const PAGE_HOOK_MARKER = "__DOUBAO_DOWNLOADER_CHAIN__";
  const POSITIONS_KEY = "doubaoDolaHelperPositions";
  const DOUBAO_PLAY_INFO_URL = "https://www.doubao.com/samantha/media/get_play_info?version_code=20800&language=zh-CN&device_platform=web&aid=497858&real_aid=497858&pkg_type=release_version&device_id=&pc_version=2.51.7&region=&sys_region=&samantha_web=1&use-olympus-account=1&web_tab_id=";

  const items = new Map();
  const selectedUrls = new Set();
  let currentSourceKey = "";
  let statusText = "等待捕获资源";
  let isCollapsed = false;
  let activeFilter = "all";
  let dateStart = "";
  let dateEnd = "";
  let panelLeft = null;
  let panelTop = null;
  let dragState = null;
  let launcherLeft = null;
  let launcherTop = null;
  let launcherDrag = null;
  let launcherMoved = false;
  let settings = {
    enabled: true,
    watermarkEnabled: true
  };

  if (document.getElementById(PANEL_ID)) {
    return;
  }

  const host = document.createElement("div");
  host.id = PANEL_ID;
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host {
        all: initial;
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        pointer-events: none;

        /* 与 内容工作台 tailwind.config.ts 同源的设计 token */
        --canvas: #F4F4F8;
        --surface: #FFFFFF;
        --soft: #F3F3F8;
        --sunken: #E9E9F1;
        --ink: #15151C;
        --muted: #5D5D6B;
        --faint: #95959F;
        --line: #E8E8EF;
        --line-strong: #D6D6E1;
        --brand-50: #F1F0FE;
        --brand-300: #A9A4F8;
        --brand-500: #6366F1;
        --brand-gradient: linear-gradient(120deg, #6366f1 0%, #7c5cf5 55%, #8b5cf6 100%);
        --danger: #E5484D;
        --shadow-card: 0 1px 2px rgba(20, 20, 45, 0.04), 0 2px 8px rgba(20, 20, 45, 0.05);
        --shadow-raised: 0 6px 22px rgba(20, 20, 45, 0.10);
        --shadow-pop: 0 16px 48px rgba(20, 20, 45, 0.16);
        --shadow-brand: 0 6px 18px rgba(99, 102, 241, 0.30);

        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", sans-serif;
        color: var(--ink);
        text-rendering: geometricPrecision;
      }

      *, *::before, *::after {
        box-sizing: border-box;
      }

      button, input, select {
        font: inherit;
      }

      /* 圆角 UI 配圆角焦点环，与主站一致 */
      button:focus-visible,
      input:focus-visible,
      select:focus-visible {
        outline: 2px solid var(--brand-500);
        outline-offset: 2px;
        border-radius: 10px;
      }

      .launcher {
        position: fixed;
        right: 18px;
        bottom: 18px;
        height: 44px;
        display: none;
        align-items: center;
        gap: 10px;
        padding: 0 8px 0 15px;
        color: var(--ink);
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 999px;
        box-shadow: var(--shadow-raised);
        cursor: grab;
        touch-action: none;
        pointer-events: auto;
        transition: border-color 0.16s ease, box-shadow 0.16s ease;
      }

      .launcher:hover {
        border-color: var(--brand-300);
        box-shadow: var(--shadow-pop);
      }

      .launcher:active {
        cursor: grabbing;
      }

      .launcher.is-visible {
        display: inline-flex;
      }

      .launcher-title {
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.01em;
      }

      /* 圆体只给数字，承接主站「font-rounded 只用于数字/徽标」的规则 */
      .badge {
        min-width: 26px;
        height: 26px;
        padding: 0 8px;
        border-radius: 999px;
        background-image: var(--brand-gradient);
        color: #fff;
        font-family: ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", system-ui, sans-serif;
        font-size: 12px;
        line-height: 26px;
        text-align: center;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }

      .shell {
        position: fixed;
        left: 50%;
        top: 50%;
        width: min(880px, calc(100vw - 48px));
        height: min(640px, calc(100vh - 72px));
        display: flex;
        flex-direction: column;
        transform: translate(-50%, -50%);
        color: var(--ink);
        background: var(--canvas);
        border: 1px solid var(--line);
        border-radius: 24px;
        box-shadow: var(--shadow-pop);
        overflow: hidden;
        pointer-events: auto;
      }

      .shell.is-hidden {
        display: none;
      }

      .topbar {
        flex: 0 0 auto;
        height: 56px;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 0 14px 0 20px;
        border-bottom: 1px solid var(--line);
        background: var(--surface);
        cursor: move;
        user-select: none;
      }

      .title {
        flex: 0 0 auto;
        margin: 0;
        font-size: 15px;
        line-height: 22px;
        font-weight: 600;
        letter-spacing: 0.01em;
      }

      .switches {
        flex: 0 0 auto;
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .switch {
        height: 30px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 0 11px;
        border: 1px solid var(--line);
        border-radius: 999px;
        background: var(--surface);
        color: var(--muted);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: color 0.16s ease, border-color 0.16s ease, background 0.16s ease;
      }

      .switch:hover {
        border-color: var(--brand-300);
        background: var(--brand-50);
      }

      .switch:has(input:checked) {
        color: var(--ink);
      }

      .switch input {
        position: absolute;
        opacity: 0;
        pointer-events: none;
      }

      .switch-track {
        position: relative;
        width: 28px;
        height: 16px;
        border-radius: 999px;
        background: var(--line-strong);
        transition: background 0.16s ease;
      }

      .switch-track::after {
        content: "";
        position: absolute;
        left: 2px;
        top: 2px;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #fff;
        box-shadow: 0 1px 2px rgba(20, 20, 45, 0.2);
        transition: transform 0.16s ease;
      }

      .switch input:checked + .switch-track {
        background: var(--brand-500);
      }

      .switch input:checked + .switch-track::after {
        transform: translateX(12px);
      }

      .actions {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        gap: 4px;
        cursor: default;
      }

      .icon-button {
        width: 32px;
        height: 32px;
        display: grid;
        place-items: center;
        color: var(--faint);
        background: transparent;
        border: 0;
        border-radius: 10px;
        font-size: 18px;
        line-height: 1;
        cursor: pointer;
        transition: color 0.16s ease, background 0.16s ease;
      }

      .icon-button:hover {
        background: var(--soft);
        color: var(--ink);
      }

      .close-button:hover {
        background: #FDECEC;
        color: var(--danger);
      }

      .toolbar {
        flex: 0 0 auto;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        padding: 12px 20px;
        border-bottom: 1px solid var(--line);
        background: var(--surface);
      }

      .select-wrap, .date-range {
        height: 34px;
        display: flex;
        align-items: center;
        background: var(--soft);
        border: 1px solid transparent;
        border-radius: 12px;
        transition: border-color 0.16s ease;
      }

      .select-wrap:hover, .date-range:hover {
        border-color: var(--line-strong);
      }

      .select-wrap {
        position: relative;
        min-width: 132px;
      }

      select {
        width: 100%;
        height: 32px;
        padding: 0 32px 0 12px;
        color: var(--ink);
        background: transparent;
        border: 0;
        outline: none;
        appearance: none;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
      }

      .select-arrow {
        position: absolute;
        right: 13px;
        top: 50%;
        width: 7px;
        height: 7px;
        border-right: 1.8px solid var(--faint);
        border-bottom: 1.8px solid var(--faint);
        transform: translateY(-70%) rotate(45deg);
        pointer-events: none;
      }

      .date-range {
        gap: 2px;
        padding: 0 10px;
        color: var(--faint);
        font-size: 12px;
      }

      .date-input {
        width: 106px;
        height: 32px;
        border: 0;
        outline: none;
        background: transparent;
        color: var(--ink);
        font-size: 12px;
      }

      .primary-button, .quiet-button {
        height: 34px;
        padding: 0 14px;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--surface);
        color: var(--muted);
        font-size: 13px;
        font-weight: 600;
        white-space: nowrap;
        cursor: pointer;
        transition: color 0.16s ease, border-color 0.16s ease, background 0.16s ease, box-shadow 0.16s ease;
      }

      .primary-button:hover, .quiet-button:hover {
        border-color: var(--brand-300);
        background: var(--brand-50);
        color: var(--ink);
      }

      .download-selected {
        margin-left: auto;
      }

      .primary-button.is-active {
        border-color: transparent;
        background-image: var(--brand-gradient);
        color: #fff;
        box-shadow: var(--shadow-brand);
      }

      .primary-button.is-active:hover {
        filter: brightness(1.05);
        color: #fff;
      }

      .content {
        flex: 1;
        min-height: 0;
        overflow: auto;
        padding: 16px 20px 24px;
        background: var(--canvas);
      }

      .content::-webkit-scrollbar {
        width: 10px;
        height: 10px;
      }

      .content::-webkit-scrollbar-track {
        background: transparent;
      }

      .content::-webkit-scrollbar-thumb {
        background: #d7d7e1;
        border: 3px solid transparent;
        background-clip: content-box;
        border-radius: 999px;
      }

      .content::-webkit-scrollbar-thumb:hover {
        background: #b9b9c8;
        background-clip: content-box;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(196px, 1fr));
        gap: 12px;
      }

      .card {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 10px;
        border: 1px solid var(--line);
        border-radius: 16px;
        background: var(--surface);
        box-shadow: var(--shadow-card);
        transition: border-color 0.16s ease, box-shadow 0.16s ease;
      }

      .card:hover {
        border-color: var(--brand-300);
        box-shadow: var(--shadow-raised);
      }

      .check {
        position: absolute;
        top: 18px;
        right: 18px;
        z-index: 2;
        width: 18px;
        height: 18px;
        accent-color: var(--brand-500);
        cursor: pointer;
        filter: drop-shadow(0 1px 2px rgba(20, 20, 45, 0.35));
      }

      .preview {
        position: relative;
        width: 100%;
        aspect-ratio: 1 / 1;
        overflow: hidden;
        background: var(--sunken);
        border-radius: 10px;
      }

      .preview img, .preview video {
        width: 100%;
        height: 100%;
        display: block;
        object-fit: cover;
      }

      .preview video {
        background: var(--ink);
      }

      .type-pill {
        position: absolute;
        left: 8px;
        top: 8px;
        height: 20px;
        padding: 0 8px;
        border-radius: 999px;
        color: #fff;
        background: rgba(21, 21, 28, 0.62);
        backdrop-filter: blur(6px);
        font-size: 11px;
        line-height: 20px;
        font-weight: 600;
      }

      .play-mark {
        position: absolute;
        left: 50%;
        top: 50%;
        width: 40px;
        height: 40px;
        display: grid;
        place-items: center;
        color: #fff;
        background: rgba(21, 21, 28, 0.55);
        backdrop-filter: blur(6px);
        border-radius: 50%;
        transform: translate(-50%, -50%);
        pointer-events: none;
      }

      .play-mark::before {
        content: "";
        width: 0;
        height: 0;
        margin-left: 3px;
        border-top: 8px solid transparent;
        border-bottom: 8px solid transparent;
        border-left: 12px solid #fff;
      }

      .card-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }

      .card-button {
        height: 32px;
        border: 1px solid var(--line);
        border-radius: 10px;
        color: var(--muted);
        background: var(--surface);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: color 0.16s ease, border-color 0.16s ease, background 0.16s ease;
      }

      .card-button:hover {
        border-color: var(--brand-300);
        background: var(--brand-50);
        color: var(--ink);
      }

      .empty {
        min-height: 200px;
        display: grid;
        place-items: center;
        color: var(--faint);
        font-size: 13px;
        text-align: center;
      }

      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          transition-duration: 0.01ms !important;
          animation-duration: 0.01ms !important;
        }
      }

      @media (max-width: 760px) {
        /* 尺寸交给基础规则的 min() 收缩，这里不能改 inset：
           它会和居中用的 translate(-50%, -50%) 打架，把面板推出屏幕。 */
        .shell {
          border-radius: 18px;
        }

        .topbar {
          height: 52px;
          padding: 0 10px 0 14px;
        }

        .title {
          font-size: 14px;
        }

        .toolbar {
          padding: 10px 12px;
        }

        .date-range {
          order: 3;
          flex: 1 1 100%;
          justify-content: center;
        }

        .download-selected {
          margin-left: 0;
        }

        .content {
          padding: 12px;
        }

        .grid {
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        }
      }
    </style>

    <button class="launcher" type="button" title="打开下载器">
      <span class="launcher-title">豆包下载器</span>
      <span class="badge launcher-count">0</span>
    </button>

    <section class="shell" aria-label="豆包下载器">
      <header class="topbar">
        <h2 class="title">豆包下载器</h2>
        <div class="switches" aria-label="插件功能开关">
          <label class="switch" title="总开关：关闭后插件放行所有接口">
            <input class="setting-toggle" data-setting="enabled" type="checkbox" />
            <span class="switch-track" aria-hidden="true"></span>
            <span>启用</span>
          </label>
          <label class="switch" title="控制无水印资源提取">
            <input class="setting-toggle" data-setting="watermarkEnabled" type="checkbox" />
            <span class="switch-track" aria-hidden="true"></span>
            <span>去水印</span>
          </label>
        </div>
        <div class="actions">
          <button class="icon-button collapse-button" type="button" title="最小化">−</button>
          <button class="icon-button close-button" type="button" title="关闭">×</button>
        </div>
      </header>

      <div class="toolbar">
        <label class="select-wrap">
          <select class="filter-select" aria-label="资源类型">
            <option value="all">所有资源</option>
            <option value="video">仅视频</option>
            <option value="image">仅图片</option>
          </select>
          <span class="select-arrow" aria-hidden="true"></span>
        </label>
        <div class="date-range" aria-label="捕获日期筛选">
          <input class="date-input start-date" type="date" title="开始日期" />
          <span>~</span>
          <input class="date-input end-date" type="date" title="结束日期" />
        </div>
        <button class="primary-button download-selected" type="button">下载选中</button>
        <button class="quiet-button download-all" type="button">全部下载</button>
      </div>

      <main class="content">
        <div class="empty">等待捕获资源</div>
      </main>
    </section>
  `;

  const shell = shadow.querySelector(".shell");
  const launcher = shadow.querySelector(".launcher");
  const launcherCount = shadow.querySelector(".launcher-count");
  const content = shadow.querySelector(".content");
  const topbar = shadow.querySelector(".topbar");
  const settingToggles = Array.from(shadow.querySelectorAll(".setting-toggle"));
  const filterSelect = shadow.querySelector(".filter-select");
  const startDateInput = shadow.querySelector(".start-date");
  const endDateInput = shadow.querySelector(".end-date");
  const downloadSelectedButton = shadow.querySelector(".download-selected");
  const downloadAllButton = shadow.querySelector(".download-all");
  const collapseButton = shadow.querySelector(".collapse-button");
  const closeButton = shadow.querySelector(".close-button");

  isCollapsed = true;
  render();
  restorePositions();

  launcher.addEventListener("click", () => {
    // A drag that ends on the launcher must not also count as a click to open.
    if (launcherMoved) {
      launcherMoved = false;
      return;
    }
    isCollapsed = false;
    render();
  });

  launcher.addEventListener("pointerdown", startLauncherDrag);
  launcher.addEventListener("pointermove", moveLauncherDrag);
  launcher.addEventListener("pointerup", endLauncherDrag);
  launcher.addEventListener("pointercancel", endLauncherDrag);

  collapseButton.addEventListener("click", () => {
    isCollapsed = true;
    render();
  });

  closeButton.addEventListener("click", () => {
    isCollapsed = true;
    render();
  });

  settingToggles.forEach((toggle) => {
    toggle.addEventListener("change", () => {
      settings = {
        ...settings,
        [toggle.dataset.setting]: toggle.checked
      };
      applySettings(settings);
      chrome.runtime.sendMessage({ type: "SET_SETTINGS", settings }, (response) => {
        if (response?.settings) {
          settings = response.settings;
          applySettings(settings);
        }
      });
    });
  });

  filterSelect.addEventListener("change", () => {
    activeFilter = filterSelect.value;
    render();
  });

  startDateInput.addEventListener("change", () => {
    dateStart = startDateInput.value;
    render();
  });

  endDateInput.addEventListener("change", () => {
    dateEnd = endDateInput.value;
    render();
  });

  topbar.addEventListener("pointerdown", startDrag);
  topbar.addEventListener("dblclick", () => {
    panelLeft = null;
    panelTop = null;
    applyPanelPosition();
    savePositions();
  });
  window.addEventListener("pointermove", moveDrag);
  window.addEventListener("pointerup", endDrag);

  downloadSelectedButton.addEventListener("click", () => {
    const urls = getFilteredItems()
      .filter((item) => selectedUrls.has(item.url))
      .map((item) => item.url);
    downloadUrls(urls);
  });

  downloadAllButton.addEventListener("click", () => {
    downloadUrls(getFilteredItems().map((item) => item.url));
  });

  chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (response) => {
    if (response?.settings) {
      settings = response.settings;
      applySettings(settings);
    }
  });

  // Bridge from page-hook.js (MAIN world) to the service worker, which owns the
  // extraction logic and can reach fallback_api without the page's CORS rules.
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.marker !== PAGE_HOOK_MARKER) {
      return;
    }

    chrome.runtime.sendMessage({
      type: "CHAIN_RESPONSE",
      sourceKey: event.data.sourceKey,
      host: event.data.host,
      url: event.data.url,
      body: event.data.body
    });
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!message) {
      return;
    }

    if (message.type === "SHOW_PANEL") {
      isCollapsed = false;
      render();
      return;
    }

    if (message.type === "SETTINGS_UPDATED" && message.settings) {
      settings = message.settings;
      applySettings(settings);
      return;
    }

    if (message.type === "MEDIA_STATUS" && typeof message.text === "string") {
      resetForSource(message.sourceKey);
      items.clear();
      selectedUrls.clear();
      statusText = message.text;
      render();
      return;
    }

    if (message.type === "MEDIA_FOUND" && Array.isArray(message.items)) {
      resetForSource(message.sourceKey);
      items.clear();
      selectedUrls.clear();
      addItems(message.items);
      statusText = items.size ? "" : "未提取到资源";
      render();
      return;
    }

    if (message.type === "DOUBAO_VIDS_FOUND" && Array.isArray(message.vids)) {
      resetForSource(message.sourceKey);
      fetchDoubaoVideos(message.sourceKey, message.vids);
    }
  });

  async function fetchDoubaoVideos(sourceKey, vids) {
    const uniqueVids = Array.from(new Set(vids.filter((vid) => typeof vid === "string" && vid)));
    if (!uniqueVids.length) {
      return;
    }

    statusText = items.size ? "" : "正在获取豆包无水印视频";
    render();

    const foundItems = [];
    for (const vid of uniqueVids) {
      const url = await getDoubaoOriginalVideoUrl(vid);
      if (isHttpUrl(url)) {
        foundItems.push({ type: "video", url });
      }
    }

    if (sourceKey !== currentSourceKey) {
      return;
    }

    addItems(foundItems);
    statusText = items.size ? "" : "未提取到资源";
    render();
  }

  async function getDoubaoOriginalVideoUrl(vid) {
    try {
      const response = await fetch(DOUBAO_PLAY_INFO_URL, {
        method: "POST",
        credentials: "omit",
        headers: {
          "accept": "application/json, text/plain, */*",
          "content-type": "application/json"
        },
        body: JSON.stringify({ key: vid })
      });
      const json = await response.json();
      const url = json?.data?.original_media_info?.main_url;
      return isHttpUrl(url) ? url : "";
    } catch (error) {
      console.warn("doubao play info failed:", error);
      return "";
    }
  }

  function resetForSource(sourceKey) {
    if (typeof sourceKey !== "string" || !sourceKey) {
      return;
    }

    if (sourceKey !== currentSourceKey) {
      currentSourceKey = sourceKey;
      items.clear();
      selectedUrls.clear();
      statusText = "";
    }
  }

  function render() {
    const allItems = Array.from(items.values());
    launcherCount.textContent = String(allItems.length);
    shell.classList.toggle("is-hidden", isCollapsed);
    launcher.classList.toggle("is-visible", isCollapsed);
    applyPanelPosition();

    const filteredItems = getFilteredItems();
    downloadSelectedButton.classList.toggle("is-active", filteredItems.some((item) => selectedUrls.has(item.url)));
    downloadSelectedButton.textContent = selectedUrls.size ? `下载选中 ${selectedUrls.size}` : "下载选中";
    downloadAllButton.textContent = filteredItems.length ? `全部下载 ${filteredItems.length}` : "全部下载";

    content.textContent = "";

    if (!filteredItems.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = statusText || (items.size ? "当前筛选没有资源，试试清空筛选" : "等待捕获资源");
      content.appendChild(empty);
      return;
    }

    const grid = document.createElement("div");
    grid.className = "grid";

    filteredItems.forEach((item, index) => {
      grid.appendChild(createCard(item, index));
    });

    content.appendChild(grid);
  }

  function createCard(item, index) {
    const card = document.createElement("article");
    card.className = "card";

    const checkbox = document.createElement("input");
    checkbox.className = "check";
    checkbox.type = "checkbox";
    checkbox.checked = selectedUrls.has(item.url);
    checkbox.title = "选择资源";
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selectedUrls.add(item.url);
      } else {
        selectedUrls.delete(item.url);
      }
      render();
    });

    const preview = document.createElement("div");
    preview.className = "preview";
    preview.title = item.url;

    const pill = document.createElement("span");
    pill.className = "type-pill";
    pill.textContent = item.type === "image" ? "图片" : "视频";

    if (item.type === "image") {
      const image = document.createElement("img");
      image.src = item.url;
      image.alt = `无水印图片 ${index + 1}`;
      image.loading = "lazy";
      preview.append(image);
    } else {
      const video = document.createElement("video");
      video.src = item.url;
      video.controls = true;
      video.muted = true;
      video.preload = "metadata";
      video.playsInline = true;
      preview.append(video, createPlayMark());
      video.addEventListener("play", () => {
        const marker = preview.querySelector(".play-mark");
        if (marker) {
          marker.remove();
        }
      }, { once: true });
    }

    preview.append(pill);

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const copyButton = document.createElement("button");
    copyButton.className = "card-button";
    copyButton.type = "button";
    copyButton.textContent = "链接";
    copyButton.title = "复制资源链接";
    copyButton.addEventListener("click", () => copyUrl(item.url, copyButton));

    const downloadButton = document.createElement("button");
    downloadButton.className = "card-button";
    downloadButton.type = "button";
    downloadButton.textContent = "下载";
    downloadButton.addEventListener("click", () => downloadUrls([item.url]));

    actions.append(copyButton, downloadButton);
    card.append(checkbox, preview, actions);
    return card;
  }

  function createPlayMark() {
    const playMark = document.createElement("span");
    playMark.className = "play-mark";
    return playMark;
  }

  async function copyUrl(url, button) {
    try {
      await navigator.clipboard.writeText(url);
      const oldText = button.textContent;
      button.textContent = "已复制";
      setTimeout(() => {
        button.textContent = oldText;
      }, 1000);
    } catch {
      downloadUrls([url]);
    }
  }

  function getFilteredItems() {
    const startMs = dateStart ? new Date(`${dateStart}T00:00:00`).getTime() : 0;
    const endMs = dateEnd ? new Date(`${dateEnd}T23:59:59`).getTime() : Number.POSITIVE_INFINITY;

    return Array.from(items.values()).filter((item) => {
      if (activeFilter !== "all" && item.type !== activeFilter) {
        return false;
      }

      const capturedAt = item.capturedAt || 0;
      return capturedAt >= startMs && capturedAt <= endMs;
    });
  }

  function applySettings(nextSettings) {
    settings = {
      enabled: nextSettings?.enabled !== false,
      watermarkEnabled: nextSettings?.watermarkEnabled !== false
    };

    settingToggles.forEach((toggle) => {
      toggle.checked = Boolean(settings[toggle.dataset.setting]);
    });
  }

  function downloadUrls(urls) {
    for (const url of urls) {
      if (isHttpUrl(url)) {
        chrome.runtime.sendMessage({ type: "DOWNLOAD_MEDIA", url });
      }
    }
  }

  function addItems(nextItems) {
    for (const item of nextItems) {
      if (!item || typeof item.url !== "string" || !isHttpUrl(item.url)) {
        continue;
      }
      const type = item.type === "image" ? "image" : "video";
      items.set(item.url, { type, url: item.url, capturedAt: Date.now() });
      selectedUrls.add(item.url);
    }
  }

  function startDrag(event) {
    if (event.button !== 0 || event.target.closest("button, input, select, label")) {
      return;
    }

    const rect = shell.getBoundingClientRect();
    panelLeft = rect.left;
    panelTop = rect.top;
    dragState = {
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    };
    topbar.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function moveDrag(event) {
    if (!dragState) {
      return;
    }

    const nextLeft = dragState.left + event.clientX - dragState.startX;
    const nextTop = dragState.top + event.clientY - dragState.startY;
    panelLeft = clamp(nextLeft, 8, Math.max(8, window.innerWidth - dragState.width - 8));
    panelTop = clamp(nextTop, 8, Math.max(8, window.innerHeight - dragState.height - 8));
    applyPanelPosition();
  }

  function endDrag() {
    if (dragState) {
      savePositions();
    }
    dragState = null;
  }

  const LAUNCHER_DRAG_THRESHOLD = 4;

  function startLauncherDrag(event) {
    if (event.button !== 0) {
      return;
    }

    const rect = launcher.getBoundingClientRect();
    launcherMoved = false;
    launcherDrag = {
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    };
    launcher.setPointerCapture?.(event.pointerId);
  }

  function moveLauncherDrag(event) {
    if (!launcherDrag) {
      return;
    }

    const deltaX = event.clientX - launcherDrag.startX;
    const deltaY = event.clientY - launcherDrag.startY;
    if (!launcherMoved && Math.hypot(deltaX, deltaY) < LAUNCHER_DRAG_THRESHOLD) {
      return;
    }

    launcherMoved = true;
    launcherLeft = clamp(launcherDrag.left + deltaX, 8, Math.max(8, window.innerWidth - launcherDrag.width - 8));
    launcherTop = clamp(launcherDrag.top + deltaY, 8, Math.max(8, window.innerHeight - launcherDrag.height - 8));
    applyLauncherPosition();
  }

  function endLauncherDrag(event) {
    if (launcherDrag) {
      launcher.releasePointerCapture?.(event.pointerId);
      if (launcherMoved) {
        savePositions();
      }
    }
    launcherDrag = null;
  }

  function applyLauncherPosition() {
    if (launcherLeft == null || launcherTop == null) {
      launcher.style.left = "auto";
      launcher.style.top = "auto";
      launcher.style.right = "18px";
      launcher.style.bottom = "18px";
      return;
    }

    launcher.style.left = `${launcherLeft}px`;
    launcher.style.top = `${launcherTop}px`;
    launcher.style.right = "auto";
    launcher.style.bottom = "auto";
  }

  function savePositions() {
    chrome.storage.local.set({
      [POSITIONS_KEY]: { panelLeft, panelTop, launcherLeft, launcherTop }
    }).catch((error) => {
      console.warn("save panel position failed:", error);
    });
  }

  function restorePositions() {
    chrome.storage.local.get(POSITIONS_KEY).then((stored) => {
      const saved = stored[POSITIONS_KEY];
      if (!saved) {
        return;
      }
      panelLeft = numberOrNull(saved.panelLeft);
      panelTop = numberOrNull(saved.panelTop);
      launcherLeft = numberOrNull(saved.launcherLeft);
      launcherTop = numberOrNull(saved.launcherTop);
      clampPositionsToViewport();
      applyPanelPosition();
      applyLauncherPosition();
    }).catch((error) => {
      console.warn("restore panel position failed:", error);
    });
  }

  function numberOrNull(value) {
    return Number.isFinite(value) ? value : null;
  }

  // A window smaller than last session would otherwise strand either element offscreen.
  function clampPositionsToViewport() {
    if (launcherLeft != null && launcherTop != null) {
      const rect = launcher.getBoundingClientRect();
      launcherLeft = clamp(launcherLeft, 8, Math.max(8, window.innerWidth - rect.width - 8));
      launcherTop = clamp(launcherTop, 8, Math.max(8, window.innerHeight - rect.height - 8));
    }

    if (panelLeft != null && panelTop != null) {
      const rect = shell.getBoundingClientRect();
      panelLeft = clamp(panelLeft, 8, Math.max(8, window.innerWidth - rect.width - 8));
      panelTop = clamp(panelTop, 8, Math.max(8, window.innerHeight - rect.height - 8));
    }
  }

  function applyPanelPosition() {
    if (panelLeft == null || panelTop == null) {
      shell.style.left = "50%";
      shell.style.top = "50%";
      shell.style.right = "auto";
      shell.style.bottom = "auto";
      shell.style.transform = "translate(-50%, -50%)";
      return;
    }

    shell.style.left = `${panelLeft}px`;
    shell.style.top = `${panelTop}px`;
    shell.style.right = "auto";
    shell.style.bottom = "auto";
    shell.style.transform = "none";
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function isHttpUrl(url) {
    return /^https?:\/\//i.test(url);
  }
})();
