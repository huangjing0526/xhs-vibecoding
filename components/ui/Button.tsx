"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "ai" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 左侧图标，通常来自 lucide-react */
  icon?: ReactNode;
  /** true 时显示转圈并禁用，文案由调用方自己换 */
  loading?: boolean;
  block?: boolean;
}

const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 rounded-xl px-3 text-xs",
  md: "h-9 gap-2 rounded-xl px-4 text-sm",
  lg: "h-11 gap-2 rounded-2xl px-5 text-sm",
};

// primary=中性主操作（保存/新建）；ai=调模型的生成类操作，唯一使用品牌渐变的地方
const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-ink text-white hover:bg-black disabled:bg-sunken disabled:text-faint",
  ai: "bg-brand-gradient text-white shadow-brand hover:brightness-110 disabled:bg-none disabled:bg-sunken disabled:text-faint disabled:shadow-none",
  secondary:
    "border border-line-strong bg-surface text-ink hover:border-brand-300 hover:bg-brand-50 disabled:border-line disabled:text-faint disabled:hover:bg-surface",
  ghost: "text-muted hover:bg-soft hover:text-ink disabled:text-faint disabled:hover:bg-transparent",
  danger:
    "border border-line-strong bg-surface text-muted hover:border-danger hover:bg-danger/5 hover:text-danger disabled:text-faint",
};

function Spinner() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M8 1.5a6.5 6.5 0 0 1 6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export default function Button({
  variant = "secondary",
  size = "md",
  icon,
  loading = false,
  block = false,
  disabled,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex shrink-0 items-center justify-center font-semibold transition-all duration-150 disabled:cursor-not-allowed ${
        SIZE[size]
      } ${VARIANT[variant]} ${block ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}
