import { UnrecoverableError, type Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { createScopedLogger } from '@/lib/logging/core'
import type { LLMStreamChunk } from '@/lib/llm-observe/types'
import { TaskTerminatedError } from '@/lib/task/errors'
import {
  rollbackTaskBillingForTask,
  touchTaskHeartbeat,
  tryMarkTaskCompleted,
  tryMarkTaskFailed,
  tryMarkTaskProcessing,
  tryUpdateTaskProgress,
  updateTaskBillingInfo,
} from '@/lib/task/service'
import { publishTaskEvent, publishTaskStreamEvent } from '@/lib/task/publisher'
import { TASK_EVENT_TYPE, TASK_TYPE, type TaskBillingInfo, type TaskJobData } from '@/lib/task/types'
import { buildTaskProgressMessage, getTaskStageLabel } from '@/lib/task/progress-message'
import { normalizeAnyError } from '@/lib/errors/normalize'
import { rollbackTaskBilling, settleTaskBilling } from '@/lib/billing'
import { withTextUsageCollection } from '@/lib/billing/runtime-usage'
import { onProjectNameAvailable } from '@/lib/logging/file-writer'
import type { NormalizedError } from '@/lib/errors/types'

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function readStringField(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function readPositiveIntField(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key]
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value)
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }
  return null
}

function extractFlowFields(jobData: TaskJobData): Record<string, unknown> {
  const payload = toObject(jobData.payload)
  const flowId = readStringField(payload, 'flowId')
  const flowStageTitle = readStringField(payload, 'flowStageTitle')
  const flowStageIndex = readPositiveIntField(payload, 'flowStageIndex')
  const flowStageTotal = readPositiveIntField(payload, 'flowStageTotal')
  const payloadMeta = toObject(payload.meta)
  const runId = readStringField(payload, 'runId') || readStringField(payloadMeta, 'runId')

  return {
    ...(flowId ? { flowId } : {}),
    ...(flowStageTitle ? { flowStageTitle } : {}),
    ...(flowStageIndex ? { flowStageIndex } : {}),
    ...(flowStageTotal ? { flowStageTotal } : {}),
    ...(runId ? { runId } : {}),
  }
}

function withFlowFields(jobData: TaskJobData, payload?: Record<string, unknown> | null): Record<string, unknown> {
  const base = { ...(payload || {}) }
  const flowFields = extractFlowFields(jobData)
  for (const [key, value] of Object.entries(flowFields)) {
    if (base[key] === undefined || base[key] === null || base[key] === '') {
      base[key] = value
    }
  }
  return base
}

function buildWorkerLogger(data: TaskJobData, queueName: string) {
  return createScopedLogger({
    module: `worker.${queueName}`,
    requestId: data.trace?.requestId || undefined,
    taskId: data.taskId,
    projectId: data.projectId,
    userId: data.userId,
  })
}

const RUN_STREAM_REPLAY_PERSIST_TYPES = new Set<string>([
  TASK_TYPE.STORY_TO_SCRIPT_RUN,
  TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN,
])

function shouldPersistRunStreamReplay(taskType: string): boolean {
  return RUN_STREAM_REPLAY_PERSIST_TYPES.has(taskType)
}

function resolveQueueAttempts(job: Job<TaskJobData>): number {
  const attempts = (job.opts?.attempts ?? 1)
  const value = typeof attempts === 'number' && Number.isFinite(attempts) ? Math.floor(attempts) : 1
  return Math.max(1, value)
}

function resolveAttemptsMade(job: Job<TaskJobData>): number {
  const attemptsMade = job.attemptsMade
  const value = typeof attemptsMade === 'number' && Number.isFinite(attemptsMade) ? Math.floor(attemptsMade) : 0
  return Math.max(0, value)
}

function resolveNextBackoffMs(job: Job<TaskJobData>, failedAttempt: number): number | null {
  const backoff = job.opts?.backoff
  if (typeof backoff === 'number' && Number.isFinite(backoff) && backoff > 0) {
    return Math.floor(backoff)
  }
  if (!backoff || typeof backoff !== 'object') return null

  const backoffRecord = backoff as { type?: unknown; delay?: unknown }
  const baseDelay = typeof backoffRecord.delay === 'number' && Number.isFinite(backoffRecord.delay)
    ? Math.max(0, Math.floor(backoffRecord.delay))
    : 0
  if (baseDelay <= 0) return null

  const type = typeof backoffRecord.type === 'string' ? backoffRecord.type : 'fixed'
  if (type === 'exponential') {
    const exponent = Math.max(0, failedAttempt - 1)
    return baseDelay * Math.pow(2, exponent)
  }
  return baseDelay
}

function shouldRetryInQueue(params: {
  job: Job<TaskJobData>
  normalizedError: NormalizedError
}): {
  enabled: boolean
  failedAttempt: number
  maxAttempts: number
  nextBackoffMs: number | null
} {
  const maxAttempts = resolveQueueAttempts(params.job)
  const failedAttempt = resolveAttemptsMade(params.job) + 1
  const enabled = params.normalizedError.retryable && failedAttempt < maxAttempts
  return {
    enabled,
    failedAttempt,
    maxAttempts,
    nextBackoffMs: resolveNextBackoffMs(params.job, failedAttempt),
  }
}

function buildErrorCauseChain(input: unknown): Array<{ name: string; message: string }> {
  const chain: Array<{ name: string; message: string }> = []
  const seen = new Set<unknown>()
  let current: unknown = input

  for (let depth = 0; depth < 6; depth += 1) {
    if (!current || seen.has(current)) break
    seen.add(current)
    if (!(current instanceof Error)) {
      chain.push({ name: typeof current, message: String(current) })
      break
    }
    chain.push({
      name: current.name || 'Error',
      message: current.message || '',
    })
    const next = (current as Error & { cause?: unknown }).cause
    if (!next) break
    current = next
  }

  return chain
}

async function resolveProjectNameForLogging(projectId: string): Promise<void> {
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true },
    })
    if (project?.name) {
      onProjectNameAvailable(projectId, project.name)
    }
  } catch {
    // Swallow – log file routing failure should never crash the worker.
  }
}

export async function withTaskLifecycle(job: Job<TaskJobData>, handler: (job: Job<TaskJobData>) => Promise<Record<string, unknown> | void>) {
  const data = job.data
  const taskId = data.taskId
  const logger = buildWorkerLogger(data, job.queueName)
  const startedAt = Date.now()
  let billingInfo = (data.billingInfo || null) as TaskBillingInfo | null

  // Register project name for per-project log file routing
  void resolveProjectNameForLogging(data.projectId)

  const heartbeatTimer = setInterval(() => {
    void touchTaskHeartbeat(taskId)
  }, 10_000)

  try {
    logger.info({
      action: 'worker.start',
      message: 'worker started',
      details: {
        queue: job.queueName,
        taskType: data.type,
        targetType: data.targetType,
        targetId: data.targetId,
        episodeId: data.episodeId || null,
      },
    })
    const markedProcessing = await tryMarkTaskProcessing(taskId)
    if (!markedProcessing) {
      const rollbackResult = await rollbackTaskBillingForTask({
        taskId,
        billingInfo,
      })
      if (rollbackResult.billingInfo) {
        billingInfo = rollbackResult.billingInfo
      }
      if (rollbackResult.attempted && !rollbackResult.rolledBack) {
        logger.error({
          action: 'worker.skip.terminated.rollback_failed',
          message: 'task is terminal and billing rollback failed',
          errorCode: 'BILLING_COMPENSATION_FAILED',
        })
      }
      logger.info({
        action: 'worker.skip.terminated',
        message: 'task is not active, skip worker execution',
      })
      return
    }
    const processingPayload = withFlowFields(data, {
      queue: job.queueName,
      stage: 'received',
      stageLabel: getTaskStageLabel('received'),
      displayMode: 'loading',
      trace: {
        requestId: data.trace?.requestId || null,
      },
    })
    await publishTaskEvent({
      taskId,
      projectId: data.projectId,
      userId: data.userId,
      type: TASK_EVENT_TYPE.PROCESSING,
      taskType: data.type,
      targetType: data.targetType,
      targetId: data.targetId,
      episodeId: data.episodeId || null,
      payload: {
        ...processingPayload,
        message: buildTaskProgressMessage({
          eventType: TASK_EVENT_TYPE.PROCESSING,
          taskType: data.type,
          payload: processingPayload,
        }),
      },
    })

    const { result, textUsage } = await withTextUsageCollection(async () => await handler(job))
    if (billingInfo?.billable) {
      billingInfo = (await settleTaskBilling({
        id: taskId,
        projectId: data.projectId,
        userId: data.userId,
        billingInfo,
      }, {
        result: (result || undefined) as Record<string, unknown> | void,
        textUsage,
      })) as TaskBillingInfo
      await updateTaskBillingInfo(taskId, billingInfo)
    }
    const markedCompleted = await tryMarkTaskCompleted(taskId, result || null)
    if (!markedCompleted) {
      logger.info({
        action: 'worker.skip.completed',
        message: 'task already terminal, skip completed event',
        durationMs: Date.now() - startedAt,
      })
      return
    }
    logger.info({
      action: 'worker.completed',
      message: 'worker completed',
      durationMs: Date.now() - startedAt,
      details: result || null,
    })
    const completedPayload = withFlowFields(data, {
      ...(result || {}),
      displayMode: 'loading',
      trace: {
        requestId: data.trace?.requestId || null,
      },
    })
    await publishTaskEvent({
      taskId,
      projectId: data.projectId,
      userId: data.userId,
      type: TASK_EVENT_TYPE.COMPLETED,
      taskType: data.type,
      targetType: data.targetType,
      targetId: data.targetId,
      episodeId: data.episodeId || null,
      payload: {
        ...completedPayload,
        message: buildTaskProgressMessage({
          eventType: TASK_EVENT_TYPE.COMPLETED,
          taskType: data.type,
          payload: completedPayload,
        }),
      },
    })
  } catch (error: unknown) {
    if (error instanceof TaskTerminatedError) {
      if (billingInfo?.billable) {
        billingInfo = (await rollbackTaskBilling({
          id: taskId,
          billingInfo,
        })) as TaskBillingInfo
        await updateTaskBillingInfo(taskId, billingInfo)
      }
      logger.info({
        action: 'worker.terminated',
        message: error.message,
        durationMs: Date.now() - startedAt,
      })
      throw new UnrecoverableError(`Task terminated: ${error.message}`)
    }

    const normalizedError = normalizeAnyError(error, { context: 'worker' })
    const retryDecision = shouldRetryInQueue({
      job,
      normalizedError,
    })
    const errorCauseChain = buildErrorCauseChain(error)
    const workerFailureLog = {
      action: 'worker.failed',
      message: normalizedError.message,
      errorCode: normalizedError.code,
      retryable: normalizedError.retryable,
      provider: normalizedError.provider || undefined,
      durationMs: Date.now() - startedAt,
      details: {
        queue: job.queueName,
        taskType: data.type,
        targetType: data.targetType,
        targetId: data.targetId,
      },
      error:
        error instanceof Error
          ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
            code: normalizedError.code,
            retryable: normalizedError.retryable,
            causeChain: errorCauseChain,
          }
          : {
            message: String(error),
            code: normalizedError.code,
            retryable: normalizedError.retryable,
            causeChain: errorCauseChain,
          },
    }
    if (retryDecision.enabled) {
      logger.error({
        ...workerFailureLog,
        action: 'worker.failed.retryable',
        message: `retryable failure: ${normalizedError.message}`,
      })
    } else {
      logger.error(workerFailureLog)
    }
    if (retryDecision.enabled) {
      logger.error({
        action: 'worker.retry.scheduled',
        message: 'retryable worker error, queue retry scheduled',
        errorCode: normalizedError.code,
        retryable: normalizedError.retryable,
        durationMs: Date.now() - startedAt,
        details: {
          queue: job.queueName,
          taskType: data.type,
          targetType: data.targetType,
          targetId: data.targetId,
          failedAttempt: retryDecision.failedAttempt,
          maxAttempts: retryDecision.maxAttempts,
          nextBackoffMs: retryDecision.nextBackoffMs,
        },
      })

      const retryPayload = withFlowFields(data, {
        stage: 'retrying',
        stageLabel: 'progress.runtime.stage.retrying',
        displayMode: 'detail',
        error: normalizedError,
        retry: {
          failedAttempt: retryDecision.failedAttempt,
          maxAttempts: retryDecision.maxAttempts,
          nextBackoffMs: retryDecision.nextBackoffMs,
        },
        trace: {
          requestId: data.trace?.requestId || null,
        },
      })

      try {
        await publishTaskEvent({
          taskId,
          projectId: data.projectId,
          userId: data.userId,
          type: TASK_EVENT_TYPE.PROGRESS,
          taskType: data.type,
          targetType: data.targetType,
          targetId: data.targetId,
          episodeId: data.episodeId || null,
          payload: {
            ...retryPayload,
            message: `Retry scheduled (${retryDecision.failedAttempt}/${retryDecision.maxAttempts}): ${normalizedError.message}`,
          },
          persist: false,
        })
      } catch (publishError) {
        logger.warn({
          action: 'worker.retry.progress_publish_failed',
          message: 'failed to publish retry progress event',
          details: {
            queue: job.queueName,
            taskType: data.type,
            taskId,
          },
          error: publishError instanceof Error ? publishError.message : String(publishError),
        })
      }

      throw (error instanceof Error ? error : new Error(normalizedError.message || 'Task failed'))
    }

    if (billingInfo?.billable) {
      billingInfo = (await rollbackTaskBilling({
        id: taskId,
        billingInfo,
      })) as TaskBillingInfo
      await updateTaskBillingInfo(taskId, billingInfo)
    }
    const markedFailed = await tryMarkTaskFailed(taskId, normalizedError.code, normalizedError.message)
    if (!markedFailed) {
      logger.info({
        action: 'worker.skip.failed',
        message: 'task already terminal, skip failed event',
        durationMs: Date.now() - startedAt,
      })
      throw new UnrecoverableError('task already terminal')
    }
    const failedPayload = withFlowFields(data, {
      error: normalizedError,
      displayMode: 'loading',
      trace: {
        requestId: data.trace?.requestId || null,
      },
    }) as Record<string, unknown>
    if (process.env.NODE_ENV !== 'production' && error instanceof Error && typeof error.stack === 'string') {
      failedPayload.errorStack = error.stack.slice(0, 8000)
    }
    await publishTaskEvent({
      taskId,
      projectId: data.projectId,
      userId: data.userId,
      type: TASK_EVENT_TYPE.FAILED,
      taskType: data.type,
      targetType: data.targetType,
      targetId: data.targetId,
      episodeId: data.episodeId || null,
      payload: {
        ...failedPayload,
        message: normalizedError.message || buildTaskProgressMessage({
          eventType: TASK_EVENT_TYPE.FAILED,
          taskType: data.type,
          payload: failedPayload,
        }),
      },
    })

    // Re-throw as UnrecoverableError so BullMQ records the job as failed
    // (without this, BullMQ thinks the job succeeded and never logs failure)
    // UnrecoverableError prevents BullMQ auto-retry since we already handle task state in app layer
    throw new UnrecoverableError(normalizedError.message || 'Task failed')
  } finally {
    clearInterval(heartbeatTimer)
  }
}

export async function reportTaskProgress(job: Job<TaskJobData>, progress: number, payload?: Record<string, unknown>) {
  const value = Math.max(0, Math.min(99, Math.floor(progress)))
  const logger = buildWorkerLogger(job.data, job.queueName)
  const nextPayload: Record<string, unknown> = withFlowFields(job.data, payload)
  const stage = typeof nextPayload.stage === 'string' ? nextPayload.stage : null
  if (stage && typeof nextPayload.stageLabel !== 'string') {
    nextPayload.stageLabel = getTaskStageLabel(stage)
  }
  if (typeof nextPayload.displayMode !== 'string') {
    nextPayload.displayMode = 'loading'
  }
  if (typeof nextPayload.message !== 'string') {
    nextPayload.message = buildTaskProgressMessage({
      eventType: TASK_EVENT_TYPE.PROGRESS,
      taskType: job.data.type,
      progress: value,
      payload: nextPayload,
    })
  }

  logger.info({
    action: 'worker.progress',
    message: 'worker progress update',
    details: {
      progress: value,
      ...nextPayload,
    },
  })

  const updated = await tryUpdateTaskProgress(job.data.taskId, value, nextPayload)
  if (!updated) {
    return
  }
  await publishTaskEvent({
    taskId: job.data.taskId,
    projectId: job.data.projectId,
    userId: job.data.userId,
    type: TASK_EVENT_TYPE.PROGRESS,
    taskType: job.data.type,
    targetType: job.data.targetType,
    targetId: job.data.targetId,
    episodeId: job.data.episodeId || null,
    payload: {
      progress: value,
      ...nextPayload,
      trace: {
        requestId: job.data.trace?.requestId || null,
      },
    },
    persist: shouldPersistRunStreamReplay(job.data.type),
  })
}

export async function reportTaskStreamChunk(
  job: Job<TaskJobData>,
  chunk: LLMStreamChunk,
  payload?: Record<string, unknown>,
) {
  const mergedPayload: Record<string, unknown> = withFlowFields(job.data, {
    ...(payload || {}),
    displayMode: 'detail',
    stream: chunk,
    done: false,
    message: payload?.message || (chunk.kind === 'reasoning' ? 'progress.runtime.llm.reasoning' : 'progress.runtime.llm.output'),
  })

  await publishTaskStreamEvent({
    taskId: job.data.taskId,
    projectId: job.data.projectId,
    userId: job.data.userId,
    taskType: job.data.type,
    targetType: job.data.targetType,
    targetId: job.data.targetId,
    episodeId: job.data.episodeId || null,
    payload: {
      ...mergedPayload,
      trace: {
        requestId: job.data.trace?.requestId || null,
      },
    },
    persist: shouldPersistRunStreamReplay(job.data.type),
  })
}
