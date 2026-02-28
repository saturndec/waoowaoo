import { createScopedLogger } from '@/lib/logging/core'
import { addTaskJob } from './queues'
import { publishTaskEvent } from './publisher'
import {
  createTask,
  markTaskEnqueueFailed,
  markTaskEnqueued,
  markTaskFailed,
  rollbackTaskBillingForTask,
  updateTaskBillingInfo,
  updateTaskPayload,
} from './service'
import { TASK_EVENT_TYPE, type TaskBillingInfo, type TaskType } from './types'
import { buildDefaultTaskBillingInfo, isBillableTaskType, InsufficientBalanceError, prepareTaskBilling } from '@/lib/billing'
import { ApiError } from '@/lib/api-errors'
import { getTaskFlowMeta } from '@/lib/llm-observe/stage-pipeline'
import type { Locale } from '@/i18n/routing'
import { attachTaskToRun, createRun } from '@/lib/run-runtime/service'
import { isAiTaskType, workflowTypeFromTaskType } from '@/lib/run-runtime/workflow'

export function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function resolveRunIdFromPayload(payload: unknown): string | null {
  const obj = toObject(payload)
  const runId = typeof obj.runId === 'string' ? obj.runId.trim() : ''
  if (runId) return runId
  const meta = toObject(obj.meta)
  const runIdFromMeta = typeof meta.runId === 'string' ? meta.runId.trim() : ''
  return runIdFromMeta || null
}

export function normalizeTaskPayload(type: TaskType, payload?: Record<string, unknown> | null) {
  const nextPayload = {
    ...(payload || {}),
  }
  const flowMeta = getTaskFlowMeta(type)
  const payloadMeta = toObject(nextPayload.meta)
  const flowId =
    typeof nextPayload.flowId === 'string' && nextPayload.flowId.trim()
      ? nextPayload.flowId.trim()
      : flowMeta.flowId
  const flowStageTitle =
    typeof nextPayload.flowStageTitle === 'string' && nextPayload.flowStageTitle.trim()
      ? nextPayload.flowStageTitle.trim()
      : flowMeta.flowStageTitle
  const flowStageIndex =
    typeof nextPayload.flowStageIndex === 'number' && Number.isFinite(nextPayload.flowStageIndex)
      ? Math.max(1, Math.floor(nextPayload.flowStageIndex))
      : flowMeta.flowStageIndex
  const flowStageTotal =
    typeof nextPayload.flowStageTotal === 'number' && Number.isFinite(nextPayload.flowStageTotal)
      ? Math.max(flowStageIndex, Math.floor(nextPayload.flowStageTotal))
      : Math.max(flowStageIndex, flowMeta.flowStageTotal)

  return {
    ...nextPayload,
    flowId,
    flowStageIndex,
    flowStageTotal,
    flowStageTitle,
    meta: {
      ...payloadMeta,
      flowId:
        typeof payloadMeta.flowId === 'string' && payloadMeta.flowId.trim()
          ? payloadMeta.flowId.trim()
          : flowId,
      flowStageIndex:
        typeof payloadMeta.flowStageIndex === 'number' && Number.isFinite(payloadMeta.flowStageIndex)
          ? Math.max(1, Math.floor(payloadMeta.flowStageIndex))
          : flowStageIndex,
      flowStageTotal:
        typeof payloadMeta.flowStageTotal === 'number' && Number.isFinite(payloadMeta.flowStageTotal)
          ? Math.max(1, Math.floor(payloadMeta.flowStageTotal))
          : flowStageTotal,
      flowStageTitle:
        typeof payloadMeta.flowStageTitle === 'string' && payloadMeta.flowStageTitle.trim()
          ? payloadMeta.flowStageTitle.trim()
          : flowStageTitle,
    },
  }
}

export async function submitTask(params: {
  userId: string
  locale: Locale
  projectId: string
  episodeId?: string | null
  type: TaskType
  targetType: string
  targetId: string
  payload?: Record<string, unknown> | null
  dedupeKey?: string | null
  priority?: number
  maxAttempts?: number
  billingInfo?: TaskBillingInfo | null
  requestId?: string | null
}) {
  const logger = createScopedLogger({
    module: 'task.submitter',
    action: 'task.submit',
    requestId: params.requestId || undefined,
    projectId: params.projectId,
    userId: params.userId,
  })

  const normalizedPayloadBase = normalizeTaskPayload(params.type, params.payload || null)
  const normalizedPayloadMeta = toObject(normalizedPayloadBase.meta)
  const normalizedPayload = {
    ...normalizedPayloadBase,
    meta: {
      ...normalizedPayloadMeta,
      locale: params.locale,
    },
  }
  const computedBillingInfo = isBillableTaskType(params.type)
    ? buildDefaultTaskBillingInfo(params.type, normalizedPayload)
    : null
  const resolvedBillingInfo = computedBillingInfo || params.billingInfo || null

  const { task, deduped } = await createTask({
    userId: params.userId,
    projectId: params.projectId,
    episodeId: params.episodeId || null,
    type: params.type,
    targetType: params.targetType,
    targetId: params.targetId,
    payload: normalizedPayload,
    dedupeKey: params.dedupeKey || null,
    priority: params.priority,
    maxAttempts: params.maxAttempts,
    billingInfo: resolvedBillingInfo || null,
  })
  let runId = resolveRunIdFromPayload(task.payload)
  if (!deduped && isAiTaskType(params.type)) {
    const run = await createRun({
      userId: params.userId,
      projectId: params.projectId,
      episodeId: params.episodeId || null,
      workflowType: workflowTypeFromTaskType(params.type),
      taskType: params.type,
      taskId: task.id,
      targetType: params.targetType,
      targetId: params.targetId,
      input: normalizedPayload,
    })
    runId = run.id
    const payloadWithRunId = {
      ...normalizedPayload,
      runId,
      meta: {
        ...toObject(normalizedPayload.meta),
        runId,
      },
    }
    await updateTaskPayload(task.id, payloadWithRunId)
    await attachTaskToRun(run.id, task.id)
  }

  let preparedBillingInfo = (task.billingInfo || resolvedBillingInfo || null) as TaskBillingInfo | null
  if (!deduped && isBillableTaskType(params.type) && (!computedBillingInfo || !computedBillingInfo.billable)) {
    await markTaskFailed(task.id, 'INVALID_PARAMS', `missing server-generated billingInfo for billable task type: ${params.type}`)
    throw new ApiError('INVALID_PARAMS', {
      message: `missing server-generated billingInfo for billable task type: ${params.type}`,
    })
  }

  if (!deduped && preparedBillingInfo) {
    try {
      preparedBillingInfo = (await prepareTaskBilling({
        id: task.id,
        userId: params.userId,
        projectId: params.projectId,
        billingInfo: preparedBillingInfo,
      })) as TaskBillingInfo | null
      if (preparedBillingInfo) {
        await updateTaskBillingInfo(task.id, preparedBillingInfo)
      }
    } catch (error) {
      if (error instanceof InsufficientBalanceError) {
        await markTaskFailed(task.id, 'INSUFFICIENT_BALANCE', error.message)
        throw new ApiError('INSUFFICIENT_BALANCE', {
          message: error.message,
          required: error.required,
          available: error.available,
        })
      }
      await markTaskFailed(task.id, 'INTERNAL_ERROR', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  if (!deduped) {
    const payloadForEvent = runId
      ? {
          ...normalizedPayload,
          runId,
          meta: {
            ...toObject(normalizedPayload.meta),
            runId,
          },
        }
      : normalizedPayload
    await publishTaskEvent({
      taskId: task.id,
      projectId: params.projectId,
      userId: params.userId,
      type: TASK_EVENT_TYPE.CREATED,
      taskType: params.type,
      targetType: params.targetType,
      targetId: params.targetId,
      episodeId: params.episodeId || null,
      payload: {
        ...payloadForEvent,
        billing: preparedBillingInfo || null,
        trace: {
          requestId: params.requestId || null,
        },
      },
    })
  }
  logger.info({
    action: 'task.submit.created',
    message: 'task created',
    taskId: task.id,
    details: {
      type: params.type,
      targetType: params.targetType,
      targetId: params.targetId,
    },
  })

  if (!deduped) {
    try {
      await addTaskJob({
        taskId: task.id,
        type: params.type,
        locale: params.locale,
        projectId: params.projectId,
        episodeId: params.episodeId || null,
        targetType: params.targetType,
        targetId: params.targetId,
        payload: runId
          ? {
              ...normalizedPayload,
              runId,
              meta: {
                ...toObject(normalizedPayload.meta),
                runId,
              },
            }
          : normalizedPayload,
        billingInfo: preparedBillingInfo || null,
        userId: params.userId,
        trace: {
          requestId: params.requestId || null,
        },
      }, {
        priority: typeof task.priority === 'number' ? task.priority : 0,
      })
      await markTaskEnqueued(task.id)
      logger.info({
        action: 'task.submit.enqueued',
        message: 'task enqueued',
        taskId: task.id,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      await markTaskEnqueueFailed(task.id, message || 'queue.add failed')
      const rollbackResult = await rollbackTaskBillingForTask({
        taskId: task.id,
        billingInfo: preparedBillingInfo,
      })
      const compensationFailed = rollbackResult.attempted && !rollbackResult.rolledBack
      const failedCode = compensationFailed ? 'BILLING_COMPENSATION_FAILED' : 'ENQUEUE_FAILED'
      const failedMessage = compensationFailed
        ? `${message || 'queue add failed'}; billing rollback failed`
        : (message || 'queue add failed')
      await markTaskFailed(task.id, failedCode, failedMessage)
      await publishTaskEvent({
        taskId: task.id,
        projectId: params.projectId,
        userId: params.userId,
        type: TASK_EVENT_TYPE.FAILED,
        taskType: params.type,
        targetType: params.targetType,
        targetId: params.targetId,
        episodeId: params.episodeId || null,
        payload: {
          stage: 'enqueue_failed',
          stageLabel: 'progress.stage.enqueueFailed',
          message: failedMessage,
          compensationFailed,
          errorCode: failedCode,
        },
        persist: false,
      })
      logger.error({
        action: 'task.submit.enqueue_failed',
        message: failedMessage,
        taskId: task.id,
        errorCode: compensationFailed ? 'INTERNAL_ERROR' : 'EXTERNAL_ERROR',
        retryable: false,
        details: {
          compensationFailed,
        },
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
              : {
                message: String(error),
              },
      })
      throw new ApiError(compensationFailed ? 'INTERNAL_ERROR' : 'EXTERNAL_ERROR', {
        message: failedMessage,
        taskId: task.id,
      })
    }
  }

  return {
    success: true,
    async: true,
    taskId: task.id,
    runId,
    status: task.status,
    deduped,
  }
}
