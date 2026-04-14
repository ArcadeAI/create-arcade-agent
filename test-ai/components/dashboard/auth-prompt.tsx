"use client";

import { useState } from "react";
import { ShieldAlert, Loader2 } from "lucide-react";
import { Button } from "@arcadeai/design-system";

interface AuthPromptProps {
  toolName: string;
  authUrl: string;
  onContinue: () => void;
}

export function AuthPrompt({ toolName, authUrl, onContinue }: AuthPromptProps) {
  const [clicked, setClicked] = useState(false);

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
      <div className="flex items-center gap-2 mb-2">
        <ShieldAlert className="size-5 text-amber-600 dark:text-amber-400" />
        <h3 className="font-semibold text-sm">Authorization required</h3>
      </div>
      <p className="text-muted-foreground mb-3 text-xs">{toolName} needs permission to continue.</p>
      {clicked ? (
        <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
          <Loader2 className="size-3.5 animate-spin" />
          Waiting for authorization&hellip; the agent will resume automatically.
        </div>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" asChild onClick={() => setClicked(true)}>
            <a href={authUrl} target="_blank" rel="noopener noreferrer">
              Authorize
            </a>
          </Button>
          <Button size="sm" variant="outline" onClick={onContinue}>
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}
