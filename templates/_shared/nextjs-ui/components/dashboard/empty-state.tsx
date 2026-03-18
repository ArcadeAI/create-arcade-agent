"use client";

import { Inbox, Loader2 } from "lucide-react";
import { Button } from "@arcadeai/design-system";

interface EmptyStateProps {
  onPlan: () => void;
  loading: boolean;
}

export function EmptyState({ onPlan, loading }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <Inbox size={48} className="text-muted-foreground/50" />
      <div className="flex flex-col items-center gap-2">
        {/* CUSTOMIZATION POINT — empty state heading */}
        <h2 className="text-2xl font-semibold">Ready to triage?</h2>
        {/* CUSTOMIZATION POINT — empty state description */}
        <p className="max-w-md text-center text-muted-foreground">
          Your agent will scan your inbox, calendar, tasks, and PRs, then prioritize everything and
          build your action plan.
        </p>
      </div>
      <Button size="lg" disabled={loading} onClick={onPlan}>
        {loading ? (
          <>
            <Loader2 className="animate-spin" />
            Planning...
          </>
        ) : (
          /* CUSTOMIZATION POINT — primary action button label */
          "Plan my day"
        )}
      </Button>
    </div>
  );
}
