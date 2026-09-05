import type { AreaId } from "@/lib/capabilities";
import {
  BUILT_IN_IMAGE_TEMPLATES,
  loadCustomImageTemplates,
  type ImageFactoryTemplate,
  type ImageTemplateThumb,
} from "@/lib/imageFactory";
import { CAST_SLOTS, describeRhythm, shotTone, type BenchmarkRhythm, type ShotTone } from "@/lib/videoFactory";
import { listBenchmarkRhythms } from "@/lib/workflowClient";

/**
 * 「模板」的单一事实源。
 *
 * 模板 = 可复刻的范例，三件事缺一不可：样例（长什么样）、结构（怎么构成的）、槽位（要你补什么）。
 * 出图模板和拆来的视频结构本是同一种东西，只是数据形状不同——把「怎么读一张模板」收在这里之后，
 * 目录页只管画卡片、工作台只管按 kind 分发，谁都不用知道一共有几种模板。
 *
 * 加第三类（道库/笔记结构）时要改的只有两处：TemplateKind 加一个字面量，
 * 这里加一个 xxxTemplateCards() 来源函数。目录页和路由都不用动。
 */

export type TemplateKind = "image" | "rhythm";

/** 节奏条的一根：高度是它在这条片子里的时长占比，颜色是它有多快。 */
export interface TemplateBar {
  /** 0-100 的百分比，已经算好，渲染时不要再遍历一遍全部镜头 */
  height: number;
  tone: ShotTone;
}

interface TemplateCardBase {
  id: string;
  name: string;
  /** 结构摘要：这张范例是怎么构成的 */
  description: string;
  /** 目录里的分区名 */
  category: string;
  /** 复刻它要你补的自有素材，卡片上直说，不等点进去才提 */
  slots: string[];
}

export interface ImageTemplateCard extends TemplateCardBase {
  kind: "image";
  preview?: string;
  thumb?: ImageTemplateThumb;
  template: ImageFactoryTemplate;
}

export interface RhythmTemplateCard extends TemplateCardBase {
  kind: "rhythm";
  bars: TemplateBar[];
  /** 整条带过去，工厂就不用拿 id 再查一遍库——那次查询失败会让「照这个做」无声地什么都不做 */
  rhythm: BenchmarkRhythm;
}

export type TemplateCard = ImageTemplateCard | RhythmTemplateCard;

/** 「照这个做」把人送进哪个工厂。 */
export function templateTarget(card: TemplateCard): AreaId {
  return card.kind === "rhythm" ? "videoFactory" : "images";
}

/** 视频结构模板单独成区，排在出图模板之后。 */
export const RHYTHM_CATEGORY = "视频结构";

/**
 * 节奏条最多画这么多根。
 * 超出的不画也不参与算高度——按看不见的那根去缩放，会把看得见的全压扁。
 */
const MAX_BARS = 32;

/** 复刻一条视频结构要补的东西：选题，加上角色/产品/场景那几个参考位。由 CAST_SLOTS 派生，不手写。 */
const RHYTHM_SLOTS = ["选题", ...CAST_SLOTS.map((slot) => slot.label)];

export function toImageTemplateCard(template: ImageFactoryTemplate): ImageTemplateCard {
  return {
    kind: "image",
    id: template.id,
    name: template.name,
    description: template.description,
    category: template.category,
    slots: template.slots.filter((slot) => slot.required).map((slot) => slot.label),
    preview: template.preview,
    thumb: template.thumb,
    template,
  };
}

export function toRhythmTemplateCard(rhythm: BenchmarkRhythm): RhythmTemplateCard {
  const shots = rhythm.shots.slice(0, MAX_BARS);
  const longest = shots.reduce((max, shot) => Math.max(max, shot.durationSec), 0) || 1;
  return {
    kind: "rhythm",
    id: rhythm.id,
    name: rhythm.sourceLabel,
    description: describeRhythm(rhythm),
    category: RHYTHM_CATEGORY,
    slots: RHYTHM_SLOTS,
    bars: shots.map((shot) => ({
      height: Math.max(12, (shot.durationSec / longest) * 100),
      tone: shotTone(shot),
    })),
    rhythm,
  };
}

/** 内置 + 自建的出图模板。自建的存在本机浏览器里，所以这个函数只能在挂载后调。 */
export function imageTemplateCards(): ImageTemplateCard[] {
  return [...BUILT_IN_IMAGE_TEMPLATES, ...loadCustomImageTemplates()].map(toImageTemplateCard);
}

/** 拆来的视频结构，存在本机磁盘上。 */
export async function rhythmTemplateCards(): Promise<RhythmTemplateCard[]> {
  const { rhythms } = await listBenchmarkRhythms();
  return rhythms.map(toRhythmTemplateCard);
}
