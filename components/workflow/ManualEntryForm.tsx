"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import Button from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Field";

export interface ManualField {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
}

interface ManualEntryFormProps {
  /** 折叠按钮文案，例如「手动新增素材」（受控/编辑模式下不渲染触发按钮） */
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
        className="inline-flex items-center gap-1.5 rounded-2xl border border-dashed border-line-strong bg-surface px-4 py-2.5 text-sm font-bold text-muted transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600"
      >
        <Plus size={15} strokeWidth={2.4} />
        {triggerLabel}
      </button>
    );
  }

  const formBody = (
    <section className="rounded-3xl border border-line bg-surface p-5 shadow-raised">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-bold text-ink">{title}</h3>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} icon={<X size={14} strokeWidth={2.4} />}>
          关闭
        </Button>
      </div>

      <div className="mt-4 space-y-3.5">
        {fields.map((field) => (
          <label key={field.name} className="block">
            <span className="mb-1.5 block text-xs font-bold text-muted">
              {field.label}
              {field.required && <span className="ml-0.5 text-danger">*</span>}
            </span>
            {field.multiline ? (
              <Textarea
                value={values[field.name] || ""}
                onChange={(event) => setValues((prev) => ({ ...prev, [field.name]: event.target.value }))}
                rows={4}
                placeholder={field.placeholder}
              />
            ) : (
              <Input
                value={values[field.name] || ""}
                onChange={(event) => setValues((prev) => ({ ...prev, [field.name]: event.target.value }))}
                placeholder={field.placeholder}
              />
            )}
          </label>
        ))}
      </div>

      <div className="mt-5 flex justify-end">
        <Button variant="primary" size="lg" onClick={handleSubmit} disabled={missingRequired}>
          {submitLabel}
        </Button>
      </div>
    </section>
  );

  if (asModal) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-ink/40 p-4 backdrop-blur-sm sm:items-center"
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
