'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  ThreadPrimitive,
} from '@assistant-ui/react'
import {
  ConfirmationActionCard,
  useWorkspaceAssistantMessagePartComponents,
  WorkspaceAssistantThreadMessage,
} from './workspace-assistant/WorkspaceAssistantRenderers'
import {
  collectPendingConfirmationActions,
  removeConfirmationRequestFromMessages,
} from './workspace-assistant/approval-state'
import { createAssistantMessage } from './workspace-assistant/assistant-messages'
import { useWorkspaceAssistantRuntime } from './workspace-assistant/useWorkspaceAssistantRuntime'
import { apiFetch } from '@/lib/api-fetch'
import { EditFirstComposer } from './workspace-assistant/EditFirstComposer'
import { WorkspaceAssistantModePicker } from './workspace-assistant/WorkspaceAssistantModePicker'
import { WorkspaceAssistantPanelHeader } from './workspace-assistant/WorkspaceAssistantPanelHeader'
import { WorkspaceAssistantPanelRail } from './workspace-assistant/WorkspaceAssistantPanelRail'
import { WorkspaceAssistantRawContextDialog } from './workspace-assistant/WorkspaceAssistantRawContextDialog'
import {
  buildWorkspaceAssistantPanelLayout,
  clampWorkspaceAssistantPanelWidth,
  WORKSPACE_ASSISTANT_PANEL_WIDTH_PX,
  WORKSPACE_ASSISTANT_TOP_OFFSET,
} from './workspace-assistant/panel-layout'
import {
  isWorkspaceAssistantSendMessageEvent,
  WORKSPACE_ASSISTANT_SEND_MESSAGE_EVENT,
} from './workspace-assistant/assistant-send-event'
import type { WorkspaceAssistantSelectionContext } from '../canvas/ProjectWorkspaceCanvas'

interface WorkspaceAssistantPanelProps {
  projectId: string
  episodeId?: string
  selection?: WorkspaceAssistantSelectionContext
  autoStartMessage?: string | null
  autoStartKey?: string | null
  onAutoStartConsumed?: () => void
  isCollapsed: boolean
  onToggleCollapsed: () => void
}

const WORKSPACE_ASSISTANT_WIDTH_STORAGE_KEY = 'workspace-assistant-panel-width'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readResponseErrorMessage(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) return fallback
  const error = isRecord(payload.error) ? payload.error : null
  if (typeof error?.message === 'string' && error.message.trim()) return error.message.trim()
  const details = isRecord(error?.details) ? error.details : null
  if (typeof details?.message === 'string' && details.message.trim()) return details.message.trim()
  return fallback
}

function readOperationResultSummary(payload: unknown): string {
  if (!isRecord(payload)) return ''
  const result = isRecord(payload.result) ? payload.result : null
  if (!result) return ''
  const taskId = typeof result.taskId === 'string' ? result.taskId.trim() : ''
  const runId = typeof result.runId === 'string' ? result.runId.trim() : ''
  const status = typeof result.status === 'string' ? result.status.trim() : ''
  return [status, taskId || runId].filter(Boolean).join(' · ')
}

function readStoredAssistantPanelWidth(): number {
  if (typeof window === 'undefined') return WORKSPACE_ASSISTANT_PANEL_WIDTH_PX
  const storedValue = window.localStorage.getItem(WORKSPACE_ASSISTANT_WIDTH_STORAGE_KEY)
  if (!storedValue) return WORKSPACE_ASSISTANT_PANEL_WIDTH_PX
  const parsedValue = Number(storedValue)
  return Number.isFinite(parsedValue)
    ? clampWorkspaceAssistantPanelWidth(parsedValue)
    : WORKSPACE_ASSISTANT_PANEL_WIDTH_PX
}

export default function WorkspaceAssistantPanel({
  projectId,
  episodeId,
  selection,
  autoStartMessage,
  autoStartKey,
  onAutoStartConsumed,
  isCollapsed,
  onToggleCollapsed,
}: WorkspaceAssistantPanelProps) {
  const t = useTranslations('assistantAgent')
  const locale = useLocale()
  const [assistantPanelWidth, setAssistantPanelWidth] = useState(readStoredAssistantPanelWidth)
  const [isResizing, setIsResizing] = useState(false)
  const resizeStateRef = useRef<{
    startX: number
    startWidth: number
    currentWidth: number
  } | null>(null)
  const layout = buildWorkspaceAssistantPanelLayout(isCollapsed, assistantPanelWidth)
  const [interactionMode, setInteractionMode] = useState<'auto' | 'plan' | 'fast'>('auto')
  const [rawContextOpen, setRawContextOpen] = useState(false)
  const assistantRuntime = useWorkspaceAssistantRuntime({
    projectId,
    episodeId,
    currentStage: null,
    selectedScopeRef: selection?.selectedScopeRef ?? null,
    selectedPanelId: selection?.selectedPanelId ?? null,
    selectedClipId: selection?.selectedClipId ?? null,
    selectedAssetId: selection?.selectedAssetId ?? null,
    interactionMode,
  })
  const { sendMessage } = assistantRuntime
  const consumedMessageKeysRef = useRef<Set<string>>(new Set())
  const sendAssistantMessageOnce = useCallback(async (key: string, message: string) => {
    const normalizedKey = key.trim()
    const normalizedMessage = message.trim()
    if (!normalizedKey || !normalizedMessage) return
    if (consumedMessageKeysRef.current.has(normalizedKey)) return
    consumedMessageKeysRef.current.add(normalizedKey)
    await sendMessage(normalizedMessage)
  }, [sendMessage])
  useEffect(() => {
    if (!autoStartMessage || !autoStartKey) return
    if (assistantRuntime.storageLoading || assistantRuntime.pending) return
    void sendAssistantMessageOnce(autoStartKey, autoStartMessage)
      .finally(() => onAutoStartConsumed?.())
  }, [
    assistantRuntime.pending,
    assistantRuntime.storageLoading,
    autoStartKey,
    autoStartMessage,
    onAutoStartConsumed,
    sendAssistantMessageOnce,
  ])
  useEffect(() => {
    const handleSendMessage = (event: Event) => {
      if (!isWorkspaceAssistantSendMessageEvent(event)) return
      void sendAssistantMessageOnce(event.detail.key, event.detail.message)
    }
    window.addEventListener(WORKSPACE_ASSISTANT_SEND_MESSAGE_EVENT, handleSendMessage)
    return () => window.removeEventListener(WORKSPACE_ASSISTANT_SEND_MESSAGE_EVENT, handleSendMessage)
  }, [sendAssistantMessageOnce])
  const pendingConfirmationActions = useMemo(
    () => collectPendingConfirmationActions(assistantRuntime.messages),
    [assistantRuntime.messages],
  )
  const [selectedPendingActionKey, setSelectedPendingActionKey] = useState<string | null>(null)
  const pendingActionItems = [
    ...pendingConfirmationActions.map((item) => ({
      key: `confirm:${item.operationId}`,
      label: item.operationId,
      kind: 'confirmation' as const,
      summary: item.data.summary,
    })),
  ]
  const effectiveSelectedPendingActionKey = selectedPendingActionKey || pendingActionItems[pendingActionItems.length - 1]?.key || null
  const activePendingConfirmation = effectiveSelectedPendingActionKey?.startsWith('confirm:')
    ? pendingConfirmationActions.find((item) => `confirm:${item.operationId}` === effectiveSelectedPendingActionKey) || null
    : null
  const [confirmationSubmittingKey, setConfirmationSubmittingKey] = useState<string | null>(null)
  const handleConfirmOperation = async (operationId: string, argsHint?: Record<string, unknown> | null) => {
    setConfirmationSubmittingKey(`confirm:${operationId}:continue`)
    try {
      const response = await apiFetch(`/api/projects/${projectId}/assistant/confirm-operation`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          operationId,
          input: {
            ...(argsHint ?? {}),
            confirmed: true,
          },
          context: {
            locale,
            ...(episodeId ? { episodeId } : {}),
            ...(selection?.selectedScopeRef ? { selectedScopeRef: selection.selectedScopeRef } : {}),
            ...(selection?.selectedPanelId ? { selectedPanelId: selection.selectedPanelId } : {}),
            ...(selection?.selectedClipId ? { selectedClipId: selection.selectedClipId } : {}),
            ...(selection?.selectedAssetId ? { selectedAssetId: selection.selectedAssetId } : {}),
          },
        }),
      })
      const payload: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(readResponseErrorMessage(payload, t('cards.operationExecutionFailedFallback')))
      }

      const nextMessages = removeConfirmationRequestFromMessages(assistantRuntime.messages, operationId)
      const resultSummary = readOperationResultSummary(payload)
      assistantRuntime.replaceMessages([
        ...nextMessages,
        createAssistantMessage([{
          type: 'text',
          text: resultSummary
            ? t('cards.confirmedOperationWithResult', { operation: operationId, result: resultSummary })
            : t('cards.confirmedOperation', { operation: operationId }),
        }]),
      ])
    } catch (error) {
      const nextMessages = removeConfirmationRequestFromMessages(assistantRuntime.messages, operationId)
      assistantRuntime.replaceMessages([
        ...nextMessages,
        createAssistantMessage([{
          type: 'text',
          text: t('cards.confirmedOperationFailed', {
            operation: operationId,
            error: error instanceof Error ? error.message : String(error),
          }),
        }]),
      ])
    } finally {
      setConfirmationSubmittingKey(null)
    }
  }
  const handleCancelOperation = async (operationId: string) => {
    setConfirmationSubmittingKey(`confirm:${operationId}:cancel`)
    try {
      const nextMessages = removeConfirmationRequestFromMessages(assistantRuntime.messages, operationId)
      assistantRuntime.replaceMessages([
        ...nextMessages,
        createAssistantMessage([{
          type: 'text',
          text: t('cards.cancelledOperation', { operation: operationId }),
        }]),
      ])
    } finally {
      setConfirmationSubmittingKey(null)
    }
  }
  const partComponents = useWorkspaceAssistantMessagePartComponents({
    onConfirmOperation: handleConfirmOperation,
    onCancelOperation: handleCancelOperation,
    confirmationSubmittingKey,
  })
  const modeOptions = useMemo(() => ([
    {
      value: 'auto' as const,
      label: t('panel.modeAuto'),
      description: t('panel.modeDescriptionAuto'),
    },
    {
      value: 'plan' as const,
      label: t('panel.modePlan'),
      description: t('panel.modeDescriptionPlan'),
    },
    {
      value: 'fast' as const,
      label: t('panel.modeFast'),
      description: t('panel.modeDescriptionFast'),
    },
  ]), [t])
  const downloadHref = useMemo(() => {
    const search = new URLSearchParams()
    if (episodeId) search.set('episodeId', episodeId)
    return `/api/projects/${projectId}/assistant/chat/log?${search.toString()}`
  }, [episodeId, projectId])

  const handleResizePointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (isCollapsed) return
    event.preventDefault()
    resizeStateRef.current = {
      startX: event.clientX,
      startWidth: assistantPanelWidth,
      currentWidth: assistantPanelWidth,
    }
    setIsResizing(true)
  }, [assistantPanelWidth, isCollapsed])

  useEffect(() => {
    if (!isResizing) return

    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'

    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = resizeStateRef.current
      if (!resizeState) return
      const nextWidth = clampWorkspaceAssistantPanelWidth(
        resizeState.startWidth + resizeState.startX - event.clientX,
      )
      resizeState.currentWidth = nextWidth
      setAssistantPanelWidth(nextWidth)
    }

    const handlePointerUp = () => {
      const currentWidth = resizeStateRef.current?.currentWidth ?? assistantPanelWidth
      window.localStorage.setItem(WORKSPACE_ASSISTANT_WIDTH_STORAGE_KEY, String(currentWidth))
      resizeStateRef.current = null
      setIsResizing(false)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp, { once: true })
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
    }
  }, [assistantPanelWidth, isResizing])

  return (
    <aside
      className="pointer-events-none fixed inset-y-0 right-0 z-20 w-0"
      style={{ width: `${layout.occupiedWidthPx}px` }}
      data-state={layout.state}
    >
      <div
        className={`pointer-events-auto fixed right-4 z-20 overflow-hidden rounded-[34px] border border-white/80 bg-white/82 ring-1 ring-[var(--glass-stroke-base)]/70 backdrop-blur-2xl ${isResizing ? '' : 'transition-[width] duration-300 ease-out'}`}
        style={{
          top: WORKSPACE_ASSISTANT_TOP_OFFSET,
          width: `${layout.panelWidthPx}px`,
          height: `calc(100vh - ${WORKSPACE_ASSISTANT_TOP_OFFSET} - 1.5rem)`,
        }}
        data-state={layout.state}
      >
        {!isCollapsed ? (
          <button
            type="button"
            aria-label={t('panel.resize')}
            title={t('panel.resize')}
            className="absolute inset-y-0 left-0 z-30 w-2 cursor-ew-resize bg-transparent"
            onPointerDown={handleResizePointerDown}
          />
        ) : null}
        <div
          className={`h-full transition-opacity duration-200 ${isCollapsed ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
          aria-hidden={isCollapsed}
        >
          <AssistantRuntimeProvider runtime={assistantRuntime.runtime}>
            <ThreadPrimitive.Root className="relative flex h-full min-h-0 flex-col">
              <WorkspaceAssistantPanelHeader
                eyebrow={t('panel.eyebrow')}
                title={t('panel.title')}
                rawContextLabel={t('panel.rawContext')}
                downloadLabel={t('panel.downloadLog')}
                downloadHref={downloadHref}
                collapseLabel={t('panel.collapse')}
                onOpenRawContext={() => setRawContextOpen(true)}
                onCollapse={onToggleCollapsed}
              />
              <WorkspaceAssistantRawContextDialog
                open={rawContextOpen}
                messages={assistantRuntime.rawContextMessages}
                storageError={assistantRuntime.rawContextStorageError}
                labels={{
                  title: t('debugContext.title'),
                  subtitle: t('debugContext.subtitle'),
                  close: t('debugContext.close'),
                  copy: t('debugContext.copy'),
                  copied: t('debugContext.copied'),
                  messageCount: t('debugContext.messageCount', { count: assistantRuntime.rawContextMessages.length }),
                  empty: t('debugContext.empty'),
                  messageId: t('debugContext.messageId'),
                  role: t('debugContext.role'),
                  parts: t('debugContext.parts'),
                  storageError: t('debugContext.storageError'),
                  dialogueTitle: t('debugContext.dialogueTitle'),
                  runtimeTitle: t('debugContext.runtimeTitle'),
                  systemPrompt: t('debugContext.systemPrompt'),
                  modelMessages: t('debugContext.modelMessages'),
                  selectedTools: t('debugContext.selectedTools'),
                  rawJsonTitle: t('debugContext.rawJsonTitle'),
                }}
                onClose={() => setRawContextOpen(false)}
              />

            <ThreadPrimitive.Viewport
              autoScroll
              className="flex-1 overflow-y-auto px-5 pb-4 pt-2"
            >
              <div className="space-y-3">
                {pendingActionItems.length > 0 ? (
                  <div className="rounded-[22px] border border-[var(--glass-stroke-base)] bg-white/82 p-3 shadow-[0_12px_34px_rgba(15,23,42,0.06)]">
                    <div className="mb-3 text-sm font-medium text-[var(--glass-text-primary)]">
                      {t('panel.pendingActionsTitle')}
                    </div>
                    <div className="mb-3 flex flex-wrap gap-2">
                      {pendingActionItems.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          className={
                            effectiveSelectedPendingActionKey === item.key
                              ? 'rounded-full bg-[var(--glass-text-primary)] px-3 py-1.5 text-xs font-medium text-white'
                              : 'rounded-full border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-1.5 text-xs text-[var(--glass-text-secondary)]'
                          }
                          onClick={() => setSelectedPendingActionKey(item.key)}
                        >
                          {t('panel.pendingConfirmationChip', { label: item.label })}
                        </button>
                      ))}
                    </div>
                    {activePendingConfirmation ? (
                      <ConfirmationActionCard
                        operationId={activePendingConfirmation.operationId}
                        summary={activePendingConfirmation.data.summary}
                        argsHint={activePendingConfirmation.data.argsHint ?? null}
                        onConfirm={async () => handleConfirmOperation(activePendingConfirmation.operationId, activePendingConfirmation.data.argsHint ?? null)}
                        onCancel={async () => handleCancelOperation(activePendingConfirmation.operationId)}
                        confirmPending={confirmationSubmittingKey === `confirm:${activePendingConfirmation.operationId}:continue`}
                        cancelPending={confirmationSubmittingKey === `confirm:${activePendingConfirmation.operationId}:cancel`}
                      />
                    ) : null}
                  </div>
                ) : null}
                <ThreadPrimitive.Messages>
                  {() => (
                    <WorkspaceAssistantThreadMessage messagePartComponents={partComponents} />
                  )}
                </ThreadPrimitive.Messages>

              </div>
            </ThreadPrimitive.Viewport>

            <div className="mx-4 mb-3 shrink-0 rounded-[22px] border border-[var(--glass-stroke-base)] bg-white/92 p-2.5 backdrop-blur-xl">
              <EditFirstComposer
                projectId={projectId}
                episodeId={episodeId}
                appendMessages={assistantRuntime.appendMessages}
              />
              <ComposerPrimitive.Root>
                <ComposerPrimitive.Input
                  rows={1}
                  placeholder={t('panel.composerPlaceholder')}
                  className="max-h-[5.5rem] min-h-9 w-full resize-none overflow-y-auto rounded-[14px] bg-[var(--glass-bg-muted)] px-3.5 py-2 text-sm leading-5 text-[var(--glass-text-primary)] outline-none [field-sizing:content] placeholder:text-[var(--glass-text-tertiary)]"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <WorkspaceAssistantModePicker
                      value={interactionMode}
                      options={modeOptions}
                      onChange={setInteractionMode}
                      label={t('panel.modeLabel')}
                    />
                  </div>
                  <ComposerPrimitive.Send className="h-10 rounded-[14px] bg-[var(--glass-text-primary)] px-4 text-sm font-semibold text-white disabled:opacity-60">
                    {assistantRuntime.pending ? t('panel.sending') : t('panel.send')}
                  </ComposerPrimitive.Send>
                </div>
                {assistantRuntime.error ? (
                  <div className="mt-2 text-xs text-[rgba(239,68,68,0.92)]">
                    {assistantRuntime.error.message || 'UNKNOWN_ERROR'} · <a href={downloadHref} className="underline">{t('panel.downloadLog')}</a>
                  </div>
                ) : null}
              </ComposerPrimitive.Root>
            </div>
            </ThreadPrimitive.Root>
          </AssistantRuntimeProvider>
        </div>
        <div
          className={`absolute inset-y-0 right-0 transition-opacity duration-200 ${isCollapsed ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          aria-hidden={!isCollapsed}
        >
          <WorkspaceAssistantPanelRail
            expandLabel={t('panel.expand')}
            onExpand={onToggleCollapsed}
          />
        </div>
      </div>
    </aside>
  )
}
