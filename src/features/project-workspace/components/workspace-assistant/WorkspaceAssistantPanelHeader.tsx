'use client'

import React from 'react'
import { AppIcon } from '@/components/ui/icons'

interface WorkspaceAssistantPanelHeaderProps {
  eyebrow: string
  title: string
  episodeLabel: string
  workspaceLabel: string
  runLabel: string
  rawContextLabel: string
  downloadLabel: string
  downloadHref: string
  collapseLabel: string
  onOpenRawContext: () => void
  onCollapse: () => void
}

export function WorkspaceAssistantPanelHeader(props: WorkspaceAssistantPanelHeaderProps) {
  return (
    <div className="sticky top-0 z-10 border-b border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-nav)] px-5 py-4 backdrop-blur-[var(--glass-blur-nav)] saturate-110">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--glass-text-tertiary)]">
            <AppIcon name="sparkles" className="h-3.5 w-3.5 text-[var(--glass-accent-from)]" />
            <span>{props.eyebrow}</span>
          </div>
          <h2 className="mt-2 text-base font-semibold text-[var(--glass-text-primary)]">{props.title}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={props.onOpenRawContext}
            className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--glass-stroke-base)] bg-[rgba(255,255,255,0.7)] text-[var(--glass-text-primary)] transition hover:border-[var(--glass-accent-from)]/40 hover:text-[var(--glass-accent-from)]"
            aria-label={props.rawContextLabel}
            title={props.rawContextLabel}
          >
            <AppIcon name="fileText" className="h-4 w-4" />
          </button>
          <a
            href={props.downloadHref}
            className="inline-flex items-center gap-2 rounded-2xl border border-[var(--glass-stroke-base)] bg-[rgba(255,255,255,0.7)] px-3 py-2 text-xs font-medium text-[var(--glass-text-primary)] transition hover:border-[var(--glass-accent-from)]/40 hover:text-[var(--glass-accent-from)]"
          >
            <AppIcon name="download" className="h-4 w-4" />
            <span>{props.downloadLabel}</span>
          </a>
          <button
            type="button"
            aria-label={props.collapseLabel}
            onClick={props.onCollapse}
            className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--glass-stroke-base)] bg-[rgba(255,255,255,0.7)] text-[var(--glass-text-primary)] transition hover:border-[var(--glass-accent-from)]/40 hover:text-[var(--glass-accent-from)]"
          >
            <AppIcon name="chevronRight" className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {[props.episodeLabel, props.workspaceLabel, props.runLabel].map((item) => (
          <div
            key={item}
            className="rounded-full border border-[var(--glass-stroke-base)] bg-[rgba(255,255,255,0.82)] px-3 py-1 text-xs text-[var(--glass-text-secondary)]"
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  )
}
