'use client'

import type { UIMessage } from 'ai'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AppIcon } from '@/components/ui/icons'
import {
  extractWorkspaceAssistantRuntimeContexts,
  serializeWorkspaceAssistantDialogue,
  serializeWorkspaceAssistantRawContext,
} from './assistant-raw-context'

interface WorkspaceAssistantRawContextDialogLabels {
  title: string
  subtitle: string
  close: string
  copy: string
  copied: string
  messageCount: string
  empty: string
  messageId: string
  role: string
  parts: string
  storageError: string
  dialogueTitle: string
  runtimeTitle: string
  systemPrompt: string
  modelMessages: string
  selectedTools: string
  rawJsonTitle: string
}

interface WorkspaceAssistantRawContextDialogProps {
  open: boolean
  messages: UIMessage[]
  storageError?: string | null
  labels: WorkspaceAssistantRawContextDialogLabels
  onClose: () => void
}

export function WorkspaceAssistantRawContextDialog(props: WorkspaceAssistantRawContextDialogProps) {
  const [mounted, setMounted] = useState(false)
  const [copied, setCopied] = useState(false)
  const { open, onClose } = props
  const serializedMessages = useMemo(
    () => serializeWorkspaceAssistantRawContext(props.messages),
    [props.messages],
  )
  const serializedDialogue = useMemo(
    () => serializeWorkspaceAssistantDialogue(props.messages),
    [props.messages],
  )
  const runtimeContexts = useMemo(
    () => extractWorkspaceAssistantRuntimeContexts(props.messages),
    [props.messages],
  )

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])

  useEffect(() => {
    if (!copied) return
    const timeout = window.setTimeout(() => setCopied(false), 1200)
    return () => window.clearTimeout(timeout)
  }, [copied])

  if (!mounted || !props.open) return null

  const handleCopy = async () => {
    await window.navigator.clipboard.writeText(serializedMessages)
    setCopied(true)
  }

  return createPortal(
    <div className="fixed inset-0 z-[1000] bg-black/35 backdrop-blur-sm">
      <div className="flex min-h-full items-start justify-end p-4 sm:p-6">
        <section
          role="dialog"
          aria-modal="true"
          aria-label={props.labels.title}
          className="flex h-[min(760px,calc(100vh-3rem))] w-[min(980px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] shadow-2xl"
        >
          <div className="flex items-start justify-between gap-4 border-b border-[var(--glass-stroke-soft)] px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--glass-text-primary)]">
                <AppIcon name="fileText" className="h-4 w-4 text-[var(--glass-accent-from)]" />
                <span>{props.labels.title}</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-[var(--glass-text-secondary)]">{props.labels.subtitle}</p>
              {props.storageError ? (
                <p className="mt-1 text-xs text-[var(--glass-tone-warn-fg)]">
                  {props.labels.storageError}: {props.storageError}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => { void handleCopy() }}
                className="inline-flex h-9 items-center gap-2 rounded-2xl border border-[var(--glass-stroke-base)] bg-[rgba(255,255,255,0.78)] px-3 text-xs font-medium text-[var(--glass-text-primary)] transition hover:border-[var(--glass-accent-from)]/40 hover:text-[var(--glass-accent-from)]"
              >
                <AppIcon name="copy" className="h-4 w-4" />
                <span>{copied ? props.labels.copied : props.labels.copy}</span>
              </button>
              <button
                type="button"
                aria-label={props.labels.close}
                onClick={props.onClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--glass-stroke-base)] bg-[rgba(255,255,255,0.78)] text-[var(--glass-text-primary)] transition hover:border-[var(--glass-accent-from)]/40 hover:text-[var(--glass-accent-from)]"
              >
                <AppIcon name="close" className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="border-b border-[var(--glass-stroke-soft)] px-5 py-3 text-xs text-[var(--glass-text-secondary)]">
            {props.labels.messageCount}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {props.messages.length === 0 ? (
              <div className="rounded-xl border border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-muted)]/70 px-4 py-6 text-sm text-[var(--glass-text-secondary)]">
                {props.labels.empty}
              </div>
            ) : (
              <div className="space-y-3">
                <section className="rounded-xl border border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-muted)]/60">
                  <div className="border-b border-[var(--glass-stroke-soft)] px-3 py-2 text-xs font-semibold text-[var(--glass-text-primary)]">
                    {props.labels.dialogueTitle}
                  </div>
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap px-3 py-3 text-[12px] leading-6 text-[var(--glass-text-primary)]">
                    {serializedDialogue || props.labels.empty}
                  </pre>
                </section>

                {runtimeContexts.length > 0 ? (
                  <section className="space-y-3">
                    <div className="text-xs font-semibold text-[var(--glass-text-primary)]">{props.labels.runtimeTitle}</div>
                    {runtimeContexts.map((context) => (
                      <article
                        key={context.requestId}
                        className="rounded-xl border border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-muted)]/60"
                      >
                        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--glass-stroke-soft)] px-3 py-2 text-xs text-[var(--glass-text-secondary)]">
                          <span className="font-semibold text-[var(--glass-text-primary)]">{context.requestId}</span>
                          <span>{context.modelKey}</span>
                          <span>{context.interactionMode}</span>
                          <span>{context.selectedTools.length} tools</span>
                        </div>
                        <div className="space-y-3 px-3 py-3">
                          <div>
                            <div className="mb-1 text-xs font-medium text-[var(--glass-text-primary)]">{props.labels.systemPrompt}</div>
                            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--glass-bg-surface)] px-3 py-2 text-[11px] leading-5 text-[var(--glass-text-primary)]">
                              {context.systemPrompt}
                            </pre>
                          </div>
                          <div>
                            <div className="mb-1 text-xs font-medium text-[var(--glass-text-primary)]">{props.labels.modelMessages}</div>
                            <pre className="max-h-72 overflow-auto rounded-lg bg-[var(--glass-bg-surface)] px-3 py-2 text-[11px] leading-5 text-[var(--glass-text-primary)]">
                              {JSON.stringify(context.modelMessages, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <div className="mb-1 text-xs font-medium text-[var(--glass-text-primary)]">{props.labels.selectedTools}</div>
                            <pre className="max-h-56 overflow-auto rounded-lg bg-[var(--glass-bg-surface)] px-3 py-2 text-[11px] leading-5 text-[var(--glass-text-primary)]">
                              {JSON.stringify(context.selectedTools, null, 2)}
                            </pre>
                          </div>
                        </div>
                      </article>
                    ))}
                  </section>
                ) : null}

                <section className="space-y-3">
                  <div className="text-xs font-semibold text-[var(--glass-text-primary)]">{props.labels.rawJsonTitle}</div>
                {props.messages.map((message, index) => (
                  <article
                    key={message.id}
                    className="rounded-xl border border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-muted)]/60"
                  >
                    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--glass-stroke-soft)] px-3 py-2 text-xs text-[var(--glass-text-secondary)]">
                      <span className="font-semibold text-[var(--glass-text-primary)]">#{index + 1}</span>
                      <span>{props.labels.role}: {message.role}</span>
                      <span>{props.labels.messageId}: {message.id}</span>
                      <span>{props.labels.parts}: {message.parts.length}</span>
                    </div>
                    <pre className="max-h-72 overflow-auto px-3 py-3 text-[11px] leading-5 text-[var(--glass-text-primary)]">
                      {JSON.stringify(message, null, 2)}
                    </pre>
                  </article>
                ))}
                </section>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>,
    document.body,
  )
}
