import { z } from 'zod'
import { ApiError, getRequestId } from '@/lib/api-errors'
import {
  createRun,
  getRunById,
  getRunSnapshot,
  listRunEventsAfterSeq,
  listRuns,
  requestRunCancel,
  retryFailedStep,
} from '@/lib/run-runtime/service'
import { publishRunEvent } from '@/lib/run-runtime/publisher'
import { RUN_EVENT_TYPE, RUN_STATUS, type RunStatus } from '@/lib/run-runtime/types'
import { cancelTask } from '@/lib/task/service'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { submitTask } from '@/lib/task/submitter'
import { TASK_TYPE, type TaskType } from '@/lib/task/types'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'
import { defineOperation } from '@/lib/operations/define-operation'

const RETRY_SUPPORTED_TASK_TYPES: ReadonlySet<string> = new Set<string>([
  TASK_TYPE.STORY_TO_SCRIPT_RUN,
  TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN,
])

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function normalizeStatus(value: string | null): RunStatus | null {
  if (!value) return null
  if (
    value === RUN_STATUS.QUEUED
    || value === RUN_STATUS.RUNNING
    || value === RUN_STATUS.COMPLETED
    || value === RUN_STATUS.FAILED
    || value === RUN_STATUS.CANCELING
    || value === RUN_STATUS.CANCELED
  ) return value
  return null
}

function normalizeStatuses(values: string[]): RunStatus[] {
  const next: RunStatus[] = []
  for (const value of values) {
    const normalized = normalizeStatus(readString(value))
    if (!normalized) continue
    if (!next.includes(normalized)) {
      next.push(normalized)
    }
  }
  return next
}

function isActiveRunStatus(status: RunStatus) {
  return (
    status === RUN_STATUS.QUEUED
    || status === RUN_STATUS.RUNNING
    || status === RUN_STATUS.CANCELING
  )
}

function resolveRetryTaskType(run: {
  workflowType: string
  taskType: string | null
}): TaskType {
  const candidate = (run.taskType || run.workflowType || '').trim()
  if (!candidate || !RETRY_SUPPORTED_TASK_TYPES.has(candidate)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'RUN_STEP_RETRY_UNSUPPORTED_TASK_TYPE',
      taskType: candidate || null,
    })
  }
  return candidate as TaskType
}

export function createRunOperations(): ProjectAgentOperationRegistryDraft {
  return {
    list_runs: defineOperation({
      id: 'list_runs',
      summary: 'List runs for the current user with optional filters.',
      intent: 'query',
      effects: {
        writes: false,
        billable: false,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: false,
        longRunning: false,
      },
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const payload = toObject(input)
        const projectId = readString(payload.projectId)
        const workflowType = readString(payload.workflowType)
        const targetType = readString(payload.targetType)
        const targetId = readString(payload.targetId)
        const episodeId = readString(payload.episodeId)
        const statusesRaw = Array.isArray(payload.status) ? payload.status : []
        const statuses = normalizeStatuses(statusesRaw.map((item) => (typeof item === 'string' ? item : '')))
        const limitRaw = typeof payload.limit === 'string' || typeof payload.limit === 'number'
          ? Number.parseInt(String(payload.limit), 10)
          : 50
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50

        const activeOnlyQuery = statuses.length > 0 && statuses.every(isActiveRunStatus)
        const scopedActiveRecoveryQuery = activeOnlyQuery && !!workflowType && !!targetType && !!targetId

        const runs = await listRuns({
          userId: ctx.userId,
          projectId: projectId || undefined,
          workflowType: workflowType || undefined,
          targetType: targetType || undefined,
          targetId: targetId || undefined,
          episodeId: episodeId || undefined,
          statuses: statuses.length > 0 ? statuses : undefined,
          limit,
          recoverableOnly: scopedActiveRecoveryQuery,
          latestOnly: scopedActiveRecoveryQuery,
        })

        return { runs }
      },
    }),

    create_run: defineOperation({
      id: 'create_run',
      summary: 'Create a run record for a workflow and target.',
      intent: 'act',
      effects: {
        writes: true,
        billable: false,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: true,
        longRunning: false,
      },
      confirmation: {
        required: true,
        summary: '将创建并提交一个新的 run（包含写入）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const body = toObject(input)
        const projectId = readString(body.projectId)
        const workflowType = readString(body.workflowType)
        const targetType = readString(body.targetType)
        const targetId = readString(body.targetId)
        const episodeId = readString(body.episodeId)
        const taskType = readString(body.taskType)
        const taskId = readString(body.taskId)
        const runInput = body.input && typeof body.input === 'object' && !Array.isArray(body.input)
          ? body.input as Record<string, unknown>
          : null

        if (!projectId || !workflowType || !targetType || !targetId) {
          throw new ApiError('INVALID_PARAMS')
        }

        const run = await createRun({
          userId: ctx.userId,
          projectId,
          episodeId,
          workflowType,
          taskType,
          taskId,
          targetType,
          targetId,
          input: runInput,
        })

        return {
          success: true,
          runId: run.id,
          run,
        }
      },
    }),

    get_run_snapshot: defineOperation({
      id: 'get_run_snapshot',
      summary: 'Get run snapshot detail for the current user.',
      intent: 'query',
      effects: {
        writes: false,
        billable: false,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: false,
        longRunning: false,
      },
      inputSchema: z.object({
        runId: z.string().min(1),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const snapshot = await getRunSnapshot(input.runId)
        if (!snapshot || snapshot.run.userId !== ctx.userId) {
          throw new ApiError('NOT_FOUND')
        }
        return snapshot
      },
    }),

    list_run_events: defineOperation({
      id: 'list_run_events',
      summary: 'List run events after a given sequence number.',
      intent: 'query',
      effects: {
        writes: false,
        billable: false,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: false,
        longRunning: false,
      },
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const payload = toObject(input)
        const runId = readString(payload.runId)
        if (!runId) {
          throw new ApiError('INVALID_PARAMS')
        }

        const afterSeqRaw = typeof payload.afterSeq === 'string' || typeof payload.afterSeq === 'number'
          ? Number.parseInt(String(payload.afterSeq), 10)
          : 0
        const limitRaw = typeof payload.limit === 'string' || typeof payload.limit === 'number'
          ? Number.parseInt(String(payload.limit), 10)
          : 200
        const afterSeq = Number.isFinite(afterSeqRaw) ? Math.max(0, afterSeqRaw) : 0
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 2000) : 200

        const events = await listRunEventsAfterSeq({
          runId,
          userId: ctx.userId,
          afterSeq,
          limit,
        })
        return {
          runId,
          afterSeq,
          events,
        }
      },
    }),

    cancel_run: defineOperation({
      id: 'cancel_run',
      summary: 'Cancel a run and cancel the linked task (best effort).',
      intent: 'act',
      effects: {
        writes: true,
        billable: false,
        destructive: false,
        overwrite: true,
        bulk: false,
        externalSideEffects: true,
        longRunning: false,
      },
      confirmation: {
        required: true,
        summary: '将取消该 run 及其关联 task（如果存在）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        runId: z.string().min(1),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const run = await getRunById(input.runId)
        if (!run || run.userId !== ctx.userId) {
          throw new ApiError('NOT_FOUND')
        }

        const cancelledRun = await requestRunCancel({
          runId: input.runId,
          userId: ctx.userId,
        })
        if (!cancelledRun) {
          throw new ApiError('NOT_FOUND')
        }

        if (cancelledRun.taskId) {
          await cancelTask(cancelledRun.taskId, 'Run cancelled by user')
        }

        if (
          cancelledRun.status === RUN_STATUS.CANCELING
          || cancelledRun.status === RUN_STATUS.CANCELED
        ) {
          await publishRunEvent({
            runId: cancelledRun.id,
            projectId: cancelledRun.projectId,
            userId: cancelledRun.userId,
            eventType: RUN_EVENT_TYPE.RUN_CANCELED,
            payload: {
              message: 'Run cancelled by user',
            },
          })
        }

        return {
          success: true,
          run: cancelledRun,
        }
      },
    }),

    retry_run_step: defineOperation({
      id: 'retry_run_step',
      summary: 'Retry a failed run step by submitting a new task tied to an existing run.',
      intent: 'act',
      effects: {
        writes: true,
        billable: true,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: true,
        longRunning: true,
      },
      confirmation: {
        required: true,
        summary: '将提交一次重试任务（可能计费）。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const payload = toObject(input)
        const runId = readString(payload.runId)
        const stepKeyRaw = readString(payload.stepKey)
        const stepKey = stepKeyRaw ? decodeURIComponent(stepKeyRaw).trim() : ''
        if (!runId || !stepKey) {
          throw new ApiError('INVALID_PARAMS')
        }

        const run = await getRunById(runId)
        if (!run || run.userId !== ctx.userId) {
          throw new ApiError('NOT_FOUND')
        }

        const modelOverride = readString(payload.modelOverride) || ''
        const reason = readString(payload.reason) || ''

        let prepared: Awaited<ReturnType<typeof retryFailedStep>> = null
        try {
          prepared = await retryFailedStep({
            runId,
            userId: ctx.userId,
            stepKey,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          if (message === 'RUN_STEP_NOT_FOUND') {
            throw new ApiError('NOT_FOUND')
          }
          if (message === 'RUN_STEP_NOT_FAILED') {
            throw new ApiError('INVALID_PARAMS', {
              code: 'RUN_STEP_RETRY_ONLY_FAILED',
              stepKey,
            })
          }
          throw error
        }
        if (!prepared) {
          throw new ApiError('NOT_FOUND')
        }

        const taskType = resolveRetryTaskType(run)
        const locale = resolveRequiredTaskLocale(ctx.request, payload)
        const runInput = toObject(run.input)
        const taskPayload: Record<string, unknown> = {
          ...runInput,
          episodeId: run.episodeId || runInput.episodeId || null,
          runId,
          retryStepKey: stepKey,
          retryStepAttempt: prepared.retryAttempt,
          retryReason: reason || null,
          displayMode: 'detail',
          meta: {
            ...toObject(runInput.meta),
            locale,
            runId,
            retryStepKey: stepKey,
            retryStepAttempt: prepared.retryAttempt,
            retryReason: reason || null,
          },
        }
        if (modelOverride) {
          taskPayload.model = modelOverride
          taskPayload.analysisModel = modelOverride
        }

        const submitResult = await submitTask({
          userId: ctx.userId,
          locale,
          requestId: getRequestId(ctx.request),
          projectId: run.projectId,
          episodeId: run.episodeId || null,
          type: taskType,
          targetType: run.targetType,
          targetId: run.targetId,
          payload: taskPayload,
          dedupeKey: null,
          priority: 3,
          operationId: 'retry_run_step',
          operationSource: ctx.source,
          operationConfirmed: payload.confirmed === true,
          operationRequestId: getRequestId(ctx.request),
        })

        return {
          success: true,
          runId,
          stepKey,
          retryAttempt: prepared.retryAttempt,
          taskId: submitResult.taskId,
          async: true,
        }
      },
    }),
  }
}
