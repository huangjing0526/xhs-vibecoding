"use client";

import { useState, useEffect } from "react";
import {
  UserProfile,
  Persona,
  loadProfile,
  saveProfile,
  createDefaultProfile,
  getPersonaPreset,
} from "@/lib/personalization";

interface PersonaSettingsProps {
  onProfileUpdate?: (profile: UserProfile) => void;
}

export default function PersonaSettings({ onProfileUpdate }: PersonaSettingsProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [catchphrase, setCatchphrase] = useState("");

  useEffect(() => {
    const loaded = loadProfile();
    setProfile(loaded);
  }, []);

  const handlePositioningChange = (positioning: Persona["positioning"]) => {
    if (!profile) return;

    const preset = getPersonaPreset(positioning);
    const updatedProfile: UserProfile = {
      ...profile,
      persona: {
        ...profile.persona,
        ...preset,
        positioning,
      },
    };

    setProfile(updatedProfile);
    saveProfile(updatedProfile);
    onProfileUpdate?.(updatedProfile);
  };

  const handleStyleChange = (style: Persona["style"]) => {
    if (!profile) return;

    const updatedProfile: UserProfile = {
      ...profile,
      persona: {
        ...profile.persona,
        style,
      },
    };

    setProfile(updatedProfile);
    saveProfile(updatedProfile);
    onProfileUpdate?.(updatedProfile);
  };

  const addCatchphrase = () => {
    if (!profile || !catchphrase.trim()) return;

    const updatedProfile: UserProfile = {
      ...profile,
      persona: {
        ...profile.persona,
        catchphrases: [...profile.persona.catchphrases, catchphrase.trim()].slice(
          -10
        ),
      },
    };

    setProfile(updatedProfile);
    saveProfile(updatedProfile);
    onProfileUpdate?.(updatedProfile);
    setCatchphrase("");
  };

  const removeCatchphrase = (phrase: string) => {
    if (!profile) return;

    const updatedProfile: UserProfile = {
      ...profile,
      persona: {
        ...profile.persona,
        catchphrases: profile.persona.catchphrases.filter((p) => p !== phrase),
      },
    };

    setProfile(updatedProfile);
    saveProfile(updatedProfile);
    onProfileUpdate?.(updatedProfile);
  };

  const handleSignatureChange = (signature: string) => {
    if (!profile) return;

    const updatedProfile: UserProfile = {
      ...profile,
      persona: {
        ...profile.persona,
        signature,
      },
    };

    setProfile(updatedProfile);
    saveProfile(updatedProfile);
    onProfileUpdate?.(updatedProfile);
  };

  const handleReset = () => {
    const newProfile = createDefaultProfile();
    setProfile(newProfile);
    saveProfile(newProfile);
    onProfileUpdate?.(newProfile);
  };

  if (!profile) return null;

  const positioningOptions: { value: Persona["positioning"]; label: string; desc: string }[] = [
    { value: "tech-newbie", label: "技术小白", desc: "刚入门，分享学习过程" },
    { value: "senior-dev", label: "资深开发", desc: "有经验，分享干货技巧" },
    { value: "slasher", label: "斜杠青年", desc: "搞副业，分享效率工具" },
    { value: "student", label: "学生党", desc: "在校生，分享学习笔记" },
  ];

  const styleOptions: { value: Persona["style"]; label: string }[] = [
    { value: "cute", label: "可爱活泼" },
    { value: "professional", label: "专业干练" },
    { value: "humorous", label: "幽默搞笑" },
    { value: "casual", label: "随性日常" },
  ];

  return (
    <div className="border rounded-xl overflow-hidden">
      {/* 折叠头部 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className="w-5 h-5 text-gray-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
          <span className="font-medium">IP人设配置</span>
          <span className="text-sm text-gray-500">
            {positioningOptions.find((o) => o.value === profile.persona.positioning)?.label}
          </span>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${
            isExpanded ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* 展开内容 */}
      {isExpanded && (
        <div className="p-4 space-y-5">
          {/* 人设定位 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              人设定位
            </label>
            <div className="grid grid-cols-2 gap-2">
              {positioningOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handlePositioningChange(option.value)}
                  className={`p-3 text-left rounded-lg border transition-all ${
                    profile.persona.positioning === option.value
                      ? "border-xhs-red bg-red-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <p className="font-medium text-sm">{option.label}</p>
                  <p className="text-xs text-gray-500">{option.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* 语言风格 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              语言风格
            </label>
            <div className="flex flex-wrap gap-2">
              {styleOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleStyleChange(option.value)}
                  className={`px-4 py-2 rounded-full text-sm transition-all ${
                    profile.persona.style === option.value
                      ? "bg-xhs-red text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* 口头禅 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              常用口头禅
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {profile.persona.catchphrases.map((phrase) => (
                <span
                  key={phrase}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 rounded-full text-sm group"
                >
                  {phrase}
                  <button
                    onClick={() => removeCatchphrase(phrase)}
                    className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={catchphrase}
                onChange={(e) => setCatchphrase(e.target.value)}
                placeholder="添加新口头禅..."
                className="flex-1 px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-xhs-red"
                onKeyDown={(e) => e.key === "Enter" && addCatchphrase()}
              />
              <button
                onClick={addCatchphrase}
                disabled={!catchphrase.trim()}
                className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
              >
                添加
              </button>
            </div>
          </div>

          {/* 签名 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              签名结尾（可选）
            </label>
            <input
              type="text"
              value={profile.persona.signature}
              onChange={(e) => handleSignatureChange(e.target.value)}
              placeholder="例如：每天进步一点点～"
              className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-xhs-red"
            />
          </div>

          {/* 偏好emoji */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              常用emoji
            </label>
            <div className="flex flex-wrap gap-2">
              {profile.persona.preferredEmojis.map((emoji, i) => (
                <span key={i} className="text-2xl">
                  {emoji}
                </span>
              ))}
            </div>
          </div>

          {/* 重置按钮 */}
          <button
            onClick={handleReset}
            className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            重置为默认设置
          </button>
        </div>
      )}
    </div>
  );
}
