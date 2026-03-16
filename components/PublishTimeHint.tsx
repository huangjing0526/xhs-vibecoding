"use client";

import { useState, useEffect } from "react";
import { getPublishTimeHint } from "@/lib/ai";

export default function PublishTimeHint() {
  const [hint, setHint] = useState<{ best: string[]; reason: string } | null>(null);
  const [currentTime, setCurrentTime] = useState("");

  useEffect(() => {
    setHint(getPublishTimeHint());

    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    };

    updateTime();
    const timer = setInterval(updateTime, 60000);
    return () => clearInterval(timer);
  }, []);

  if (!hint) return null;

  return (
    <div className="p-4 bg-gradient-to-r from-orange-50 to-yellow-50 border border-orange-200 rounded-xl">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-orange-100 rounded-lg">
          <svg
            className="w-5 h-5 text-orange-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium text-orange-800">黄金发布时间</h4>
            <span className="text-sm text-gray-500">现在 {currentTime}</span>
          </div>

          <div className="flex flex-wrap gap-2 mb-2">
            {hint.best.map((time, index) => (
              <span
                key={index}
                className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm font-medium"
              >
                {time}
              </span>
            ))}
          </div>

          <p className="text-sm text-gray-600">{hint.reason}</p>
        </div>
      </div>
    </div>
  );
}
