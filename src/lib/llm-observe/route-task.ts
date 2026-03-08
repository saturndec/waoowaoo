import { NextRequest, NextResponse } from 'next/server'
import { getRequestId } from '@/lib/api-errors'
import { submitTask } from '@/lib/task/submitter'
import { TASK_TYPE, type TaskType } from '@/lib/task/types'
import { buildDefaultTaskBillingInfo, isBillableTaskType } from '@/lib/billing'
import { LLM_OBSERVE_DEFAULT_MODE, LLM_OBSERVE_ENABLED } from './config'
import type { LLMObserveDisplayMode } from './config'
import { getLLMTaskPolicy } from './task-policy'
import { getTaskFlowMeta } from './stage-pipeline'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { getProjectModelConfig, getUserModelConfig } from '@/lib/config-service'
import { resolveAnalysisModel } from '@/lib/workers/handlers/resolve-analysis-model'

export function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

export function parseSyncFlag(value: unknown): boolean {
  if (value === true || value === 1 || value === '1') return true
  if (typeof value !== 'string') return false
  const normalized = value.trim().toLowerCase()
  return normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

export function resolveDisplayMode(value: unknown, fallback: LLMObserveDisplayMode): LLMObserveDisplayMode {
  if (value === 'detail' || value === 'loading') return value
  return fallback
}

export function resolvePositiveInteger(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value)
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }
  return fallback
}

export function shouldRunSyncTask(request: NextRequest, body?: unknown) {
  if (request.headers.get('x-internal-task-id')) return true
  const payload = toObject(body)
  if (parseSyncFlag(payload.sync)) return true
  if (parseSyncFlag(request.nextUrl.searchParams.get('sync'))) return true
  return false
}

function shouldRunAsyncTask(request: NextRequest, body?: unknown) {
  const payload = toObject(body)
  if (parseSyncFlag(payload.async)) return true
  if (parseSyncFlag(request.nextUrl.searchParams.get('async'))) return true
  return false
}

export async function maybeSubmitLLMTask(params: {
  request: NextRequest
  userId: string
  projectId: string
  episodeId?: string | null
  type: TaskType
  targetType: string
  targetId: string
  routePath: string
  body?: unknown
  dedupeKey?: string | null
  priority?: number
}) {
  const policy = getLLMTaskPolicy(params.type)
  const observeEnabled = LLM_OBSERVE_ENABLED || policy.consoleEnabled
  if (!observeEnabled) return null
  if (!policy.consoleEnabled && !shouldRunAsyncTask(params.request, params.body)) return null
  if (shouldRunSyncTask(params.request, params.body)) return null

  const payload = toObject(params.body)
  const displayMode = resolveDisplayMode(
    payload.displayMode,
    policy.displayMode || LLM_OBSERVE_DEFAULT_MODE,
  )
  const payloadMeta = toObject(payload.meta)
  const locale = resolveRequiredTaskLocale(params.request, payload)
  const userTierFromPayload = typeof payloadMeta.userTier === 'string' ? payloadMeta.userTier : null
  const priority = params.priority ?? policy.priority ?? 0
  const defaultFlowMeta = getTaskFlowMeta(params.type)
  const flowId =
    typeof payload.flowId === 'string' && payload.flowId.trim()
      ? payload.flowId.trim()
      : defaultFlowMeta.flowId
  const flowStageIndex = resolvePositiveInteger(payload.flowStageIndex, defaultFlowMeta.flowStageIndex)
  const flowStageTotal = resolvePositiveInteger(payload.flowStageTotal, defaultFlowMeta.flowStageTotal)
  const flowStageTitle =
    typeof payload.flowStageTitle === 'string' && payload.flowStageTitle.trim()
      ? payload.flowStageTitle.trim()
      : defaultFlowMeta.flowStageTitle

  // Ensure payload contains the same resolved analysis model the worker will actually use,
  // so billing info can be generated consistently for billable text tasks.
  const hasModel = Boolean(
    (typeof payload.analysisModel === 'string' && payload.analysisModel.trim())
      || (typeof payload.model === 'string' && payload.model.trim()),
  )
  if (!hasModel && isBillableTaskType(params.type)) {
    const useUserLevelConfig = params.type === TASK_TYPE.EPISODE_SPLIT_LLM
      || params.type === TASK_TYPE.REFERENCE_TO_CHARACTER

    if (useUserLevelConfig) {
      const userConfig = await getUserModelConfig(params.userId)
      if (userConfig.analysisModel) {
        payload.analysisModel = userConfig.analysisModel
      }
    } else {
      const modelConfig = await getProjectModelConfig(params.projectId, params.userId)
      const resolvedAnalysisModel = await resolveAnalysisModel({
        userId: params.userId,
        projectAnalysisModel: modelConfig.analysisModel,
      }).catch(() => null)

      if (resolvedAnalysisModel) {
        payload.analysisModel = resolvedAnalysisModel
      }
    }
  }

  const billingInfo = isBillableTaskType(params.type)
    ? buildDefaultTaskBillingInfo(params.type, payload)
    : null

  const taskResult = await submitTask({
    userId: params.userId,
    locale,
    requestId: getRequestId(params.request),
    projectId: params.projectId,
    episodeId: params.episodeId || null,
    type: params.type,
    targetType: params.targetType,
    targetId: params.targetId,
    payload: {
      ...payload,
      sync: 1,
      displayMode,
      flowId,
      flowStageIndex,
      flowStageTotal,
      flowStageTitle,
      meta: {
        ...payloadMeta,
        route: params.routePath,
        locale,
        userTier: userTierFromPayload,
        flowId,
        flowStageIndex,
        flowStageTotal,
        flowStageTitle,
      },
    },
    dedupeKey: params.dedupeKey || null,
    priority,
    billingInfo,
  })

  return NextResponse.json(taskResult)
}
