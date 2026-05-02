import type { NextRequest } from 'next/server'
import { getRequestId } from '@/lib/api-errors'
import { submitTask } from '@/lib/task/submitter'
import { type TaskType } from '@/lib/task/types'
import { buildDefaultTaskBillingInfo, isBillableTaskType } from '@/lib/billing'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'

export function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function submitOperationTask(params: {
  request: NextRequest
  userId: string
  projectId: string
  episodeId?: string | null
  type: TaskType
  targetType: string
  targetId: string
  operationId: string
  source: string
  confirmed: boolean
  payload: Record<string, unknown>
  dedupeKey?: string | null
  priority?: number
}) {
  const locale = resolveRequiredTaskLocale(params.request, params.payload)
  const billingInfo = isBillableTaskType(params.type) ? buildDefaultTaskBillingInfo(params.type, params.payload) : null
  return await submitTask({
    userId: params.userId,
    locale,
    requestId: getRequestId(params.request),
    projectId: params.projectId,
    episodeId: params.episodeId || null,
    type: params.type,
    targetType: params.targetType,
    targetId: params.targetId,
    payload: {
      ...params.payload,
      sync: 1,
      meta: {
        ...(typeof params.payload.meta === 'object' && params.payload.meta && !Array.isArray(params.payload.meta) ? params.payload.meta as Record<string, unknown> : {}),
        locale,
      },
    },
    dedupeKey: params.dedupeKey || null,
    priority: params.priority ?? 0,
    billingInfo,
    operationId: params.operationId,
    operationSource: params.source,
    operationConfirmed: params.confirmed,
    operationRequestId: getRequestId(params.request),
  })
}
