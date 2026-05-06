'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { AppIcon } from '@/components/ui/icons'
import type { ProjectAgentInteractionMode } from '@/lib/project-agent/types'

const VIEWPORT_EDGE_GAP = 12
const PANEL_WIDTH = 320

interface ModeOption {
  value: ProjectAgentInteractionMode
  label: string
  description: string
}

interface WorkspaceAssistantModePickerProps {
  value: ProjectAgentInteractionMode
  options: ModeOption[]
  onChange: (value: ProjectAgentInteractionMode) => void
  label: string
}

export function WorkspaceAssistantModePicker(props: WorkspaceAssistantModePickerProps) {
  const [open, setOpen] = useState(false)
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({})
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const selectedOption = useMemo(
    () => props.options.find((option) => option.value === props.value) || props.options[0],
    [props.options, props.value],
  )

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || typeof window === 'undefined') return
    const rect = triggerRef.current.getBoundingClientRect()
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth
    const openUpward = viewportHeight - rect.bottom < 240 && rect.top > viewportHeight - rect.bottom
    const left = Math.min(
      Math.max(VIEWPORT_EDGE_GAP, rect.left),
      Math.max(VIEWPORT_EDGE_GAP, viewportWidth - PANEL_WIDTH - VIEWPORT_EDGE_GAP),
    )
    setPanelStyle({
      position: 'fixed',
      left,
      width: PANEL_WIDTH,
      zIndex: 70,
      ...(openUpward
        ? { bottom: viewportHeight - rect.top + 10 }
        : { top: rect.bottom + 10 }),
    })
  }, [])

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (triggerRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, updatePosition])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex h-10 min-w-[76px] items-center justify-between gap-2 rounded-full bg-[var(--glass-bg-muted)] px-3 text-left text-sm font-medium text-[var(--glass-text-primary)] transition hover:bg-[var(--glass-bg-surface)]"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="truncate">{selectedOption?.label}</span>
        <AppIcon name="chevronDown" className={`h-4 w-4 shrink-0 text-[var(--glass-text-tertiary)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={panelRef}
              style={panelStyle}
              className="overflow-hidden rounded-3xl border border-[var(--glass-stroke-base)] bg-[rgba(255,255,255,0.96)] p-2 shadow-[0_28px_80px_rgba(15,23,42,0.22)] backdrop-blur-xl"
            >
              <div className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--glass-text-tertiary)]">
                {props.label}
              </div>
              <div className="space-y-1">
                {props.options.map((option) => {
                  const selected = props.value === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${
                        selected
                          ? 'bg-[rgba(59,130,246,0.12)] text-[var(--glass-text-primary)]'
                          : 'text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-muted)]/90'
                      }`}
                      onClick={() => {
                        props.onChange(option.value)
                        setOpen(false)
                      }}
                    >
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        selected
                          ? 'bg-[var(--glass-accent-from)] text-white'
                          : 'border border-[var(--glass-stroke-base)] bg-[rgba(255,255,255,0.9)] text-[var(--glass-text-secondary)]'
                      }`}
                      >
                        {option.label}
                      </span>
                      <span className="min-w-0 text-xs leading-5 text-[var(--glass-text-tertiary)]">
                        {option.description}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
