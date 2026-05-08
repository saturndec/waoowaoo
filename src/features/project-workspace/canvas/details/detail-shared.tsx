'use client'

import React from 'react'
import type { ReactNode } from 'react'
import { AppIcon } from '@/components/ui/icons'
import type { ProjectPanel, ProjectStoryboard } from '@/types/project'
import type { WorkspaceCanvasFlowNode } from '../node-canvas-types'

export interface PanelContext {
  readonly storyboard: ProjectStoryboard
  readonly panel: ProjectPanel
}

export type DetailTone = 'script' | 'shot' | 'image' | 'video' | 'final' | 'story'

export type PrimitiveGenerationOption = string | number | boolean
export type PrimitiveGenerationOptions = Record<string, PrimitiveGenerationOption>

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isPrimitiveGenerationOption(value: unknown): value is PrimitiveGenerationOption {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

export function parseCharacterRefs(value: string | null | undefined): Array<{ readonly name: string; readonly appearance: string }> {
  if (!value?.trim()) return []
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item) => {
      if (typeof item === 'string' && item.trim()) return [{ name: item.trim(), appearance: '' }]
      if (!isRecord(item) || typeof item.name !== 'string') return []
      return [{
        name: item.name.trim(),
        appearance: typeof item.appearance === 'string' ? item.appearance.trim() : '',
      }]
    }).filter((item) => item.name)
  } catch {
    return value.split(',').map((name) => ({ name: name.trim(), appearance: '' })).filter((item) => item.name)
  }
}

export function serializeCharacterRefs(value: readonly { readonly name: string; readonly appearance: string }[]): string {
  return JSON.stringify(value.map((item) => ({
    name: item.name,
    ...(item.appearance ? { appearance: item.appearance } : {}),
  })))
}

export function splitList(value: string): string[] {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  window.URL.revokeObjectURL(url)
  document.body.removeChild(anchor)
}

export function resolveTone(kind: WorkspaceCanvasFlowNode['data']['kind']): DetailTone {
  switch (kind) {
    case 'scriptClip':
      return 'script'
    case 'shot':
      return 'shot'
    case 'imageAsset':
      return 'image'
    case 'videoClip':
      return 'video'
    case 'finalTimeline':
      return 'final'
    case 'editScript':
    case 'editRequiredAsset':
      return 'script'
    case 'storyInput':
    case 'analysis':
      return 'story'
  }
}

export function toneClassName(tone: DetailTone): string {
  switch (tone) {
    case 'script':
      return 'border-[#7c3aed]/25'
    case 'shot':
      return 'border-[#059669]/25'
    case 'image':
      return 'border-[#d97706]/25'
    case 'video':
      return 'border-[#dc2626]/25'
    case 'final':
      return 'border-[#111827]/25'
    case 'story':
      return 'border-[#2f6fed]/25'
  }
}

export function Field(props: {
  readonly label: string
  readonly children: ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--glass-text-tertiary)]">{props.label}</span>
      {props.children}
    </label>
  )
}

export function TextInput(props: {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly placeholder?: string
}) {
  return (
    <input
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      placeholder={props.placeholder}
      className="w-full rounded-md border border-[var(--glass-stroke-base)] bg-white px-3 py-2 text-sm text-[var(--glass-text-primary)] outline-none focus:border-[var(--glass-stroke-focus)]"
    />
  )
}

export function TextArea(props: {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly rows?: number
  readonly placeholder?: string
  readonly readOnly?: boolean
}) {
  return (
    <textarea
      value={props.value}
      rows={props.rows ?? 4}
      readOnly={props.readOnly}
      onChange={(event) => props.onChange(event.target.value)}
      placeholder={props.placeholder}
      className="w-full resize-y rounded-md border border-[var(--glass-stroke-base)] bg-white px-3 py-2 text-sm leading-6 text-[var(--glass-text-primary)] outline-none focus:border-[var(--glass-stroke-focus)]"
    />
  )
}

export function isValidOptionalNumber(value: string): boolean {
  return !value.trim() || Number.isFinite(Number(value))
}

export function DetailSection(props: {
  readonly title: string
  readonly children: ReactNode
}) {
  return (
    <section className="space-y-3 rounded-lg border border-black/5 bg-[#f8fafc] p-4">
      <h3 className="text-xs font-semibold uppercase tracking-[0.05em] text-[var(--glass-text-tertiary)]">{props.title}</h3>
      {props.children}
    </section>
  )
}

export function ActionButton(props: {
  readonly children: ReactNode
  readonly onClick: () => void | Promise<void>
  readonly disabled?: boolean
  readonly variant?: 'primary' | 'danger' | 'ghost'
}) {
  const variant = props.variant ?? 'ghost'
  const className = variant === 'primary'
    ? 'bg-[#111827] text-white hover:bg-[#0f172a]'
    : variant === 'danger'
      ? 'border border-[var(--glass-stroke-danger)] bg-white text-[var(--glass-tone-danger-fg)] hover:bg-[var(--glass-tone-danger-bg)]'
      : 'border border-[var(--glass-stroke-base)] bg-white text-[var(--glass-text-secondary)] hover:bg-[#f8fafc]'
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={() => { void props.onClick() }}
      className={`inline-flex items-center justify-center rounded-md px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {props.children}
    </button>
  )
}

export function findPanelContext(storyboards: readonly ProjectStoryboard[], panelId: string): PanelContext | null {
  for (const storyboard of storyboards) {
    const panel = (storyboard.panels ?? []).find((candidate) => candidate.id === panelId)
    if (panel) return { storyboard, panel }
  }
  return null
}

export function findNextPanelContext(storyboards: readonly ProjectStoryboard[], context: PanelContext): PanelContext | null {
  const panels = [...(context.storyboard.panels ?? [])].sort((a, b) => a.panelIndex - b.panelIndex)
  const currentIndex = panels.findIndex((panel) => panel.id === context.panel.id)
  if (currentIndex < 0) return null
  const next = panels[currentIndex + 1]
  return next ? { storyboard: context.storyboard, panel: next } : null
}

export function candidateImages(panel: ProjectPanel): string[] {
  if (!panel.candidateImages) return []
  try {
    const parsed = JSON.parse(panel.candidateImages) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0 && !item.startsWith('PENDING:'))
  } catch {
    return []
  }
}

export function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  values.forEach((value) => {
    const normalized = value.trim()
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    output.push(normalized)
  })
  return output
}

export function IconLabel(props: {
  readonly icon: Parameters<typeof AppIcon>[0]['name']
  readonly children: ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <AppIcon name={props.icon} className="h-3.5 w-3.5" />
      {props.children}
    </span>
  )
}
