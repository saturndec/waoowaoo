import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from './keys'
import { TASK_EVENT_TYPE } from '@/lib/task/types'
import type { TaskIntent } from '@/lib/task/intent'

export const TASK_TARGET_OVERLAY_TTL_MS = 30_000

export type TaskTargetOverlayPhase = 'queued' | 'processing'

export type TaskTargetOverlayState = {
  targetType: string
  targetId: string
  phase: TaskTargetOverlayPhase
  runningTaskId: string | null
  runningTaskType: string | null
  intent: TaskIntent
  hasOutputAtStart: boolean | null
  progress: number | null
  stage: string | null
  stageLabel: string | null
  updatedAt: string | null
  lastError: null
  expiresAt: number
}

export type TaskTargetOverlayMap = Record<string, TaskTargetOverlayState>

function toOverlayKey(targetType: string, targetId: string) {
  return `${targetType}:${targetId}`
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function buildOptimisticTaskId(targetType: string, targetId: string, now: number): string {
  return `optimistic:${targetType}:${targetId}:${now.toString(36)}`
}

function pruneExpiredOverlay(prev: TaskTargetOverlayMap | undefined, now: number) {
  const next: TaskTargetOverlayMap = { ...(prev || {}) }
  for (const [overlayKey, value] of Object.entries(next)) {
    if ((value?.expiresAt || 0) <= now) {
      delete next[overlayKey]
    }
  }
  return next
}

export function upsertTaskTargetOverlay(
  queryClient: QueryClient,
  params: {
    projectId: string
    targetType: string
    targetId: string
    phase?: TaskTargetOverlayPhase
    runningTaskId?: string | null
    runningTaskType?: string | null
    intent?: TaskIntent
    hasOutputAtStart?: boolean | null
    progress?: number | null
    stage?: string | null
    stageLabel?: string | null
    updatedAt?: string | null
  },
) {
  const now = Date.now()
  const key = toOverlayKey(params.targetType, params.targetId)
  queryClient.setQueryData<TaskTargetOverlayMap>(
    queryKeys.tasks.targetStateOverlay(params.projectId),
    (prev) => {
      const next = pruneExpiredOverlay(prev, now)
      const existing = next[key]
      const runningTaskId = normalizeOptionalString(params.runningTaskId)
        || normalizeOptionalString(existing?.runningTaskId)
        || buildOptimisticTaskId(params.targetType, params.targetId, now)
      const runningTaskType = normalizeOptionalString(params.runningTaskType)
        || normalizeOptionalString(existing?.runningTaskType)
      next[key] = {
        targetType: params.targetType,
        targetId: params.targetId,
        phase: params.phase || 'queued',
        runningTaskId,
        runningTaskType,
        intent: params.intent || 'process',
        hasOutputAtStart: params.hasOutputAtStart ?? null,
        progress: params.progress ?? null,
        stage: params.stage ?? null,
        stageLabel: params.stageLabel ?? null,
        updatedAt: params.updatedAt || new Date(now).toISOString(),
        lastError: null,
        expiresAt: now + TASK_TARGET_OVERLAY_TTL_MS,
      }
      return next
    },
  )
}

export function clearTaskTargetOverlay(
  queryClient: QueryClient,
  params: {
    projectId: string
    targetType: string
    targetId: string
  },
) {
  const key = toOverlayKey(params.targetType, params.targetId)
  queryClient.setQueryData<TaskTargetOverlayMap>(
    queryKeys.tasks.targetStateOverlay(params.projectId),
    (prev) => {
      if (!prev || !prev[key]) return prev || {}
      const next: TaskTargetOverlayMap = { ...prev }
      delete next[key]
      return next
    },
  )
}

export function applyTaskLifecycleToOverlay(
  queryClient: QueryClient,
  params: {
    projectId: string
    lifecycleType: string | null
    targetType: string | null
    targetId: string | null
    taskId: string | null
    taskType: string | null
    intent: TaskIntent
    hasOutputAtStart: boolean | null
    progress: number | null
    stage: string | null
    stageLabel: string | null
    eventTs: string | null
  },
) {
  if (!params.targetType || !params.targetId) return
  if (params.lifecycleType === TASK_EVENT_TYPE.CREATED) {
    upsertTaskTargetOverlay(queryClient, {
      projectId: params.projectId,
      targetType: params.targetType,
      targetId: params.targetId,
      phase: 'queued',
      runningTaskId: params.taskId,
      runningTaskType: params.taskType,
      intent: params.intent,
      hasOutputAtStart: params.hasOutputAtStart,
      progress: params.progress,
      stage: params.stage,
      stageLabel: params.stageLabel,
      updatedAt: params.eventTs,
    })
    return
  }

  if (params.lifecycleType === TASK_EVENT_TYPE.PROCESSING) {
    upsertTaskTargetOverlay(queryClient, {
      projectId: params.projectId,
      targetType: params.targetType,
      targetId: params.targetId,
      phase: 'processing',
      runningTaskId: params.taskId,
      runningTaskType: params.taskType,
      intent: params.intent,
      hasOutputAtStart: params.hasOutputAtStart,
      progress: params.progress,
      stage: params.stage,
      stageLabel: params.stageLabel,
      updatedAt: params.eventTs,
    })
    return
  }

  if (
    params.lifecycleType === TASK_EVENT_TYPE.COMPLETED ||
    params.lifecycleType === TASK_EVENT_TYPE.FAILED
  ) {
    const key = toOverlayKey(params.targetType, params.targetId)
    queryClient.setQueryData<TaskTargetOverlayMap>(
      queryKeys.tasks.targetStateOverlay(params.projectId),
      (prev) => {
        if (!prev || !prev[key]) return prev || {}
        const current = prev[key]
        const incomingTaskId = normalizeOptionalString(params.taskId)
        const currentTaskId = normalizeOptionalString(current.runningTaskId)
        if (incomingTaskId && currentTaskId && incomingTaskId !== currentTaskId) {
          return prev
        }
        const next: TaskTargetOverlayMap = { ...prev }
        delete next[key]
        return next
      },
    )
  }
}
