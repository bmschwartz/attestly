"use client";

import { useCallback, useRef, useState } from "react";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function useAutoSave(
  saveFn: (questionId: string, value: string) => Promise<void>,
  debounceMs = 1500,
) {
  const timers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const pendingCount = useRef(0);
  const [status, setStatus] = useState<SaveStatus>("idle");

  const save = useCallback(
    (questionId: string, value: string) => {
      const existing = timers.current.get(questionId);
      if (existing) clearTimeout(existing);

      setStatus("saving");

      const timer = setTimeout(async () => {
        timers.current.delete(questionId);
        pendingCount.current += 1;
        try {
          await saveFn(questionId, value);
          pendingCount.current -= 1;
          if (pendingCount.current === 0) {
            setStatus("saved");
          }
        } catch {
          pendingCount.current -= 1;
          setStatus("error");
        }
      }, debounceMs);

      timers.current.set(questionId, timer);
    },
    [saveFn, debounceMs],
  );

  const flushAll = useCallback(async () => {
    // Clear all pending timers and trigger saves immediately
    const entries = Array.from(timers.current.entries());
    for (const [, timer] of entries) {
      clearTimeout(timer);
    }
    timers.current.clear();
  }, []);

  return { save, flushAll, status };
}
