"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { InboxItem, PlanEvent, SourceStatus } from "@/types/inbox";
import { Header } from "@/components/layout/header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { StatsBar } from "@/components/dashboard/stats-bar";
import { TaskList } from "@/components/dashboard/task-list";
import { ToolStatusBar } from "@/components/dashboard/tool-status";
import { ChatPanel } from "@/components/chat/chat-panel";
import { AuthPrompt } from "@/components/chat/auth-prompt";
import { Skeleton, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arcadeai/design-system";
import { Loader2, ShieldAlert, AlertTriangle, RotateCcw } from "lucide-react";

// --- Arcade connection state machine ---

type ArcadeStatus =
  | { state: "checking" }
  | { state: "needs_auth"; authUrl: string }
  | { state: "connected" }
  | { state: "error"; message: string };

function parseArcadeResponse(data: {
  connected?: boolean;
  authUrl?: string;
  error?: string;
}): ArcadeStatus {
  if (data.connected) return { state: "connected" };
  if (data.authUrl) return { state: "needs_auth", authUrl: data.authUrl };
  return {
    state: "error",
    message: data.error || "Could not connect to Arcade Gateway.",
  };
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");

  // --- Arcade connection ---
  const [arcadeStatus, setArcadeStatus] = useState<ArcadeStatus>({
    state: "checking",
  });
  const connectInFlight = useRef(false);
  const authInProgress = useRef(false);
  const lastCheckRef = useRef(0);

  useEffect(() => {
    const doConnect = async () => {
      if (connectInFlight.current || authInProgress.current) return;
      lastCheckRef.current = Date.now();
      connectInFlight.current = true;
      try {
        const r = await fetch("/api/auth/arcade/connect", { method: "POST" });
        if (r.status === 401) {
          router.push("/");
          return;
        }
        const data = await r.json();
        const status = parseArcadeResponse(data);
        authInProgress.current = status.state === "needs_auth";
        setArcadeStatus(status);
      } catch {
        setArcadeStatus({
          state: "error",
          message: "Failed to check Arcade connection.",
        });
      } finally {
        connectInFlight.current = false;
      }
    };

    doConnect();
    const onFocus = () => {
      if (Date.now() - lastCheckRef.current < 2000) return;
      authInProgress.current = false; // User returned from OAuth tab — re-check
      doConnect();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [router]);

  const retryConnection = () => {
    if (connectInFlight.current) return;
    authInProgress.current = false;
    setArcadeStatus({ state: "checking" });
    connectInFlight.current = true;
    fetch("/api/auth/arcade/connect", { method: "POST" })
      .then((r) => {
        if (r.status === 401) {
          router.push("/");
          return;
        }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        const status = parseArcadeResponse(data);
        authInProgress.current = status.state === "needs_auth";
        setArcadeStatus(status);
      })
      .catch(() =>
        setArcadeStatus({
          state: "error",
          message: "Failed to check Arcade connection.",
        })
      )
      .finally(() => {
        connectInFlight.current = false;
      });
  };

  useEffect(() => {
    if (urlError) {
      const messages: Record<string, string> = {
        auth_incomplete: "Authorization was not completed. Please try connecting again.",
        auth_failed: "Authorization failed. Please try again.",
        gateway_missing:
          "ARCADE_GATEWAY_URL is missing. Create one at https://app.arcade.dev/mcp-gateways, add only the minimum required tools from Slack, Google Calendar, Linear, GitHub, and Gmail, then set ARCADE_GATEWAY_URL in .env.",
        verify_failed: "User verification failed. Please try again.",
      };
      setError(messages[urlError] || `Authentication error: ${urlError}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [urlError]);

  // --- Plan / triage state ---
  const [items, setItems] = useState<InboxItem[]>([]);
  const [stats, setStats] = useState<{ total: number; bySource: Record<string, number> }>({
    total: 0,
    bySource: {},
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [authUrls, setAuthUrls] = useState<{ url: string; toolName?: string }[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [planRan, setPlanRan] = useState(false);
  const [sourceStatuses, setSourceStatuses] = useState<Record<string, SourceStatus>>({});

  // --- Check source auth status via WhoAmI tools ---
  const checkSources = useCallback(async () => {
    try {
      const res = await fetch("/api/sources", { method: "POST" });
      if (!res.ok) return;
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
    } catch {
      // Silent — sources will still be checked when plan runs
    }
  }, []);

  useEffect(() => {
    if (arcadeStatus.state !== "connected") return;
    checkSources();
  }, [arcadeStatus.state, checkSources]);

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
              case "sources":
                setSourceStatuses(
                  Object.fromEntries(
                    event.sources.map((s: string) => [s, "checking" as SourceStatus])
                  )
                );
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
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  };

  const dismissAuthUrl = (url: string) => {
    setAuthUrls((prev) => prev.filter((a) => a.url !== url));
    // Re-check sources — user may have just authorized
    checkSources();
  };

  const hasItems = items.length > 0;
  const showEmpty = !hasItems && !loading && !planRan && authUrls.length === 0;
  const showNoResults = !hasItems && !loading && planRan && authUrls.length === 0 && !error;

  // --- Arcade connection gate ---
  if (arcadeStatus.state !== "connected") {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Header onChatToggle={() => {}} chatOpen={false} onLogout={handleLogout} />
        <main className="flex flex-1 items-center justify-center px-4">
          {arcadeStatus.state === "checking" && (
            <div className="text-center">
              <Loader2 className="mx-auto mb-4 size-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Connecting to Arcade...</p>
            </div>
          )}

          {arcadeStatus.state === "needs_auth" && (
            <Card className="max-w-md text-center">
              <CardHeader>
                <div className="mx-auto mb-2">
                  <ShieldAlert className="size-10 text-primary" />
                </div>
                <CardTitle>Connect to Arcade</CardTitle>
                <CardDescription>
                  Sign in with your Arcade account to give the agent access to your tools.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button asChild className="w-full">
                  <a href={arcadeStatus.authUrl}>Sign in with Arcade</a>
                </Button>
                <button
                  onClick={retryConnection}
                  className="block w-full text-sm text-muted-foreground hover:text-foreground"
                >
                  I&apos;ve already signed in &mdash; retry
                </button>
              </CardContent>
            </Card>
          )}

          {arcadeStatus.state === "error" && (
            <Card className="max-w-md text-center">
              <CardHeader>
                <div className="mx-auto mb-2">
                  <AlertTriangle className="size-10 text-destructive" />
                </div>
                <CardTitle className="text-destructive">Connection Failed</CardTitle>
                <CardDescription>{arcadeStatus.message}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={retryConnection} className="w-full">
                  Retry
                </Button>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    );
  }

  // --- Connected: show dashboard ---
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header
        onChatToggle={() => setChatOpen((o) => !o)}
        chatOpen={chatOpen}
        onLogout={handleLogout}
      />

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-8">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        )}

        {Object.keys(sourceStatuses).length > 0 && (
          <ToolStatusBar statuses={sourceStatuses} authUrls={authUrls} />
        )}

        {authUrls.length > 0 && (
          <div className="space-y-3">
            {authUrls.map((auth) => (
              <AuthPrompt
                key={auth.url}
                toolName={auth.toolName || "Service"}
                authUrl={auth.url}
                onContinue={() => dismissAuthUrl(auth.url)}
              />
            ))}
          </div>
        )}

        {loading && statusMessage && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {statusMessage}
          </div>
        )}

        {showEmpty && <EmptyState onPlan={handlePlan} loading={loading} />}

        {showNoResults && (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
            <AlertTriangle size={48} className="text-muted-foreground/50" />
            <div className="flex flex-col items-center gap-2">
              <h2 className="text-2xl font-semibold">No items found</h2>
              <p className="max-w-md text-center text-muted-foreground">
                The agent finished scanning but didn&apos;t find any items to triage. This can
                happen if tools need authorization or if there&apos;s no recent activity.
              </p>
            </div>
            <Button
              size="lg"
              onClick={() => {
                setPlanRan(false);
                handlePlan();
              }}
            >
              Try again
            </Button>
          </div>
        )}

        {loading && !hasItems && authUrls.length === 0 && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          </div>
        )}

        {hasItems && (
          <>
            <div className="flex justify-end">
              <Button variant="outline" onClick={handlePlan} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Replanning...
                  </>
                ) : (
                  <>
                    <RotateCcw className="size-4" />
                    Replan my day
                  </>
                )}
              </Button>
            </div>
            <StatsBar stats={stats} />
            <TaskList items={items} />
          </>
        )}
      </main>

      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}
