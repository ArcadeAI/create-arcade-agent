"use client";

import { useCallback, useRef, useState } from "react";
import type { InboxItem, PlanEvent, SourceStatus } from "@/types/inbox";

export function usePlanStream(options: {
  setSourceStatuses: React.Dispatch<React.SetStateAction<Record<string, SourceStatus>>>;
  setAuthUrls: React.Dispatch<React.SetStateAction<{ url: string; toolName?: string }[]>>;
}): {
  items: InboxItem[];
  stats: { total: number; bySource: Record<string, number> };
  loading: boolean;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  activeSource: string | null;
  setActiveSource: React.Dispatch<React.SetStateAction<string | null>>;
  statusMessage: string | null;
  planRan: boolean;
  setPlanRan: React.Dispatch<React.SetStateAction<boolean>>;
  handlePlan: () => Promise<void>;
} {
  const { setSourceStatuses, setAuthUrls } = options;

  const [items, setItems] = useState<InboxItem[]>([]);
  const [stats, setStats] = useState<{ total: number; bySource: Record<string, number> }>({
    total: 0,
    bySource: {},
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [planRan, setPlanRan] = useState(false);

  const handlePlan = useCallback(async () => {
    setLoading(true);
    setError(null);
    setItems([]);
    setStats({ total: 0, bySource: {} });
    setAuthUrls([]);
    setStatusMessage(null);
    setSourceStatuses({});

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Plan request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as PlanEvent;
            switch (event.type) {
              case "task":
                setItems((prev) => [...prev, event.data]);
                break;
              case "summary":
                setStats({
                  total: event.data.total,
                  bySource: event.data.bySource,
                });
                break;
              case "auth_required":
                setAuthUrls((prev) =>
                  prev.some((a) => a.url === event.authUrl)
                    ? prev
                    : [...prev, { url: event.authUrl, toolName: event.toolName }]
                );
                if (event.toolName) {
                  setSourceStatuses((prev) => ({ ...prev, [event.toolName!]: "auth_required" }));
                }
                break;
              case "status":
                setStatusMessage(event.message);
                break;
              case "error":
                setError(event.message);
                break;
              case "done":
                setSourceStatuses((prev) => {
                  const next = { ...prev };
                  for (const key of Object.keys(next)) {
                    if (next[key] === "checking") next[key] = "connected";
                  }
                  return next;
                });
                break;
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    } finally {
      setLoading(false);
      setStatusMessage(null);
      setPlanRan(true);
    }
  }, [setSourceStatuses, setAuthUrls]);

  return {
    items,
    stats,
    loading,
    error,
    setError,
    activeSource,
    setActiveSource,
    statusMessage,
    planRan,
    setPlanRan,
    handlePlan,
  };
}
