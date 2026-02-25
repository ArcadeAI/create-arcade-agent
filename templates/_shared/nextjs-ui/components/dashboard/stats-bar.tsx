import {
  MessageSquare,
  Calendar,
  GitPullRequest,
  CheckSquare,
  Mail,
  Globe,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatsBarProps {
  stats: {
    total: number;
    bySource: Record<string, number>;
  };
}

const sourceIcons: Record<string, { icon: LucideIcon; label: string }> = {
  slack: { icon: MessageSquare, label: "Slack" },
  google_calendar: { icon: Calendar, label: "Calendar" },
  linear: { icon: CheckSquare, label: "Linear" },
  github: { icon: GitPullRequest, label: "GitHub" },
  gmail: { icon: Mail, label: "Gmail" },
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
            <LayoutDashboard size={20} className="text-muted-foreground" />
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
                <Icon size={20} className="text-muted-foreground" />
              </CardAction>
              <p className="text-3xl font-bold">{count}</p>
            </CardHeader>
          </Card>
        );
      })}
    </div>
  );
}
