"use client";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import type { TemplateDefinition, TemplateInputField, TemplateInputValues } from "@/lib/templates/types";

function renderField(
  field: TemplateInputField,
  value: TemplateInputValues[string],
  onChange: (next: TemplateInputValues[string]) => void
) {
  switch (field.type) {
    case "text":
      return (
        <Input
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case "textarea":
      return (
        <Textarea
          rows={5}
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case "select":
      return (
        <Select value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)}>
          {(field.options || []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      );
    case "number":
      return (
        <Input
          type="number"
          max={field.max}
          value={typeof value === "number" ? value : 0}
          placeholder={field.placeholder}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      );
    default: {
      // 新增字段类型时在这里编译失败，而不是悄悄退化成文本框
      const unreachable: never = field.type;
      throw new Error(`未实现的模板字段类型：${unreachable}`);
    }
  }
}

/**
 * 模板参数表单：字段全部由 template.inputs 驱动渲染。
 *
 * 这里没有任何模板专属分支——加模板不该改这个文件，否则「模板 = 一份配置」就不成立了。
 * 新增的是字段**类型**时才需要动这里，那是一个 case 的事。
 */
export default function TemplateForm({
  template,
  values,
  onChange,
  onSubmit,
  running,
}: {
  template: TemplateDefinition;
  values: TemplateInputValues;
  onChange: (next: TemplateInputValues) => void;
  onSubmit: () => void;
  running: boolean;
}) {
  return (
    <Card>
      <div className="space-y-4">
        {template.inputs.map((field) => (
          <Field key={field.key} label={field.required ? `${field.label} *` : field.label} hint={field.hint}>
            {renderField(field, values[field.key], (next) => onChange({ ...values, [field.key]: next }))}
          </Field>
        ))}

        <Button variant="ai" block size="lg" loading={running} onClick={onSubmit}>
          {running ? "生成中" : `生成${template.name}`}
        </Button>
      </div>
    </Card>
  );
}
