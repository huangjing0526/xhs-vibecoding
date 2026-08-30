/**
 * 生成单元：分镜表真正要向引擎下一次单的那一段。
 *
 * 为什么需要这一层——爆款的镜头长度和引擎的档位对不上。一条 80 秒的探店片切出 34 镜，
 * 每镜 1-2 秒，而图生视频最短一档是 6 秒：逐镜下单等于每次生成 6 秒只用 1.5 秒，
 * 四分之三的钱和时间烧在剪掉的部分上，而且 34 次生成里的人和场景各不相同，一致性还最差。
 *
 * 所以把一个叙事阶段里连着的、都能直接生成的镜头并成一次生成：10 秒档一次下单，
 * 出来一整段连续画面，再按对标原本的切点从这 10 秒里**等距铺开取样**——
 * 取 0-1.5、3.5-5.0、7.0-8.5 这样三段接起来，就是三个真跳切，
 * 主体是同一次生成的所以不会换脸，总时长和对标一刀不差。
 *
 * 关键在于必须**跳着取**。三段连着取（0-1.5、1.5-3.0、3.0-4.5）接回去还是原来那段连续画面，
 * 切口一个都看不见——对标那种碎切质感恰恰是它值钱的地方，那样并镜就是拿节奏换钱。
 *
 * 什么不并：
 * - 要走编辑通道的镜头。它的素材来自原片切片，不是生成出来的，并进来无从生成。
 * - 没判过路线的镜头。不知道就不合并——合错的代价是整段活儿白干。
 * - 一镜量出机位钉死、另一镜量出机位在动。一次连续生成不可能两样都是。
 * - 跨阶段。阶段是人做决策的粒度，并过界之后「这一段占多长」就没法调了。
 *
 * 什么**不**构成障碍，两条都是实测调出来的：
 * - 「要后期贴字」和「直接生成」并不冲突。贴字是生成完之后的活儿，
 *   按路线是否相等来拆组，会把本来连着的一串镜头切得七零八落——
 *   实测一条 9 镜的片子因此一组都并不出来。工序是集合不是单值，这里同理：
 *   组里有一镜要贴字，整组就标成要贴字，而不是为它单开一次生成。
 * - 机位「轻微移动」和「量不到」不设限。不知道不等于不行，
 *   拿它当障碍等于让测不准的镜头自动失去合并资格。
 */

import {
  CAMERA_MOTION_PROMPT,
  describeSubjectScale,
  planBenchmarkShot,
  shotMetricsToPrompt,
  type BenchmarkRhythm,
  type BenchmarkShot,
  type CameraMotion,
} from "./benchmark";
// 只取这一个函数。storyboard.ts 反过来只 import type 本文件，运行时不成环
import { metricsToCameraMove } from "./storyboard";
import { routeByShot, type ShotRoute } from "./replicability";
import { stageOfShot } from "./stage";
import { PROVIDER_CAPS, type ShotDuration, type VideoGenProviderId } from "./types";

/** 秒数一律收到一位小数：切点要写进 ffmpeg 命令行，多余的位数只会让日志难读。 */
const round1 = (value: number) => Math.round(value * 10) / 10;

/** 一组镜头在成片里一共占多长。 */
const totalSec = (shots: BenchmarkShot[]) => shots.reduce((sum, shot) => sum + shot.durationSec, 0);

/**
 * 组内的一刀：从生成出来的那段视频里取哪一段，对应对标的哪一镜。
 * 时间码全由服务端算，模型碰不到——它只写这一刀的字幕和口播。
 *
 * fromSec 和 durationSec 两个数都得存，推不出来：刀与刀之间留着间隔
 * （那正是跳切的来源），下一刀的起点不等于上一刀的终点。
 */
export interface UnitCut {
  /** 对标片里的第几镜 */
  sourceShotOrder: number;
  /** 从生成出来的这段视频的第几秒开始取 */
  fromSec: number;
  /** 取多长 */
  durationSec: number;
}

export interface GenerationUnit {
  /** 属于哪个叙事阶段。没归过组就是空字符串 */
  stage: string;
  /** 要向引擎下单生成多长，只能是引擎档位里的数 */
  generateSec: ShotDuration;
  /** 成片里这一段实际用多长，等于组内各刀之和 */
  trimToSec: number;
  /** 组内各刀，按成片顺序。**恒非空**——「不用切」就是只有一刀，下游因此只有一条路径 */
  cuts: UnitCut[];
  /**
   * 这一单元怎么做出来。
   * edit 的那些不由我们生成，只是为了让分镜表和对标镜头一一对得上才占一格；
   * 算「生成了多少秒、浪费多少」时必须把它们排除，那笔钱根本不会花。
   */
  route: ShotRoute;
  /** 组内量准了的实测运镜；量不到就是空 */
  cameraMove: string;
  /**
   * 这一单元量出来的结构，写成给模型看的一句话。空表示一项都没量到——
   * 那就一个字都不提，写占位符模型会拿它当真去编。
   */
  measured: string;
}

/** 这一单元覆盖了对标的哪几镜，按出现顺序去重。 */
export function unitSourceOrders(unit: GenerationUnit): number[] {
  return [...new Set(unit.cuts.map((cut) => cut.sourceShotOrder))];
}

/**
 * 这一镜的机位是不是「量准了」。
 * fixed / moving 是结论，slight 和 unknown 都是「说不好」——后两者不参与冲突判断。
 */
function decisiveMotion(shot: BenchmarkShot): CameraMotion | null {
  const motion = shot.metrics?.cameraMotion;
  return motion === "fixed" || motion === "moving" ? motion : null;
}

/**
 * 一组里第一个量准了机位的镜头；全组都没量准就是第一镜。
 * 取第一镜的话，一组「量不到 + 固定 + 固定」会整组标成「没量到」，白丢一条实测约束。
 */
const decisiveShot = (shots: BenchmarkShot[]) => shots.find((shot) => decisiveMotion(shot)) ?? shots[0];

/**
 * 一组镜头的实测结构写成一句。
 *
 * 机位在组内是一致的（那是并镜的条件之一），所以只说一遍；
 * 而「主体走近多少」各刀不同，逐刀补在后面——并镜之后模型只写一段运动，
 * 得知道这一段里主体是一路走近还是走走停停。
 */
function measuredOf(shots: BenchmarkShot[]): string {
  if (shots.length === 1) return shotMetricsToPrompt(shots[0]);
  const motion = decisiveMotion(decisiveShot(shots));
  const moves = shots
    .map((shot, index) =>
      shot.metrics?.subjectScaleRatio
        ? `第 ${index + 1} 刀主体${describeSubjectScale(shot.metrics.subjectScaleRatio)}`
        : "",
    )
    .filter(Boolean);
  return [motion ? CAMERA_MOTION_PROMPT[motion] : "", ...moves].filter(Boolean).join("；");
}

/**
 * 把 N 刀在生成出来的 G 秒里等距铺开。
 *
 * 第 i 刀从 `已用时长 + i × 间隔` 开始，间隔 = (G − 总用时) ÷ (N−1)。
 * 最后一刀正好收在 G——整段生成都被用上，没有白扔的尾巴。
 * 富余为 0（正好用满）时间隔是 0，退化成连续取，也就没有跳切，这是对的：
 * 没有多余素材就变不出跳切，硬切等于把画面接回它自己。
 */
function spreadCuts(shots: BenchmarkShot[], generateSec: number): UnitCut[] {
  const gap = shots.length > 1 ? Math.max(0, generateSec - totalSec(shots)) / (shots.length - 1) : 0;
  let consumed = 0;
  return shots.map((shot, index) => {
    const fromSec = Math.round((consumed + gap * index) * 100) / 100;
    consumed += shot.durationSec;
    return { sourceShotOrder: shot.order, fromSec, durationSec: shot.durationSec };
  });
}

/**
 * 一组镜头凑成一个单元。
 * 档位怎么挑由 planBenchmarkShot 说了算——那份判据切镜时就在用，两处各写一遍迟早会分叉。
 */
function toUnit(
  shots: BenchmarkShot[],
  stage: string,
  route: ShotRoute,
  ladder: readonly ShotDuration[],
): GenerationUnit {
  const plan = planBenchmarkShot(totalSec(shots), ladder);
  return {
    stage,
    generateSec: plan.generateSec,
    trimToSec: plan.trimToSec,
    cuts: spreadCuts(shots, plan.generateSec),
    route,
    cameraMove: metricsToCameraMove(decisiveShot(shots).metrics),
    measured: measuredOf(shots),
  };
}

/**
 * 比最长档还长的镜头拆成多段接起来。
 *
 * 这条路径以前是靠提示词里写「第 3-1 镜」「第 3-2 镜」让模型多切几行，
 * 而服务端收敛时按位置对回 rhythm.shots——多出来的那几行会把后面每一镜都错位一格。
 * 现在拆成几段就是几个单元，位置天然对得上。
 */
function splitLongShot(
  shot: BenchmarkShot,
  stage: string,
  route: ShotRoute,
  ladder: readonly ShotDuration[],
): GenerationUnit[] {
  const longest = ladder[ladder.length - 1];
  const units: GenerationUnit[] = [];
  let left = shot.durationSec;
  while (left > 0.01) {
    const take = round1(Math.min(left, longest));
    // 每一段当成一个「短了一点的同一镜」走 toUnit，档位和实测结构就只有一套算法。
    // 尾巴那一段因此只占盖得住它的最小档，而不是白占最长档
    units.push(toUnit([{ ...shot, durationSec: take }], stage, route, ladder));
    left = round1(left - take);
  }
  return units;
}

/**
 * 按叙事阶段把节奏模板排成生成单元。
 *
 * 回传通道（片子在别处做好再传回来）没有档位约束，那时不并镜——
 * 并镜的全部理由是「引擎档位比镜头长」，没有档位这件事就不成立，
 * 而并了反倒会把人在外部平台上逐镜跑的活儿搅乱。
 */
export function planGenerationUnits(
  rhythm: BenchmarkRhythm,
  provider: VideoGenProviderId,
): GenerationUnit[] {
  const caps = PROVIDER_CAPS[provider].durations;
  const routes = routeByShot(rhythm.report);
  const nameOfStage = (order: number) => stageOfShot(rhythm.stages, order)?.name ?? "";
  const routeOf = (shot: BenchmarkShot): ShotRoute => routes.get(shot.order) ?? "generate";

  if (!caps.length) {
    // 回传通道的时长按切镜时算好的那份走，不按档位重挑——它压根没有档位
    return rhythm.shots.map((shot) => ({
      ...toUnit([shot], nameOfStage(shot.order), routeOf(shot), [shot.plan.generateSec]),
      generateSec: shot.plan.generateSec,
      trimToSec: shot.plan.trimToSec,
    }));
  }

  const ladder = [...caps].sort((a, b) => a - b);
  const longest = ladder[ladder.length - 1];
  const units: GenerationUnit[] = [];

  /**
   * 攒着的这一组，只存镜头本身。
   * 阶段、路线、机位全部由这几镜现推——另存一份就得在每次 push 之后记得同步，
   * 而那正是「组里有一镜要贴字」这条规则最容易被漏掉的地方。
   */
  let open: BenchmarkShot[] = [];
  /** 组里量准了的那个机位，一组只能有一个；全组都没量准就是 null，谁都能并进来 */
  const openMotion = () => (open.length ? decisiveMotion(decisiveShot(open)) : null);
  /** 组里有一镜要贴字，整组就得贴字。工序是集合不是单值 */
  const openRoute = (): ShotRoute =>
    open.some((shot) => routeOf(shot) === "postfix") ? "postfix" : "generate";
  const flush = () => {
    if (open.length) units.push(toUnit(open, nameOfStage(open[0].order), openRoute(), ladder));
    open = [];
  };

  for (const shot of rhythm.shots) {
    const stage = nameOfStage(shot.order);
    const route = routeOf(shot);

    // 判过路线、且不用切原片，才有资格并进来。没判过的按原样一镜一单元——
    // 不知道就不合并，合错的代价是整段活儿白干
    if (route !== "generate" && route !== "postfix") {
      flush();
      units.push(toUnit([shot], stage, route, ladder));
      continue;
    }
    if (shot.durationSec > longest) {
      flush();
      units.push(...splitLongShot(shot, stage, route, ladder));
      continue;
    }

    const motion = decisiveMotion(shot);
    const held = openMotion();
    const fits =
      open.length > 0 &&
      nameOfStage(open[0].order) === stage &&
      // 机位只有「一个量出固定、一个量出移动」才算冲突
      (!held || !motion || held === motion) &&
      totalSec(open) + shot.durationSec <= longest;
    if (!fits) flush();
    open.push(shot);
  }
  flush();
  return units;
}

/**
 * 并镜省下了多少次生成。界面上要给人看这笔账，不然没人知道为什么镜头数变少了。
 *
 * 只算要我们自己生成的那些：走编辑通道的镜头素材来自原片切片，
 * 把它们的档位算进「生成了多少秒」，报出来的浪费率是一笔根本不会花的钱。
 */
export function describeUnitPlan(units: GenerationUnit[]): string {
  const mine = units.filter((unit) => unit.route !== "edit");
  const shots = units.reduce((sum, unit) => sum + unit.cuts.length, 0);
  const merged = units.filter((unit) => unit.cuts.length > 1).length;
  const generated = mine.reduce((sum, unit) => sum + unit.generateSec, 0);
  const used = mine.reduce((sum, unit) => sum + unit.trimToSec, 0);

  const head = merged
    ? `${shots} 镜并成 ${units.length} 段（${merged} 段是并出来的）`
    : `${shots} 镜排成 ${units.length} 段`;
  const body = generated
    ? `要生成 ${mine.length} 段共 ${Math.round(generated)} 秒、用掉 ${round1(used)} 秒，浪费 ${Math.round((1 - used / generated) * 100)}%`
    : "没有要我们生成的镜头";
  const edit = units.length - mine.length;
  return `${head}，${body}${edit ? `，另有 ${edit} 段走编辑通道` : ""}`;
}
