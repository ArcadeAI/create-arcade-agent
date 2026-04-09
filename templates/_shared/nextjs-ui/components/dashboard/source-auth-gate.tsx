import { Check, ArrowUpRight, Info } from "lucide-react";
import { Alert, AlertTitle, AlertDescription, Button } from "@arcadeai/design-system";
import type { SourceStatus } from "@/types/inbox";
import { getSource } from "@/lib/sources";

interface SourceAuthGateProps {
  sourceStatuses: Record<string, SourceStatus>;
  authUrls: { url: string; toolName?: string }[];
  skippedSources: Set<string>;
  onSkip: (source: string) => void;
  onContinue: () => void;
}

export function SourceAuthGate({
  sourceStatuses,
  authUrls,
  skippedSources,
  onSkip,
  onContinue,
}: SourceAuthGateProps) {
  const pendingCount = Object.entries(sourceStatuses).filter(
    ([source, status]) => status === "auth_required" && !skippedSources.has(source)
  ).length;

  const canContinue = pendingCount === 0;

  return (
    <div className="w-full max-w-md">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Connect your tools</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The agent uses these tools to build your daily plan. Authorize each one you&apos;d like to
          include, or skip any you want to leave out.
        </p>
      </div>

      <Alert className="mb-6">
        <Info className="size-4" />
        <AlertTitle>Why authorize?</AlertTitle>
        <AlertDescription>
          Each tool connects on your behalf using OAuth — the agent only gets read access to scan
          for items to triage. You can skip any source you don&apos;t use, and revoke access anytime
          from your Arcade dashboard.
        </AlertDescription>
      </Alert>

      <div className="mb-6 space-y-2">
        {Object.entries(sourceStatuses).map(([source, status]) => {
          const config = getSource(source);
          const Icon = config.icon;
          const authUrl = authUrls.find((a) => a.toolName === source)?.url;
          const isSkipped = skippedSources.has(source);
          const effectiveStatus: SourceStatus = isSkipped ? "skipped" : status;

          return (
            <div
              key={source}
              className="flex items-center justify-between rounded-lg border bg-card px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <Icon className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">{config.label}</span>
              </div>

              <div className="flex items-center gap-2">
                {effectiveStatus === "connected" && (
                  <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                    <span className="flex size-4 items-center justify-center rounded-full bg-green-500">
                      <Check className="size-2.5 text-white" strokeWidth={3} />
                    </span>
                    Connected
                  </span>
                )}

                {effectiveStatus === "skipped" && (
                  <span className="text-xs text-muted-foreground">Skipped</span>
                )}

                {effectiveStatus === "auth_required" && authUrl && (
                  <>
                    <Button size="sm" asChild>
                      <a href={authUrl} target="_blank" rel="noopener noreferrer">
                        Authorize
                        <ArrowUpRight className="size-3" />
                      </a>
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onSkip(source)}>
                      Skip
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Button className="w-full" disabled={!canContinue} onClick={onContinue}>
        {canContinue
          ? "Continue"
          : `Authorize or skip ${pendingCount} remaining tool${pendingCount !== 1 ? "s" : ""} to continue`}
      </Button>
    </div>
  );
}
