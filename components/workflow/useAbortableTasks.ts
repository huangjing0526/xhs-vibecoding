"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * 按 key 管理可取消的长任务（各类 AI 生成）。
 * 同一个 key 再次 start 会先中止上一次——重复点「生成」不会留下孤儿请求。
 * 组件卸载时统一中止，避免离开页面后回调仍在写已卸载组件的 state。
 */
export function useAbortableTasks() {
  const controllers = useRef(new Map<string, AbortController>());

  const start = useCallback((key: string): AbortSignal => {
    controllers.current.get(key)?.abort();
    const controller = new AbortController();
    controllers.current.set(key, controller);
    return controller.signal;
  }, []);

  const finish = useCallback((key: string) => {
    controllers.current.delete(key);
  }, []);

  const cancel = useCallback((key: string) => {
    controllers.current.get(key)?.abort();
    controllers.current.delete(key);
  }, []);

  useEffect(() => {
    const map = controllers.current;
    return () => map.forEach((controller) => controller.abort());
  }, []);

  return { start, finish, cancel };
}
