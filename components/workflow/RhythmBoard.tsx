"use client";

import { useMemo, useState } from "react";
import { Activity, AlertTriangle, ChevronDown, ChevronRight, Download, Film, Link2, Loader2, MapPin, Mic, Music, Package, Ruler, Scan, Scissors, ShieldCheck, Trash2, Upload, Users, Zap } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import Card, { CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";
import { extractShareUrl } from "@/lib/videoExtract";
import Stat from "@/components/ui/Stat";
import {
  FAST_CUT_SEC,
  METRIC_UNAVAILABLE_LABEL,
  RHYTHM_THRESHOLDS,
  RISK_LABEL,
  RISK_STEPS,
  RISK_WHY,
  ROUTE_LABEL,
  ROUTE_WHY,
  STEP_LABEL,
  STEP_WHY,
  SHOT_TONE_BAR,
  VERDICT_LABEL,
  beatLocked,
  castToken,
  clippedShots,
  clipsAllowed,
  describeBeatSync,
  describeCast,
  describeRhythm,
  describeShotMetrics,
  entitiesInShot,
  formatTimecode,
  rhythmShotCount,
  riskyShots,
  routeByShot,
  shotRoute,
  shotSteps,
  shotTone,
  splitCastTokens,
  summarizeRhythm,
  tallySteps,
  type BenchmarkCastEntity,
  type BenchmarkCastKind,
  type BenchmarkRhythm,
  type BenchmarkShot,
  type BenchmarkShotContent,
  type BenchmarkShotMetrics,
  type MetricUnavailable,
  type ReplicabilityRisk,
  type ReplicabilityVerdict,
  type ShotRisk,
  type ShotRoute,
  type ShotTone,
} from "@/lib/videoFactory";

/**
 * 三条通道的配色。
 *
 * 「切片去编辑」用品牌色而不是红色，是这次改版的关键一笔：
 * 它以前是「做不出来」的红色警告，现在是一条正经通道，标成红的会让人以为这镜有问题。
 *
 * dot/mark 只有非 generate 的两条有——干净的镜头不打角标。
 */
const ROUTE_STYLE: Record<ShotRoute, { border: string; chip: string; dot?: string; mark?: string }> = {
  generate: { border: "border-line-strong", chip: "bg-soft text-muted" },
  edit: { border: "border-brand-500", chip: "bg-brand-50 text-brand-600", dot: "bg-brand-500", mark: "编" },
  postfix: { border: "border-warn", chip: "bg-warn/10 text-warn", dot: "bg-warn", mark: "字" },
};

/** 一条风险按它引出的第一道工序着色；identity 不引出工序，跟着「直接生成」走。 */
function riskRoute(risk: ReplicabilityRisk): ShotRoute {
  const [step] = RISK_STEPS[risk];
  return step === "edit" || step === "postfix" ? step : "generate";
}

interface RhythmBoardProps {
  rhythm: BenchmarkRhythm | null;
  busy: boolean;
  /** 从「链接拆片」带过来的无水印视频地址，有就能一键拆，不用再贴一次 */
  sourceUrl?: string;
  /** 当前忙在哪一步。贴链接要先取视频再切镜，两段耗时都不短，得分开说 */
  busyHint?: string;
  /** 以前拆过的节奏，可以直接拿来套，不必每次重拆 */
  saved: BenchmarkRhythm[];
  onPickSaved: (rhythm: BenchmarkRhythm) => void;
  onDeleteSaved: (rhythmId: string) => void;
  /** 回到选择状态，重新拆一条或换一条 */
  onReset: () => void;
  onDetect: (options: { file?: File; threshold: number; reuseId?: string }) => void;
  /** 贴一条抖音/小红书链接就地拆：先取无水印视频和口播，再切镜 */
  onDetectLink: (link: string) => void;
  /** 已经在用这条节奏 */
  applied: boolean;
  onApply: () => void;
  onClear: () => void;
  /** 让模型看关键帧，逐镜判出走哪条通道 */
  onScreen: () => void;
  screening: boolean;
  /** 人工确认这条原片没水印。确认了才切原片段，撤销则连已切的一起删 */
  onConfirmSource: (watermarkFree: boolean) => void;
  confirmingSource: boolean;
  /** 导出编辑任务包时用来查绑定，没落盘的项目就没有 */
  projectId?: string;
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
  routes,
}: {
  rhythm: BenchmarkRhythm;
  selected: number | null;
  onSelect: (order: number) => void;
  routes: Map<number, ShotRoute>;
}) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {rhythm.shots.map((shot) => {
        const route = routes.get(shot.order) || "generate";
        const style = ROUTE_STYLE[route];
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
          {style.dot && (
            <span
              title={`${ROUTE_LABEL[route]}：${ROUTE_WHY[route]}`}
              className={`absolute right-1 top-1 z-10 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white ${style.dot}`}
            >
              {style.mark}
            </span>
          )}
          {shot.clip && (
            <span
              title="这一镜的原片段已经切出来了，可以拿去编辑模型换主体"
              className="absolute left-1 top-1 z-10 rounded-full bg-ink/70 px-1 text-[8px] font-bold text-white"
            >
              片
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

/**
 * 一镜量出来的结构：机位、主体走近还是后退、节奏三段。
 *
 * 这几个数是拿来核对的，所以测不出来的项要明说为什么，而不是留白——
 * 留白会让人以为「这一镜就是固定机位」，而实际是根本没测到。
 */
function MeasuredStructure({ metrics }: { metrics?: BenchmarkShotMetrics }) {
  if (!metrics) return null;
  const summary = describeShotMetrics(metrics);
  const missing = Object.entries(metrics.unavailable || {});
  if (!summary && !missing.length) return null;

  return (
    <div className="mt-2">
      {summary && (
        <div className="flex items-center gap-1.5 text-sm leading-6 text-ink">
          <Ruler size={13} className="shrink-0 text-faint" />
          <span className="font-medium">{summary}</span>
        </div>
      )}
      {missing.length > 0 && (
        <p className="mt-1 text-[11px] leading-5 text-faint">
          测不了：
          {missing
            .map(([, reason]) => METRIC_UNAVAILABLE_LABEL[reason as MetricUnavailable])
            // 同一个原因会挂在好几个字段上（没检出人脸就三项全废），说一遍就够
            .filter((label, index, all) => label && all.indexOf(label) === index)
            .join("、")}
        </p>
      )}
    </div>
  );
}

/**
 * 这一镜画面里是什么。四段照原样摆出来，占位符不展开——
 * {角色1} 这种记号正是「要换成你自己的」那几处，得让人一眼看见换在哪。
 */
/** 三类实体的配色。和「可替换」这件事绑在一起，所以三类共用一套底，靠图标区分。 */
const CAST_KIND_ICON: Record<BenchmarkCastKind, typeof Users> = {
  role: Users,
  product: Package,
  scene: MapPin,
};

/**
 * 描述里的占位符就地画成标签。
 *
 * 原样印出「{角色1} 夹起 {产品1}」的话，人得翻到下面的花名册才知道那是谁——
 * 而这两样东西正是这一镜要换掉的，本来就该在同一行里看见。
 */
function CastText({ text, names }: { text: string; names: Map<string, string> }) {
  return (
    <>
      {splitCastTokens(text).map((part, index) =>
        part.token ? (
          <span
            key={index}
            title={names.get(part.token) || "这个占位符不在花名册里，换不掉"}
            className="mx-0.5 rounded bg-brand-50 px-1 font-bold text-brand-600"
          >
            {names.get(part.token) || part.token}
          </span>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

/** 这一镜里出现的人、货、地方。看某一镜时要问的就是这个。 */
function ShotElements({ cast }: { cast: BenchmarkCastEntity[] }) {
  if (!cast.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {cast.map((entity) => {
        const Icon = CAST_KIND_ICON[entity.kind];
        return (
          <span
            key={castToken(entity)}
            title={`${castToken(entity)}——也出现在对标第 ${entity.shots.join("、")} 镜`}
            className="flex items-center gap-1 rounded-lg bg-brand-50 px-2 py-1 text-[11px] text-brand-600"
          >
            <Icon size={11} className="shrink-0" />
            <span className="font-bold">{entity.label}</span>
            {entity.shots.length > 1 && (
              <span className="text-[10px] text-brand-600/60">跨 {entity.shots.length} 镜</span>
            )}
          </span>
        );
      })}
    </div>
  );
}

function ShotContentBlock({
  content,
  names,
}: {
  content?: BenchmarkShotContent;
  names: Map<string, string>;
}) {
  if (!content) {
    return (
      <p className="mt-2 text-[11px] leading-5 text-faint">
        这一镜没抽到帧，画面内容没看——分镜到这一镜会按你的脚本自己写。
      </p>
    );
  }
  const rows: Array<[string, string]> = [
    ["主体", content.subject],
    ["构图", content.framing],
    ["光线", content.light],
    ["场景", content.scene],
  ];
  return (
    <div className="mt-2 space-y-0.5">
      {rows
        .filter(([, text]) => text)
        .map(([label, text]) => (
          <p key={label} className="flex gap-2 text-xs leading-5">
            <span className="w-7 shrink-0 font-bold text-faint">{label}</span>
            <span className="min-w-0 text-ink">
              <CastText text={text} names={names} />
            </span>
          </p>
        ))}
    </div>
  );
}

/** 这条片子里可替换的实体清单。绑素材在视频工厂那边做，这里只说清有哪些。 */
function CastSummary({ cast }: { cast?: BenchmarkCastEntity[] }) {
  if (!cast?.length) return null;
  return (
    <div className="mt-4 rounded-2xl border border-line bg-soft p-3.5">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-faint">
        <Users size={12} />
        可替换的实体 · {describeCast(cast)}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {cast.map((entity) => (
          <span
            key={castToken(entity)}
            className="rounded-lg bg-surface px-2 py-1 text-[11px] text-ink"
            title={entity.shots.length ? `对标第 ${entity.shots.join("、")} 镜` : "没定位到具体镜头"}
          >
            <span className="font-bold text-brand-500">{castToken(entity)}</span>
            <span className="ml-1 text-muted">{entity.label}</span>
          </span>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-5 text-faint">
        套用这条节奏后，去下面「把对标里的人、货、场景换成你自己的」逐个绑上你的素材。
      </p>
    </div>
  );
}

const VERDICT_TONE: Record<ReplicabilityVerdict, "ok" | "warn" | "danger"> = {
  easy: "ok",
  doable: "warn",
  hard: "danger",
};

/**
 * 复刻路线报告。
 *
 * 只列有风险的镜头、要切片的排前面——一条片子每镜都能挑出毛病，全列出来等于没说。
 * 这块以前叫「可复刻性」，答的是能不能做；现在答的是每一镜走哪条路做，
 * 因为接上编辑通道之后，「做不出来」这个二分已经不成立了。
 */
function ReplicabilityPanel({
  rhythm,
  projectId,
  screening,
  onScreen,
  confirming,
  onConfirmSource,
}: {
  rhythm: BenchmarkRhythm;
  /** 有项目就把绑定的素材名写进任务清单；没有就按对标里的说法写 */
  projectId?: string;
  screening: boolean;
  onScreen: () => void;
  confirming: boolean;
  onConfirmSource: (watermarkFree: boolean) => void;
}) {
  const report = rhythm.report;
  if (!report) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-line-strong bg-surface/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-bold text-ink">这条每一镜该怎么做？</div>
            <p className="mt-1 text-[11px] leading-5 text-faint">
              让模型看一遍关键帧，逐镜判出走哪条通道：直接生成、切原片去编辑、还是生成完后期贴字。
              动手之前先分好路，省得拆完节奏才发现有一半镜头这条路走不通。
            </p>
          </div>
          <Button variant="ai" size="sm" onClick={onScreen} loading={screening} icon={<Scan size={13} />}>
            {screening ? "看片中" : "分路线"}
          </Button>
        </div>
      </div>
    );
  }

  const tally = tallySteps(report);
  const risky = riskyShots(report);
  // 镜头多于抽样上限时只看了一部分，没看的不能算进「直接生成」
  const unscreened = Math.max(0, rhythm.shots.length - report.shots.length);
  const clippedSet = new Set(clippedShots(rhythm));
  const allowed = clipsAllowed(rhythm);
  // 各项不互斥：一镜既要切片又要贴字，两边都会数上，所以逐项说而不是拼成一句分配式
  const counts = [
    tally.generate && `${tally.generate} 镜直接生成`,
    tally.edit && `${tally.edit} 镜要切片`,
    tally.postfix && `${tally.postfix} 镜要贴字`,
    tally.lipsync && `${tally.lipsync} 镜要对口型`,
  ].filter(Boolean) as string[];
  const uploaded = rhythm.source?.origin === "upload";

  return (
    <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone={VERDICT_TONE[report.verdict]}>{VERDICT_LABEL[report.verdict]}</Badge>
          <span className="text-[11px] font-bold text-faint">
            {counts.join(" · ")}
            {unscreened > 0 && ` · 另 ${unscreened} 镜没抽到`}
          </span>
        </div>
        <Button size="sm" variant="ghost" onClick={onScreen} loading={screening}>
          重看
        </Button>
      </div>

      <p className="mt-2 text-sm leading-6 text-ink">{report.summary}</p>
      {report.recurringSubject && (
        <p className="mt-1.5 text-[11px] leading-5 text-faint">
          跨镜反复出现：{report.recurringSubject}——走生成通道的镜头要在每一镜的首帧提示词里用同样的措辞描述它，否则会变样。
        </p>
      )}

      {/* 水印闸门。只有真有镜头要切片时才值得占地方 */}
      {tally.edit > 0 && (
        allowed ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="flex items-center gap-1.5 text-[11px] leading-5 text-faint">
              <ShieldCheck size={12} className="shrink-0 text-ok" />
              {rhythm.source?.origin === "extractor"
                ? "无水印源（拆片服务抓的）"
                : "已人工确认无水印"}
              ，已切出 {clippedSet.size} 段原片
            </p>
            {clippedSet.size > 0 && (
              /* 逐镜点开、逐个下载、再各自回想这一镜换谁——十几镜就是一下午。一次拿走 */
              <a
                href={`/api/video-factory/benchmark/edit-pack?id=${encodeURIComponent(rhythm.id)}${
                  projectId ? `&project=${encodeURIComponent(projectId)}` : ""
                }`}
                download
                className="flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-bold text-ink transition-colors hover:border-brand-300"
              >
                <Download size={12} className="text-faint" />
                导出这 {clippedSet.size} 段和任务清单
              </a>
            )}
          </div>
        ) : (
          <Callout tone="warn" className="mt-3">
            <div className="font-bold">这 {tally.edit} 镜要用原片段，先确认画面里没有水印</div>
            <p className="mt-1 leading-5">
              {uploaded ? "这条是手动传进来的，来路不明。" : "这条来路没记下。"}
              抖音/小红书的水印是飘移的半透明 logo 加账号 ID，带着进编辑模型会糊成一团洗不掉，
              成片发出去就是搬运实锤。自己看一眼再点——不做自动检测，是因为漏判一次不可逆。
            </p>
            <Button
              size="sm"
              className="mt-2"
              loading={confirming}
              onClick={() => onConfirmSource(true)}
              icon={<ShieldCheck size={13} />}
            >
              确认没有水印，切出这 {tally.edit} 段
            </Button>
          </Callout>
        )
      )}

      {rhythm.beatSync && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] leading-5 text-faint">
          <Music size={12} className={`shrink-0 ${beatLocked(rhythm.beatSync) ? "text-warn" : "text-faint"}`} />
          {describeBeatSync(rhythm.beatSync)}
        </p>
      )}

      {risky.length > 0 && (
        <div className="mt-3 space-y-2">
          {risky.map((shot) => {
            const steps = shotSteps(shot);
            return (
              <div
                key={shot.order}
                className={`rounded-xl border-l-[3px] bg-soft px-3 py-2.5 ${ROUTE_STYLE[shotRoute(shot)].border}`}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-bold text-ink">第 {shot.order} 镜</span>
                  {steps.map((step) => (
                    <span
                      key={step}
                      title={STEP_WHY[step]}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        step === "lipsync" ? "bg-danger/10 text-danger" : ROUTE_STYLE[step].chip
                      }`}
                    >
                      {STEP_LABEL[step]}
                    </span>
                  ))}
                  {clippedSet.has(shot.order) && (
                    <span className="rounded-full bg-ok/10 px-2 py-0.5 text-[10px] font-bold text-ok">原片已切</span>
                  )}
                  {shot.risks.map((risk) => (
                    <span
                      key={risk}
                      title={RISK_WHY[risk]}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ROUTE_STYLE[riskRoute(risk)].chip}`}
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

      {tally.edit > 0 && (
        <Callout tone="info" className="mt-3">
          有 {tally.edit} 镜从零生成做不出来，得拿对标的原片段进视频编辑模型换主体——
          运动和构图照旧，只把人和货换成你自己的。
          {tally.lipsync > 0 && ` 其中 ${tally.lipsync} 镜有人说话，换完主体口型还是原片的，要让他说你的词就还得再补一道对口型。`}
          {" 编辑目前只能在外部平台上手动跑（VACE / 可灵 / Runway 这些），成片传回来走「手动回传」那条通道。"}
        </Callout>
      )}

      {/* 报告是跟着这份节奏存的，换项目也还在 */}
      <p className="mt-3 text-[10px] text-faint">
        看了 {report.shots.length} 张关键帧（节奏 {rhythm.id.slice(0, 8)}），结论已随模板存下。
      </p>
    </div>
  );
}

export default function RhythmBoard({
  rhythm,
  busy,
  busyHint,
  sourceUrl,
  saved,
  onPickSaved,
  onDeleteSaved,
  onReset,
  onDetect,
  onDetectLink,
  applied,
  onApply,
  onClear,
  onScreen,
  screening,
  onConfirmSource,
  confirmingSource,
  projectId,
}: RhythmBoardProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [link, setLink] = useState("");
  /** 已存节奏默认收起：拆过几十条之后这张列表会把上面的入口挤出屏幕 */
  const [savedOpen, setSavedOpen] = useState(false);
  const stats = useMemo(() => (rhythm ? summarizeRhythm(rhythm) : null), [rhythm]);
  // 按镜号索引风险，胶片条和详情都要按镜取
  const riskByShot = useMemo(
    () => new Map((rhythm?.report?.shots || []).map((shot) => [shot.order, shot])),
    [rhythm],
  );
  // 路线算一次给所有消费者用，省得同一件事在胶片条、报告、切片清单里各推一遍
  const routes = useMemo(() => routeByShot(rhythm?.report), [rhythm]);
  // 占位符 → 它在对标里是什么。描述里就地渲染成标签要用
  const castNames = useMemo(
    () => new Map((rhythm?.cast || []).map((entity) => [castToken(entity), entity.label])),
    [rhythm],
  );
  const selectedShot = rhythm?.shots.find((shot) => shot.order === selected) || null;

  if (!rhythm) {
    const linkReady = Boolean(extractShareUrl(link));
    return (
      <Card>
        <CardHeader
          title="拆对标的真实节奏"
          description="用 ffmpeg 算出每一刀切在哪，再看一遍关键帧写出每镜画面内容——进下游的是时间码和文字描述，对标的原画面和原音频都不搬运"
        />
        <Callout tone="info">
          模型自己拆分镜会给你四平八稳的 6 秒一镜，而爆款的开场常常是 5 秒内切三刀——这种节奏猜不出来，只能量。
        </Callout>

        {/* 贴链接和传文件是两条并列的入口，不是主次关系：
            平台上刷到的直接贴链接，自己手里的素材传文件。 */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[280px] flex-1">
            <Link2 size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <Input
              value={link}
              disabled={busy}
              onChange={(event) => setLink(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && linkReady && !busy) onDetectLink(link);
              }}
              placeholder="粘贴抖音 / 小红书链接，或整段分享口令"
              className="pl-9"
            />
          </div>
          <Button
            variant="ai"
            disabled={!linkReady || busy}
            loading={busy}
            onClick={() => onDetectLink(link)}
            icon={<Activity size={14} />}
          >
            拆这条链接
          </Button>
          <span className="text-xs text-faint">或</span>
          <label
            className={`inline-flex h-9 items-center gap-2 rounded-xl border border-line-strong bg-surface px-4 text-sm font-bold transition-colors ${
              busy ? "cursor-not-allowed text-faint" : "cursor-pointer text-ink hover:border-brand-300 hover:bg-brand-50"
            }`}
          >
            <Upload size={14} />
            上传 mp4
            <input
              type="file"
              accept="video/mp4"
              className="hidden"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onDetect({ file, threshold: 0.3 });
                event.target.value = "";
              }}
            />
          </label>
        </div>

        {/* 粘了东西但抠不出链接时当场说，别等点了按钮才报错 */}
        {link.trim() && !linkReady && (
          <p className="mt-2 text-[11px] leading-5 text-warn">
            没认出链接。抖音/小红书的分享口令整段粘进来也行，但里面得带 http 开头的那一段。
          </p>
        )}

        {sourceUrl && !link.trim() && (
          <div className="mt-3">
            <Button variant="secondary" size="sm" onClick={() => onDetect({ threshold: 0.3 })} disabled={busy}>
              直接拆刚才「链接拆片」那条
            </Button>
          </div>
        )}

        {busy && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
            <Loader2 size={13} className="animate-spin shrink-0" />
            {busyHint || "正在逐镜抽帧"}
          </p>
        )}

        <p className="mt-3 text-[11px] leading-5 text-faint">
          贴链接和用拆片结果都要本机的 services/video-renderer 在跑，视频是从它那里取的；上传 mp4 不需要。
        </p>

        {saved.length > 0 && (
          <div className="mt-5 border-t border-line pt-4">
            {/* 这是流程内的「给手上这条项目换一条节奏」，不是目录——浏览全部模板在「模板」区。
                默认收起：拆过几十条之后，这张列表会把上面两个入口挤到屏幕外去。 */}
            <button
              type="button"
              onClick={() => setSavedOpen((current) => !current)}
              className="flex w-full items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-faint transition-colors hover:text-ink"
              aria-expanded={savedOpen}
            >
              {savedOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              换一条已存的节奏 · {saved.length} 条
            </button>
            {savedOpen && (
              <div className="mt-2 space-y-2">
                {saved.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-2.5">
                    <button type="button" onClick={() => onPickSaved(item)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-sm font-bold text-ink">{item.sourceLabel}</span>
                      <span className="mt-0.5 block text-[11px] text-faint">{describeRhythm(item)}</span>
                    </button>
                    <Button size="sm" variant="danger" onClick={() => onDeleteSaved(item.id)} icon={<Trash2 size={13} />}>
                      删除
                    </Button>
                  </div>
                ))}
              </div>
            )}
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
        {/* 判据不同切出来的镜头数能差一半，看这份模板时得知道它是哪个判据切的 */}
        {rhythm.detector === "adaptive" ? (
          <span className="text-[11px] text-faint">· 自适应判据</span>
        ) : (
          <span
            className="text-[11px] text-warn"
            title="ffmpeg 的固定阈值会漏掉同机位同场景的切换——换装、景别变化、人物进出画面。实测五条片子漏了 7 刀。"
          >
            · 固定阈值，会漏切（装 scenedetect 更准）
          </span>
        )}
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
        <Filmstrip rhythm={rhythm} selected={selected} onSelect={setSelected} routes={routes} />
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
            <ShotElements cast={entitiesInShot(rhythm.cast, selectedShot.order)} />
            <MeasuredStructure metrics={selectedShot.metrics} />
            <ShotContentBlock content={selectedShot.content} names={castNames} />
            {selectedShot.voiceover?.text && (
              <p className="mt-2 flex gap-1.5 text-xs leading-5 text-muted">
                <Mic size={12} className="mt-1 shrink-0 text-faint" />
                <span>
                  原片这一镜说：「{selectedShot.voiceover.text}」
                </span>
              </p>
            )}
            {selectedShot.clip && (
              <div className="mt-2">
                {/* 拿去编辑之前先自己看一眼这段切得对不对——切点差半秒，换出来的主体就会在半空里出现 */}
                <video
                  key={`${rhythm.id}-${selectedShot.order}`}
                  src={`/api/video-factory/benchmark/clip?id=${encodeURIComponent(rhythm.id)}&shot=${selectedShot.order}`}
                  controls
                  preload="metadata"
                  className="w-full max-w-[220px] rounded-xl border border-line bg-black"
                />
                <p className="mt-1 text-[10px] text-faint">
                  原片段 {selectedShot.clip.durationSec} 秒 · {(selectedShot.clip.bytes / 1024 / 1024).toFixed(1)}MB，
                  拿它去编辑模型换主体
                </p>
              </div>
            )}
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
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ROUTE_STYLE[riskRoute(item)].chip}`}
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

      <CastSummary cast={rhythm.cast} />

      <ReplicabilityPanel
        rhythm={rhythm}
        projectId={projectId}
        screening={screening}
        onScreen={onScreen}
        confirming={confirmingSource}
        onConfirmSource={onConfirmSource}
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
