'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../keys'
import type { TaskIntent } from '@/lib/task/intent'
import type { TaskTargetOverlayMap } from '../task-target-overlay'
import { createScopedLogger } from '@/lib/logging/core'

export type TaskTargetStateQuery = {
  targetType: string
  targetId: string
  types?: string[]
}

export type TaskTargetState = {
  targetType: string
  targetId: string
  phase: 'idle' | 'queued' | 'processing' | 'completed' | 'failed'
  runningTaskId: string | null
  runningTaskType: string | null
  intent: TaskIntent
  hasOutputAtStart: boolean | null
  progress: number | null
  stage: string | null
  stageLabel: string | null
  lastError: {
    code: string
    message: string
  } | null
  updatedAt: string | null
}

type TaskTargetStateBatchSubscriber = {
  targets: TaskTargetStateQuery[]
  resolve: (states: TaskTargetState[]) => void
  reject: (error: unknown) => void
}

type TaskTargetStateBatch = {
  targetsByKey: Map<string, TaskTargetStateQuery>
  subscribers: TaskTargetStateBatchSubscriber[]
  timer: ReturnType<typeof setTimeout> | null
}

const TARGET_STATE_BATCH_WINDOW_MS = 120
const TARGET_STATE_CHUNK_SIZE = 500
const pendingTaskTargetStateBatches = new Map<string, TaskTargetStateBatch>()
const mergeTraceSignatureByKey = new Map<string, string>()
const taskTargetStateLogger = createScopedLogger({
  module: 'query.use-task-target-state-map',
})

function traceFrontend(event: string, details: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  console.info(`[FE_TASK_TRACE] ${event}`, details)
}

function stateKey(targetType: string, targetId: string) {
  return `${targetType}:${targetId}`
}

function targetQueryKey(target: TaskTargetStateQuery) {
  const types = (target.types || []).filter(Boolean).sort()
  return `${target.targetType}:${target.targetId}:${types.join(',')}`
}

function normalizeTargets(targets: TaskTargetStateQuery[]) {
  const deduped = new Map<string, TaskTargetStateQuery>()
  for (const target of targets) {
    if (!target.targetType || !target.targetId) continue
    const types = (target.types || []).filter(Boolean).sort()
    const key = `${target.targetType}:${target.targetId}:${types.join(',')}`
    deduped.set(key, {
      targetType: target.targetType,
      targetId: target.targetId,
      ...(types.length ? { types } : {}),
    })
  }
  return Array.from(deduped.values()).sort((a, b) => {
    const aTypes = (a.types || []).join(',')
    const bTypes = (b.types || []).join(',')
    if (a.targetType !== b.targetType) return a.targetType.localeCompare(b.targetType)
    if (a.targetId !== b.targetId) return a.targetId.localeCompare(b.targetId)
    return aTypes.localeCompare(bTypes)
  })
}

function buildIdleState(target: TaskTargetStateQuery): TaskTargetState {
  return {
    targetType: target.targetType,
    targetId: target.targetId,
    phase: 'idle',
    runningTaskId: null,
    runningTaskType: null,
    intent: 'process',
    hasOutputAtStart: null,
    progress: null,
    stage: null,
    stageLabel: null,
    lastError: null,
    updatedAt: null,
  }
}

function matchesTaskTypeWhitelist(
  whitelist: string[] | undefined,
  runningTaskType: string | null,
): boolean {
  if (!whitelist || whitelist.length === 0) return true
  if (!runningTaskType) return true
  const normalized = runningTaskType.toLowerCase()
  return whitelist.some((type) => type.toLowerCase() === normalized)
}

function shouldTraceMergeTarget(targetType: string) {
  return targetType === 'NovelPromotionPanel'
}

function logMergeDecision(params: {
  projectId: string | null | undefined
  key: string
  decision:
  | 'overlay_applied'
  | 'overlay_expired'
  | 'overlay_phase_ignored'
  | 'overlay_task_type_mismatch'
  | 'server_processing_authoritative'
  runtimePhase: string | null
  runtimeTaskId: string | null
  runtimeTaskType: string | null
  currentPhase: string | null
  whitelist: string[]
}) {
  const signature = [
    params.decision,
    params.runtimePhase || '',
    params.runtimeTaskId || '',
    params.runtimeTaskType || '',
    params.currentPhase || '',
    params.whitelist.join(','),
  ].join('|')
  const last = mergeTraceSignatureByKey.get(params.key)
  if (last === signature) return
  mergeTraceSignatureByKey.set(params.key, signature)
  taskTargetStateLogger.info({
    action: 'task-state.merge.decision',
    message: 'task state merge decision',
    details: {
      projectId: params.projectId || null,
      key: params.key,
      decision: params.decision,
      runtimePhase: params.runtimePhase,
      runtimeTaskId: params.runtimeTaskId,
      runtimeTaskType: params.runtimeTaskType,
      currentPhase: params.currentPhase,
      whitelist: params.whitelist,
    },
  })
  traceFrontend('task-state.merge.decision', {
    projectId: params.projectId || null,
    key: params.key,
    decision: params.decision,
    runtimePhase: params.runtimePhase,
    runtimeTaskId: params.runtimeTaskId,
    runtimeTaskType: params.runtimeTaskType,
    currentPhase: params.currentPhase,
    whitelist: params.whitelist,
  })
}

/** 将数组分成固定大小的块 */
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

/** 发送单个 targets 请求（targets 长度必须 <= TARGET_STATE_CHUNK_SIZE） */
async function fetchTargetStatesChunk(
  projectId: string,
  targets: TaskTargetStateQuery[],
): Promise<TaskTargetState[]> {
  const response = await fetch('/api/task-target-states', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, targets }),
  })
  if (!response.ok) {
    throw new Error('Failed to fetch task target states')
  }
  const payload = await response.json()
  return (payload?.states || []) as TaskTargetState[]
}

async function flushTaskTargetStateBatch(projectId: string) {
  const batch = pendingTaskTargetStateBatches.get(projectId)
  if (!batch) return

  pendingTaskTargetStateBatches.delete(projectId)
  const mergedTargets = Array.from(batch.targetsByKey.values())
  const subscribers = batch.subscribers.slice()

  try {
    // 将 targets 按 TARGET_STATE_CHUNK_SIZE 分片，并行请求
    const chunks = chunkArray(mergedTargets, TARGET_STATE_CHUNK_SIZE)
    const chunkResults = await Promise.all(
      chunks.map((chunk) => fetchTargetStatesChunk(projectId, chunk)),
    )

    // 合并所有分片的结果到统一索引
    // 用 targetQueryKey（含 types）做精确索引，避免同一 (targetType, targetId)
    // 的不同 types 的状态互相覆盖（例如 image 的 processing 被 lip_sync 的 idle 覆盖）
    const byTargetQueryKey = new Map<string, TaskTargetState>()
    for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
      const chunkTargets = chunks[chunkIdx]
      const chunkStates = chunkResults[chunkIdx]
      for (let i = 0; i < chunkTargets.length && i < chunkStates.length; i++) {
        byTargetQueryKey.set(targetQueryKey(chunkTargets[i]), chunkStates[i])
      }
    }

    for (const subscriber of subscribers) {
      const subset: TaskTargetState[] = []
      for (const target of subscriber.targets) {
        const state = byTargetQueryKey.get(targetQueryKey(target))
        if (state) subset.push(state)
      }
      subscriber.resolve(subset)
    }
  } catch (error) {
    for (const subscriber of subscribers) {
      subscriber.reject(error)
    }
  }
}

function fetchTaskTargetStatesBatched(
  projectId: string,
  targets: TaskTargetStateQuery[],
) {
  return new Promise<TaskTargetState[]>((resolve, reject) => {
    const batchKey = projectId
    let batch = pendingTaskTargetStateBatches.get(batchKey)
    if (!batch) {
      batch = {
        targetsByKey: new Map<string, TaskTargetStateQuery>(),
        subscribers: [],
        timer: null,
      }
      pendingTaskTargetStateBatches.set(batchKey, batch)
    }

    for (const target of targets) {
      batch.targetsByKey.set(targetQueryKey(target), target)
    }
    batch.subscribers.push({
      targets,
      resolve,
      reject,
    })

    if (!batch.timer) {
      batch.timer = setTimeout(() => {
        void flushTaskTargetStateBatch(batchKey)
      }, TARGET_STATE_BATCH_WINDOW_MS)
    }
  })
}

export function useTaskTargetStateMap(
  projectId: string | null | undefined,
  targets: TaskTargetStateQuery[],
  options: {
    enabled?: boolean
    staleTime?: number
  } = {},
) {
  const normalizedTargets = useMemo(() => normalizeTargets(targets), [targets])
  const serializedTargets = useMemo(
    () => JSON.stringify(normalizedTargets),
    [normalizedTargets],
  )
  const enabled = (options.enabled ?? true) && !!projectId && normalizedTargets.length > 0

  const query = useQuery({
    queryKey: queryKeys.tasks.targetStates(projectId || '', serializedTargets),
    enabled,
    staleTime: options.staleTime ?? 15000,
    refetchInterval: false,
    refetchOnMount: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    queryFn: async () => {
      return fetchTaskTargetStatesBatched(projectId || '', normalizedTargets)
    },
  })

  const overlayQuery = useQuery<TaskTargetOverlayMap>({
    queryKey: queryKeys.tasks.targetStateOverlay(projectId || ''),
    enabled: false,
    initialData: {},
    queryFn: async () => ({}),
  })

  const mergedByKey = useMemo(() => {
    const map = new Map<string, TaskTargetState>()
    for (const state of query.data || []) {
      map.set(stateKey(state.targetType, state.targetId), state)
    }

    const overlay = overlayQuery.data || {}
    const now = Date.now()
    for (const target of normalizedTargets) {
      const key = stateKey(target.targetType, target.targetId)
      const runtime = overlay[key]
      if (!runtime) continue
      if (runtime.expiresAt && runtime.expiresAt <= now) {
        if (shouldTraceMergeTarget(target.targetType)) {
          logMergeDecision({
            projectId,
            key,
            decision: 'overlay_expired',
            runtimePhase: runtime.phase,
            runtimeTaskId: runtime.runningTaskId,
            runtimeTaskType: runtime.runningTaskType,
            currentPhase: map.get(key)?.phase || null,
            whitelist: target.types || [],
          })
        }
        continue
      }
      if (runtime.phase !== 'queued' && runtime.phase !== 'processing') {
        if (shouldTraceMergeTarget(target.targetType)) {
          logMergeDecision({
            projectId,
            key,
            decision: 'overlay_phase_ignored',
            runtimePhase: runtime.phase,
            runtimeTaskId: runtime.runningTaskId,
            runtimeTaskType: runtime.runningTaskType,
            currentPhase: map.get(key)?.phase || null,
            whitelist: target.types || [],
          })
        }
        continue
      }
      // Skip overlay if the target has a types whitelist and the task type doesn't match
      if (!matchesTaskTypeWhitelist(target.types, runtime.runningTaskType)) {
        if (shouldTraceMergeTarget(target.targetType)) {
          logMergeDecision({
            projectId,
            key,
            decision: 'overlay_task_type_mismatch',
            runtimePhase: runtime.phase,
            runtimeTaskId: runtime.runningTaskId,
            runtimeTaskType: runtime.runningTaskType,
            currentPhase: map.get(key)?.phase || null,
            whitelist: target.types || [],
          })
        }
        continue
      }

      const current = map.get(key)
      if (current) {
        // Server-side processing state is authoritative.
        if (current.phase === 'processing') {
          if (shouldTraceMergeTarget(target.targetType)) {
            logMergeDecision({
              projectId,
              key,
              decision: 'server_processing_authoritative',
              runtimePhase: runtime.phase,
              runtimeTaskId: runtime.runningTaskId,
              runtimeTaskType: runtime.runningTaskType,
              currentPhase: current.phase,
              whitelist: target.types || [],
            })
          }
          continue
        }
      }
      map.set(key, {
        ...(current || buildIdleState(target)),
        ...runtime,
        phase: runtime.phase,
        targetType: target.targetType,
        targetId: target.targetId,
        lastError: null,
      })
      if (shouldTraceMergeTarget(target.targetType)) {
        logMergeDecision({
          projectId,
          key,
          decision: 'overlay_applied',
          runtimePhase: runtime.phase,
          runtimeTaskId: runtime.runningTaskId,
          runtimeTaskType: runtime.runningTaskType,
          currentPhase: current?.phase || null,
          whitelist: target.types || [],
        })
      }
    }
    return map
  }, [normalizedTargets, overlayQuery.data, query.data])

  const mergedData = useMemo(() => {
    return normalizedTargets.map((target) =>
      mergedByKey.get(stateKey(target.targetType, target.targetId)) || buildIdleState(target),
    )
  }, [mergedByKey, normalizedTargets])

  const byKey = useMemo(() => {
    const map = new Map<string, TaskTargetState>()
    for (const state of mergedData) {
      map.set(stateKey(state.targetType, state.targetId), state)
    }
    return map
  }, [mergedData])

  const getState = useMemo(() => {
    return (targetType: string, targetId: string) =>
      byKey.get(stateKey(targetType, targetId)) || null
  }, [byKey])

  return {
    ...query,
    data: mergedData,
    byKey,
    getState,
  }
}
