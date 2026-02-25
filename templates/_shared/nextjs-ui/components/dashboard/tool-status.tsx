import {
  MessageSquare,
  Calendar,
  GitPullRequest,
  CheckSquare,
  Globe,
  Check,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SourceStatus } from "@/types/inbox";

interface ToolStatusBarProps {
  statuses: Record<string, SourceStatus>;
  authUrls: { url: string; toolName?: string }[];
}

const sourceConfig: Record<string, { icon: LucideIcon; label: string }> = {
  slack: { icon: MessageSquare, label: "Slack" },
  google: { icon: Calendar, label: "Google" },
  linear: { icon: CheckSquare, label: "Linear" },
  github: { icon: GitPullRequest, label: "GitHub" },
  other: { icon: Globe, label: "Other" },
};

const sourceToProvider: Record<string, string> = {
  slack: "slack",
  google_calendar: "google",
  gmail: "google",
  linear: "linear",
  github: "github",
};

const providerOrder = ["slack", "google", "linear", "github"];

function StatusDot({ status }: { status: SourceStatus }) {
  if (status === "checking") {
    return <Loader2 className="size-2.5 animate-spin text-muted-foreground" />;
  }
  if (status === "connected") {
    return (
      <span className="flex size-2.5 items-center justify-center rounded-full bg-green-500">
        <Check className="size-1.5 text-white" strokeWidth={3} />
      </span>
    );
  }
  if (status === "auth_required") {
    return <span className="size-2.5 rounded-full bg-amber-500" />;
  }
  return <span className="size-2.5 rounded-full bg-gray-300" />;
}

export function ToolStatusBar({ statuses, authUrls }: ToolStatusBarProps) {
  const providerStatuses: Record<string, SourceStatus[]> = {};
  for (const [source, status] of Object.entries(statuses)) {
    const provider = sourceToProvider[source] || "other";
    providerStatuses[provider] = providerStatuses[provider] || [];
    providerStatuses[provider].push(status);
  }

  const aggregateStatus = (all: SourceStatus[]): SourceStatus => {
    if (all.some((status) => status === "auth_required")) return "auth_required";
    if (all.some((status) => status === "checking")) return "checking";
    if (all.some((status) => status === "connected")) return "connected";
    return "unknown";
  };

  const providerAuthUrls = new Map<string, string>();
  for (const auth of authUrls) {
    if (!auth.toolName) continue;
    const provider = sourceToProvider[auth.toolName] || auth.toolName;
    if (!providerAuthUrls.has(provider)) {
      providerAuthUrls.set(provider, auth.url);
    }
  }

  const entries = Object.entries(providerStatuses)
    .map(([provider, sourceList]) => [provider, aggregateStatus(sourceList)] as const)
    .sort(([a], [b]) => {
      const aIndex = providerOrder.indexOf(a);
      const bIndex = providerOrder.indexOf(b);
      return (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) -
        (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex);
    });
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span className="font-medium">Sources:</span>
      {entries.map(([provider, status]) => {
        const config = sourceConfig[provider] || sourceConfig.other;
        const Icon = config.icon;
        const authUrl = status === "auth_required" ? providerAuthUrls.get(provider) : undefined;

        const pill = (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors",
              status === "connected" &&
                "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950",
              status === "auth_required" &&
                "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950",
              (status === "checking" || status === "unknown") && "border-border bg-muted"
            )}
          >
            <Icon className="size-3" />
            <span>{config.label}</span>
            <StatusDot status={status} />
          </span>
        );

        if (authUrl) {
          return (
            <a
              key={provider}
              href={authUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="hover:opacity-80 transition-opacity"
              title={`Authorize ${config.label}`}
            >
              {pill}
            </a>
          );
        }

        return <span key={provider}>{pill}</span>;
      })}
    </div>
  );
}
