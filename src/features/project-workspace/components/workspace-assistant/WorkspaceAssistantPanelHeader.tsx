'use client'

import React from 'react'
import { AppIcon } from '@/components/ui/icons'

interface WorkspaceAssistantPanelHeaderProps {
  eyebrow: string
  title: string
  rawContextLabel: string
  downloadLabel: string
  downloadHref: string
  collapseLabel: string
  onOpenRawContext: () => void
  onCollapse: () => void
}

export function WorkspaceAssistantPanelHeader(props: WorkspaceAssistantPanelHeaderProps) {
  return (
    <div className="sticky top-0 z-10 bg-transparent px-5 py-4 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold tracking-tight text-[var(--glass-text-primary)]">{props.title}</h2>
          <div className="mt-1 flex items-center gap-2 text-xs text-[var(--glass-text-tertiary)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--glass-text-secondary)]" />
            <span>{props.eyebrow}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={props.onOpenRawContext}
            className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--glass-stroke-base)] bg-white/80 text-[var(--glass-text-secondary)] transition hover:bg-[var(--glass-bg-muted)] hover:text-[var(--glass-text-primary)]"
            aria-label={props.rawContextLabel}
            title={props.rawContextLabel}
          >
            <AppIcon name="fileText" className="h-4 w-4" />
          </button>
          <a
            href={props.downloadHref}
            className="inline-flex h-10 items-center gap-2 rounded-[14px] border border-[var(--glass-stroke-base)] bg-white/80 px-3 text-xs font-medium text-[var(--glass-text-secondary)] transition hover:bg-[var(--glass-bg-muted)] hover:text-[var(--glass-text-primary)]"
          >
            <AppIcon name="download" className="h-4 w-4" />
            <span>{props.downloadLabel}</span>
          </a>
          <button
            type="button"
            aria-label={props.collapseLabel}
            onClick={props.onCollapse}
            className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--glass-stroke-base)] bg-white/80 text-[var(--glass-text-secondary)] transition hover:bg-[var(--glass-bg-muted)] hover:text-[var(--glass-text-primary)]"
          >
            <AppIcon name="chevronRight" className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
