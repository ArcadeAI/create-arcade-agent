'use client'

import { Loader2, Check } from 'lucide-react'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'

interface ToolCallProps {
  toolName: string
  args: Record<string, unknown>
  result?: Record<string, unknown>
  status: 'running' | 'done'
}

export function ToolCall({ toolName, args, result, status }: ToolCallProps) {
  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="tool-call" className="border-b-0">
        <AccordionTrigger className="py-2">
          <span className="flex items-center gap-2">
            <span className="font-mono text-xs">{toolName}</span>
            <Badge variant={status === 'done' ? 'secondary' : 'outline'}>
              {status === 'running' ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Check className="size-3" />
              )}
              {status === 'running' ? 'Running' : 'Done'}
            </Badge>
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-2">
            <div>
              <p className="text-muted-foreground mb-1 text-xs font-medium">Input</p>
              <pre className="bg-muted rounded-md p-2 font-mono text-xs overflow-x-auto">
                {JSON.stringify(args, null, 2)}
              </pre>
            </div>
            {result && (
              <div>
                <p className="text-muted-foreground mb-1 text-xs font-medium">Output</p>
                <pre className="bg-muted rounded-md p-2 font-mono text-xs overflow-x-auto">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
