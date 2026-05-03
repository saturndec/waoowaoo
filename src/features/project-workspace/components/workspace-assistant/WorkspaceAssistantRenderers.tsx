'use client'

import React from 'react'
import {
  MessagePrimitive,
  useMessage,
  type DataMessagePartProps,
  type ToolCallMessagePartProps,
} from '@assistant-ui/react'
import type { ComponentProps } from 'react'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import type {
  AgentPlanPartData,
  ConfirmationRequestPartData,
  ProjectAgentStopPartData,
  ProjectContextPartData,
  ProjectPhasePartData,
  TaskBatchSubmittedPartData,
  TaskSubmittedPartData,
} from '@/lib/project-agent/types'
import { useRevertMutationBatch } from '@/lib/query/hooks'
import { MarkdownTextPart } from './MarkdownTextPart'

const AGENT_SKILL_LABELS: Record<string, string> = {
  'creative-direction': '创意方向',
  screenwriting: '剧本写作',
  'story-structure': '故事结构',
  'storyboard-direction': '分镜指导',
  'visual-continuity': '视觉连续性',
  'location-selection': '场景选择',
  'character-selection': '角色选择',
  'audio-direction': '声音指导',
  'media-generation': '媒体生成',
}

function formatSkillLabel(skillId: string | null | undefined): string {
  if (!skillId) return '未命名技能'
  return AGENT_SKILL_LABELS[skillId] || skillId
}

type MessagePartComponents = NonNullable<ComponentProps<typeof MessagePrimitive.Parts>['components']>

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0)
}

function ProjectPhaseDataCard({ data }: DataMessagePartProps<ProjectPhasePartData>) {
  const t = useTranslations('assistantAgent')
  return (
    <div className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-[var(--glass-text-primary)]">{t('cards.projectPhase')}</div>
          <div className="mt-1 text-xs text-[var(--glass-text-secondary)]">{data.phase}</div>
        </div>
        <div className="rounded-full bg-[var(--glass-bg-surface)] px-2.5 py-1 text-xs text-[var(--glass-text-secondary)]">
          {t('cards.runs', { count: data.snapshot.activePlanRunCount })}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[var(--glass-text-secondary)]">
        <div className="rounded-xl bg-[var(--glass-bg-muted)]/70 px-3 py-2">{t('cards.clips', { count: data.snapshot.progress.clipCount })}</div>
        <div className="rounded-xl bg-[var(--glass-bg-muted)]/70 px-3 py-2">{t('cards.screenplays', { count: data.snapshot.progress.screenplayClipCount })}</div>
        <div className="rounded-xl bg-[var(--glass-bg-muted)]/70 px-3 py-2">{t('cards.storyboards', { count: data.snapshot.progress.storyboardCount })}</div>
        <div className="rounded-xl bg-[var(--glass-bg-muted)]/70 px-3 py-2">{t('cards.voice', { count: data.snapshot.progress.voiceLineCount })}</div>
      </div>
    </div>
  )
}

export function AgentStopDataCard({ data }: DataMessagePartProps<ProjectAgentStopPartData>) {
  const t = useTranslations('assistantAgent')
  return (
    <div className="rounded-2xl border border-[var(--glass-tone-warn-fg)]/30 bg-[var(--glass-bg-muted)]/70 p-3 text-xs text-[var(--glass-text-secondary)]">
      <div className="text-sm font-medium text-[var(--glass-text-primary)]">{t('cards.maxSteps')}</div>
      <div className="mt-1">{t('cards.stepUsage', { stepCount: data.stepCount, maxSteps: data.maxSteps })}</div>
      <div className="mt-2 text-[var(--glass-text-tertiary)]">{t('cards.reason', { reason: data.reason })}</div>
    </div>
  )
}

export function ApprovalCard(props: {
  planId: string
  summary: string
  reasons: string[]
  onApprove: (planId: string) => Promise<void>
  onReject: (params: { planId: string; note?: string }) => Promise<void>
  approvePending: boolean
  rejectPending: boolean
}) {
  const t = useTranslations('assistantAgent')
  const [note, setNote] = useState('')

  return (
    <div className="rounded-2xl border border-[var(--glass-tone-warn-fg)]/30 bg-[var(--glass-bg-muted)]/70 p-3">
      <div className="text-sm font-medium text-[var(--glass-text-primary)]">{t('cards.approvalRequired')}</div>
      <div className="mt-1 text-xs text-[var(--glass-text-secondary)]">{props.summary}</div>
      {props.reasons.length > 0 ? (
        <div className="mt-3 max-h-32 space-y-1 overflow-y-auto text-xs text-[var(--glass-tone-warn-fg)]">
          {props.reasons.map((reason) => (
            <div key={reason}>{reason}</div>
          ))}
        </div>
      ) : null}
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder={t('cards.rejectNotePlaceholder')}
        className="mt-3 min-h-20 w-full rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-2 text-sm text-[var(--glass-text-primary)] outline-none"
      />
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="flex-1 rounded-xl bg-[var(--glass-accent-from)] px-3 py-2 text-sm font-medium text-white"
          onClick={() => { void props.onApprove(props.planId) }}
          disabled={props.approvePending}
        >
          {t('cards.approve')}
        </button>
        <button
          type="button"
          className="flex-1 rounded-xl border border-[var(--glass-stroke-base)] px-3 py-2 text-sm font-medium text-[var(--glass-text-primary)]"
          onClick={() => { void props.onReject({ planId: props.planId, note }) }}
          disabled={props.rejectPending}
        >
          {t('cards.reject')}
        </button>
      </div>
    </div>
  )
}

export function HiddenApprovalRequestDataCard() {
  return null
}

export function ConfirmationActionCard(props: {
  operationId: string
  summary: string
  argsHint?: Record<string, unknown> | null
  onConfirm: () => Promise<void>
  onCancel: () => Promise<void>
  confirmPending: boolean
  cancelPending: boolean
}) {
  const t = useTranslations('assistantAgent')
  return (
    <div className="rounded-2xl border border-[var(--glass-tone-warn-fg)]/30 bg-[var(--glass-bg-muted)]/70 p-3 text-xs text-[var(--glass-text-secondary)]">
      <div className="text-sm font-medium text-[var(--glass-text-primary)]">{t('cards.confirmationRequired')}</div>
      <div className="mt-1">{props.summary}</div>
      <div className="mt-2 rounded-xl bg-[var(--glass-bg-surface)]/70 px-3 py-2 font-mono text-[10px] text-[var(--glass-text-tertiary)]">
        {t('cards.operationLabel')}: {props.operationId}
      </div>
      {props.argsHint ? (
        <pre className="mt-2 overflow-x-auto rounded-xl bg-[var(--glass-bg-surface)]/70 px-3 py-2 text-[10px] text-[var(--glass-text-tertiary)]">
          {JSON.stringify(props.argsHint, null, 2)}
        </pre>
      ) : null}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="flex-1 rounded-xl bg-[var(--glass-accent-from)] px-3 py-2 text-sm font-medium text-white"
          onClick={() => { void props.onConfirm() }}
          disabled={props.confirmPending}
        >
          {props.confirmPending ? t('cards.confirmRunning') : t('cards.confirmContinue')}
        </button>
        <button
          type="button"
          className="flex-1 rounded-xl border border-[var(--glass-stroke-base)] px-3 py-2 text-sm font-medium text-[var(--glass-text-primary)]"
          onClick={() => { void props.onCancel() }}
          disabled={props.cancelPending}
        >
          {props.cancelPending ? t('cards.cancelRunning') : t('cards.cancelAction')}
        </button>
      </div>
    </div>
  )
}

function InlineConfirmationRequestDataCard(props: DataMessagePartProps<ConfirmationRequestPartData> & {
  onConfirmOperation: (operationId: string, argsHint?: Record<string, unknown> | null) => Promise<void>
  onCancelOperation: (operationId: string) => Promise<void>
  confirmationSubmittingKey: string | null
}) {
  return (
    <ConfirmationActionCard
      operationId={props.data.operationId}
      summary={props.data.summary}
      argsHint={props.data.argsHint ?? null}
      onConfirm={async () => props.onConfirmOperation(props.data.operationId, props.data.argsHint ?? null)}
      onCancel={async () => props.onCancelOperation(props.data.operationId)}
      confirmPending={props.confirmationSubmittingKey === `confirm:${props.data.operationId}:continue`}
      cancelPending={props.confirmationSubmittingKey === `confirm:${props.data.operationId}:cancel`}
    />
  )
}

function TaskSubmittedDataCard({ data }: DataMessagePartProps<TaskSubmittedPartData>) {
  const t = useTranslations('assistantAgent')
  const revertMutationBatch = useRevertMutationBatch()
  const [undoResult, setUndoResult] = useState<{ ok: boolean; message?: string } | null>(null)

  const handleUndo = async () => {
    if (!data.mutationBatchId) return
    if (!window.confirm(t('cards.undoConfirmSingle'))) return
    setUndoResult(null)
    try {
      const result = await revertMutationBatch.mutateAsync(data.mutationBatchId)
      if (result.ok) {
        setUndoResult({ ok: true, message: t('cards.undoSucceeded', { count: result.reverted }) })
      } else {
        setUndoResult({ ok: false, message: result.error || t('cards.undoFailed') })
      }
    } catch (error) {
      setUndoResult({ ok: false, message: error instanceof Error ? error.message : String(error) })
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/70 p-3 text-xs text-[var(--glass-text-secondary)]">
      <div className="text-sm font-medium text-[var(--glass-text-primary)]">{t('cards.taskSubmitted')}</div>
      <div className="mt-2">{t('cards.operationLabel')}: {data.operationId}</div>
      <div>{t('cards.taskIdLabel')}: {data.taskId}</div>
      <div>{t('cards.statusLabel')}: {data.status}</div>
      {data.runId ? <div>{t('cards.runIdLabel')}: {data.runId}</div> : null}
      {typeof data.deduped === 'boolean' ? <div>{t('cards.dedupedLabel')}: {String(data.deduped)}</div> : null}
      {data.mutationBatchId ? <div>{t('cards.undoBatchIdLabel')}: {data.mutationBatchId}</div> : null}
      {data.mutationBatchId ? (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            className="rounded-xl bg-[var(--glass-tone-warn-fg)]/90 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
            onClick={() => { void handleUndo() }}
            disabled={revertMutationBatch.isPending}
          >
            {revertMutationBatch.isPending ? t('cards.undoRunning') : t('cards.undoCurrentChange')}
          </button>
          {undoResult ? (
            <div className={undoResult.ok ? 'text-[var(--glass-tone-success-fg)]' : 'text-[var(--glass-tone-warn-fg)]'}>
              {undoResult.message}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function TaskBatchSubmittedDataCard({ data }: DataMessagePartProps<TaskBatchSubmittedPartData>) {
  const t = useTranslations('assistantAgent')
  const revertMutationBatch = useRevertMutationBatch()
  const [undoResult, setUndoResult] = useState<{ ok: boolean; message?: string } | null>(null)

  const handleUndo = async () => {
    if (!data.mutationBatchId) return
    if (!window.confirm(t('cards.undoConfirmBatch'))) return
    setUndoResult(null)
    try {
      const result = await revertMutationBatch.mutateAsync(data.mutationBatchId)
      if (result.ok) {
        setUndoResult({ ok: true, message: t('cards.undoSucceeded', { count: result.reverted }) })
      } else {
        setUndoResult({ ok: false, message: result.error || t('cards.undoFailed') })
      }
    } catch (error) {
      setUndoResult({ ok: false, message: error instanceof Error ? error.message : String(error) })
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/70 p-3 text-xs text-[var(--glass-text-secondary)]">
      <div className="text-sm font-medium text-[var(--glass-text-primary)]">{t('cards.batchTaskSubmitted')}</div>
      <div className="mt-2">{t('cards.operationLabel')}: {data.operationId}</div>
      <div>{t('cards.totalLabel')}: {String(data.total)}</div>
      <div className="mt-2 space-y-1 rounded-xl bg-[var(--glass-bg-muted)]/70 px-3 py-2 font-mono text-[10px] text-[var(--glass-text-tertiary)]">
        {(data.taskIds || []).slice(0, 8).map((taskId: string) => (
          <div key={taskId}>{taskId}</div>
        ))}
        {(data.taskIds || []).length > 8 ? <div>…</div> : null}
      </div>
      {data.mutationBatchId ? <div className="mt-2">{t('cards.undoBatchIdLabel')}: {data.mutationBatchId}</div> : null}
      {data.mutationBatchId ? (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            className="rounded-xl bg-[var(--glass-tone-warn-fg)]/90 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
            onClick={() => { void handleUndo() }}
            disabled={revertMutationBatch.isPending}
          >
            {revertMutationBatch.isPending ? t('cards.undoRunning') : t('cards.undoCurrentBatch')}
          </button>
          {undoResult ? (
            <div className={undoResult.ok ? 'text-[var(--glass-tone-success-fg)]' : 'text-[var(--glass-tone-warn-fg)]'}>
              {undoResult.message}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function AgentPlanDataCard({ data }: DataMessagePartProps<AgentPlanPartData>) {
  return (
    <div className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/70 p-3">
      <div className="text-sm font-medium text-[var(--glass-text-primary)]">{data.summary || data.goal}</div>
      <div className="mt-1 text-xs text-[var(--glass-text-secondary)]">
        {data.validation.ok ? 'Plan validated' : 'Plan needs revision'}
      </div>
      <div className="mt-3 space-y-2">
        {data.steps.map((step: AgentPlanPartData['steps'][number]) => (
          <div key={`${data.planId}:step:${step.stepKey}`} className="rounded-xl bg-[var(--glass-bg-muted)]/70 px-3 py-2 text-xs">
            <div className="font-medium text-[var(--glass-text-primary)]">{formatSkillLabel(step.skillId)}</div>
            <div className="mt-1 text-[var(--glass-text-secondary)]">{step.operationId}</div>
            <div className="mt-1 text-[var(--glass-text-tertiary)]">{step.reason}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ProjectContextDataCard({ data }: DataMessagePartProps<ProjectContextPartData>) {
  const t = useTranslations('assistantAgent')
  return (
    <div className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/70 p-3 text-xs text-[var(--glass-text-secondary)]">
      <div className="font-medium text-[var(--glass-text-primary)]">{t('cards.projectContext')}</div>
      <div className="mt-2">{t('cards.projectLabel')}: {data.context.projectName}</div>
      <div>{t('cards.episodeLabel')}: {data.context.episodeName}</div>
      <div>{t('cards.workspaceLabel')}: {t('panel.workspaceStatus')}</div>
    </div>
  )
}


export function WorkspaceAssistantToolCallCard(props: ToolCallMessagePartProps) {
  const t = useTranslations('assistantAgent')
  const [expanded, setExpanded] = useState(false)
  const toolStatus = props.status.type
  const inputText = JSON.stringify(props.args ?? {}, null, 2)
  const outputText = props.result === undefined ? '' : JSON.stringify(props.result, null, 2)
  const stateClassName = toolStatus === 'incomplete'
      ? 'border-[rgba(59,130,246,0.24)] bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)]'
      : toolStatus === 'requires-action'
        ? 'border-[rgba(245,158,11,0.24)] bg-[var(--glass-tone-warning-bg)] text-[var(--glass-tone-warning-fg)]'
        : 'border-[rgba(34,197,94,0.24)] bg-[var(--glass-tone-success-bg)] text-[var(--glass-tone-success-fg)]'
  const summaryText = toolStatus === 'complete'
    ? t('toolCall.success')
    : toolStatus === 'requires-action'
      ? t('toolCall.needsAction')
      : t('toolCall.running')

  return (
    <div className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[rgba(255,255,255,0.82)]">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
        onClick={() => setExpanded((current) => !current)}
      >
        <div className="min-w-0 max-w-[calc(100%-6rem)] flex-1">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--glass-text-tertiary)]">
            <AppIcon name="settingsHex" className="h-3.5 w-3.5" />
            <span>{t('toolCall.title')}</span>
          </div>
          <div className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold text-[var(--glass-text-primary)]">
            {props.toolName}
          </div>
        </div>
        <div className="flex min-w-[7.5rem] shrink-0 items-center justify-end gap-2">
          <div className={`rounded-full border px-3 py-1 text-[11px] font-medium shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] ${stateClassName}`}>
            {summaryText}
          </div>
          <div className="text-[11px] text-[var(--glass-text-tertiary)]">{expanded ? t('toolCall.hide') : t('toolCall.show')}</div>
        </div>
      </button>
      {expanded ? (
        <div className="space-y-2 border-t border-[var(--glass-stroke-base)] px-3 py-3">
          <div className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/60 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--glass-text-tertiary)]">{t('toolCall.arguments')}</div>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-[11px] leading-5 text-[var(--glass-text-secondary)]">{inputText}</pre>
          </div>
          <div className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/60 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--glass-text-tertiary)]">{t('toolCall.result')}</div>
            {props.result === undefined ? (
              <div className="mt-2 text-xs text-[var(--glass-text-secondary)]">{t('toolCall.waiting')}</div>
            ) : (
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-[11px] leading-5 text-[var(--glass-text-secondary)]">{outputText}</pre>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

interface WorkspaceAssistantMessagePartComponentsOptions {
  onConfirmOperation: (operationId: string, argsHint?: Record<string, unknown> | null) => Promise<void>
  onCancelOperation: (operationId: string) => Promise<void>
  confirmationSubmittingKey: string | null
}

export function useWorkspaceAssistantMessagePartComponents({
  onConfirmOperation,
  onCancelOperation,
  confirmationSubmittingKey,
}: WorkspaceAssistantMessagePartComponentsOptions): MessagePartComponents {
  return useMemo<MessagePartComponents>(() => ({
    Text: MarkdownTextPart,
    tools: {
      Fallback: WorkspaceAssistantToolCallCard,
    },
    data: {
      by_name: {
        'agent-stop': AgentStopDataCard,
        'project-phase': ProjectPhaseDataCard,
        'confirmation-request': (props) => (
          <InlineConfirmationRequestDataCard
            {...props}
            onConfirmOperation={onConfirmOperation}
            onCancelOperation={onCancelOperation}
            confirmationSubmittingKey={confirmationSubmittingKey}
          />
        ),
        'task-submitted': TaskSubmittedDataCard,
        'task-batch-submitted': TaskBatchSubmittedDataCard,
        plan: AgentPlanDataCard,
        'project-context': ProjectContextDataCard,
      },
    },
  }), [
    confirmationSubmittingKey,
    onCancelOperation,
    onConfirmOperation,
  ])
}

function HiddenConversationSummaryMessage(props: {
  children: React.ReactNode
}) {
  const isSummary = useMessage((state) => state.metadata.custom?.projectAgentConversationSummary === true)
  if (isSummary) return null
  return <>{props.children}</>
}

export function WorkspaceAssistantThreadMessage(props: {
  messagePartComponents: MessagePartComponents
}) {
  const t = useTranslations('assistantAgent')
  return (
    <>
      <MessagePrimitive.If user>
        <div className="ml-auto flex w-full max-w-[88%] flex-col items-end gap-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--glass-text-tertiary)]">{t('thread.user')}</div>
          <MessagePrimitive.Root className="w-fit rounded-2xl bg-[var(--glass-accent-from)] px-3 py-3 text-sm text-white shadow-[0_12px_30px_rgba(59,130,246,0.18)]">
            <MessagePrimitive.Parts />
          </MessagePrimitive.Root>
        </div>
      </MessagePrimitive.If>

      <MessagePrimitive.If assistant>
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--glass-text-tertiary)]">
            <AppIcon name="brain" className="h-3.5 w-3.5 text-[var(--glass-accent-from)]" />
            <span>{t('thread.modelOutput')}</span>
          </div>
          <MessagePrimitive.Root className="space-y-3 rounded-[22px] border border-[rgba(59,130,246,0.12)] bg-[rgba(255,255,255,0.8)] px-3 py-3 text-sm text-[var(--glass-text-primary)] shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
            <MessagePrimitive.Parts components={props.messagePartComponents} />
          </MessagePrimitive.Root>
        </div>
      </MessagePrimitive.If>

      <MessagePrimitive.If system>
        <HiddenConversationSummaryMessage>
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--glass-text-tertiary)]">{t('thread.executionEvent')}</div>
            <MessagePrimitive.Root className="space-y-3 rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/78 px-3 py-3 text-sm text-[var(--glass-text-primary)]">
              <MessagePrimitive.Parts components={props.messagePartComponents} />
            </MessagePrimitive.Root>
          </div>
        </HiddenConversationSummaryMessage>
      </MessagePrimitive.If>
    </>
  )
}
