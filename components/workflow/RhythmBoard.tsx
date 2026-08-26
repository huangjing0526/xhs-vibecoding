"use client";

import { useMemo, useState } from "react";
import { Activity, AlertTriangle, Film, Loader2, Scan, Scissors, Trash2, Upload, Zap } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import Card, { CardHeader } from "@/components/ui/Card";
import Stat from "@/components/ui/Stat";
import {
  FAST_CUT_SEC,
  RHYTHM_THRESHOLDS,
  RISK_LABEL,
  RISK_SEVERITY,
  RISK_WHY,
  SHOT_TONE_BAR,
  VERDICT_LABEL,
  describeRhythm,
  formatTimecode,
  rhythmShotCount,
  riskyShots,
  shotSeverity,
  shotTone,
  summarizeRhythm,
  tallyRisks,
  type BenchmarkRhythm,
  type BenchmarkShot,
  type ReplicabilityReport,
  type ReplicabilityVerdict,
  type ShotRisk,
  type ShotTone,
} from "@/lib/videoFactory";

interface RhythmBoardProps {
  rhythm: BenchmarkRhythm | null;
  busy: boolean;
  /** 拆片带过来的无水印视频地址，有就能一键拆，不用再上传 */
  sourceUrl?: string;
  /** 以前拆过的节奏，可以直接拿来套，不必每次重拆 */
  saved: BenchmarkRhythm[];
  onPickSaved: (rhythm: BenchmarkRhythm) => void;
  onDeleteSaved: (rhythmId: string) => void;
  /** 回到选择状态，重新拆一条或换一条 */
  onReset: () => void;
  onDetect: (options: { file?: File; threshold: number; reuseId?: string }) => void;
  /** 已经在用这条节奏 */
  applied: boolean;
  onApply: () => void;
  onClear: () => void;
  /** 让模型看关键帧判断能不能复刻 */
  onScreen: () => void;
  screening: boolean;
}

const TONE_LABEL: Record<ShotTone, string> = {
  fast: "快切",
  normal: "常规",
  long: "长镜",
};

/** 这一镜怎么落到生成引擎上，说人话。 */
function planText(shot: BenchmarkShot): string {
  const { kind, segments, generateSec, trimToSec } = shot.plan;
  if (kind === "exact") return `正好 ${generateSec} 秒，直接生成一段`;
  if (kind === "split") return `${trimToSec} 秒，拆成 ${segments} 段各生成 ${generateSec} 秒接起来`;
  return `生成 ${generateSec} 秒，剪到 ${trimToSec} 秒用`;
}

/**
 * 节奏条：每镜一个块，宽度就是它在片子里占的时长比例。
 * 这是整块面板的主视觉——「开头 5 秒切三刀」这种事只有画出来才看得见，列成表是看不出来的。
 */
function RhythmBar({
  rhythm,
  selected,
  onSelect,
}: {
  rhythm: BenchmarkRhythm;
  selected: number | null;
  onSelect: (order: number) => void;
}) {
  const total = rhythm.totalDurationSec;
  const showOpeningMark = total > 8;

  return (
    <div>
      <div className="relative">
        <div className="flex h-16 w-full overflow-hidden rounded-2xl border border-line bg-soft">
          {rhythm.shots.map((shot) => {
            const tone = shotTone(shot);
            const wide = shot.durationSec / total > 0.045;
            return (
              <button
                key={shot.order}
                type="button"
                onClick={() => onSelect(shot.order)}
                title={`第 ${shot.order} 镜 · ${shot.durationSec} 秒 · ${planText(shot)}`}
                aria-pressed={selected === shot.order}
                style={{ flexGrow: shot.durationSec, flexBasis: 0 }}
                className={`relative min-w-[7px] border-r border-surface/70 transition-opacity last:border-r-0 hover:opacity-80 ${
                  SHOT_TONE_BAR[tone]
                } ${selected === shot.order ? "ring-2 ring-inset ring-ink" : ""}`}
              >
                {wide && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] font-bold text-white/90">
                    {shot.order}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 前 5 秒的分界线：钩子密度全藏在这一段里 */}
        {showOpeningMark && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 border-l-2 border-dashed border-ink/50"
            style={{ left: `${(5 / total) * 100}%` }}
          >
            <span className="absolute -top-5 left-1 whitespace-nowrap text-[10px] font-bold text-muted">前 5 秒</span>
          </div>
        )}
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[10px] font-semibold text-faint">
        <span>0:00.0</span>
        <span>{formatTimecode(total)}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] font-semibold text-faint">
        {(["fast", "normal", "long"] as ShotTone[]).map((tone) => (
          <span key={tone} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-4 rounded-sm ${SHOT_TONE_BAR[tone]}`} />
            {TONE_LABEL[tone]}
            {tone === "fast" && `（<${FAST_CUT_SEC} 秒）`}
            {tone === "long" && "（要拆段）"}
          </span>
        ))}
      </div>
    </div>
  );
}

/** 关键帧胶片条：看到画面才判断得出「这条 AI 能不能复刻」。 */
function Filmstrip({
  rhythm,
  selected,
  onSelect,
  riskByShot,
}: {
  rhythm: BenchmarkRhythm;
  selected: number | null;
  onSelect: (order: number) => void;
  riskByShot: Map<number, ShotRisk>;
}) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {rhythm.shots.map((shot) => {
        const severity = shotSeverity(riskByShot.get(shot.order) || { order: shot.order, risks: [], what: "", workaround: "" });
        return (
        <button
          key={shot.order}
          type="button"
          onClick={() => onSelect(shot.order)}
          aria-pressed={selected === shot.order}
          className={`relative shrink-0 overflow-hidden rounded-xl border transition-all ${
            selected === shot.order ? "border-brand-400 ring-2 ring-brand-100" : "border-line hover:border-brand-300"
          }`}
        >
          {severity && (
            <span
              title={severity === "block" ? "生成阶段就做不出来" : "后期能补"}
              className={`absolute right-1 top-1 z-10 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white ${
                severity === "block" ? "bg-danger" : "bg-warn"
              }`}
            >
              !
            </span>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/video-factory/benchmark/frame?id=${encodeURIComponent(rhythm.id)}&shot=${shot.order}`}
            alt={`第 ${shot.order} 镜`}
            loading="lazy"
            className="h-24 w-[54px] bg-sunken object-cover"
          />
          <span className="block bg-surface px-1 py-1 text-center text-[10px] font-bold tabular-nums text-muted">
            {shot.durationSec}s
          </span>
        </button>
        );
      })}
    </div>
  );
}

const VERDICT_TONE: Record<ReplicabilityVerdict, "ok" | "warn" | "danger"> = {
  easy: "ok",
  doable: "warn",
  hard: "danger",
};

/**
 * 可复刻性报告。
 * 只列有风险的镜头、硬卡点排前面——一条片子每镜都能挑出毛病，全列出来等于没说。
 */
function ReplicabilityPanel({
  rhythmId,
  report,
  totalShots,
  screening,
  onScreen,
}: {
  rhythmId: string;
  report?: ReplicabilityReport;
  totalShots: number;
  screening: boolean;
  onScreen: () => void;
}) {
  if (!report) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-line-strong bg-surface/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-bold text-ink">这条能不能用 AI 复刻？</div>
            <p className="mt-1 text-[11px] leading-5 text-faint">
              让模型看一遍关键帧，逐镜标出真人说话、精细动作、跨镜主体、画面文字这些卡点，并给绕法。
              动手之前先问清楚，省得拆完节奏才发现做不了。
            </p>
          </div>
          <Button variant="ai" size="sm" onClick={onScreen} loading={screening} icon={<Scan size={13} />}>
            {screening ? "看片中" : "查可复刻性"}
          </Button>
        </div>
      </div>
    );
  }

  const tally = tallyRisks(report);
  const risky = riskyShots(report);
  // 镜头多于抽样上限时只看了一部分，没看的不能算进「干净」
  const unscreened = Math.max(0, totalShots - report.shots.length);

  return (
    <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone={VERDICT_TONE[report.verdict]}>{VERDICT_LABEL[report.verdict]}</Badge>
          <span className="text-[11px] font-bold text-faint">
            硬卡点 {tally.blocked} 镜 · 后期能补 {tally.workable} 镜 · 干净 {tally.clean} 镜
            {unscreened > 0 && ` · 另 ${unscreened} 镜没抽到`}
          </span>
        </div>
        <Button size="sm" variant="ghost" onClick={onScreen} loading={screening}>
          重查
        </Button>
      </div>

      <p className="mt-2 text-sm leading-6 text-ink">{report.summary}</p>
      {report.recurringSubject && (
        <p className="mt-1.5 text-[11px] leading-5 text-faint">
          跨镜反复出现：{report.recurringSubject}——这些的外观要在每一镜的首帧提示词里用同样的措辞描述，否则会变样。
        </p>
      )}

      {risky.length > 0 && (
        <div className="mt-3 space-y-2">
          {risky.map((shot) => {
            const severity = shotSeverity(shot);
            return (
              <div
                key={shot.order}
                className={`rounded-xl border-l-[3px] bg-soft px-3 py-2.5 ${
                  severity === "block" ? "border-danger" : "border-warn"
                }`}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-bold text-ink">第 {shot.order} 镜</span>
                  {shot.risks.map((risk) => (
                    <span
                      key={risk}
                      title={RISK_WHY[risk]}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        RISK_SEVERITY[risk] === "block" ? "bg-danger/10 text-danger" : "bg-warn/10 text-warn"
                      }`}
                    >
                      {RISK_LABEL[risk]}
                    </span>
                  ))}
                </div>
                {shot.what && <p className="mt-1 text-xs leading-5 text-muted">{shot.what}</p>}
                {shot.workaround && (
                  <p className="mt-1 flex gap-1.5 text-xs leading-5 text-ink">
                    <AlertTriangle size={12} className="mt-1 shrink-0 text-faint" />
                    <span>{shot.workaround}</span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tally.blocked > 0 && (
        <Callout tone="info" className="mt-3">
          有 {tally.blocked} 镜是生成阶段就做不出来的。要么按上面的绕法改画面，要么只借这条的节奏、画面全部另想——
          节奏本来就是这条片子里最值钱的部分。
        </Callout>
      )}

      {/* 报告是跟着这份节奏存的，换项目也还在 */}
      <p className="mt-3 text-[10px] text-faint">
        看了 {report.shots.length} 张关键帧（节奏 {rhythmId.slice(0, 8)}），结论已随模板存下。
      </p>
    </div>
  );
}

export default function RhythmBoard({
  rhythm,
  busy,
  sourceUrl,
  saved,
  onPickSaved,
  onDeleteSaved,
  onReset,
  onDetect,
  applied,
  onApply,
  onClear,
  onScreen,
  screening,
}: RhythmBoardProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const stats = useMemo(() => (rhythm ? summarizeRhythm(rhythm) : null), [rhythm]);
  // 按镜号索引风险，胶片条和详情都要按镜取
  const riskByShot = useMemo(
    () => new Map((rhythm?.report?.shots || []).map((shot) => [shot.order, shot])),
    [rhythm],
  );
  const selectedShot = rhythm?.shots.find((shot) => shot.order === selected) || null;

  if (!rhythm) {
    return (
      <Card>
        <CardHeader
          title="拆对标的真实节奏"
          description="用 ffmpeg 算出这条片子每一刀切在哪，得到的只有时间码和缩略图，画面和音频都不会进下游"
        />
        <Callout tone="info">
          模型自己拆分镜会给你四平八稳的 6 秒一镜，而爆款的开场常常是 5 秒内切三刀——这种节奏猜不出来，只能量。
        </Callout>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {sourceUrl && (
            <Button variant="ai" onClick={() => onDetect({ threshold: 0.3 })} loading={busy} icon={<Activity size={14} />}>
              {busy ? "拆解中" : "拆刚才那条片子的节奏"}
            </Button>
          )}
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-line-strong bg-surface px-4 text-sm font-bold text-ink transition-colors hover:border-brand-300 hover:bg-brand-50">
            <Upload size={14} />
            上传 mp4
            <input
              type="file"
              accept="video/mp4"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onDetect({ file, threshold: 0.3 });
                event.target.value = "";
              }}
            />
          </label>
          {busy && (
            <span className="flex items-center gap-1.5 text-xs text-faint">
              <Loader2 size={13} className="animate-spin" />
              正在逐镜抽帧
            </span>
          )}
        </div>
        {sourceUrl && (
          <p className="mt-3 text-[11px] leading-5 text-faint">
            用拆片结果时需要本机的 services/video-renderer 还在跑，视频是从它那里取的。
          </p>
        )}

        {saved.length > 0 && (
          <div className="mt-5 border-t border-line pt-4">
            {/* 这是流程内的「给手上这条项目换一条节奏」，不是目录——浏览全部模板在「模板」区 */}
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-faint">换一条已存的节奏</div>
            <div className="space-y-2">
              {saved.map((item) => {
                return (
                  <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-2.5">
                    <button type="button" onClick={() => onPickSaved(item)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-sm font-bold text-ink">{item.sourceLabel}</span>
                      <span className="mt-0.5 block text-[11px] text-faint">{describeRhythm(item)}</span>
                    </button>
                    <Button size="sm" variant="danger" onClick={() => onDeleteSaved(item.id)} icon={<Trash2 size={13} />}>
                      删除
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title={`节奏表 · ${rhythm.shots.length} 镜`}
        description={`${rhythm.sourceLabel} · ${formatTimecode(rhythm.totalDurationSec)} · ${rhythm.width}×${rhythm.height}`}
        action={
          <div className="flex items-center gap-2">
            {applied ? (
              <>
                <Badge tone="ok">已在用</Badge>
                <Button size="sm" variant="danger" onClick={onClear}>
                  不套了
                </Button>
              </>
            ) : (
              <Button size="sm" variant="primary" onClick={onApply} icon={<Film size={13} />}>
                用这条节奏
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onReset}>
              换一条
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold text-faint">检测灵敏度</span>
        {RHYTHM_THRESHOLDS.map((item) => (
          <button
            key={item.value}
            type="button"
            title={item.hint}
            disabled={busy}
            onClick={() => onDetect({ threshold: item.value, reuseId: rhythm.id })}
            aria-pressed={rhythm.threshold === item.value}
            className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors disabled:opacity-50 ${
              rhythm.threshold === item.value ? "bg-ink text-white" : "bg-soft text-muted hover:bg-sunken hover:text-ink"
            }`}
          >
            {item.label}
          </button>
        ))}
        {busy && <Loader2 size={13} className="animate-spin text-faint" />}
      </div>

      {stats && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Stat value={stats.shotCount} label="镜头数" />
          <Stat value={`${stats.averageSec}s`} label="平均镜长" />
          <Stat value={`${stats.shortestSec}s`} label="最短一镜" />
          <Stat value={stats.openingCuts} label="前 5 秒切几刀" tone="brand" />
          <Stat value={stats.totalSegments} label="要生成几段" tone="ok" />
        </div>
      )}

      <RhythmBar rhythm={rhythm} selected={selected} onSelect={setSelected} />

      <div className="mt-4">
        <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-faint">关键帧</div>
        <Filmstrip rhythm={rhythm} selected={selected} onSelect={setSelected} riskByShot={riskByShot} />
      </div>

      {selectedShot ? (
        <div className="mt-4 flex gap-4 rounded-2xl border border-line bg-soft p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/video-factory/benchmark/frame?id=${encodeURIComponent(rhythm.id)}&shot=${selectedShot.order}`}
            alt={`第 ${selectedShot.order} 镜`}
            className="h-36 w-[81px] shrink-0 rounded-xl bg-sunken object-cover"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand">第 {selectedShot.order} 镜</Badge>
              <Badge tone={shotTone(selectedShot) === "long" ? "warn" : "neutral"}>
                {TONE_LABEL[shotTone(selectedShot)]}
              </Badge>
              <span className="font-mono text-xs text-muted">
                {formatTimecode(selectedShot.startSec)} → {formatTimecode(selectedShot.endSec)}
              </span>
            </div>
            <div className="mt-2 font-rounded text-2xl font-bold tabular-nums text-ink">{selectedShot.durationSec} 秒</div>
            <p className="mt-1 flex items-center gap-1.5 text-sm leading-6 text-muted">
              <Scissors size={13} className="shrink-0 text-faint" />
              {planText(selectedShot)}
            </p>
            {(() => {
              const risk = riskByShot.get(selectedShot.order);
              if (!risk?.risks.length) return null;
              return (
                <div className="mt-2">
                  <div className="flex flex-wrap gap-1.5">
                    {risk.risks.map((item) => (
                      <span
                        key={item}
                        title={RISK_WHY[item]}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          RISK_SEVERITY[item] === "block" ? "bg-danger/10 text-danger" : "bg-warn/10 text-warn"
                        }`}
                      >
                        {RISK_LABEL[item]}
                      </span>
                    ))}
                  </div>
                  {risk.workaround && <p className="mt-1.5 text-xs leading-5 text-muted">{risk.workaround}</p>}
                </div>
              );
            })()}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-[11px] text-faint">点节奏条或关键帧看某一镜的时间码与生成方案。</p>
      )}

      <ReplicabilityPanel
        rhythmId={rhythm.id}
        report={rhythm.report}
        totalShots={rhythm.shots.length}
        screening={screening}
        onScreen={onScreen}
      />

      {stats && stats.splitCount > 0 && (
        <Callout tone="warn" className="mt-4">
          有 {stats.splitCount} 个镜头超过 10 秒，得拆成多段接起来。整条片子落地一共要生成{" "}
          {stats.totalSegments} 段，比镜头数多 {stats.totalSegments - stats.shotCount} 段。
        </Callout>
      )}

      {stats && stats.openingCuts >= 2 && (
        <Callout tone="info" className="mt-3">
          <span className="inline-flex items-center gap-1.5">
            <Zap size={13} className="shrink-0" />
            开头 5 秒里切了 {stats.openingCuts} 刀——这条的钩子是靠快切堆出来的，套用时别把开场并成一个长镜。
          </span>
        </Callout>
      )}

      {applied && (
        <Callout tone="ok" className="mt-3">
          去「脚本改写」那步点「拆成分镜表」，就会按这 {rhythmShotCount(rhythm)} 段的时长切你自己的口播。
        </Callout>
      )}
    </Card>
  );
}
