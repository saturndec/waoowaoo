'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  ThreadPrimitive,
} from '@assistant-ui/react'
import { AppIcon } from '@/components/ui/icons'
import { useProjectContext } from '@/lib/query/hooks'
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
import { WorkspaceAssistantModePicker } from './workspace-assistant/WorkspaceAssistantModePicker'
import { WorkspaceAssistantPanelHeader } from './workspace-assistant/WorkspaceAssistantPanelHeader'
import { WorkspaceAssistantPanelRail } from './workspace-assistant/WorkspaceAssistantPanelRail'
import { WorkspaceAssistantRawContextDialog } from './workspace-assistant/WorkspaceAssistantRawContextDialog'
import { buildWorkspaceAssistantPanelLayout, WORKSPACE_ASSISTANT_TOP_OFFSET } from './workspace-assistant/panel-layout'
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
  const layout = buildWorkspaceAssistantPanelLayout(isCollapsed)
  const [interactionMode, setInteractionMode] = useState<'auto' | 'plan' | 'fast'>('auto')
  const [rawContextOpen, setRawContextOpen] = useState(false)
  const { data: projectContext } = useProjectContext(projectId, {
    episodeId,
  })
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
  const contextSummary = `${projectContext?.episodeName || episodeId || t('cards.globalScope')} · ${t('panel.workspaceStatus')} · ${t('panel.runs', { count: projectContext?.activePlanRuns.length || 0 })}`
  const statusText = assistantRuntime.syncError
    || assistantRuntime.storageError
    || assistantRuntime.error?.message
    || (assistantRuntime.pending
      ? t('panel.streaming')
      : assistantRuntime.storageLoading
        ? t('panel.loading')
        : t('panel.statusReady'))
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

  return (
    <aside
      className="pointer-events-none fixed inset-y-0 right-0 z-20 w-0"
      style={{ width: `${layout.occupiedWidthPx}px` }}
      data-state={layout.state}
    >
      <div
        className="pointer-events-auto fixed right-0 z-20 overflow-hidden rounded-l-3xl border border-r-0 border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/95 shadow-xl backdrop-blur-md transition-[width] duration-300 ease-out"
        style={{
          top: WORKSPACE_ASSISTANT_TOP_OFFSET,
          width: `${layout.panelWidthPx}px`,
          height: `calc(100vh - ${WORKSPACE_ASSISTANT_TOP_OFFSET} - 1.5rem)`,
        }}
        data-state={layout.state}
      >
        <div
          className={`h-full transition-opacity duration-200 ${isCollapsed ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
          aria-hidden={isCollapsed}
        >
          <AssistantRuntimeProvider runtime={assistantRuntime.runtime}>
            <ThreadPrimitive.Root className="flex h-full min-h-0 flex-col">
              <WorkspaceAssistantPanelHeader
                eyebrow={t('panel.eyebrow')}
                title={t('panel.title')}
                episodeLabel={projectContext?.episodeName || episodeId || t('cards.globalScope')}
                workspaceLabel={t('panel.workspaceStatus')}
                runLabel={t('panel.runs', { count: projectContext?.activePlanRuns.length || 0 })}
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
              className="flex-1 overflow-y-auto bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0))] px-4 py-4"
            >
              {assistantRuntime.messageCount === 0 ? (
                <div className="mb-3 rounded-2xl bg-[var(--glass-bg-muted)]/70 px-3 py-4 text-sm text-[var(--glass-text-secondary)]">
                  {t('panel.empty')}
                </div>
              ) : null}

              <div className="space-y-3">
                <div className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[rgba(255,255,255,0.72)] px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--glass-text-tertiary)]">
                        {t('panel.executionTraceTitle')}
                      </div>
                      <div className="mt-1 text-sm font-medium text-[var(--glass-text-primary)]">
                        {assistantRuntime.pending ? t('panel.executionTraceRunning') : t('panel.executionTraceIdle')}
                      </div>
                    </div>
                    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
                      assistantRuntime.pending
                        ? 'border-[rgba(59,130,246,0.26)] bg-[rgba(59,130,246,0.1)] text-[var(--glass-accent-from)]'
                        : 'border-[var(--glass-stroke-base)] bg-[rgba(255,255,255,0.9)] text-[var(--glass-text-secondary)]'
                    }`}
                    >
                      <AppIcon name="cpu" className={`h-3.5 w-3.5 ${assistantRuntime.pending ? 'animate-pulse' : ''}`} />
                      <span>{statusText}</span>
                    </div>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[var(--glass-text-secondary)]">{contextSummary}</p>
                </div>
                {pendingActionItems.length > 0 ? (
                  <div className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/80 p-3">
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
                              ? 'rounded-full bg-[var(--glass-accent-from)] px-3 py-1.5 text-xs font-medium text-white'
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

            <div className="border-t border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/95 px-4 py-4">
              <ComposerPrimitive.Root>
                <ComposerPrimitive.Input
                  placeholder={t('panel.composerPlaceholder')}
                  className="min-h-20 w-full rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] px-3 py-3 text-sm text-[var(--glass-text-primary)] outline-none"
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <WorkspaceAssistantModePicker
                      value={interactionMode}
                      options={modeOptions}
                      onChange={setInteractionMode}
                      label={t('panel.modeLabel')}
                    />
                    <div
                      className={`inline-flex min-w-0 items-center gap-2 rounded-full border px-3 py-2 text-xs ${
                        assistantRuntime.error
                          ? 'border-[rgba(239,68,68,0.22)] bg-[rgba(239,68,68,0.08)] text-[rgba(239,68,68,0.92)]'
                          : assistantRuntime.pending
                            ? 'border-[rgba(59,130,246,0.22)] bg-[rgba(59,130,246,0.08)] text-[var(--glass-tone-info-fg)]'
                            : 'border-[rgba(34,197,94,0.22)] bg-[rgba(240,253,244,0.85)] text-[var(--glass-tone-success-fg)]'
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${assistantRuntime.pending ? 'bg-[var(--glass-tone-info-fg)]' : 'bg-[var(--glass-tone-success-fg)]'}`} />
                      <span className="truncate">{statusText}</span>
                    </div>
                  </div>
                  <ComposerPrimitive.Send className="rounded-xl bg-[var(--glass-accent-from)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
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
