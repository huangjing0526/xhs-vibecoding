"use client";

import { useState, useEffect } from "react";

interface ApiConfig {
  provider: "openai" | "anthropic" | "siliconflow" | "custom";
  openaiKey?: string;
  openaiModel?: string;
  anthropicKey?: string;
  anthropicModel?: string;
  siliconflowKey?: string;
  siliconflowModel?: string;
  customKey?: string;
  customBase?: string;
  customModel?: string;
}

interface ApiSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved?: () => void;
}

export default function ApiSettings({ isOpen, onClose, onConfigSaved }: ApiSettingsProps) {
  const [config, setConfig] = useState<ApiConfig>({
    provider: "siliconflow",
    openaiModel: "gpt-4o-mini",
    anthropicModel: "claude-sonnet-4-20250514",
    siliconflowModel: "Qwen/Qwen2.5-7B-Instruct",
  });

  const [showKeys, setShowKeys] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");
  const [saveToast, setSaveToast] = useState("");

  useEffect(() => {
    // 从 localStorage 加载配置
    const saved = localStorage.getItem("vibenote_api_config");
    if (saved) {
      try {
        setConfig(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load config:", e);
      }
    }
  }, []);

  const handleSave = () => {
    // 验证配置
    const providerKey = config.provider === "openai" ? "openaiKey" :
                        config.provider === "anthropic" ? "anthropicKey" :
                        config.provider === "siliconflow" ? "siliconflowKey" :
                        "customKey";

    if (!config[providerKey]) {
      alert("请输入 API Key");
      return;
    }

    console.log("[ApiSettings] Saving config:", config);

    // 保存到 localStorage
    localStorage.setItem("vibenote_api_config", JSON.stringify(config));

    // 保存到环境变量（通过 API）
    saveToEnv();

    // Toast 提示
    setSaveToast("配置已保存！");
    setTimeout(() => {
      setSaveToast("");
      onClose();
    }, 1200);

    // 通知父组件
    onConfigSaved?.();
  };

  const handleClear = () => {
    if (confirm("确定要清除所有配置吗？")) {
      localStorage.removeItem("vibenote_api_config");
      setConfig({
        provider: "siliconflow",
        openaiModel: "gpt-4o-mini",
        anthropicModel: "claude-sonnet-4-20250514",
        siliconflowModel: "Qwen/Qwen2.5-7B-Instruct",
      });
      setSaveToast("配置已清除");
      setTimeout(() => setSaveToast(""), 1500);
    }
  };

  const saveToEnv = async () => {
    // 发送到服务端保存（可选实现）
    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
    } catch (e) {
      console.error("Failed to save to server:", e);
    }
  };

  const handleTest = async () => {
    setTestStatus("testing");
    setTestMessage("正在测试连接...");

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "请简单回复：测试成功",
          config,
          test: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error((errorData as any).error || "连接失败");
      }

      // 读取 SSE 流，检查是否收到 done 或 error 事件
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let success = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(part.slice(6));
            if (event.type === "done") { success = true; break; }
            if (event.type === "error") throw new Error(event.message);
          } catch (e: any) {
            if (e.message && e.message !== "done") throw e;
          }
        }
        if (success) break;
      }

      if (!success) throw new Error("未收到有效响应");

      setTestStatus("success");
      setTestMessage("✅ 连接成功！配置有效");
    } catch (error: any) {
      setTestStatus("error");
      setTestMessage(`❌ ${error.message || "连接失败，请检查配置"}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      {/* Toast 通知 */}
      {saveToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[60] px-5 py-2.5 bg-gray-900 text-white rounded-full text-sm shadow-lg animate-fade-in">
          {saveToast}
        </div>
      )}
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto m-4">
        {/* 头部 */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 rounded-t-2xl">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-xl font-bold text-gray-900">AI API 配置</h2>
              <p className="text-sm text-gray-500 mt-1">配置你的 AI 服务提供商</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* 当前配置状态 */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500">当前选择:</span>
            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full font-medium">
              {config.provider === "siliconflow" ? "硅基流动" :
               config.provider === "openai" ? "OpenAI" :
               config.provider === "anthropic" ? "Anthropic" :
               "自定义"}
            </span>
          </div>
        </div>

        {/* 内容 */}
        <div className="p-6 space-y-6">
          {/* Provider 选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              选择 AI 服务商
            </label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: "siliconflow", label: "硅基流动", icon: "🚀", desc: "国内推荐" },
                { value: "openai", label: "OpenAI", icon: "🤖", desc: "GPT" },
                { value: "anthropic", label: "Anthropic", icon: "🧠", desc: "Claude" },
                { value: "custom", label: "自定义", icon: "⚙️", desc: "其他 API" },
              ].map((provider) => (
                <button
                  key={provider.value}
                  onClick={() => setConfig({ ...config, provider: provider.value as any })}
                  className={`p-4 border-2 rounded-xl transition-all ${
                    config.provider === provider.value
                      ? "border-xhs-red bg-red-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="text-3xl mb-2">{provider.icon}</div>
                  <div className="font-medium text-sm">{provider.label}</div>
                  <div className="text-xs text-gray-500 mt-1">{provider.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 硅基流动配置 */}
          {config.provider === "siliconflow" && (
            <div className="space-y-4 p-4 bg-gray-50 rounded-xl">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  硅基流动 API Key
                  <a
                    href="https://cloud.siliconflow.cn/account/ak"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 text-xs text-blue-600 hover:underline"
                  >
                    获取 API Key →
                  </a>
                </label>
                <input
                  type={showKeys ? "text" : "password"}
                  value={config.siliconflowKey || ""}
                  onChange={(e) => setConfig({ ...config, siliconflowKey: e.target.value })}
                  placeholder="sk-..."
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-xhs-red focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  模型名称
                </label>
                <select
                  value={config.siliconflowModel || "Qwen/Qwen2.5-7B-Instruct"}
                  onChange={(e) => setConfig({ ...config, siliconflowModel: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-xhs-red"
                >
                  <option value="Qwen/Qwen2.5-7B-Instruct">Qwen2.5-7B (推荐)</option>
                  <option value="Qwen/Qwen2.5-14B-Instruct">Qwen2.5-14B</option>
                  <option value="Qwen/Qwen2.5-32B-Instruct">Qwen2.5-32B</option>
                  <option value="deepseek-ai/DeepSeek-V3">DeepSeek-V3</option>
                  <option value="deepseek-ai/DeepSeek-V2.5">DeepSeek-V2.5</option>
                </select>
              </div>
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                <p>💡 硅基流动是国内访问最稳定的 AI API 服务</p>
              </div>
            </div>
          )}

          {/* OpenAI 配置 */}
          {config.provider === "openai" && (
            <div className="space-y-4 p-4 bg-gray-50 rounded-xl">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  OpenAI API Key
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 text-xs text-blue-600 hover:underline"
                  >
                    获取 API Key →
                  </a>
                </label>
                <input
                  type={showKeys ? "text" : "password"}
                  value={config.openaiKey || ""}
                  onChange={(e) => setConfig({ ...config, openaiKey: e.target.value })}
                  placeholder="sk-..."
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-xhs-red focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  模型名称
                </label>
                <select
                  value={config.openaiModel || "gpt-4o-mini"}
                  onChange={(e) => setConfig({ ...config, openaiModel: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-xhs-red"
                >
                  <option value="gpt-4o-mini">gpt-4o-mini (推荐)</option>
                  <option value="gpt-4o">gpt-4o</option>
                  <option value="gpt-4-turbo">gpt-4-turbo</option>
                  <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
                </select>
              </div>
            </div>
          )}

          {/* Anthropic 配置 */}
          {config.provider === "anthropic" && (
            <div className="space-y-4 p-4 bg-gray-50 rounded-xl">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Anthropic API Key
                  <a
                    href="https://console.anthropic.com/settings/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 text-xs text-blue-600 hover:underline"
                  >
                    获取 API Key →
                  </a>
                </label>
                <input
                  type={showKeys ? "text" : "password"}
                  value={config.anthropicKey || ""}
                  onChange={(e) => setConfig({ ...config, anthropicKey: e.target.value })}
                  placeholder="sk-ant-..."
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-xhs-red focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  模型名称
                </label>
                <select
                  value={config.anthropicModel || "claude-sonnet-4-20250514"}
                  onChange={(e) => setConfig({ ...config, anthropicModel: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-xhs-red"
                >
                  <option value="claude-sonnet-4-20250514">Claude Sonnet 4 (推荐)</option>
                  <option value="claude-opus-4-20250514">Claude Opus 4</option>
                  <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                </select>
              </div>
            </div>
          )}

          {/* Custom 配置 */}
          {config.provider === "custom" && (
            <div className="space-y-4 p-4 bg-gray-50 rounded-xl">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  API Key
                </label>
                <input
                  type={showKeys ? "text" : "password"}
                  value={config.customKey || ""}
                  onChange={(e) => setConfig({ ...config, customKey: e.target.value })}
                  placeholder="your-api-key"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-xhs-red focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  API Base URL
                </label>
                <input
                  type="text"
                  value={config.customBase || ""}
                  onChange={(e) => setConfig({ ...config, customBase: e.target.value })}
                  placeholder="https://api.example.com/v1"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-xhs-red focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  模型名称
                </label>
                <input
                  type="text"
                  value={config.customModel || ""}
                  onChange={(e) => setConfig({ ...config, customModel: e.target.value })}
                  placeholder="gpt-3.5-turbo"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-xhs-red focus:border-transparent"
                />
              </div>
            </div>
          )}

          {/* 显示/隐藏 Key */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="showKeys"
              checked={showKeys}
              onChange={(e) => setShowKeys(e.target.checked)}
              className="rounded accent-xhs-red"
            />
            <label htmlFor="showKeys" className="text-sm text-gray-600">
              显示 API Key
            </label>
          </div>

          {/* 测试连接 */}
          <div>
            <button
              onClick={handleTest}
              disabled={testStatus === "testing"}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg hover:border-gray-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {testStatus === "testing" ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>正在测试...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>测试连接</span>
                </>
              )}
            </button>

            {/* 测试结果 */}
            {testMessage && (
              <div className={`mt-3 p-3 rounded-lg text-sm ${
                testStatus === "success" ? "bg-green-50 text-green-800 border border-green-200" :
                testStatus === "error" ? "bg-red-50 text-red-800 border border-red-200" :
                "bg-gray-50 text-gray-800"
              }`}>
                {testMessage}
              </div>
            )}
          </div>

          {/* 说明 */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">配置说明</p>
                <ul className="space-y-1 text-blue-700">
                  <li>• API Key 保存在浏览器本地，不会上传到服务器</li>
                  <li>• 如需服务端配置，请编辑项目根目录的 .env 文件</li>
                  <li>• 推荐使用 OpenAI gpt-4o-mini，性价比高</li>
                  <li>• 自定义 API 的 Base URL 必须以 https:// 开头</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="sticky bottom-0 bg-gray-50 border-t px-6 py-4 flex gap-3 rounded-b-2xl">
          <button
            onClick={handleClear}
            className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="清除所有配置"
          >
            清除配置
          </button>
          <div className="flex-1"></div>
          <button
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-gradient-to-r from-xhs-red to-xhs-pink text-white rounded-lg hover:shadow-lg transition-all"
          >
            保存配置
          </button>
        </div>
      </div>
    </div>
  );
}
