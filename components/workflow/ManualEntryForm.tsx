"use client";

import { useEffect, useState } from "react";

export interface ManualField {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
}

interface ManualEntryFormProps {
  /** 折叠按钮文案，例如「+ 手动新增素材」（受控/编辑模式下不渲染触发按钮） */
  triggerLabel?: string;
  /** 表单标题 */
  title: string;
  fields: ManualField[];
  submitLabel: string;
  onSubmit: (values: Record<string, string>) => void;
  /** 受控开合：传入即进入受控模式（编辑场景由父组件控制）。 */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 初始值（编辑时回填）。 */
  initialValues?: Record<string, string>;
  /** 以浮层弹窗呈现（编辑场景默认浮层，避免挤在列表里）。 */
  asModal?: boolean;
}

/**
 * 通用手动表单：素材/选题/草稿等步骤共用，新增与编辑复用同一套字段。
 * - 非受控：渲染折叠触发按钮，点开内联表单（新增）。
 * - 受控（传 open/onOpenChange）：父组件控制开合，可回填 initialValues（编辑）。
 */
export default function ManualEntryForm({
  triggerLabel,
  title,
  fields,
  submitLabel,
  onSubmit,
  open,
  onOpenChange,
  initialValues,
  asModal,
}: ManualEntryFormProps) {
  const isControlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(initialValues ?? {});

  const effectiveOpen = isControlled ? Boolean(open) : internalOpen;

  // 受控模式下每次打开/换条目时回填初始值
  useEffect(() => {
    if (isControlled && open) setValues(initialValues ?? {});
  }, [isControlled, open, initialValues]);

  const setOpen = (next: boolean) => {
    if (isControlled) onOpenChange?.(next);
    else setInternalOpen(next);
  };

  const missingRequired = fields.some((field) => field.required && !values[field.name]?.trim());

  const handleSubmit = () => {
    if (missingRequired) return;
    onSubmit(values);
    if (!isControlled) setValues({});
    setOpen(false);
  };

  if (!effectiveOpen) {
    if (isControlled || !triggerLabel) return null;
    return (
      <button
        type="button"
        onClick={() => {
          setValues({});
          setOpen(true);
        }}
        className="rounded-lg border border-dashed border-[#C7C7CC] bg-white px-4 py-2.5 text-sm font-semibold text-[#6E6E73] transition-colors hover:border-[#FF2442] hover:text-[#FF2442]"
      >
        {triggerLabel}
      </button>
    );
  }

  const formBody = (
    <section className="rounded-lg border border-[#E5E5EA] bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#1D1D1F]">{title}</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs font-semibold text-[#A1A1A6] hover:text-[#1D1D1F]"
        >
          收起
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {fields.map((field) => (
          <label key={field.name} className="block">
            <span className="text-xs font-semibold text-[#6E6E73]">
              {field.label}
              {field.required && <span className="ml-0.5 text-[#FF2442]">*</span>}
            </span>
            {field.multiline ? (
              <textarea
                value={values[field.name] || ""}
                onChange={(event) => setValues((prev) => ({ ...prev, [field.name]: event.target.value }))}
                rows={4}
                placeholder={field.placeholder}
                className="mt-1 w-full resize-y rounded-md border border-[#D2D2D7] bg-white px-3 py-2 text-sm leading-6 text-[#1D1D1F] outline-none focus:border-[#1D1D1F]"
              />
            ) : (
              <input
                value={values[field.name] || ""}
                onChange={(event) => setValues((prev) => ({ ...prev, [field.name]: event.target.value }))}
                placeholder={field.placeholder}
                className="mt-1 w-full rounded-md border border-[#D2D2D7] bg-white px-3 py-2 text-sm text-[#1D1D1F] outline-none focus:border-[#1D1D1F]"
              />
            )}
          </label>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={missingRequired}
          className="rounded-lg bg-[#1D1D1F] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#000] disabled:cursor-not-allowed disabled:bg-[#E5E5EA] disabled:text-[#A1A1A6]"
        >
          {submitLabel}
        </button>
      </div>
    </section>
  );

  if (asModal) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4 sm:items-center"
        onClick={() => setOpen(false)}
      >
        <div className="w-full max-w-lg" onClick={(event) => event.stopPropagation()}>
          {formBody}
        </div>
      </div>
    );
  }

  return formBody;
}
