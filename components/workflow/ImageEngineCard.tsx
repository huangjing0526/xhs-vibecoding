"use client";

import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import Card from "@/components/ui/Card";
import ProviderButton from "@/components/ui/ProviderButton";
import type { CliProviderStatus, ImageCliProvider } from "@/lib/imageFactory";

const CUSTOM_MODEL_VALUE = "__custom__";


/**
 * 生成引擎与模型。
 * 模型列表只放真探到的：Grok 来自 `grok models`，Codex 来自本机配置里那条。
 * 探不全很正常，所以永远留一个手填口子——猜一个不存在的模型名只会让整轮生成白跑。
 */
export default function ImageEngineCard({
  providers,
  provider,
  model,
  isLoading,
  onSelectProvider,
  onSelectModel,
  onRefresh,
}: {
  providers: CliProviderStatus[];
  provider: ImageCliProvider;
  /** 空串表示跟随 CLI 自己的默认模型 */
  model: string;
  isLoading: boolean;
  onSelectProvider: (provider: ImageCliProvider) => void;
  onSelectModel: (model: string) => void;
  onRefresh: () => void;
}) {
  const current = providers.find((item) => item.id === provider);
  const options = current?.models || [];
  const isCustom = Boolean(model) && !options.some((option) => option.id === model);
  const [customOpen, setCustomOpen] = useState(false);
  const showCustomInput = customOpen || isCustom;

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-ink">生成引擎</h2>
          <p className="mt-0.5 text-[11px] text-faint">使用已登录 CLI 的订阅额度</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="rounded-xl p-2 text-faint hover:bg-soft hover:text-ink"
          aria-label="刷新CLI状态"
        >
          <RefreshCw size={15} className={isLoading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="mt-3 grid gap-2">
        {providers.map((item) => (
          <ProviderButton key={item.id} provider={item} selected={provider === item.id} onSelect={onSelectProvider} />
        ))}
        {isLoading && providers.length === 0 && (
          <div className="flex items-center gap-2 rounded-2xl bg-soft p-4 text-xs text-faint">
            <Loader2 size={14} className="animate-spin" />
            正在检查本机 CLI
          </div>
        )}
      </div>

      <div className="mt-3 border-t border-line pt-3">
        <label htmlFor="image-factory-model" className="text-[11px] font-bold text-muted">
          生成模型
        </label>
        <select
          id="image-factory-model"
          value={showCustomInput ? CUSTOM_MODEL_VALUE : model}
          onChange={(event) => {
            if (event.target.value === CUSTOM_MODEL_VALUE) {
              setCustomOpen(true);
              return;
            }
            setCustomOpen(false);
            onSelectModel(event.target.value);
          }}
          className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs font-bold text-ink outline-none transition focus:border-brand-300"
        >
          <option value="">跟随 CLI 默认{current?.defaultModel ? `（${current.defaultModel}）` : ""}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
              {option.id === current?.defaultModel ? " · 默认" : ""}
            </option>
          ))}
          <option value={CUSTOM_MODEL_VALUE}>手填模型名…</option>
        </select>
        {showCustomInput && (
          <input
            value={model}
            onChange={(event) => onSelectModel(event.target.value.trim())}
            placeholder="例如 grok-4.5"
            className="mt-2 w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink outline-none transition focus:border-brand-300"
          />
        )}
        <p className="mt-1.5 text-[10px] leading-4 text-faint">
          换模型只换驱动生成的那个大模型，出图能力仍来自该 CLI 自带的生图工具。
        </p>
      </div>
    </Card>
  );
}
