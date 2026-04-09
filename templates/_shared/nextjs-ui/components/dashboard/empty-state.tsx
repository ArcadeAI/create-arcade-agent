"use client";

import { useState } from "react";
import { Inbox, Info, Loader2, X } from "lucide-react";
import { Alert, AlertTitle, AlertDescription, Button } from "@arcadeai/design-system";

const CALLOUT_KEY = "callout-how-planning-works";

interface EmptyStateProps {
  onPlan: () => void;
  loading: boolean;
}

export function EmptyState({ onPlan, loading }: EmptyStateProps) {
  const [showCallout, setShowCallout] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem(CALLOUT_KEY) !== "1" : true
  );
  const dismissCallout = () => {
    localStorage.setItem(CALLOUT_KEY, "1");
    setShowCallout(false);
  };

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
      {showCallout && (
        <Alert className="max-w-md">
          <Info className="size-4" />
          <AlertTitle className="flex items-center justify-between">
            How this works
            <button
              onClick={dismissCallout}
              className="ml-2 rounded-sm opacity-70 hover:opacity-100"
            >
              <X className="size-3.5" />
            </button>
          </AlertTitle>
          <AlertDescription>
            When you click &ldquo;Plan my day&rdquo;, the agent connects to your Slack, Gmail,
            Google Calendar, Linear, and GitHub through Arcade&apos;s MCP Gateway. It will first
            check if any of those need authentication — if so, you&apos;ll be prompted to authorize
            before the run starts. Then it reads your recent messages, emails, events, issues, and
            pull requests, and classifies each item by priority and suggests next steps.
          </AlertDescription>
        </Alert>
      )}
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
