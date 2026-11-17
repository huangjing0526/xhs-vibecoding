import type { VideoGenJob } from "./videoGen";

/** Query errors pause tracking; only renderer job states describe generation failure. */
export function startVideoJobPolling({
  jobId,
  query,
  onJob,
  onPause,
  intervalMs,
}: {
  jobId: string;
  query: (id: string, signal: AbortSignal) => Promise<VideoGenJob>;
  onJob: (job: VideoGenJob) => void;
  onPause: (error: unknown) => void;
  intervalMs: number;
}): () => void {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const tick = async () => {
    if (controller.signal.aborted) return;
    try {
      const job = await query(jobId, controller.signal);
      if (controller.signal.aborted) return;
      onJob(job);
      if (!controller.signal.aborted && job.state === "running") timer = setTimeout(() => void tick(), intervalMs);
    } catch (error) {
      if (!controller.signal.aborted) onPause(error);
    }
  };

  void tick();
  return () => {
    controller.abort();
    clearTimeout(timer);
  };
}
