import {
  MessageSquare,
  Calendar,
  GitPullRequest,
  CheckSquare,
  Mail,
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
  google_calendar: { icon: Calendar, label: "Calendar" },
  linear: { icon: CheckSquare, label: "Linear" },
  github: { icon: GitPullRequest, label: "GitHub" },
  gmail: { icon: Mail, label: "Gmail" },
  other: { icon: Globe, label: "Other" },
};

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
  const entries = Object.entries(statuses);
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span className="font-medium">Sources:</span>
      {entries.map(([source, status]) => {
        const config = sourceConfig[source] || sourceConfig.other;
        const Icon = config.icon;
        const authUrl =
          status === "auth_required" ? authUrls.find((a) => a.toolName === source)?.url : undefined;

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
              key={source}
              href={authUrl}
              className="hover:opacity-80 transition-opacity"
              title={`Authorize ${config.label}`}
            >
              {pill}
            </a>
          );
        }

        return <span key={source}>{pill}</span>;
      })}
    </div>
  );
}
