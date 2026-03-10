import type { ComponentType, SVGProps } from "react";
import {
  Slack,
  Github,
  GoogleCalendar,
  Linear,
  Gmail,
} from "@arcadeai/design-system/components/ui/atoms/icons";
import { Globe } from "lucide-react";

export type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

export interface SourceConfig {
  icon: IconComponent;
  label: string;
  className: string;
  /** Regex that matches tool names belonging to this source (e.g. "Slack_ListMessages") */
  pattern: RegExp;
}

// ──────────────────────────────────────────────
// CUSTOMIZATION POINT — add new sources here
// ──────────────────────────────────────────────
export const sources: Record<string, SourceConfig> = {
  slack: {
    pattern: /^slack[._]/i,
    icon: Slack,
    label: "Slack",
    className:
      "bg-purple-100 border-purple-200 text-purple-900 dark:bg-purple-950 dark:border-purple-900 dark:text-purple-200",
  },
  google_calendar: {
    pattern: /^(google|googlecalendar|calendar)[._]/i,
    icon: GoogleCalendar,
    label: "Calendar",
    className:
      "bg-blue-100 border-blue-200 text-blue-900 dark:bg-blue-950 dark:border-blue-900 dark:text-blue-200",
  },
  linear: {
    pattern: /^linear[._]/i,
    icon: Linear,
    label: "Linear",
    className:
      "bg-indigo-100 border-indigo-200 text-indigo-900 dark:bg-indigo-950 dark:border-indigo-900 dark:text-indigo-200",
  },
  github: {
    pattern: /^git(hub)?[._]/i,
    icon: Github,
    label: "GitHub",
    className:
      "bg-gray-100 border-gray-300 text-gray-900 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200",
  },
  gmail: {
    pattern: /^gmail[._]/i,
    icon: Gmail,
    label: "Gmail",
    className:
      "bg-red-100 border-red-200 text-red-900 dark:bg-red-950 dark:border-red-900 dark:text-red-200",
  },
};

const defaultSource: Omit<SourceConfig, "pattern"> = {
  icon: Globe,
  label: "Other",
  className:
    "bg-gray-100 border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300",
};

/** Look up source config by key, with fallback for unknown sources. */
export function getSource(key: string): Omit<SourceConfig, "pattern"> {
  if (sources[key]) return sources[key];
  return {
    ...defaultSource,
    label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  };
}

/** Map a tool name (e.g. "Slack_ListConversations") to a source key. */
export function mapToolToSource(toolName?: string): string {
  if (!toolName) return "other";
  for (const [key, config] of Object.entries(sources)) {
    if (config.pattern.test(toolName)) return key;
  }
  const namespace = toolName.split(/[._]/)[0];
  return namespace ? namespace.toLowerCase() : "other";
}
