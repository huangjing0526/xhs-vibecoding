"use client";

import { useState } from "react";

interface RowActionsProps {
  onEdit?: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
  archived?: boolean;
  extraMenu?: Array<{ label: string; onClick: () => void; danger?: boolean }>;
}

export default function RowActions({ onEdit, onArchive, onRestore, archived, extraMenu }: RowActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleAction = (handler?: () => void) => (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    handler?.();
    setMenuOpen(false);
  };

  return (
    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      {archived ? (
        onRestore && (
          <button
            type="button"
            onClick={handleAction(onRestore)}
            className="bg-white px-2 py-1 text-xs font-black text-stone-700 hover:text-stone-950"
            aria-label="恢复"
          >
            恢复
          </button>
        )
      ) : (
        <>
          {onEdit && (
            <button
              type="button"
              onClick={handleAction(onEdit)}
              className="bg-white px-2 py-1 text-xs font-black text-stone-700 hover:text-stone-950"
              aria-label="编辑"
            >
              编辑
            </button>
          )}
          {onArchive && (
            <button
              type="button"
              onClick={handleAction(onArchive)}
              className="bg-white px-2 py-1 text-xs font-black text-stone-500 hover:text-rose-600"
              aria-label="归档"
            >
              归档
            </button>
          )}
        </>
      )}

      {extraMenu && extraMenu.length > 0 && (
        <div className="relative">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
              setMenuOpen((prev) => !prev);
            }}
            className="bg-white px-2 py-1 text-xs font-black text-stone-500 hover:text-stone-950"
            aria-label="更多"
          >
            ···
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-full z-10 mt-1 min-w-[120px] border border-stone-300 bg-white py-1 shadow-lg"
              onClick={(event) => event.stopPropagation()}
            >
              {extraMenu.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={handleAction(item.onClick)}
                  className={`block w-full px-3 py-1.5 text-left text-xs font-semibold ${
                    item.danger ? "text-rose-600 hover:bg-rose-50" : "text-stone-700 hover:bg-stone-50"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
