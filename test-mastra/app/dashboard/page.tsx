"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import type { ConfigWarning } from "@/types/dashboard";
import { Header } from "@/components/layout/header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { StatsBar } from "@/components/dashboard/stats-bar";
import { TaskList } from "@/components/dashboard/task-list";
import { SourceAuthGate } from "@/components/dashboard/source-auth-gate";
import { AuthPrompt } from "@/components/dashboard/auth-prompt";
import { useArcadeConnection } from "@/hooks/use-arcade-connection";
import { useSourceCheck } from "@/hooks/use-source-check";
import { usePlanStream } from "@/hooks/use-plan-stream";
import {
  Alert,
  AlertTitle,
  AlertDescription,
  Skeleton,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@arcadeai/design-system";
import { Info, Loader2, ShieldAlert, AlertTriangle, RotateCcw, X } from "lucide-react";

// --- Config health warnings ---

function ConfigWarningBanner({ warnings }: { warnings: ConfigWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="border-b border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
      <div className="mx-auto max-w-4xl space-y-2 px-6 py-3">
        {warnings.map((w) => (
          <div key={w.id} className="flex items-start gap-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <span className="font-semibold text-amber-900 dark:text-amber-200">{w.title}:</span>{" "}
              <span className="text-amber-800 dark:text-amber-300">{w.message}</span>{" "}
              <a
                href={w.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline text-amber-900 hover:text-amber-700 dark:text-amber-200"
              >
                Docs &rarr;
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ArcadeSignInButton({ authUrl }: { authUrl: string }) {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      className="w-full"
      disabled={loading}
      onClick={() => {
        setLoading(true);
        window.location.href = authUrl;
      }}
    >
      {loading ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          Redirecting...
        </>
      ) : (
        "Sign in with Arcade"
      )}
    </Button>
  );
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

  // --- Hooks ---
  const { arcadeStatus, retryConnection } = useArcadeConnection();

  const {
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
  } = useSourceCheck({ enabled: arcadeStatus.state === "connected" });

  const {
    items,
    stats,
    loading,
    error,
    showError,
    activeSource,
    setActiveSource,
    statusMessage,
    planRan,
    resetPlan,
    handlePlan,
  } = usePlanStream({
    onAuthRequired: (url, toolName) => {
      if (toolName) markSourceAuthRequired(toolName);
      addAuthUrl(url, toolName);
    },
    onElicitation: (_elicitationId, authUrl, message) => {
      addAuthUrl(authUrl, message);
    },
    onSourcesDone: markAllCheckingAsConnected,
  });

  // --- Config health check ---
  const [configWarnings, setConfigWarnings] = useState<ConfigWarning[]>([]);

  // --- Dismissible callout state ---
  const [showAgentWorkingCallout, setShowAgentWorkingCallout] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("callout-agent-working") !== "1" : true
  );
  const dismissAgentWorkingCallout = () => {
    localStorage.setItem("callout-agent-working", "1");
    setShowAgentWorkingCallout(false);
  };
  const [showCustomizeCallout, setShowCustomizeCallout] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("callout-customize-agent") !== "1" : true
  );
  const dismissCustomizeCallout = () => {
    localStorage.setItem("callout-customize-agent", "1");
    setShowCustomizeCallout(false);
  };

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((data) => setConfigWarnings(data.warnings ?? []))
      .catch(() => {});
  }, []);

  // --- URL error parameter handling ---
  useEffect(() => {
    if (urlError) {
      const messages: Record<string, string> = {
        auth_incomplete: "Authorization was not completed. Please try connecting again.",
        auth_failed: "Authorization failed. Please try again.",
        gateway_missing:
          "ARCADE_GATEWAY_URL is missing. Create one at https://app.arcade.dev/mcp-gateways, add only the minimum required tools from Slack, Google Calendar, Linear, GitHub, and Gmail, then set ARCADE_GATEWAY_URL in .env.",
        verify_failed: "User verification failed. Please try again.",
        verify_session_required:
          "Verification failed: no session found. If using ngrok, log in through the ngrok URL (not localhost) so the session cookie matches the verifier host.",
      };
      showError(messages[urlError] || `Authentication error: ${urlError}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [urlError, showError]);

  // --- Handlers ---
  const handleLogout = useCallback(async () => {
    await authClient.signOut();
    router.push("/");
  }, [router]);

  // Resets cross-hook state then kicks off a new plan run
  const startPlan = useCallback(() => {
    resetPlan();
    resetForNewPlan();
    handlePlan();
  }, [resetPlan, resetForNewPlan, handlePlan]);

  // --- Computed ---
  const hasItems = items.length > 0;
  const filteredItems = useMemo(
    () => (activeSource !== null ? items.filter((i) => i.source === activeSource) : items),
    [activeSource, items]
  );
  const showEmpty = !hasItems && !loading && !planRan;
  const showNoResults = !hasItems && !loading && planRan && !error;

  // --- Arcade connection gate ---
  if (arcadeStatus.state !== "connected") {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Header onLogout={handleLogout} />
        <ConfigWarningBanner warnings={configWarnings} />
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
                <ArcadeSignInButton authUrl={arcadeStatus.authUrl} />
                <button
                  onClick={retryConnection}
                  className="block w-full text-sm text-muted-foreground hover:text-foreground"
                >
                  I&apos;ve already signed in &mdash; retry
                </button>
                <Alert>
                  <Info className="size-4" />
                  <AlertTitle>Why Arcade?</AlertTitle>
                  <AlertDescription>
                    The agent uses Arcade as an MCP Gateway to read from your tools on your behalf.
                    Signing in here links your Arcade identity so the gateway knows which
                    user&apos;s tools to access. Your{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">ARCADE_API_KEY</code> in{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">.env</code> handles the
                    server-side connection.
                  </AlertDescription>
                </Alert>
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
      <Header onLogout={handleLogout} />
      <ConfigWarningBanner warnings={configWarnings} />

      {/* Source check loading */}
      {sourceCheckPhase !== "done" && (
        <main className="flex flex-1 items-center justify-center px-4">
          <div className="text-center">
            <Loader2 className="mx-auto mb-4 size-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Checking tool permissions...</p>
          </div>
        </main>
      )}

      {/* Pre-flight auth gate */}
      {sourceCheckPhase === "done" && authGateActive && (
        <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-6 py-8">
          <SourceAuthGate
            sourceStatuses={sourceStatuses}
            authUrls={authUrls}
            skippedSources={skippedSources}
            onSkip={skipSource}
            onContinue={() => setAuthGateActive(false)}
          />
        </main>
      )}

      {/* Normal dashboard (source check done, gate dismissed) */}
      {sourceCheckPhase === "done" && !authGateActive && (
        <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-8">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              {error}
            </div>
          )}

          {/* Mid-run auth prompts (fallback for tools not covered by pre-flight) */}
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

          {showEmpty && <EmptyState onPlan={startPlan} loading={loading} />}

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
              <Button size="lg" onClick={startPlan}>
                Try again
              </Button>
            </div>
          )}

          {loading && !hasItems && authUrls.length === 0 && (
            <div className="space-y-6">
              {showAgentWorkingCallout && (
                <Alert>
                  <Info className="size-4" />
                  <AlertTitle className="flex items-center justify-between">
                    What&apos;s happening
                    <button
                      onClick={dismissAgentWorkingCallout}
                      className="ml-2 rounded-sm opacity-70 hover:opacity-100"
                    >
                      <X className="size-3.5" />
                    </button>
                  </AlertTitle>
                  <AlertDescription>
                    The agent is reading from your connected sources and classifying what it finds.
                    This behavior is driven by the system prompt in{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">
                      app/api/plan/route.ts
                    </code>{" "}
                    — edit it to change what gets fetched, how items are prioritized, or what the
                    agent focuses on.
                  </AlertDescription>
                </Alert>
              )}
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
                <Button variant="outline" onClick={startPlan} disabled={loading}>
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
              {showCustomizeCallout && (
                <Alert>
                  <Info className="size-4" />
                  <AlertTitle className="flex items-center justify-between">
                    Make it yours
                    <button
                      onClick={dismissCustomizeCallout}
                      className="ml-2 rounded-sm opacity-70 hover:opacity-100"
                    >
                      <X className="size-3.5" />
                    </button>
                  </AlertTitle>
                  <AlertDescription>
                    Start with the system prompt in{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">
                      app/api/plan/route.ts
                    </code>{" "}
                    — that&apos;s where the agent&apos;s behavior is defined. From there, check out{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">AGENT_PLAYBOOK.md</code>{" "}
                    for a full walkthrough of customization points.
                  </AlertDescription>
                </Alert>
              )}
              <StatsBar
                stats={stats}
                activeSource={activeSource}
                onSourceClick={setActiveSource}
                isLoading={loading}
              />
              <TaskList items={filteredItems} />
            </>
          )}
        </main>
      )}
    </div>
  );
}
