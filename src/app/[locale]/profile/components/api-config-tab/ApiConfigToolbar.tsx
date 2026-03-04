'use client'

import type { ComponentProps } from 'react'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { AppIcon } from '@/components/ui/icons'
import { Badge } from '@/components/ui/badge'

interface ApiConfigToolbarProps {
  title: string
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
  savingState: ComponentProps<typeof TaskStatusInline>['state'] | null
  savingLabel: string
  savedLabel: string
  saveFailedLabel: string
}

export function ApiConfigToolbar({
  title,
  saveStatus,
  savingState,
  savingLabel,
  savedLabel,
  saveFailedLabel,
}: ApiConfigToolbarProps) {
  return (
    <div className="flex items-center justify-between border-b border-border px-6 py-4">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="flex items-center gap-2 text-sm">
        {saveStatus === 'saving' && (
          <Badge variant="secondary" className="flex items-center gap-1">
            <TaskStatusInline state={savingState} className="[&>span]:sr-only" />
            <span>{savingLabel}</span>
          </Badge>
        )}
        {saveStatus === 'saved' && (
          <Badge className="flex items-center gap-1 bg-emerald-600 text-white hover:bg-emerald-600">
            <AppIcon name="check" className="w-4 h-4" />
            {savedLabel}
          </Badge>
        )}
        {saveStatus === 'error' && (
          <Badge variant="destructive" className="flex items-center gap-1">
            <AppIcon name="close" className="w-4 h-4" />
            {saveFailedLabel}
          </Badge>
        )}
      </div>
    </div>
  )
}
