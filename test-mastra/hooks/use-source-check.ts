"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SourceStatus } from "@/types/inbox";
import type { SourceCheckPhase } from "@/types/dashboard";

export function useSourceCheck(options: { enabled: boolean }): {
  sourceCheckPhase: SourceCheckPhase;
  authGateActive: boolean;
  setAuthGateActive: (active: boolean) => void;
  skippedSources: Set<string>;
  skipSource: (source: string) => void;
  sourceStatuses: Record<string, SourceStatus>;
  authUrls: { url: string; toolName?: string }[];
  markSourceAuthRequired: (toolName: string) => void;
  markAllCheckingAsConnected: () => void;
  addAuthUrl: (url: string, toolName?: string) => void;
  dismissAuthUrl: (url: string) => void;
  resetForNewPlan: () => void;
} {
  const { enabled } = options;

  const [sourceCheckPhase, setSourceCheckPhase] = useState<SourceCheckPhase>("idle");
  const [authGateActive, setAuthGateActive] = useState(false);
  const [skippedSources, setSkippedSources] = useState<Set<string>>(new Set());
  const [sourceStatuses, setSourceStatuses] = useState<Record<string, SourceStatus>>({});
  const [authUrls, setAuthUrls] = useState<{ url: string; toolName?: string }[]>([]);
  const sourceCheckInFlight = useRef(false);
  const initialCheckDone = useRef(false);

  // --- Check source auth status via WhoAmI tools ---
  const checkSources = useCallback(async () => {
    if (sourceCheckInFlight.current) return;
    sourceCheckInFlight.current = true;
    const isInitial = !initialCheckDone.current;
    initialCheckDone.current = true; // mark immediately so re-checks don't re-enter initial path
    if (isInitial) setSourceCheckPhase("checking");
    try {
      const res = await fetch("/api/sources", { method: "POST" });
      if (!res.ok) {
        if (isInitial) setSourceCheckPhase("done");
        return;
      }
      const data = await res.json();
      const statuses: Record<string, SourceStatus> = {};
      const urls: { url: string; toolName?: string }[] = [];
      for (const [source, info] of Object.entries(
        data.sources as Record<string, { status: string; authUrl?: string }>
      )) {
        statuses[source] = info.status as SourceStatus;
        if (info.authUrl) urls.push({ url: info.authUrl, toolName: source });
      }
      setSourceStatuses(statuses);
      setAuthUrls(urls);
      if (isInitial) {
        const hasAuthRequired = Object.values(statuses).some((s) => s === "auth_required");
        if (hasAuthRequired) setAuthGateActive(true);
        setSourceCheckPhase("done");
      }
    } catch {
      if (isInitial) setSourceCheckPhase("done");
    } finally {
      sourceCheckInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    checkSources();
  }, [enabled, checkSources]);

  // Re-check sources when user returns from an auth tab (while gate is active)
  useEffect(() => {
    if (!authGateActive) return;
    const onFocus = () => {
      checkSources();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [authGateActive, checkSources]);

  const skipSource = (source: string) => {
    setSkippedSources((prev) => new Set([...prev, source]));
  };

  const markSourceAuthRequired = useCallback((toolName: string) => {
    setSourceStatuses((prev) => ({ ...prev, [toolName]: "auth_required" }));
  }, []);

  const markAllCheckingAsConnected = useCallback(() => {
    setSourceStatuses((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (next[key] === "checking") next[key] = "connected";
      }
      return next;
    });
  }, []);

  const addAuthUrl = useCallback((url: string, toolName?: string) => {
    setAuthUrls((prev) => (prev.some((a) => a.url === url) ? prev : [...prev, { url, toolName }]));
  }, []);

  const dismissAuthUrl = useCallback((url: string) => {
    setAuthUrls((prev) => prev.filter((a) => a.url !== url));
  }, []);

  const resetForNewPlan = useCallback(() => {
    setAuthUrls([]);
    setSourceStatuses({});
  }, []);

  return {
    sourceCheckPhase,
    authGateActive,
    setAuthGateActive,
    skippedSources,
    skipSource,
    sourceStatuses,
    authUrls,
    markSourceAuthRequired,
    markAllCheckingAsConnected,
    addAuthUrl,
    dismissAuthUrl,
    resetForNewPlan,
  };
}
