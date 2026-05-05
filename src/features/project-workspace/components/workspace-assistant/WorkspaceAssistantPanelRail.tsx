'use client'

import React from 'react'
import { AppIcon } from '@/components/ui/icons'

interface WorkspaceAssistantPanelRailProps {
  expandLabel: string
  onExpand: () => void
}

export function WorkspaceAssistantPanelRail({
  expandLabel,
  onExpand,
}: WorkspaceAssistantPanelRailProps) {
  return (
    <div className="absolute inset-y-0 right-0 z-20 flex w-16 flex-col items-center border-l border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/95 px-2 py-4 backdrop-blur-md">
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          aria-label={expandLabel}
          onClick={onExpand}
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--glass-stroke-base)] bg-[rgba(255,255,255,0.82)] text-[var(--glass-text-primary)] transition hover:border-[var(--glass-accent-from)]/40 hover:text-[var(--glass-accent-from)]"
        >
          <AppIcon name="chevronLeft" className="h-4 w-4" />
        </button>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(255,255,255,0.78)] text-[var(--glass-accent-from)]">
          <AppIcon name="sparkles" className="h-4 w-4" />
        </div>
      </div>
    </div>
  )
}
