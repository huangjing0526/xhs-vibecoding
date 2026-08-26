"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import { BookmarkPlus, Download, Loader2, Play, Sparkles, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import ModalOverlay from "@/components/ui/ModalOverlay";
import SegmentedControl from "@/components/workflow/SegmentedControl";
import { groupInOrder } from "@/lib/collections";
import { LIBRARY_COPY, LIBRARY_KINDS } from "@/lib/imageFactory/libraries";
import type { AnyWork, ImageWork, VideoWork } from "@/lib/works";
import { deleteWork, listWorks, saveLibraryAssets } from "@/lib/workflowClient";
import type { Notice } from "./types";

/**
 * 作品：本机跑出来的全部产出——图片工厂的图和视频工厂的成片都在这里。
 *
 * 和资产库的分工是「产出 vs 输入」——这里是刚跑完的结果，按时间倒着翻；
 * 觉得某张图值得反复用，就在大图里「存入资产库」，它才成为下次生成能取用的素材。
 * 视频成片归项目所有（clips 以盘上为准），删除和重跑都在视频工厂里做，这里只看、只下载。
 */

const ALL = "";

type KindFilter = "" | "image" | "video";

const KIND_OPTIONS: Array<{ value: KindFilter; label: string }> = [
  { value: ALL, label: "全部" },
  { value: "image", label: "图片" },
  { value: "video", label: "视频" },
];

export default function WorksLibrary({ onNotice }: { onNotice: (notice: Notice) => void }) {
  const [works, setWorks] = useState<AnyWork[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>(ALL);
  const [templateFilter, setTemplateFilter] = useState(ALL);
  const [zoomed, setZoomed] = useState<AnyWork | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const { works: loaded } = await listWorks();
      setWorks(loaded);
    } catch (error) {
      console.error("[WorksLibrary] 作品读取失败", { action: "works.list", error });
      setErrorMessage(error instanceof Error ? error.message : "作品读取失败");
      setWorks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (work: ImageWork) => {
    try {
      await deleteWork(work.jobId, work.dir);
      setWorks((current) => current.filter((item) => item.id !== work.id));
      setZoomed((current) => (current?.id === work.id ? null : current));
      onNotice({ type: "success", message: "已删除这件作品" });
    } catch (error) {
      console.error("[WorksLibrary] 作品删除失败", { action: "works.delete", workId: work.id, error });
      onNotice({ type: "error", message: error instanceof Error ? error.message : "作品删除失败" });
    }
  };

  // 筛选条按模板给，不按分类——翻自己跑过的图时想的是「那张白底图呢」，不是「那是哪一类」。
  // 模板只属于图片，视频按项目归属，所以这里只看图片作品。
  const templates = useMemo(() => {
    const images = works.filter((work): work is ImageWork => work.kind === "image");
    return groupInOrder(images, (work) => work.templateId).map((group) => ({
      id: group.key,
      name: group.items[0].templateName,
      count: group.items.length,
    }));
  }, [works]);
  const imageCount = templates.reduce((total, template) => total + template.count, 0);

  // 「模板筛选只属于图片」只写这一处：切到视频时它自动失效，切回图片又自动恢复，不靠 setState 互相修正
  const activeTemplate = kindFilter === "video" ? ALL : templateFilter;
  const visible = works.filter(
    (work) =>
      (!kindFilter || work.kind === kindFilter) &&
      (!activeTemplate || (work.kind === "image" && work.templateId === activeTemplate))
  );
  const days = groupInOrder(visible, (work) => work.createdAt.slice(0, 10));

  return (
    <div className="mt-6 space-y-4">
      {errorMessage && <Callout tone="danger">{errorMessage}</Callout>}

      <SegmentedControl value={kindFilter} onChange={setKindFilter} ariaLabel="按产出类型筛选" options={KIND_OPTIONS} compact />

      {kindFilter !== "video" && templates.length > 0 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <FilterChip label="全部" count={imageCount} active={activeTemplate === ALL} onClick={() => setTemplateFilter(ALL)} />
          {templates.map((template) => (
            <FilterChip
              key={template.id}
              label={template.name}
              count={template.count}
              active={activeTemplate === template.id}
              onClick={() => setTemplateFilter(template.id)}
            />
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-xs text-faint">
          <Loader2 size={14} className="animate-spin" />
          正在读取作品
        </div>
      ) : days.length === 0 ? (
        <EmptyState
          icon={<Sparkles size={22} />}
          title={works.length === 0 ? "还没有作品" : "这个筛选下没有产出"}
          description={
            works.length === 0
              ? "去图片工厂或视频工厂跑一次，产出会自动留在本机，之后都能在这里翻出来。"
              : "换个筛选看看，或点「全部」看所有产出。"
          }
        />
      ) : (
        days.map((day) => (
          <Card key={day.key}>
            <h2 className="text-[15px] font-bold text-ink">
              {day.key}
              <span className="ml-2 text-[11px] font-normal text-faint">{day.items.length} 件</span>
            </h2>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
              {day.items.map((work) =>
                work.kind === "image" ? (
                  <WorkThumb key={work.id} work={work} onOpen={setZoomed} onDelete={handleDelete} />
                ) : (
                  <VideoThumb key={work.id} work={work} onOpen={setZoomed} />
                )
              )}
            </div>
          </Card>
        ))
      )}

      {zoomed?.kind === "image" && (
        <WorkDetail
          work={zoomed}
          onClose={() => setZoomed(null)}
          onDelete={() => handleDelete(zoomed)}
          onNotice={onNotice}
        />
      )}
      {zoomed?.kind === "video" && <VideoDetail work={zoomed} onClose={() => setZoomed(null)} />}
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${
        active ? "border-brand-400 bg-brand-50 text-brand-700" : "border-line bg-surface text-muted hover:border-brand-300 hover:text-ink"
      }`}
    >
      {label}
      <span className={`ml-1.5 font-normal ${active ? "text-brand-500" : "text-faint"}`}>{count}</span>
    </button>
  );
}

/** 下载文件名：日期 + 模板 + 视角，落到本地一眼认得出。 */
function downloadName(work: ImageWork): string {
  const view = work.viewLabel ? `-${work.viewLabel}` : "";
  const extension = work.file.slice(work.file.lastIndexOf("."));
  return `${work.createdAt.slice(0, 10)}-${work.templateName}${view}${extension}`;
}

/** 视频下载名：日期 + 项目 + 镜号，同一条片子的各镜排在一起。 */
function videoDownloadName(work: VideoWork): string {
  return `${work.createdAt.slice(0, 10)}-${work.projectTitle}-第${work.shotOrder}镜.mp4`;
}

/** 详情里的生成时间：到分钟。 */
function formatWorkTime(createdAt: string): string {
  return createdAt.replace("T", " ").slice(0, 16);
}

/** 缩略卡右上角的悬浮动作：下载 + 可选的额外按钮。两种卡共用同一份悬浮时机与样式。 */
function ThumbActions({
  href,
  download,
  label,
  children,
}: {
  href: string;
  download: string;
  label: string;
  children?: ReactNode;
}) {
  return (
    <div className="pointer-events-none absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
      <a
        href={href}
        download={download}
        onClick={(event) => event.stopPropagation()}
        className="rounded-lg bg-black/55 p-1.5 text-white"
        aria-label={`下载${label}`}
      >
        <Download size={12} />
      </a>
      {children}
    </div>
  );
}

function WorkThumb({
  work,
  onOpen,
  onDelete,
}: {
  work: ImageWork;
  onOpen: (work: ImageWork) => void;
  onDelete: (work: ImageWork) => void;
}) {
  const label = work.viewLabel || work.templateName;
  return (
    <div className="group overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="relative aspect-square bg-soft">
        <button type="button" onClick={() => onOpen(work)} className="absolute inset-0" aria-label={`看大图：${label}`}>
          <Image src={work.imageUrl} alt={label} fill sizes="200px" className="object-cover" unoptimized />
        </button>
        <ThumbActions href={work.imageUrl} download={downloadName(work)} label={label}>
          <button
            type="button"
            onClick={() => onDelete(work)}
            className="rounded-lg bg-black/55 p-1.5 text-white hover:bg-danger"
            aria-label={`删除${label}`}
          >
            <Trash2 size={12} />
          </button>
        </ThumbActions>
      </div>
      <div className="truncate px-2 py-1.5 text-[11px] font-bold text-muted">{label}</div>
    </div>
  );
}

/** 视频缩略卡：首帧当封面（preload=metadata 不拉整条片子），角标写时长。没有删除——成片归项目所有。 */
function VideoThumb({ work, onOpen }: { work: VideoWork; onOpen: (work: VideoWork) => void }) {
  const label = `${work.projectTitle} · 第${work.shotOrder}镜`;
  return (
    <div className="group overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="relative aspect-square bg-soft">
        <button type="button" onClick={() => onOpen(work)} className="absolute inset-0" aria-label={`播放：${label}`}>
          {/* #t=0.1 让浏览器在 preload=metadata 下真的把首帧画出来，否则格子常是黑的 */}
          <video src={`${work.videoUrl}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-black/45 p-2 text-white opacity-80 transition-opacity group-hover:opacity-100">
              <Play size={14} fill="currentColor" aria-hidden="true" />
            </span>
          </span>
        </button>
        <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white">
          {work.durationSec}s
        </span>
        <ThumbActions href={work.videoUrl} download={videoDownloadName(work)} label={label} />
      </div>
      <div className="truncate px-2 py-1.5 text-[11px] font-bold text-muted">{label}</div>
    </div>
  );
}

/**
 * 一件作品的大图与来历。
 * 元数据不是装饰：跑出一张满意的图之后，想再跑一张同样的，靠的就是这里的引擎、模型与补充要求。
 */
function WorkDetail({
  work,
  onClose,
  onDelete,
  onNotice,
}: {
  work: ImageWork;
  onClose: () => void;
  onDelete: () => void;
  onNotice: (notice: Notice) => void;
}) {
  // 能存进哪些库跟着资产库那张表走，那边加一种库这里自动跟上
  const [kind, setKind] = useState(LIBRARY_KINDS[0]);
  const [name, setName] = useState("");
  const [traits, setTraits] = useState("");
  const [saving, setSaving] = useState(false);

  const copy = LIBRARY_COPY[kind];

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      onNotice({ type: "error", message: `先给它起个名字再存入${copy.label}` });
      return;
    }
    setSaving(true);
    try {
      await saveLibraryAssets(kind, [
        {
          sourcePath: work.outputPath,
          name: trimmed,
          sourceLabel: work.viewLabel || work.templateName,
          traits: traits.trim(),
        },
      ]);
      onNotice({ type: "success", message: `已存入${copy.label}` });
      setName("");
      setTraits("");
    } catch (error) {
      console.error("[WorksLibrary] 存入资产库失败", { action: "works.saveToLibrary", kind, workId: work.id, error });
      onNotice({ type: "error", message: error instanceof Error ? error.message : `存入${copy.label}失败` });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose} maxWidthClass="max-w-3xl" ariaLabel={`${work.templateName}大图`}>
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-ink">{work.templateName}</h2>
            <p className="mt-0.5 text-xs text-faint">
              {work.viewLabel ? `${work.viewLabel} · ` : ""}
              {work.category || "未分类"} · {work.aspectRatio}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <a
              href={work.imageUrl}
              download={downloadName(work)}
              className="rounded-xl px-2.5 py-1.5 text-[11px] font-bold text-brand-600 hover:bg-brand-50"
            >
              下载原图
            </a>
            <button
              type="button"
              onClick={onDelete}
              className="rounded-xl px-2.5 py-1.5 text-[11px] font-bold text-faint hover:text-danger"
            >
              删除
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(260px,0.75fr)]">
          <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-soft">
            <Image src={work.imageUrl} alt={work.viewLabel || work.templateName} fill sizes="600px" className="object-contain" unoptimized />
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl bg-soft p-3">
              <h3 className="text-xs font-bold text-muted">这张是怎么跑出来的</h3>
              <dl className="mt-2 space-y-1.5 text-[11px] leading-5">
                <MetaRow label="生成时间" value={formatWorkTime(work.createdAt)} />
                <MetaRow label="引擎" value={work.provider} />
                <MetaRow label="模型" value={work.model || "跟随 CLI 默认"} />
                {work.customPrompt && <MetaRow label="补充要求" value={work.customPrompt} />}
              </dl>
            </div>

            <div className="rounded-2xl border border-line p-3">
              <h3 className="flex items-center gap-1.5 text-xs font-bold text-muted">
                <BookmarkPlus size={13} />
                存入资产库
              </h3>
              <p className="mt-1 text-[11px] leading-4 text-faint">存进去之后，下次生成能直接取用它锁住同一个主体。</p>
              <div className="mt-2.5 flex gap-1.5">
                {LIBRARY_KINDS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setKind(item)}
                    aria-pressed={kind === item}
                    className={`rounded-xl border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                      kind === item
                        ? "border-brand-400 bg-brand-50 text-brand-700"
                        : "border-line bg-surface text-muted hover:border-brand-300"
                    }`}
                  >
                    {LIBRARY_COPY[item].label}
                  </button>
                ))}
              </div>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="起个名字，同名的算同一个主体"
                className="mt-2 w-full rounded-xl border border-line bg-soft px-3 py-2 text-xs text-ink outline-none transition focus:border-brand-300 focus:bg-surface"
              />
              <input
                value={traits}
                onChange={(event) => setTraits(event.target.value)}
                placeholder={copy.traitsPlaceholder}
                className="mt-1.5 w-full rounded-xl border border-line bg-soft px-3 py-2 text-xs text-ink outline-none transition focus:border-brand-300 focus:bg-surface"
              />
              <Button onClick={save} loading={saving} size="sm" block className="mt-2">
                {saving ? "存入中" : `存入${copy.label}`}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </ModalOverlay>
  );
}

/** 一段成片的播放与来历。删除和重跑不在这里——成片归项目所有，动它去视频工厂。 */
function VideoDetail({ work, onClose }: { work: VideoWork; onClose: () => void }) {
  return (
    <ModalOverlay onClose={onClose} maxWidthClass="max-w-3xl" ariaLabel={`${work.projectTitle}成片`}>
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-ink">{work.projectTitle}</h2>
            <p className="mt-0.5 text-xs text-faint">
              第{work.shotOrder}镜 · {work.durationSec} 秒{work.resolution ? ` · ${work.resolution}` : ""}
            </p>
          </div>
          <a
            href={work.videoUrl}
            download={videoDownloadName(work)}
            className="shrink-0 rounded-xl px-2.5 py-1.5 text-[11px] font-bold text-brand-600 hover:bg-brand-50"
          >
            下载成片
          </a>
        </div>

        <div className="mt-3 overflow-hidden rounded-2xl bg-black">
          <video src={work.videoUrl} controls autoPlay playsInline className="max-h-[60vh] w-full" />
        </div>

        <div className="mt-3 rounded-2xl bg-soft p-3">
          <h3 className="text-xs font-bold text-muted">这一镜是怎么跑出来的</h3>
          <dl className="mt-2 space-y-1.5 text-[11px] leading-5">
            <MetaRow label="生成时间" value={formatWorkTime(work.createdAt)} />
            <MetaRow label="引擎" value={work.provider} />
            <MetaRow label="所属项目" value={work.projectTitle} />
          </dl>
        </div>
      </Card>
    </ModalOverlay>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-14 shrink-0 text-faint">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-muted">{value}</dd>
    </div>
  );
}
