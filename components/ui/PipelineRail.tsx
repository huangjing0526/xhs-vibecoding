"use client";

import { Check } from "lucide-react";

export interface PipelineStep {
  id: string;
  label: string;
  done: boolean;
  onSelect?: () => void;
}

/**
 * 内容管线进度轨：把「选题 → 草稿 → 封面 → 质检 → 发布」这条真实存在的顺序流程画出来。
 * 已完成段用品牌渐变填充，当前节点带光环——一眼看出这篇走到哪、下一步点哪。
 * 顺序在这里是有意义的信息（管线本身有先后），不是装饰性编号。
 */
export default function PipelineRail({ steps, className = "" }: { steps: PipelineStep[]; className?: string }) {
  // 当前节点 = 第一个未完成的；全完成时最后一个即当前
  const currentIndex = steps.findIndex((step) => !step.done);
  const activeIndex = currentIndex === -1 ? steps.length - 1 : currentIndex;

  return (
    <ol className={`flex min-w-0 items-center ${className}`}>
      {steps.map((step, index) => {
        const isCurrent = index === activeIndex;
        const Tag = step.onSelect ? "button" : "div";
        return (
          <li key={step.id} className="flex min-w-0 items-center">
            <Tag
              {...(step.onSelect ? { type: "button" as const, onClick: step.onSelect } : {})}
              aria-current={isCurrent ? "step" : undefined}
              className={`flex shrink-0 items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 transition-colors ${
                step.onSelect ? "hover:bg-soft" : ""
              } ${isCurrent ? "bg-brand-50" : ""}`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                  step.done
                    ? "bg-brand-gradient text-white"
                    : isCurrent
                      ? "bg-surface text-brand-600 ring-2 ring-brand-400 ring-offset-1 ring-offset-brand-50"
                      : "bg-sunken text-faint"
                }`}
              >
                {step.done ? <Check size={12} strokeWidth={3} /> : index + 1}
              </span>
              <span
                className={`truncate text-xs font-bold ${
                  isCurrent ? "text-brand-600" : step.done ? "text-ink" : "text-faint"
                }`}
              >
                {step.label}
              </span>
            </Tag>
            {index < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={`mx-1 h-[3px] w-4 shrink-0 rounded-full lg:w-7 ${
                  step.done ? "bg-brand-gradient" : "bg-sunken"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
