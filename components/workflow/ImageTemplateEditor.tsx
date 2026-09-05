"use client";

import { useState } from "react";
import Image from "next/image";
import { Trash2, X } from "lucide-react";
import Button from "@/components/ui/Button";
import TemplateThumb from "@/components/workflow/TemplateThumb";
import {
  aspectRatioStyle,
  IMAGE_TEMPLATE_THUMB_OPTIONS,
  type ImageFactoryTemplate,
  type ImageTemplateThumb,
} from "@/lib/imageFactory";

/** 产出样例大图。点开只为看清效果，不承载操作。 */
export function PreviewLightbox({ template, onClose }: { template: ImageFactoryTemplate; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`${template.name}的产出样例`}
      onClick={onClose}
    >
      <div className="max-h-full w-full max-w-md overflow-auto rounded-3xl bg-surface p-4 shadow-pop" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-ink">{template.name}</h2>
            <p className="mt-0.5 text-xs leading-5 text-muted">{template.description || "未填写用途说明"}</p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-xl p-2 text-faint hover:bg-soft hover:text-ink" aria-label="关闭">
            <X size={16} />
          </button>
        </div>
        {/* 放大只为看清效果，画幅与裁切都跟详情页那块保持一致——同一张图点开变个形状最让人犯疑 */}
        <div
          style={aspectRatioStyle(template.aspectRatio)}
          className="relative mt-3 overflow-hidden rounded-2xl border border-line bg-soft"
        >
          {template.preview ? (
            <Image src={template.preview} alt={`${template.name}的产出样例`} fill sizes="420px" className="object-contain" unoptimized />
          ) : (
            <TemplateThumb thumb={template.thumb} />
          )}
        </div>
        {(template.views?.length || 0) > 0 && (
          <div className="mt-4">
            <h3 className="text-xs font-bold text-muted">一次出这几个视角</h3>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {(template.views || []).map((view) => (
                <div key={view.id}>
                  <div
                    style={aspectRatioStyle(view.aspectRatio || template.aspectRatio)}
                    className="relative overflow-hidden rounded-xl border border-line bg-soft"
                  >
                    {view.preview ? (
                      <Image src={view.preview} alt={view.label} fill sizes="96px" className="object-contain" unoptimized />
                    ) : (
                      <span className="flex h-full items-center justify-center text-[10px] text-faint">暂无</span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-[10px] font-bold text-muted" title={view.hint}>{view.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="mt-3 text-[11px] leading-5 text-faint">
          这是该产出类型跑出来的真实样例，换成你自己的素材会得到同样结构的图。
        </p>
      </div>
    </div>
  );
}

const EDITOR_FIELD = "min-w-0 rounded-xl border border-line bg-surface px-2.5 py-2 text-xs text-ink";

function newRowId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 槽位 / 视图 / 场景三段结构一样，抽出来避免三份重复的增删壳子。 */
function EditorSection({
  title,
  hint,
  addLabel,
  onAdd,
  empty,
  children,
}: {
  title: string;
  hint: string;
  addLabel: string;
  onAdd: () => void;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold text-muted">
          {title}
          <span className="ml-2 font-normal text-faint">{hint}</span>
        </h3>
        <button type="button" onClick={onAdd} className="shrink-0 text-xs font-bold text-brand-600">{addLabel}</button>
      </div>
      <div className="mt-2 space-y-2">
        {empty ? <p className="rounded-2xl bg-soft px-3 py-2.5 text-[11px] text-faint">还没有条目，可以不填</p> : children}
      </div>
    </div>
  );
}

function EditorRow({
  cols,
  label,
  onRemove,
  children,
}: {
  cols: string;
  label: string;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-soft p-2">
      <div className={`grid min-w-0 flex-1 gap-2 ${cols}`}>{children}</div>
      <button type="button" onClick={onRemove} className="shrink-0 rounded-xl p-2 text-faint hover:text-danger" aria-label={`删除${label}`}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export default function TemplateEditor({
  template,
  categories,
  onCancel,
  onSave,
}: {
  template: ImageFactoryTemplate;
  categories: string[];
  onCancel: () => void;
  onSave: (template: ImageFactoryTemplate) => void;
}) {
  const [draft, setDraft] = useState(template);
  const views = draft.views || [];
  const presets = draft.scenePresets || [];

  const patch = (next: Partial<ImageFactoryTemplate>) => setDraft((current) => ({ ...current, ...next }));
  const replaceAt = <T,>(list: T[], index: number, next: Partial<T>): T[] =>
    list.map((item, itemIndex) => (itemIndex === index ? { ...item, ...next } : item));

  // 空列表存成 undefined，和内置模板「不填即没有」的形态保持一致
  const submit = () => onSave({
    ...draft,
    views: views.length > 0 ? views : undefined,
    scenePresets: presets.length > 0 ? presets : undefined,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="编辑图片模板">
      <div className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-3xl bg-surface p-5 shadow-pop">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">自建模板</h2>
          <button type="button" onClick={onCancel} className="rounded-xl p-2 text-faint hover:bg-soft hover:text-ink" aria-label="关闭"><X size={17} /></button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-bold text-muted">模板名称 *<input value={draft.name} onChange={(event) => patch({ name: event.target.value })} className="mt-1.5 w-full rounded-xl border border-line px-3 py-2.5 text-sm text-ink" /></label>
          <label className="text-xs font-bold text-muted">
            所属分类
            <input
              value={draft.category}
              onChange={(event) => patch({ category: event.target.value })}
              list="image-factory-categories"
              className="mt-1.5 w-full rounded-xl border border-line px-3 py-2.5 text-sm text-ink"
            />
            <datalist id="image-factory-categories">
              {categories.map((category) => <option key={category} value={category} />)}
            </datalist>
          </label>
          <label className="text-xs font-bold text-muted">输出比例<input value={draft.aspectRatio} onChange={(event) => patch({ aspectRatio: event.target.value })} className="mt-1.5 w-full rounded-xl border border-line px-3 py-2.5 text-sm text-ink" /></label>
          <label className="text-xs font-bold text-muted">
            卡片示意图
            <select
              value={draft.thumb || ""}
              onChange={(event) => patch({ thumb: event.target.value ? (event.target.value as ImageTemplateThumb) : undefined })}
              className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink"
            >
              <option value="">通用图标</option>
              {IMAGE_TEMPLATE_THUMB_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-muted sm:col-span-2">用途说明<input value={draft.description} onChange={(event) => patch({ description: event.target.value })} className="mt-1.5 w-full rounded-xl border border-line px-3 py-2.5 text-sm text-ink" /></label>
          <label className="text-xs font-bold text-muted sm:col-span-2">
            生成规则 *
            <span className="ml-2 font-normal text-faint">写清楚：保持什么 / 默认什么 / 禁止什么</span>
            <textarea value={draft.prompt} onChange={(event) => patch({ prompt: event.target.value })} rows={5} className="mt-1.5 w-full rounded-xl border border-line px-3 py-2.5 text-sm leading-6 text-ink" />
          </label>
        </div>

        <EditorSection
          title="上传槽位"
          hint="勾选即必传"
          addLabel="+ 添加槽位"
          empty={draft.slots.length === 0}
          onAdd={() => patch({ slots: [...draft.slots, { id: newRowId("slot"), label: "参考图", description: "", required: true }] })}
        >
          {draft.slots.map((slot, index) => (
            <EditorRow
              key={slot.id}
              cols="grid-cols-[1fr_1.6fr_auto]"
              label={slot.label}
              onRemove={() => patch({ slots: draft.slots.filter((_, slotIndex) => slotIndex !== index) })}
            >
              <input value={slot.label} onChange={(event) => patch({ slots: replaceAt(draft.slots, index, { label: event.target.value }) })} placeholder="槽位名称" className={EDITOR_FIELD} />
              <input value={slot.description} onChange={(event) => patch({ slots: replaceAt(draft.slots, index, { description: event.target.value }) })} placeholder="图片用途" className={EDITOR_FIELD} />
              <label className="flex shrink-0 items-center gap-1.5 px-1 text-[11px] font-bold text-muted">
                <input type="checkbox" checked={slot.required} onChange={(event) => patch({ slots: replaceAt(draft.slots, index, { required: event.target.checked }) })} className="h-3.5 w-3.5 accent-brand-500" />
                必传
              </label>
            </EditorRow>
          ))}
        </EditorSection>

        <EditorSection
          title="输出视图"
          hint="填了就一次出多张，逐张生成"
          addLabel="+ 添加视图"
          empty={views.length === 0}
          onAdd={() => patch({ views: [...views, { id: newRowId("view"), label: "新视角", hint: "" }] })}
        >
          {views.map((view, index) => (
            <EditorRow
              key={view.id}
              cols="grid-cols-[1fr_1.6fr]"
              label={view.label}
              onRemove={() => patch({ views: views.filter((_, viewIndex) => viewIndex !== index) })}
            >
              <input value={view.label} onChange={(event) => patch({ views: replaceAt(views, index, { label: event.target.value }) })} placeholder="视角名称" className={EDITOR_FIELD} />
              <input value={view.hint} onChange={(event) => patch({ views: replaceAt(views, index, { hint: event.target.value }) })} placeholder="这个视角要拍成什么样" className={EDITOR_FIELD} />
            </EditorRow>
          ))}
        </EditorSection>

        <EditorSection
          title="画面场景"
          hint="点选后写进补充要求，只写场景不写商品"
          addLabel="+ 添加场景"
          empty={presets.length === 0}
          onAdd={() => patch({ scenePresets: [...presets, { id: newRowId("scene"), label: "新场景", prompt: "" }] })}
        >
          {presets.map((preset, index) => (
            <EditorRow
              key={preset.id}
              cols="grid-cols-[1fr_1.6fr]"
              label={preset.label}
              onRemove={() => patch({ scenePresets: presets.filter((_, presetIndex) => presetIndex !== index) })}
            >
              <input value={preset.label} onChange={(event) => patch({ scenePresets: replaceAt(presets, index, { label: event.target.value }) })} placeholder="标签名" className={EDITOR_FIELD} />
              <input value={preset.prompt} onChange={(event) => patch({ scenePresets: replaceAt(presets, index, { prompt: event.target.value }) })} placeholder="30-60 字的画面描述" className={EDITOR_FIELD} />
            </EditorRow>
          ))}
        </EditorSection>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>取消</Button>
          <Button variant="primary" disabled={!draft.name.trim() || !draft.prompt.trim()} onClick={submit}>保存模板</Button>
        </div>
      </div>
    </div>
  );
}
