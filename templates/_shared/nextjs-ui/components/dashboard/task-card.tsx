"use client";

import { Card, CardContent, Badge } from "@arcadeai/design-system";
import type { InboxItem, ItemSource } from "@/types/inbox";
import {
  MessageSquare,
  Calendar,
  GitPullRequest,
  CheckSquare,
  Mail,
  Globe,
  type LucideIcon,
} from "lucide-react";

const sourceConfig: Record<ItemSource, { icon: LucideIcon; label: string; className: string }> = {
  slack: {
    icon: MessageSquare,
    label: "Slack",
    className: "bg-purple-100 text-purple-700 border-purple-200",
  },
  google_calendar: {
    icon: Calendar,
    label: "Calendar",
    className: "bg-blue-100 text-blue-700 border-blue-200",
  },
  linear: {
    icon: CheckSquare,
    label: "Linear",
    className: "bg-indigo-100 text-indigo-700 border-indigo-200",
  },
  github: {
    icon: GitPullRequest,
    label: "GitHub",
    className: "bg-gray-100 text-gray-700 border-gray-300",
  },
  gmail: {
    icon: Mail,
    label: "Gmail",
    className: "bg-red-100 text-red-700 border-red-200",
  },
  other: {
    icon: Globe,
    label: "Other",
    className: "bg-gray-100 text-gray-600 border-gray-200",
  },
};

const priorityConfig: Record<
  InboxItem["priority"],
  { label: string; variant: "destructive" | "secondary" | "outline"; className?: string }
> = {
  P0: { label: "P0", variant: "destructive" },
  P1: {
    label: "P1",
    variant: "secondary",
    className: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  },
  P2: { label: "P2", variant: "secondary" },
  FYI: { label: "FYI", variant: "outline" },
};

const categoryLabels: Record<InboxItem["category"], string> = {
  NEEDS_REPLY: "Needs Reply",
  NEEDS_FEEDBACK: "Needs Feedback",
  NEEDS_DECISION: "Needs Decision",
  NEEDS_REVIEW: "Needs Review",
  ATTEND: "Attend",
  FYI: "FYI",
  IGNORE: "Ignore",
};

interface TaskCardProps {
  item: InboxItem;
}

export function TaskCard({ item }: TaskCardProps) {
  const priority = priorityConfig[item.priority];
  const source = sourceConfig[item.source] || sourceConfig.other;
  const SourceIcon = source.icon;
  const subtitle = item.sourceDetail || item.participants?.map((p) => p.name).join(", ");

  const formattedTime = item.scheduledTime
    ? new Date(item.scheduledTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <Card className="animate-card-in transition-shadow hover:shadow-md">
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={source.className}>
            <SourceIcon className="mr-1 size-3" />
            {source.label}
          </Badge>
          <Badge variant={priority.variant} className={priority.className}>
            {priority.label}
          </Badge>
          <Badge variant="outline">{categoryLabels[item.category] || item.category}</Badge>
          {formattedTime && (
            <span className="text-xs font-medium text-blue-600">{formattedTime}</span>
          )}
          <span className="ml-auto text-xs text-muted-foreground">{item.effort}</span>
        </div>

        {item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm font-medium leading-snug hover:underline"
          >
            {item.summary}
          </a>
        ) : (
          <p className="text-sm font-medium leading-snug">{item.summary}</p>
        )}

        <div className="flex items-baseline justify-between gap-4">
          {subtitle && <span className="truncate text-xs text-muted-foreground">{subtitle}</span>}
          <span className="shrink-0 text-xs italic text-muted-foreground">
            {item.suggestedNextStep}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
