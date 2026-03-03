import type { ComponentType, SVGProps } from "react";
import { LayoutDashboard, Globe } from "lucide-react";
import {
  Slack,
  Github,
  GoogleCalendar,
  Linear,
  Gmail,
} from "@arcadeai/design-system/components/ui/atoms/icons";
import { Card, CardHeader, CardTitle } from "@arcadeai/design-system";
import { cn } from "@/lib/utils";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

interface StatsBarProps {
  stats: {
    total: number;
    bySource: Record<string, number>;
  };
  activeSource: string | null;
  onSourceClick: (source: string | null) => void;
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

function StatCard({
  label,
  count,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  count: number;
  icon: IconComponent;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md",
        active && "ring-2 ring-primary"
      )}
      onClick={onClick}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
          <Icon className="size-5 text-muted-foreground" />
        </div>
        <p className={cn("text-3xl font-bold", count === 0 && "text-muted-foreground")}>{count}</p>
      </CardHeader>
    </Card>
  );
}

export function StatsBar({ stats, activeSource, onSourceClick }: StatsBarProps) {
  const activeSources = Object.entries(stats.bySource).filter(([, count]) => count > 0);
  const cardCount = 1 + activeSources.length;
  const gridClass = gridColsClass[Math.min(cardCount, 6)] || gridColsClass[6];

  return (
    <div className={cn("grid gap-4", gridClass)}>
      <StatCard
        label="Total"
        count={stats.total}
        icon={LayoutDashboard}
        active={activeSource === null}
        onClick={() => onSourceClick(null)}
      />
      {activeSources.map(([source, count]) => {
        const config = sourceIcons[source] || sourceIcons.other;
        return (
          <StatCard
            key={source}
            label={config.label}
            count={count}
            icon={config.icon}
            active={activeSource === source}
            onClick={() => onSourceClick(activeSource === source ? null : source)}
          />
        );
      })}
    </div>
  );
}
