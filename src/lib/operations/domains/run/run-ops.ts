import { z } from 'zod'
import { ApiError } from '@/lib/api-errors'
import {
  createPlanRun,
  getPlanRunById,
  getPlanRunSnapshot,
  listPlanRunEventsAfterSeq,
  listPlanRuns,
  requestPlanRunCancel,
  retryPlanStep,
} from '@/lib/plan-run-runtime/service'
import { publishPlanRunEvent } from '@/lib/plan-run-runtime/publisher'
import {
  PLAN_RUN_EVENT_TYPE,
  PLAN_RUN_STATUS,
  type PlanRunStatus,
} from '@/lib/plan-run-runtime/types'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'
import { defineOperation } from '@/lib/operations/define-operation'

const EFFECTS_NONE = {
  writes: false,
  billable: false,
  destructive: false,
  overwrite: false,
  bulk: false,
  externalSideEffects: false,
  longRunning: false,
} as const

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function normalizeStatus(value: string | null): PlanRunStatus | null {
  if (!value) return null
  if (
    value === PLAN_RUN_STATUS.QUEUED
    || value === PLAN_RUN_STATUS.RUNNING
    || value === PLAN_RUN_STATUS.COMPLETED
    || value === PLAN_RUN_STATUS.FAILED
    || value === PLAN_RUN_STATUS.CANCELING
    || value === PLAN_RUN_STATUS.CANCELED
  ) return value
  return null
}

function normalizeStatuses(values: string[]): PlanRunStatus[] {
  const next: PlanRunStatus[] = []
  for (const value of values) {
    const normalized = normalizeStatus(readString(value))
    if (!normalized) continue
    if (!next.includes(normalized)) next.push(normalized)
  }
  return next
}

export function createPlanRunOperations(): ProjectAgentOperationRegistryDraft {
  return {
    list_plan_runs: defineOperation({
      id: 'list_plan_runs',
      summary: 'List dynamic AI plan runs for the current user.',
      intent: 'query',
      effects: EFFECTS_NONE,
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const payload = toObject(input)
        const projectId = readString(payload.projectId)
        const episodeId = readString(payload.episodeId)
        const statusesRaw = Array.isArray(payload.status) ? payload.status : []
        const statuses = normalizeStatuses(statusesRaw.map((item) => (typeof item === 'string' ? item : '')))
        const limitRaw = typeof payload.limit === 'string' || typeof payload.limit === 'number'
          ? Number.parseInt(String(payload.limit), 10)
          : 50
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50

        const planRuns = await listPlanRuns({
          userId: ctx.userId,
          projectId: projectId || undefined,
          episodeId: episodeId || undefined,
          statuses: statuses.length > 0 ? statuses : undefined,
          limit,
        })

        return { planRuns }
      },
    }),

    create_plan_run: defineOperation({
      id: 'create_plan_run',
      summary: 'Create a dynamic AI plan run record. This does not execute steps by itself.',
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
        summary: '将创建新的 AI plan run 执行记录。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        projectId: z.string().min(1),
        episodeId: z.string().optional().nullable(),
        planId: z.string().optional().nullable(),
        goal: z.string().optional().nullable(),
        steps: z.array(z.object({
          stepKey: z.string().min(1),
          skillId: z.string().optional().nullable(),
          operationId: z.string().min(1),
          taskId: z.string().optional().nullable(),
          stepIndex: z.number().int().positive(),
          stepTotal: z.number().int().positive(),
          dependsOn: z.array(z.string()).optional(),
          inputArtifacts: z.array(z.string()).optional(),
          outputArtifacts: z.array(z.string()).optional(),
          input: z.record(z.unknown()).optional().nullable(),
        })).optional(),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const planRun = await createPlanRun({
          userId: ctx.userId,
          projectId: input.projectId,
          episodeId: input.episodeId || null,
          planId: input.planId || null,
          goal: input.goal || null,
          steps: input.steps || [],
        })
        return {
          success: true,
          planRunId: planRun.id,
          planRun,
        }
      },
    }),

    get_plan_run_snapshot: defineOperation({
      id: 'get_plan_run_snapshot',
      summary: 'Get dynamic AI plan run snapshot detail for the current user.',
      intent: 'query',
      effects: EFFECTS_NONE,
      inputSchema: z.object({
        planRunId: z.string().min(1),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const snapshot = await getPlanRunSnapshot(input.planRunId)
        if (!snapshot || snapshot.planRun.userId !== ctx.userId) {
          throw new ApiError('NOT_FOUND')
        }
        return snapshot
      },
    }),

    list_plan_run_events: defineOperation({
      id: 'list_plan_run_events',
      summary: 'List dynamic AI plan run events after a given sequence number.',
      intent: 'query',
      effects: EFFECTS_NONE,
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const payload = toObject(input)
        const planRunId = readString(payload.planRunId)
        if (!planRunId) throw new ApiError('INVALID_PARAMS')

        const afterSeqRaw = typeof payload.afterSeq === 'string' || typeof payload.afterSeq === 'number'
          ? Number.parseInt(String(payload.afterSeq), 10)
          : 0
        const limitRaw = typeof payload.limit === 'string' || typeof payload.limit === 'number'
          ? Number.parseInt(String(payload.limit), 10)
          : 200
        const afterSeq = Number.isFinite(afterSeqRaw) ? Math.max(0, afterSeqRaw) : 0
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 2000) : 200

        const events = await listPlanRunEventsAfterSeq({
          planRunId,
          userId: ctx.userId,
          afterSeq,
          limit,
        })
        return { planRunId, afterSeq, events }
      },
    }),

    cancel_plan_run: defineOperation({
      id: 'cancel_plan_run',
      summary: 'Cancel a dynamic AI plan run.',
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
        summary: '将取消该 AI plan run。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        planRunId: z.string().min(1),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const run = await getPlanRunById(input.planRunId)
        if (!run || run.userId !== ctx.userId) throw new ApiError('NOT_FOUND')

        const cancelledRun = await requestPlanRunCancel({
          planRunId: input.planRunId,
          userId: ctx.userId,
        })
        if (!cancelledRun) throw new ApiError('NOT_FOUND')

        await publishPlanRunEvent({
          planRunId: cancelledRun.id,
          projectId: cancelledRun.projectId,
          userId: cancelledRun.userId,
          eventType: PLAN_RUN_EVENT_TYPE.PLAN_CANCELED,
          payload: { message: 'Plan run cancelled by user' },
        })

        return {
          success: true,
          planRun: cancelledRun,
        }
      },
    }),

    retry_plan_step: defineOperation({
      id: 'retry_plan_step',
      summary: 'Reset a failed dynamic plan step and its dependent downstream steps.',
      intent: 'act',
      effects: {
        writes: true,
        billable: false,
        destructive: false,
        overwrite: true,
        bulk: false,
        externalSideEffects: false,
        longRunning: false,
      },
      confirmation: {
        required: true,
        summary: '将重置失败步骤及依赖它的后续步骤。确认继续后请重新调用并传入 confirmed=true。',
      },
      inputSchema: z.object({
        confirmed: z.boolean().optional(),
        planRunId: z.string().min(1),
        stepKey: z.string().min(1),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        let result: Awaited<ReturnType<typeof retryPlanStep>>
        try {
          result = await retryPlanStep({
            planRunId: input.planRunId,
            userId: ctx.userId,
            stepKey: input.stepKey,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : ''
          if (message === 'PLAN_STEP_NOT_FOUND') throw new ApiError('NOT_FOUND')
          if (message === 'PLAN_STEP_NOT_FAILED') {
            throw new ApiError('INVALID_PARAMS', {
              code: 'PLAN_STEP_RETRY_ONLY_FAILED',
              stepKey: input.stepKey,
            })
          }
          throw error
        }
        if (!result) throw new ApiError('NOT_FOUND')
        return {
          success: true,
          planRunId: input.planRunId,
          stepKey: input.stepKey,
          invalidatedStepKeys: result.invalidatedStepKeys,
        }
      },
    }),
  }
}
