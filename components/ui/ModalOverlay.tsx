"use client";

import type { ReactNode } from "react";

/** 弹窗遮罩：全屏半透明背景 + 居中容器；点背景关闭，点内容不冒泡。 */
export default function ModalOverlay({
  onClose,
  children,
  maxWidthClass = "max-w-lg",
}: {
  onClose: () => void;
  children: ReactNode;
  maxWidthClass?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-ink/40 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div className={`w-full ${maxWidthClass}`} onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
