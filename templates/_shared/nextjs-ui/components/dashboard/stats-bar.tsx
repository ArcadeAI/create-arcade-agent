import type { ComponentType, SVGProps } from "react";
import { LayoutDashboard, Globe } from "lucide-react";
import {
  Slack,
  Github,
  GoogleCalendar,
  Linear,
  Gmail,
} from "@arcadeai/design-system/components/ui/atoms/icons";
import { Card, CardAction, CardHeader, CardTitle } from "@arcadeai/design-system";
import { cn } from "@/lib/utils";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

interface StatsBarProps {
  stats: {
    total: number;
    bySource: Record<string, number>;
  };
}

const sourceIcons: Record<string, { icon: IconComponent; label: string }> = {
  slack: { icon: Slack, label: "Slack" },
  google_calendar: { icon: GoogleCalendar, label: "Calendar" },
  linear: { icon: Linear, label: "Linear" },
  github: { icon: Github, label: "GitHub" },
  gmail: { icon: Gmail, label: "Gmail" },
  other: { icon: Globe, label: "Other" },
};

const gridColsClass: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-5",
  6: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
};

export function StatsBar({ stats }: StatsBarProps) {
  const activeSources = Object.entries(stats.bySource).filter(([, count]) => count > 0);
  const cardCount = 1 + activeSources.length; // "Total" + per-source
  const gridClass = gridColsClass[Math.min(cardCount, 6)] || gridColsClass[6];

  return (
    <div className={cn("grid gap-4", gridClass)}>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
          <CardAction>
            <LayoutDashboard className="size-5 text-muted-foreground" />
          </CardAction>
          <p className={cn("text-3xl font-bold", stats.total === 0 && "text-muted-foreground")}>
            {stats.total}
          </p>
        </CardHeader>
      </Card>

      {activeSources.map(([source, count]) => {
        const config = sourceIcons[source] || sourceIcons.other;
        const Icon = config.icon;
        return (
          <Card key={source}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {config.label}
              </CardTitle>
              <CardAction>
                <Icon className="size-5" />
              </CardAction>
              <p className="text-3xl font-bold">{count}</p>
            </CardHeader>
          </Card>
        );
      })}
    </div>
  );
}
