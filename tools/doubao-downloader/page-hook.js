// Runs in the page's MAIN world at document_start.
//
// It observes chain/single responses by wrapping fetch and XMLHttpRequest, then
// hands the raw body to the content script via postMessage. Nothing is modified
// on the way through, which is why this extension no longer needs the debugger
// permission (and no longer shows Chrome's "started debugging" bar).
(() => {
  const MARKER = "__DOUBAO_DOWNLOADER_CHAIN__";
  const CHAIN_PATH = "/im/chain/single";

  if (window[MARKER]) {
    return;
  }
  window[MARKER] = true;

  let sequence = 0;

  function isChainUrl(url) {
    return typeof url === "string" && url.includes(CHAIN_PATH);
  }

  function report(url, body) {
    if (typeof body !== "string" || !body) {
      return;
    }
    sequence += 1;
    window.postMessage({
      marker: MARKER,
      sourceKey: `chain:${sequence}`,
      host: window.location.hostname,
      url,
      body
    }, window.location.origin);
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = function (...args) {
      const result = originalFetch.apply(this, args);
      return result.then((response) => {
        try {
          const url = response.url
            || (typeof args[0] === "string" ? args[0] : args[0]?.url)
            || "";
          if (isChainUrl(url)) {
            // Read a clone so the page keeps its own untouched body stream.
            response.clone().text().then((body) => report(url, body)).catch(() => {});
          }
        } catch {
          // Observation must never break the page's own request.
        }
        return response;
      });
    };
  }

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this[MARKER] = url;
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    const url = this[MARKER];
    if (isChainUrl(url)) {
      this.addEventListener("load", () => {
        try {
          if (this.responseType === "" || this.responseType === "text") {
            report(url, this.responseText);
          }
        } catch {
          // Ignore unreadable bodies (blob/arraybuffer response types).
        }
      });
    }
    return originalSend.apply(this, args);
  };
})();
