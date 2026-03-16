"use client";

import { useState } from "react";
import { saveProfile, loadProfile } from "@/lib/personalization";

interface OnboardingWizardProps {
  onComplete: () => void;
  onOpenApiSettings: () => void;
  onLoadExample: () => void;
}

const SAMPLE_MARKDOWN = `---
title: 用 AI 帮我写了个自动化脚本
mood: achievement
tags: [AI, 效率, 自动化]
---

# 用 AI 帮我写了个自动化脚本

今天试着用 AI 写了个 Python 脚本，把每天手动整理的 Excel 数据全部自动化了。

## 背景

公司每天要处理大量数据，手动操作至少要 3 小时，实在太烦了。

## 过程

1. 把需求告诉 AI
2. AI 直接生成了完整代码
3. 踩坑：路径问题报错
4. 让 AI 帮我 debug，几分钟搞定

## 结果

现在一键运行，3 秒完成！省了 3 小时！

真的太爽了，感觉打开了新世界的大门 🚀
`;

export default function OnboardingWizard({
  onComplete,
  onOpenApiSettings,
  onLoadExample,
}: OnboardingWizardProps) {
  const [step, setStep] = useState(1);
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null);

  const personas = [
    {
      key: "tech-newbie",
      icon: "🎮",
      label: "技术小白",
      desc: "刚开始学编程或用AI工具，想分享探索过程",
    },
    {
      key: "senior-dev",
      icon: "💻",
      label: "资深开发",
      desc: "有技术深度，想分享干货经验和项目心得",
    },
    {
      key: "slasher",
      icon: "⚡",
      label: "斜杠青年",
      desc: "多元身份，技术 + 生活 + 兴趣都想分享",
    },
    {
      key: "student",
      icon: "📚",
      label: "学生",
      desc: "在校学习中，记录学习笔记和成长点滴",
    },
  ];

  const handleSelectPersona = (key: string) => {
    setSelectedPersona(key);
    const profile = loadProfile();
    saveProfile({
      ...profile,
      persona: {
        ...profile.persona,
        positioning: key as any,
      },
    });
  };

  const handleLoadExample = () => {
    onLoadExample();
    localStorage.setItem("vibenote_onboarded", "1");
    onComplete();
  };

  const handleSkipToEnd = () => {
    localStorage.setItem("vibenote_onboarded", "1");
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
        {/* 步骤指示器 */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all ${
                  s <= step ? "bg-xhs-red w-8" : "bg-gray-200 w-4"
                }`}
              />
            ))}
          </div>
          <button
            onClick={handleSkipToEnd}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            跳过
          </button>
        </div>

        {/* Step 1: 选择身份 */}
        {step === 1 && (
          <div className="px-6 pb-6 space-y-5">
            <div>
              <h2 className="text-xl font-bold text-gray-900">你是哪种创作者？</h2>
              <p className="text-sm text-gray-500 mt-1">选择你的身份，AI 会根据你的风格生成内容</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {personas.map((p) => (
                <button
                  key={p.key}
                  onClick={() => handleSelectPersona(p.key)}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    selectedPersona === p.key
                      ? "border-xhs-red bg-red-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="text-2xl mb-2">{p.icon}</div>
                  <div className="font-medium text-sm text-gray-900">{p.label}</div>
                  <div className="text-xs text-gray-500 mt-1 leading-relaxed">{p.desc}</div>
                </button>
              ))}
            </div>
            <button
              onClick={() => setStep(2)}
              disabled={!selectedPersona}
              className="w-full py-3 bg-gradient-to-r from-xhs-red to-xhs-pink text-white rounded-xl font-medium disabled:opacity-50 transition-all hover:shadow-md"
            >
              下一步
            </button>
          </div>
        )}

        {/* Step 2: 配置 API */}
        {step === 2 && (
          <div className="px-6 pb-6 space-y-5">
            <div>
              <h2 className="text-xl font-bold text-gray-900">配置 AI 引擎</h2>
              <p className="text-sm text-gray-500 mt-1">需要一个 API Key 才能生成内容</p>
            </div>

            <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
              <div className="flex items-start gap-3">
                <span className="text-2xl">🚀</span>
                <div>
                  <p className="font-medium text-blue-900 text-sm">推荐：硅基流动</p>
                  <p className="text-xs text-blue-700 mt-1">注册即送免费额度，国内访问稳定，生成效果好</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => {
                  onOpenApiSettings();
                  // 不关闭向导，让用户配置后回来
                }}
                className="w-full py-3 bg-gradient-to-r from-xhs-red to-xhs-pink text-white rounded-xl font-medium hover:shadow-md transition-all"
              >
                立即配置 API Key →
              </button>
              <button
                onClick={() => setStep(3)}
                className="w-full py-2.5 text-gray-500 hover:text-gray-700 text-sm transition-colors"
              >
                先跳过，使用演示模式
              </button>
            </div>

            <div className="flex justify-between">
              <button onClick={() => setStep(1)} className="text-sm text-gray-400 hover:text-gray-600">
                上一步
              </button>
              <button onClick={() => setStep(3)} className="text-sm text-gray-400 hover:text-gray-600">
                下一步
              </button>
            </div>
          </div>
        )}

        {/* Step 3: 开始创作 */}
        {step === 3 && (
          <div className="px-6 pb-6 space-y-5">
            <div>
              <h2 className="text-xl font-bold text-gray-900">开始你的第一篇笔记！</h2>
              <p className="text-sm text-gray-500 mt-1">用示例内容体验完整流程</p>
            </div>

            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">📝</span>
                <span className="text-sm font-medium text-gray-700">示例：AI 自动化脚本分享</span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed pl-7">
                一个关于用 AI 写脚本、省了 3 小时工作时间的真实记录 —— 已写好 Markdown，一键生成爆款文案
              </p>
            </div>

            <div className="space-y-2.5">
              <button
                onClick={handleLoadExample}
                className="w-full py-3 bg-gradient-to-r from-xhs-red to-xhs-pink text-white rounded-xl font-medium hover:shadow-md transition-all flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                使用示例内容，立即体验
              </button>
              <button
                onClick={handleSkipToEnd}
                className="w-full py-2.5 text-gray-500 hover:text-gray-700 text-sm transition-colors"
              >
                我自己输入内容
              </button>
            </div>

            <button onClick={() => setStep(2)} className="text-sm text-gray-400 hover:text-gray-600">
              上一步
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// 供外部判断是否需要展示向导
export function shouldShowOnboarding(): boolean {
  if (typeof window === "undefined") return false;
  return !localStorage.getItem("vibenote_onboarded");
}

export { SAMPLE_MARKDOWN };
