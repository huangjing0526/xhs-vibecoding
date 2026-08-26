"use client";

import { UserRound, X } from "lucide-react";
import ModelCardRow from "@/components/workflow/ModelCardRow";
import type { ModelProfile } from "@/lib/imageFactory";

/**
 * 模特库里的模特直接摆出来当模板选。
 * 库里攒下的模特是这条线上最贵的资产，藏在弹窗后面等于没有——
 * 一排头像点一下就锁定这位模特，再去勾要出哪几张图。
 */
export default function ModelTemplateStrip({
  profiles,
  loading,
  activeName,
  onSelect,
  onClear,
  onManage,
}: {
  profiles: ModelProfile[];
  loading: boolean;
  /** 当前锁定的模特名；空表示没选，按文字描述新生成一位 */
  activeName: string;
  onSelect: (profile: ModelProfile) => void;
  onClear: () => void;
  onManage: () => void;
}) {
  return (
    <div className="rounded-2xl bg-soft p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold text-muted">
          用哪位模特
          {activeName ? (
            <span className="ml-1.5 font-normal text-brand-600">已锁定 {activeName}</span>
          ) : (
            <span className="ml-1.5 font-normal text-faint">不选就按下方文字描述新生成一位</span>
          )}
        </h3>
        <div className="flex items-center gap-1.5">
          {activeName && (
            <button type="button" onClick={onClear} className="rounded-lg px-2 py-1 text-[11px] font-bold text-faint hover:text-danger">
              取消锁定
            </button>
          )}
          <button type="button" onClick={onManage} className="rounded-lg px-2 py-1 text-[11px] font-bold text-brand-600 hover:bg-brand-50">
            换个视角 / 管理
          </button>
        </div>
      </div>

      <div className="mt-2.5">
        <ModelCardRow
          profiles={profiles}
          activeName={activeName}
          loading={loading}
          emptyHint="模特库还是空的。跑一组模特资产图并存入后，这里就能一键复用。"
          onSelect={(profile) => (profile.name === activeName ? onClear() : onSelect(profile))}
        />
      </div>

      {activeName && (
        <p className="mt-1.5 flex items-start gap-1 text-[10px] leading-4 text-faint">
          <UserRound size={11} className="mt-0.5 shrink-0" />
          锁脸图与体貌描述会跟着每一张一起发给 CLI，跨视角才是同一个人。
        </p>
      )}
      {!activeName && profiles.length > 0 && (
        <p className="mt-1.5 flex items-start gap-1 text-[10px] leading-4 text-faint">
          <X size={11} className="mt-0.5 shrink-0" />
          没锁定模特时，每次生成都可能是不同的人。
        </p>
      )}
    </div>
  );
}
