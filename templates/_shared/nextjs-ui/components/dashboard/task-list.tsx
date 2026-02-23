"use client"

import type { InboxItem } from "@/types/inbox"
import { TaskCard } from "@/components/dashboard/task-card"

interface TaskListProps {
  items: InboxItem[]
}

export function TaskList({ items }: TaskListProps) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline gap-2">
        <h2 className="text-lg font-semibold">Today&apos;s Tasks</h2>
        <span className="text-sm text-muted-foreground">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <TaskCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  )
}
