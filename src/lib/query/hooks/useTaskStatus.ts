'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../keys'

export type TaskItem = {
  id: string
  type: string
  targetType: string
  targetId: string
  episodeId?: string | null
  status: string
  progress?: number | null
  errorCode?: string | null
  errorMessage?: string | null
  error?: {
    code: string
    message: string
    messageKey?: string
    defaultMessage?: string
    retryable: boolean
    category: string
    userMessageKey: string
    details?: Record<string, unknown> | null
  } | null
  createdAt: string
  updatedAt: string
}

const ACTIVE_STATUS = ['queued', 'processing'] as const
const SNAPSHOT_STATUS = ['queued', 'processing', 'completed', 'failed'] as const

function buildTaskSearch(params: {
  projectId: string
  targetType?: string
  targetId?: string
  type?: string[]
  statuses: readonly string[]
  limit?: number
}) {
  const search = new URLSearchParams()
  search.set('projectId', params.projectId)
  if (params.targetType) search.set('targetType', params.targetType)
  if (params.targetId) search.set('targetId', params.targetId)
  for (const status of params.statuses) {
    search.append('status', status)
  }
  if (typeof params.limit === 'number') {
    search.set('limit', String(params.limit))
  }
  for (const taskType of params.type || []) {
    search.append('type', taskType)
  }
  return search
}

export function useTaskList(params: {
  projectId?: string | null
  targetType?: string | null
  targetId?: string | null
  type?: string[]
  statuses?: string[]
  limit?: number
  enabled?: boolean
}) {
  const enabled = (params.enabled ?? true) && !!params.projectId
  const statusKey = (params.statuses || []).slice().sort().join(',')
  const typeKey = (params.type || []).slice().sort().join(',')
  const queryKey = [
    ...queryKeys.tasks.all(params.projectId || ''),
    params.targetType || '',
    params.targetId || '',
    statusKey,
    typeKey,
    params.limit ?? '',
  ] as const

  return useQuery({
    queryKey,
    enabled,
    staleTime: 5000,
    queryFn: async () => {
      const search = buildTaskSearch({
        projectId: params.projectId!,
        targetType: params.targetType || undefined,
        targetId: params.targetId || undefined,
        type: params.type,
        statuses: (params.statuses || SNAPSHOT_STATUS),
        limit: params.limit,
      })
      const res = await fetch(`/api/tasks?${search}`)
      if (!res.ok) throw new Error('Failed to fetch tasks')
      const data = await res.json()
      return (data.tasks || []) as TaskItem[]
    },
  })
}

export function useActiveTasks(params: {
  projectId?: string | null
  targetType?: string | null
  targetId?: string | null
  type?: string[]
  enabled?: boolean
}) {
  const enabled = (params.enabled ?? true) && !!params.projectId
  const typeKey = (params.type || []).slice().sort().join(',')
  const queryKey = params.targetType && params.targetId
    ? [...queryKeys.tasks.target(params.projectId || '', params.targetType, params.targetId), typeKey] as const
    : [...queryKeys.tasks.all(params.projectId || ''), typeKey] as const

  return useQuery({
    queryKey,
    enabled,
    staleTime: 5000,
    queryFn: async () => {
      const search = buildTaskSearch({
        projectId: params.projectId!,
        targetType: params.targetType || undefined,
        targetId: params.targetId || undefined,
        type: params.type,
        statuses: ACTIVE_STATUS,
      })
      const res = await fetch(`/api/tasks?${search}`)
      if (!res.ok) throw new Error('Failed to fetch active tasks')
      const data = await res.json()
      return (data.tasks || []) as TaskItem[]
    },
  })
}

export function useTaskSnapshot(params: {
  projectId?: string | null
  targetType?: string | null
  targetId?: string | null
  enabled?: boolean
  type?: string[]
}) {
  const enabled = (params.enabled ?? true) && !!params.projectId && !!params.targetType && !!params.targetId
  const typeKey = (params.type || []).slice().sort().join(',')

  return useQuery({
    queryKey: queryKeys.tasks.snapshot(params.projectId || '', params.targetType || '', params.targetId || '', typeKey),
    enabled,
    staleTime: 5000,
    queryFn: async () => {
      const search = buildTaskSearch({
        projectId: params.projectId!,
        targetType: params.targetType || undefined,
        targetId: params.targetId || undefined,
        type: params.type,
        statuses: SNAPSHOT_STATUS,
        limit: 1,
      })
      const res = await fetch(`/api/tasks?${search}`)
      if (!res.ok) throw new Error('Failed to fetch task snapshot')
      const data = await res.json()
      const tasks = (data.tasks || []) as TaskItem[]
      return tasks[0] || null
    },
  })
}

export function useTaskStatus(params: {
  projectId?: string | null
  targetType?: string | null
  targetId?: string | null
  enabled?: boolean
  type?: string[]
}) {
  const query = useActiveTasks({
    projectId: params.projectId,
    targetType: params.targetType,
    targetId: params.targetId,
    enabled: params.enabled,
    type: params.type,
  })
  const snapshotQuery = useTaskSnapshot({
    projectId: params.projectId,
    targetType: params.targetType,
    targetId: params.targetId,
    enabled: params.enabled,
    type: params.type,
  })

  const data = useMemo(() => {
    const tasks = query.data || []
    const latest = snapshotQuery.data || tasks[0] || null
    const lastFailed = latest?.status === 'failed' ? (latest.error || null) : null
    return {
      active: tasks,
      hasActive: tasks.length > 0,
      latest,
      lastFailed,
      lastTerminal: lastFailed,
      // Backward compatibility: keep lastError but only represent FAILED.
      lastError: lastFailed,
    }
  }, [query.data, snapshotQuery.data])

  return {
    ...query,
    isFetching: query.isFetching || snapshotQuery.isFetching,
    isError: query.isError || snapshotQuery.isError,
    error: query.error || snapshotQuery.error,
    data,
  }
}
