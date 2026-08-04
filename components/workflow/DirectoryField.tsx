"use client";

import { useState } from "react";
import { FolderOpen } from "lucide-react";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { pickDirectory } from "@/lib/workflowClient";
import type { Notice } from "./types";

interface DirectoryFieldProps {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onNotice?: (notice: Notice) => void;
}

/** 目录输入行：可手动粘贴，也可点「选择目录」弹 macOS 原生文件夹选择器回填绝对路径。 */
export default function DirectoryField({ label, hint, value, onChange, placeholder, onNotice }: DirectoryFieldProps) {
  const [isPicking, setIsPicking] = useState(false);

  const handlePick = async () => {
    setIsPicking(true);
    try {
      const { path } = await pickDirectory(value);
      if (path) onChange(path);
    } catch (error) {
      console.error("[DirectoryField] 选择目录失败", { action: "system.pickDirectory", error });
      onNotice?.({ type: "error", message: error instanceof Error ? error.message : "打开目录选择器失败" });
    } finally {
      setIsPicking(false);
    }
  };

  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="flex-1"
        />
        <Button
          type="button"
          variant="secondary"
          icon={<FolderOpen size={15} />}
          onClick={handlePick}
          loading={isPicking}
        >
          {isPicking ? "选择中" : "选择目录"}
        </Button>
      </div>
    </Field>
  );
}
