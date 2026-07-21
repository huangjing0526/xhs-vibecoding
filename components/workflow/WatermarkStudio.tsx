"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// 视频去水印工具页：UI 在这里，重活（LaMa 模型逐帧修复）在本机的
// 去水印服务里（clip-pipeline/watermark-webui，端口 8765）。该服务
// 依赖本机 GPU 与模型文件，不进 Cloudflare 部署——与 video-renderer 同款架构。
const SERVICE = "http://127.0.0.1:8765";

type JobState = "ready" | "queued" | "processing" | "done" | "error";
interface WatermarkJob {
  id: string;
  name: string;
  mode: string;
  state: JobState;
  progress: number;
  stage: string;
  error: string | null;
  box: number[] | null;
  /** 前端本地记忆的类型选择，未开始前可改 */
  modeSel?: string;
}

const MODES: Array<[string, string]> = [
  ["auto", "自动识别"],
  ["doubao", "豆包（四角游走文字）"],
  ["static", "静态水印（Veo 星标 / 固定字）"],
];

function stateText(j: WatermarkJob): string {
  if (j.state === "ready") return "待开始";
  if (j.state === "queued") return "排队中";
  if (j.state === "processing") return j.stage;
  if (j.state === "done") return "✓ 完成";
  return "出错";
}

export default function WatermarkStudio() {
  const [serviceUp, setServiceUp] = useState<boolean | null>(null);
  const [jobs, setJobs] = useState<Record<string, WatermarkJob>>({});
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [boxJobId, setBoxJobId] = useState<string | null>(null);
  const [cmpJobId, setCmpJobId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  // 服务探活 + 任务轮询（服务不在时降频重试）
  useEffect(() => {
    let stop = false;
    let up = true;
    const tick = async () => {
      try {
        const r = await fetch(`${SERVICE}/api/jobs`, { signal: AbortSignal.timeout(2000) });
        const list: WatermarkJob[] = await r.json();
        if (stop) return;
        up = true;
        setServiceUp(true);
        setJobs((prev) => {
          const next: Record<string, WatermarkJob> = {};
          for (const j of list) next[j.id] = { ...prev[j.id], ...j, modeSel: prev[j.id]?.modeSel };
          return next;
        });
      } catch {
        up = false;
        if (!stop) setServiceUp(false);
      }
      if (!stop) setTimeout(tick, up ? 1500 : 4000);
    };
    tick();
    return () => {
      stop = true;
    };
  }, []);

  const upload = useCallback(async (files: FileList | File[]) => {
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        if (!/\.(mp4|mov)$/i.test(f.name)) continue;
        const r = await fetch(`${SERVICE}/api/upload?name=${encodeURIComponent(f.name)}`, {
          method: "POST",
          body: f,
        });
        const j: WatermarkJob = await r.json();
        setJobs((prev) => ({ ...prev, [j.id]: j }));
      }
    } finally {
      setUploading(false);
    }
  }, []);

  const start = useCallback(async (id: string) => {
    const j = jobsRef.current[id];
    await fetch(`${SERVICE}/api/jobs/${id}/start`, {
      method: "POST",
      body: JSON.stringify({ mode: j?.modeSel || j?.mode || "auto", box: j?.box || null }),
    });
  }, []);

  // ---------- 服务未启动的引导 ----------
  if (serviceUp === false) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line-strong bg-white py-16 text-center">
        <p className="text-sm font-semibold text-ink">本机去水印服务未启动</p>
        <p className="max-w-md text-sm text-muted">
          去水印用到本机的 AI 修复模型，需要先启动本地服务：双击桌面上的
          <span className="mx-1 font-semibold text-ink">「去水印工作台.command」</span>
          ，看到启动提示后回到这里即可（本页会自动重连）。
        </p>
      </div>
    );
  }

  const jobList = Object.values(jobs);

  return (
    <div className="space-y-4">
      {/* 拖入区 */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          upload(e.dataTransfer.files);
        }}
        className={`cursor-pointer rounded-xl border border-dashed px-6 py-10 text-center transition-colors ${
          dragOver ? "border-[#FF2442] bg-[#FFF5F6]" : "border-line-strong bg-white"
        }`}
      >
        <p className="text-sm font-semibold text-ink">
          {uploading ? "上传中…" : "把视频拖到这里，或点击选择文件"}
        </p>
        <p className="mt-1 text-xs text-faint">支持 mp4 / mov，可一次拖入多个，按顺序排队处理</p>
        <input
          ref={fileRef}
          type="file"
          accept="video/mp4,video/quicktime"
          multiple
          hidden
          onChange={(e) => e.target.files && upload(e.target.files)}
        />
      </div>

      {/* 任务列表 */}
      {jobList.map((j) => (
        <div key={j.id} className="rounded-xl border border-line bg-white p-4">
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink" title={j.name}>
              {j.name}
            </span>
            <span
              className={`shrink-0 text-xs font-semibold ${
                j.state === "done" ? "text-[#34C759]" : j.state === "error" ? "text-[#FF2442]" : "text-faint"
              }`}
            >
              {stateText(j)}
            </span>
          </div>

          {/* 类型选择 */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {MODES.map(([v, t]) => {
              const busy = j.state === "processing" || j.state === "queued";
              const active = (j.modeSel || j.mode || "auto") === v;
              return (
                <button
                  key={v}
                  type="button"
                  disabled={busy}
                  onClick={() => setJobs((prev) => ({ ...prev, [j.id]: { ...prev[j.id], modeSel: v } }))}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-40 ${
                    active
                      ? "border-[#FF2442] font-semibold text-[#FF2442]"
                      : "border-line text-muted hover:border-line-strong"
                  }`}
                >
                  {t}
                </button>
              );
            })}
            {j.box && <span className="text-xs font-semibold text-[#FF2442]">已框选区域 ✓</span>}
          </div>

          {/* 进度 */}
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#F2F2F7]">
            <div
              className="h-full rounded-full bg-ink transition-[width] duration-500"
              style={{ width: `${j.progress || 0}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-xs text-faint">
            <span>{j.state === "error" ? "" : `${j.progress || 0}%`}</span>
            {j.state === "error" && <span className="text-[#FF2442]">{j.error}</span>}
          </div>

          {/* 操作 */}
          <div className="mt-3 flex flex-wrap gap-2">
            {(j.state === "ready" || j.state === "error") && (
              <>
                <button
                  type="button"
                  onClick={() => start(j.id)}
                  className="rounded-2xl bg-ink px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-black"
                >
                  开始处理
                </button>
                <button
                  type="button"
                  onClick={() => setBoxJobId(j.id)}
                  className="rounded-2xl border border-line px-4 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-line-strong"
                >
                  框选水印
                </button>
              </>
            )}
            {j.state === "done" && (
              <>
                <button
                  type="button"
                  onClick={() => setCmpJobId(j.id)}
                  className="rounded-2xl bg-ink px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-black"
                >
                  对比查看
                </button>
                <a
                  href={`${SERVICE}/api/media/${j.id}/result`}
                  download={j.name.replace(/\.(mp4|mov)$/i, "_去水印.mp4")}
                  className="rounded-2xl border border-line px-4 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-line-strong"
                >
                  下载成品
                </a>
                <a
                  href={`${SERVICE}/api/mask/${j.id}?r=${Date.now()}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-2xl border border-line px-4 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-line-strong"
                >
                  识别区域
                </a>
                <button
                  type="button"
                  onClick={() => start(j.id)}
                  className="rounded-2xl border border-line px-4 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-line-strong"
                >
                  重新处理
                </button>
              </>
            )}
          </div>
        </div>
      ))}

      {boxJobId && (
        <BoxSelectModal
          jobId={boxJobId}
          initial={jobs[boxJobId]?.box || null}
          onClose={() => setBoxJobId(null)}
          onSave={(box) => {
            setJobs((prev) => ({ ...prev, [boxJobId]: { ...prev[boxJobId], box } }));
            setBoxJobId(null);
          }}
        />
      )}
      {cmpJobId && <CompareModal jobId={cmpJobId} onClose={() => setCmpJobId(null)} />}
    </div>
  );
}

// 框选水印弹窗：抽一帧画面，鼠标拖矩形，坐标换算回视频原始分辨率
function BoxSelectModal({
  jobId,
  initial,
  onClose,
  onSave,
}: {
  jobId: string;
  initial: number[] | null;
  onClose: () => void;
  onSave: (box: number[] | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [rect, setRect] = useState<number[] | null>(initial);
  const dragStart = useRef<[number, number] | null>(null);

  const draw = useCallback(
    (r: number[] | null) => {
      const canvas = canvasRef.current;
      const img = imgRef.current;
      if (!canvas || !img) return;
      const scale = Math.min(1, Math.min(window.innerWidth * 0.8, 860) / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.dataset.scale = String(scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      if (r) {
        ctx.strokeStyle = "#FF2442";
        ctx.lineWidth = 2;
        ctx.strokeRect(r[0] * scale, r[1] * scale, (r[2] - r[0]) * scale, (r[3] - r[1]) * scale);
      }
    },
    []
  );

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      draw(initial);
    };
    img.src = `${SERVICE}/api/frame/${jobId}?t=1&r=${Date.now()}`;
    // 只在打开时抽帧一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] overflow-auto rounded-xl bg-white p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-bold text-ink">框选水印区域</h3>
        <p className="mb-3 mt-1 text-xs text-muted">按住鼠标拖出一个矩形框住水印，稍微框大一点没关系。</p>
        <canvas
          ref={canvasRef}
          className="block max-w-full cursor-crosshair rounded-2xl"
          onPointerDown={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            dragStart.current = [e.clientX - r.left, e.clientY - r.top];
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!dragStart.current) return;
            const el = e.currentTarget;
            const r = el.getBoundingClientRect();
            const s = parseFloat(el.dataset.scale || "1");
            const cur: [number, number] = [e.clientX - r.left, e.clientY - r.top];
            const box = [
              Math.min(dragStart.current[0], cur[0]) / s,
              Math.min(dragStart.current[1], cur[1]) / s,
              Math.max(dragStart.current[0], cur[0]) / s,
              Math.max(dragStart.current[1], cur[1]) / s,
            ].map(Math.round);
            setRect(box);
            draw(box);
          }}
          onPointerUp={() => {
            dragStart.current = null;
          }}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setRect(null);
              draw(null);
            }}
            className="rounded-2xl border border-line px-4 py-1.5 text-xs font-semibold text-muted"
          >
            清除框选
          </button>
          <button
            type="button"
            onClick={() => onSave(rect)}
            className="rounded-2xl bg-ink px-4 py-1.5 text-xs font-semibold text-white"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

// 处理前后对比弹窗：并排播放原片与成品
function CompareModal({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const origRef = useRef<HTMLVideoElement>(null);
  const newRef = useRef<HTMLVideoElement>(null);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-xl bg-white p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-bold text-ink">处理前后对比</h3>
        <p className="mb-3 mt-1 text-xs text-muted">重点看水印原来出现的位置。</p>
        <div className="flex flex-wrap gap-3">
          <figure className="min-w-[260px] flex-1">
            <figcaption className="mb-1 text-xs text-faint">处理前</figcaption>
            <video ref={origRef} src={`${SERVICE}/api/media/${jobId}/orig`} controls muted className="w-full rounded-2xl bg-black" />
          </figure>
          <figure className="min-w-[260px] flex-1">
            <figcaption className="mb-1 text-xs text-faint">处理后</figcaption>
            <video ref={newRef} src={`${SERVICE}/api/media/${jobId}/result`} controls className="w-full rounded-2xl bg-black" />
          </figure>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              for (const v of [origRef.current, newRef.current]) {
                if (v) {
                  v.currentTime = 0;
                  v.play();
                }
              }
            }}
            className="rounded-2xl bg-ink px-4 py-1.5 text-xs font-semibold text-white"
          >
            同步播放
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-line px-4 py-1.5 text-xs font-semibold text-muted"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
