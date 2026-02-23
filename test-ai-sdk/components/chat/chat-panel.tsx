'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { SendHorizontal } from 'lucide-react'

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Message } from '@/components/chat/message'

interface ChatPanelProps {
  open: boolean
  onClose: () => void
}

export function ChatPanel({ open, onClose }: ChatPanelProps) {
  const [chatError, setChatError] = useState<string | null>(null)
  const { messages, sendMessage, status, error } = useChat({
    onError: (err) => {
      setChatError(err.message || 'Something went wrong')
    },
  })
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const busy = status === 'submitted' || status === 'streaming'

  useEffect(() => {
    if (error) setChatError(error.message)
  }, [error])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || busy) return
    setChatError(null)
    setInput('')
    sendMessage({ text })
  }

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent
        side="right"
        className="w-[400px] sm:w-[450px] flex flex-col"
      >
        <SheetHeader>
          <SheetTitle>Chat with your day</SheetTitle>
          <SheetDescription>
            Ask questions about your tasks and priorities
          </SheetDescription>
        </SheetHeader>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto space-y-3 py-4"
        >
          {chatError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              {chatError}
            </div>
          )}
          {messages.map((msg) => {
            const textContent =
              msg.parts
                ?.filter(
                  (p): p is Extract<typeof p, { type: 'text' }> =>
                    p.type === 'text'
                )
                .map((p) => p.text)
                .join('') || ''

            if (!textContent) return null

            return (
              <Message
                key={msg.id}
                role={msg.role as 'user' | 'assistant'}
                content={textContent}
              />
            )
          })}
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 border-t pt-4 px-1"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your day..."
            className="flex-1"
          />
          <Button
            type="submit"
            size="icon"
            disabled={busy || !input.trim()}
            aria-label="Send message"
          >
            <SendHorizontal className="size-4" />
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
