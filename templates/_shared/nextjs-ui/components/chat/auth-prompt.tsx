'use client'

import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface AuthPromptProps {
  toolName: string
  authUrl: string
  onContinue: () => void
}

export function AuthPrompt({ toolName, authUrl, onContinue }: AuthPromptProps) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
      <div className="flex items-center gap-2 mb-2">
        <ShieldAlert className="size-5 text-amber-600 dark:text-amber-400" />
        <h3 className="font-semibold text-sm">Authorization required</h3>
      </div>
      <p className="text-muted-foreground mb-3 text-xs">
        The tool <span className="font-mono">{toolName}</span> needs permission to continue.
      </p>
      <div className="flex gap-2">
        <Button size="sm" asChild>
          <a href={authUrl}>
            Authorize
          </a>
        </Button>
        <Button size="sm" variant="outline" onClick={onContinue}>
          Continue
        </Button>
      </div>
    </div>
  )
}
