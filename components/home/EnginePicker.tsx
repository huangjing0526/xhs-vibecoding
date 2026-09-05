"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_ENGINE,
  loadProviders,
  peekCachedProviders,
  pickUsableProvider,
  readEnginePreference,
  writeEnginePreference,
} from "@/lib/enginePreference";
import type { CliProviderStatus, ImageCliProvider } from "@/lib/imageFactory";

/** 下拉的统一皮肤：贴着输入框工具栏的字号，去掉浏览器原生外观。 */
const SELECT_CLASS =
  "cursor-pointer appearance-none rounded-full border border-line bg-surface py-1 pl-2.5 pr-6 text-[11px] font-semibold text-muted " +
  "transition-colors hover:border-brand-300 hover:text-ink focus:border-brand-300 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50";

/** 自绘的下拉箭头——原生那个在各平台长得不一样，跟这行的其余元素对不齐。 */
function Caret() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[8px] text-faint"
    >
      ▼
    </span>
  );
}

/**
 * 首页的引擎与模型选择。
 *
 * 它是自治的：自己读偏好、自己拉状态，不经过意图输入那条数据流——
 * 「这次用哪个引擎」和「这句话要做什么」是两件事，混在一起传参只会让两边都变复杂。
 *
 * 偏好存的是图片工厂那把 key，所以在这里选完，进图片工厂就是选好的，不用再选一次。
 */
export default function EnginePicker() {
  const [providers, setProviders] = useState<CliProviderStatus[]>(() => peekCachedProviders() || []);
  const [provider, setProvider] = useState<ImageCliProvider>(DEFAULT_ENGINE);
  const [model, setModel] = useState("");
  const [loading, setLoading] = useState(false);

  // 偏好只能在挂载后读：localStorage 在服务端不存在，直接读会让首屏 hydration 对不上
  useEffect(() => {
    const saved = readEnginePreference();
    setProvider(saved.provider);
    setModel(saved.model);
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadProviders()
      .then((list) => {
        if (!alive) return;
        setProviders(list);
        // 存着的引擎这会儿可能没登录/没装，换一个能用的，别让人点了半天才发现跑不了
        setProvider((current) => {
          const usable = pickUsableProvider(list, current);
          if (usable !== current) writeEnginePreference({ provider: usable, model: "" });
          return usable;
        });
      })
      .catch((error) => {
        console.error("[EnginePicker] 引擎状态检查失败", { action: "home.engines", error });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const current = providers.find((item) => item.id === provider);
  const models = current?.models || [];

  const selectProvider = (next: ImageCliProvider) => {
    setProvider(next);
    // 模型名跟着引擎走，换引擎必须清掉，否则会把 grok 的模型名塞给 codex
    setModel("");
    writeEnginePreference({ provider: next, model: "" });
  };

  const selectModel = (next: string) => {
    setModel(next);
    writeEnginePreference({ provider, model: next });
  };

  return (
    <div className="flex items-center gap-1.5">
      <span className="relative inline-flex">
        <select
          aria-label="生成引擎"
          value={provider}
          disabled={loading && !providers.length}
          onChange={(event) => selectProvider(event.target.value as ImageCliProvider)}
          className={SELECT_CLASS}
          title={current?.message}
        >
          {providers.length ? (
            providers.map((item) => (
              <option key={item.id} value={item.id} disabled={!item.available || !item.authenticated}>
                {/* 不可用的留在列表里并标出原因，比直接藏掉更容易让人知道该去装什么 */}
                {item.name}
                {item.available && item.authenticated ? "" : "（不可用）"}
              </option>
            ))
          ) : (
            <option value={provider}>{loading ? "检查中…" : "引擎"}</option>
          )}
        </select>
        <Caret />
      </span>

      <span className="relative inline-flex">
        <select
          aria-label="驱动模型"
          value={model}
          onChange={(event) => selectModel(event.target.value)}
          className={SELECT_CLASS}
          title={model || "跟随引擎自己的默认模型"}
        >
          <option value="">默认模型</option>
          {models.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <Caret />
      </span>
    </div>
  );
}
