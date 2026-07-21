"use client";

import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

// 输入类控件的共用底样式：圆角、内陷底色、聚焦时收束到品牌色细环
const BASE =
  "w-full rounded-xl border border-line bg-soft px-3.5 text-ink transition-colors placeholder:text-faint focus:border-brand-300 focus:bg-surface focus:outline-none focus:ring-4 focus:ring-brand-500/10 disabled:text-faint";

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${BASE} h-10 text-sm ${className}`} {...rest} />;
}

export function Textarea({ className = "", ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${BASE} resize-none py-3 text-sm leading-7 ${className}`} {...rest} />;
}

/** 带标签的表单行。label 短、hint 补充规则，两者不重复说同一件事。 */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[11px] leading-4 text-faint">{hint}</span>}
    </label>
  );
}
