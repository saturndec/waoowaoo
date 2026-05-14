'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  AssistantRuntimeProvider,
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
import { createAssistantMessage, createUserMessage } from './workspace-assistant/assistant-messages'
import {
  buildEditFirstPromptWithAnswers,
  type EditFirstAnswer,
  type EditFirstQuestion,
} from './workspace-assistant/edit-first-questions'
import { useWorkspaceAssistantRuntime } from './workspace-assistant/useWorkspaceAssistantRuntime'
import { apiFetch } from '@/lib/api-fetch'
import { useCreateProjectEditScript, useCreateProjectEditScriptBriefQuestions } from '@/lib/query/hooks'
import type { EditBriefOptionId, EditScriptVideoRatio } from '@/lib/edit-script/types'
import { ART_STYLES, type ArtStyleValue } from '@/lib/constants'
import { EditFirstComposer } from './workspace-assistant/EditFirstComposer'
import { EditFirstInlineReply, type EditFirstProgressKind } from './workspace-assistant/EditFirstInlineReply'
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
  onEditScriptPendingChange?: (pending: boolean) => void
}

const WORKSPACE_ASSISTANT_WIDTH_STORAGE_KEY = 'workspace-assistant-panel-width'

type EditFirstPhase = 'idle' | 'briefQuestions' | 'answeringQuestions' | 'editScript'
const EDIT_FIRST_VIDEO_RATIOS: readonly EditScriptVideoRatio[] = ['9:16', '16:9', '21:9'] as const

interface EditFirstBriefFlow {
  readonly originalPrompt: string
  readonly questionIndex: number
  readonly questions: readonly EditFirstQuestion[]
  readonly answers: readonly EditFirstAnswer[]
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

function resolveEditFirstVideoRatio(answers: readonly EditFirstAnswer[]): EditScriptVideoRatio | undefined {
  const ratioAnswer = answers.find((answer) => answer.questionId === 'aspect_ratio')
  if (!ratioAnswer) return undefined
  const answerText = `${ratioAnswer.optionLabel} ${ratioAnswer.questionLabel}`
  return EDIT_FIRST_VIDEO_RATIOS.find((ratio) => answerText.includes(ratio))
}

function resolveEditFirstArtStyle(answers: readonly EditFirstAnswer[]): ArtStyleValue | undefined {
  const styleAnswer = answers.find((answer) => answer.questionId === 'visual_style')
  if (!styleAnswer) return undefined
  const answerText = `${styleAnswer.optionLabel} ${styleAnswer.questionLabel}`.toLocaleLowerCase()
  return ART_STYLES.find((style) => (
    answerText.includes(style.value.toLocaleLowerCase())
    || answerText.includes(style.label.toLocaleLowerCase())
  ))?.value
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
  onEditScriptPendingChange,
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
  const [rawContextOpen, setRawContextOpen] = useState(false)
  const [composerText, setComposerText] = useState('')
  const [composerError, setComposerError] = useState<string | null>(null)
  const [editFirstPhase, setEditFirstPhase] = useState<EditFirstPhase>('idle')
  const [briefFlow, setBriefFlow] = useState<EditFirstBriefFlow | null>(null)
  const createBriefQuestions = useCreateProjectEditScriptBriefQuestions(projectId)
  const createEditScript = useCreateProjectEditScript(projectId)
  const assistantRuntime = useWorkspaceAssistantRuntime({
    projectId,
    episodeId,
    currentStage: null,
    selectedScopeRef: selection?.selectedScopeRef ?? null,
    selectedPanelId: selection?.selectedPanelId ?? null,
    selectedClipId: selection?.selectedClipId ?? null,
    selectedAssetId: selection?.selectedAssetId ?? null,
    interactionMode: 'fast',
  })
  const consumedMessageKeysRef = useRef<Set<string>>(new Set())
  const buildAnswerSummaries = useCallback((answers: readonly EditFirstAnswer[]) => answers.map((answer) => (
    `${answer.questionLabel}: ${answer.optionId}: ${answer.optionLabel}`
  )), [])
  const generateEditGraphFromBrief = useCallback(async (
    originalPrompt: string,
    answers: readonly EditFirstAnswer[],
    options?: { clearComposer?: boolean },
  ) => {
    if (!episodeId) {
      const errorMessage = t('panel.episodeRequired')
      setComposerError(errorMessage)
      assistantRuntime.appendMessages([createAssistantMessage([{ type: 'text', text: errorMessage }])])
      return
    }

    const prompt = buildEditFirstPromptWithAnswers({
      originalPrompt,
      answerSectionTitle: t('panel.briefAnswerPromptTitle'),
      answers: buildAnswerSummaries(answers),
    })
    const videoRatio = resolveEditFirstVideoRatio(answers)
    const artStyle = resolveEditFirstArtStyle(answers)

    setComposerError(null)
    setEditFirstPhase('editScript')
    try {
      const editScript = await createEditScript.mutateAsync({
        episodeId,
        prompt,
        ...(videoRatio ? { videoRatio } : {}),
        ...(artStyle ? { artStyle } : {}),
      })
      assistantRuntime.appendMessages([
        createAssistantMessage([
          {
            type: 'text',
            text: t('panel.editFirstComplete', {
              shots: editScript.shotCount,
              duration: editScript.durationSec,
              assets: editScript.requirements.length,
            }),
          },
        ]),
      ])
      setBriefFlow(null)
      setEditFirstPhase('idle')
      if (options?.clearComposer) setComposerText('')
    } catch (caught) {
      const messageText = caught instanceof Error ? caught.message : String(caught)
      setComposerError(messageText)
      setBriefFlow(null)
      setEditFirstPhase('idle')
      assistantRuntime.appendMessages([createAssistantMessage([{ type: 'text', text: messageText }])])
    }
  }, [assistantRuntime, buildAnswerSummaries, createEditScript, episodeId, t])
  const startEditGraphBrief = useCallback(async (message: string, options?: { clearComposer?: boolean }) => {
    const normalizedMessage = message.trim()
    if (!normalizedMessage) return
    if (!episodeId) {
      const errorMessage = t('panel.episodeRequired')
      setComposerError(errorMessage)
      assistantRuntime.appendMessages([createAssistantMessage([{ type: 'text', text: errorMessage }])])
      return
    }

    setComposerError(null)
    assistantRuntime.appendMessages([createUserMessage(normalizedMessage)])
    if (options?.clearComposer) setComposerText('')
    setEditFirstPhase('briefQuestions')
    try {
      const briefQuestions = await createBriefQuestions.mutateAsync({
        episodeId,
        prompt: normalizedMessage,
      })
      if (briefQuestions.questions.length === 0) {
        setBriefFlow(null)
        setEditFirstPhase('editScript')
        await generateEditGraphFromBrief(normalizedMessage, [], { clearComposer: options?.clearComposer })
        return
      }
      setBriefFlow({
        originalPrompt: normalizedMessage,
        questionIndex: 0,
        questions: briefQuestions.questions,
        answers: [],
      })
      setEditFirstPhase('answeringQuestions')
    } catch (caught) {
      const messageText = caught instanceof Error ? caught.message : String(caught)
      setComposerError(messageText)
      setBriefFlow(null)
      setEditFirstPhase('idle')
      assistantRuntime.appendMessages([createAssistantMessage([{ type: 'text', text: messageText }])])
    }
  }, [assistantRuntime, createBriefQuestions, episodeId, generateEditGraphFromBrief, t])
  const createEditGraphOnce = useCallback(async (key: string, message: string) => {
    const normalizedKey = key.trim()
    const normalizedMessage = message.trim()
    if (!normalizedKey || !normalizedMessage) return
    if (consumedMessageKeysRef.current.has(normalizedKey)) return
    consumedMessageKeysRef.current.add(normalizedKey)
    await startEditGraphBrief(normalizedMessage)
  }, [startEditGraphBrief])
  const handleComposerSubmit = useCallback(async () => {
    await startEditGraphBrief(composerText, { clearComposer: true })
  }, [composerText, startEditGraphBrief])
  const handleBriefOptionSelect = useCallback((optionId: EditBriefOptionId) => {
    if (!briefFlow || createBriefQuestions.isPending || createEditScript.isPending) return
    const currentQuestion = briefFlow.questions[briefFlow.questionIndex]
    if (!currentQuestion) {
      setComposerError(t('panel.briefQuestionMissing'))
      return
    }
    const selectedOption = currentQuestion.options.find((option) => option.id === optionId)
    if (!selectedOption) {
      setComposerError(t('panel.briefQuestionMissing'))
      return
    }
    const nextAnswers: readonly EditFirstAnswer[] = [
      ...briefFlow.answers,
      {
        questionId: currentQuestion.id,
        questionLabel: currentQuestion.label,
        optionId,
        optionLabel: selectedOption.label,
      },
    ]
    const nextQuestionIndex = briefFlow.questionIndex + 1
    if (nextQuestionIndex >= briefFlow.questions.length) {
      setBriefFlow(null)
      setEditFirstPhase('editScript')
      void generateEditGraphFromBrief(briefFlow.originalPrompt, nextAnswers, { clearComposer: true })
      return
    }

    setBriefFlow({
      originalPrompt: briefFlow.originalPrompt,
      questionIndex: nextQuestionIndex,
      questions: briefFlow.questions,
      answers: nextAnswers,
    })
  }, [briefFlow, createBriefQuestions.isPending, createEditScript.isPending, generateEditGraphFromBrief, t])
  const activeBriefQuestion = briefFlow
    ? briefFlow.questions[briefFlow.questionIndex] ?? null
    : null
  const editFirstProgressKind: EditFirstProgressKind | null =
    editFirstPhase === 'briefQuestions' || createBriefQuestions.isPending
      ? 'briefQuestions'
      : editFirstPhase === 'editScript' || createEditScript.isPending
        ? 'editScript'
        : null
  useEffect(() => {
    onEditScriptPendingChange?.(editFirstProgressKind === 'editScript')
    return () => onEditScriptPendingChange?.(false)
  }, [editFirstProgressKind, onEditScriptPendingChange])
  useEffect(() => {
    if (!autoStartMessage || !autoStartKey) return
    if (assistantRuntime.storageLoading || createBriefQuestions.isPending || createEditScript.isPending) return
    onAutoStartConsumed?.()
    void createEditGraphOnce(autoStartKey, autoStartMessage)
  }, [
    assistantRuntime.storageLoading,
    autoStartKey,
    autoStartMessage,
    createEditGraphOnce,
    createBriefQuestions.isPending,
    createEditScript.isPending,
    onAutoStartConsumed,
  ])
  useEffect(() => {
    const handleSendMessage = (event: Event) => {
      if (!isWorkspaceAssistantSendMessageEvent(event)) return
      void createEditGraphOnce(event.detail.key, event.detail.message)
    }
    window.addEventListener(WORKSPACE_ASSISTANT_SEND_MESSAGE_EVENT, handleSendMessage)
    return () => window.removeEventListener(WORKSPACE_ASSISTANT_SEND_MESSAGE_EVENT, handleSendMessage)
  }, [createEditGraphOnce])
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
                <EditFirstInlineReply
                  pending={createBriefQuestions.isPending || createEditScript.isPending}
                  progressKind={editFirstProgressKind}
                  activeQuestion={activeBriefQuestion}
                  onSelectOption={handleBriefOptionSelect}
                />

              </div>
            </ThreadPrimitive.Viewport>

            <div className="mx-4 mb-3 shrink-0 rounded-[22px] border border-[var(--glass-stroke-base)] bg-white/92 p-2.5 backdrop-blur-xl">
              <EditFirstComposer
                episodeId={episodeId}
                value={composerText}
                error={composerError || (assistantRuntime.error ? assistantRuntime.error.message || 'UNKNOWN_ERROR' : null)}
                pending={createBriefQuestions.isPending || createEditScript.isPending}
                onChange={setComposerText}
                onSubmit={handleComposerSubmit}
              />
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
