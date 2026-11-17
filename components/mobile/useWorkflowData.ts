"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DEMO_SNAPSHOT } from "@/lib/demoWorkflow";
import { getUsableDrafts, getUsableTopics } from "@/lib/snapshotMerge";
import {
  getWorkflowBootstrap,
  syncWorkflowData,
  type WorkflowBootstrapResult,
  type WorkflowMode,
  type WorkflowSnapshot,
} from "@/lib/workflowClient";
import type { ContentCard, DraftNote } from "@/lib/xhsWorkflow";

type WorkflowConfig = WorkflowBootstrapResult["config"] | null;

const EMPTY_SNAPSHOT: WorkflowSnapshot = {
  materials: [],
  glossary: [],
  topics: [],
  drafts: [],
  metrics: [],
};

interface CachedData {
  mode: WorkflowMode;
  config: WorkflowConfig;
  snapshot: WorkflowSnapshot;
}

/**
 * 移动端各 tab 是独立路由，来回切会重新挂载。把上一次结果留在模块级，
 * 免得每次回首页都空屏重拉一遍飞书——要新数据时用户会自己下拉「同步」。
 */
let cached: CachedData | null = null;

export interface MobileWorkflowData extends CachedData {
  /** 过滤掉占位/空壳后的可用列表，与桌面工作台同口径 */
  topics: ContentCard[];
  drafts: DraftNote[];
  loading: boolean;
  reload: () => Promise<void>;
}

/** 移动端的工作流数据入口：启动读 bootstrap，连上飞书就拉快照，否则走 Demo。 */
export function useWorkflowData(): MobileWorkflowData {
  const [data, setData] = useState<CachedData>(
    () => cached ?? { mode: "demo", config: null, snapshot: EMPTY_SNAPSHOT }
  );
  const [loading, setLoading] = useState(!cached);

  const apply = useCallback((next: CachedData) => {
    cached = next;
    setData(next);
  }, []);

  const load = useCallback(
    async (silent: boolean) => {
      setLoading(true);
      try {
        const bootstrap = await getWorkflowBootstrap();

        if (bootstrap.mode === "demo") {
          apply({
            mode: "demo",
            config: bootstrap.config,
            snapshot: bootstrap.snapshot || DEMO_SNAPSHOT,
          });
          if (!silent) toast.success("已加载 Demo 数据，不会写入飞书");
          return;
        }

        const snapshot = await syncWorkflowData();
        apply({ mode: "connected", config: bootstrap.config, snapshot });
        if (!silent) toast.success("飞书数据已同步");
      } catch (error) {
        console.error("[mobile/useWorkflowData] 工作流数据加载失败", {
          action: "mobile.workflow.load",
          mode: cached?.mode ?? "unknown",
          error,
        });
        apply({ mode: "demo", config: cached?.config ?? null, snapshot: DEMO_SNAPSHOT });
        toast.error(error instanceof Error ? error.message : "数据加载失败，已切换 Demo 模式");
      } finally {
        setLoading(false);
      }
    },
    [apply]
  );

  useEffect(() => {
    // 有缓存就直接用，首次进入才走网络
    if (cached) return;
    void load(true);
  }, [load]);

  const topics = useMemo(() => getUsableTopics(data.snapshot.topics), [data.snapshot.topics]);
  const drafts = useMemo(() => getUsableDrafts(data.snapshot.drafts), [data.snapshot.drafts]);
  const reload = useCallback(() => load(false), [load]);

  return { ...data, topics, drafts, loading, reload };
}

/** 一篇笔记对应的草稿（一稿多投时取第一条）。列表与能力页共用这个口径。 */
export function findDraftForTopic(drafts: DraftNote[], topic: ContentCard | null): DraftNote | null {
  if (!topic) return null;
  return drafts.find((draft) => draft.topicId === topic.topicId) ?? null;
}
