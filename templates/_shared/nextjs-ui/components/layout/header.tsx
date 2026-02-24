'use client'

import { LogOut, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface HeaderProps {
  onChatToggle: () => void
  chatOpen: boolean
  onLogout?: () => void
}

export function Header({ onChatToggle, chatOpen, onLogout }: HeaderProps) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-3">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold">Arcade Agent</h1>
        <span className="text-sm text-muted-foreground">{today}</span>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={onChatToggle}
          aria-label="Toggle chat"
          className={cn(chatOpen && 'bg-accent')}
        >
          <MessageSquare />
        </Button>
        {onLogout && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onLogout}
            aria-label="Logout"
          >
            <LogOut />
          </Button>
        )}
      </div>
    </header>
  )
}
