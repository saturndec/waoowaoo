import { prisma } from '@/lib/prisma'
import {
  PLAN_RUN_EVENT_TYPE,
  PLAN_RUN_STATUS,
  PLAN_STEP_STATUS,
  type CreatePlanRunInput,
  type ListPlanRunsInput,
  type PlanRunEventInput,
  type PlanRunStatus,
  type PlanStepStatus,
} from './types'

type JsonRecord = Record<string, unknown>

type PlanRunRow = {
  id: string
  userId: string
  projectId: string
  episodeId: string | null
  commandId: string | null
  planId: string | null
  goal: string | null
  status: string
  currentStepKey: string | null
  errorCode: string | null
  errorMessage: string | null
  cancelRequestedAt: Date | null
  queuedAt: Date
  startedAt: Date | null
  finishedAt: Date | null
  lastSeq: number
  createdAt: Date
  updatedAt: Date
}

type PlanStepRunRow = {
  id: string
  planRunId: string
  stepKey: string
  skillId: string | null
  operationId: string
  taskId: string | null
  status: string
  stepIndex: number
  stepTotal: number
  dependsOnJson: unknown
  inputArtifactsJson: unknown
  outputArtifactsJson: unknown
  inputJson: unknown
  outputJson: unknown
  errorCode: string | null
  errorMessage: string | null
  startedAt: Date | null
  finishedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

type PlanRunEventRow = {
  id: bigint
  planRunId: string
  projectId: string
  userId: string
  seq: number
  eventType: string
  stepKey: string | null
  payload: unknown
  createdAt: Date
}

type PlanArtifactRow = {
  id: string
  planRunId: string
  stepKey: string
  artifactType: string
  refId: string
  payload: unknown
  createdAt: Date
}

type ExecutionPlanRow = {
  id: string
}

type ExecutionPlanModel = {
  findFirst: (args: unknown) => Promise<ExecutionPlanRow | null>
}

type PlanRunModel = {
  create: (args: unknown) => Promise<PlanRunRow>
  update: (args: unknown) => Promise<PlanRunRow>
  updateMany: (args: unknown) => Promise<{ count: number }>
  findUnique: (args: unknown) => Promise<PlanRunRow | null>
  findMany: (args: unknown) => Promise<PlanRunRow[]>
}

type PlanStepRunModel = {
  createMany: (args: unknown) => Promise<{ count: number }>
  upsert: (args: unknown) => Promise<PlanStepRunRow>
  update: (args: unknown) => Promise<PlanStepRunRow>
  updateMany: (args: unknown) => Promise<{ count: number }>
  findMany: (args: unknown) => Promise<PlanStepRunRow[]>
  findUnique: (args: unknown) => Promise<PlanStepRunRow | null>
}

type PlanRunEventModel = {
  create: (args: unknown) => Promise<PlanRunEventRow>
  findMany: (args: unknown) => Promise<PlanRunEventRow[]>
}

type PlanArtifactModel = {
  upsert: (args: unknown) => Promise<PlanArtifactRow>
  findMany: (args: unknown) => Promise<PlanArtifactRow[]>
  deleteMany: (args: unknown) => Promise<{ count: number }>
}

type PlanRuntimeTx = {
  executionPlan: ExecutionPlanModel
  planRun: PlanRunModel
  planStepRun: PlanStepRunModel
  planRunEvent: PlanRunEventModel
  planArtifact: PlanArtifactModel
}

type PlanRuntimeClient = PlanRuntimeTx & {
  $transaction: <T>(fn: (tx: PlanRuntimeTx) => Promise<T>) => Promise<T>
}

const runtimeClient = prisma as unknown as PlanRuntimeClient

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null
}

function toRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as JsonRecord
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function asPlanRunStatus(value: string): PlanRunStatus {
  if (
    value === PLAN_RUN_STATUS.QUEUED
    || value === PLAN_RUN_STATUS.RUNNING
    || value === PLAN_RUN_STATUS.COMPLETED
    || value === PLAN_RUN_STATUS.FAILED
    || value === PLAN_RUN_STATUS.CANCELING
    || value === PLAN_RUN_STATUS.CANCELED
  ) return value
  return PLAN_RUN_STATUS.FAILED
}

function mapPlanRun(row: PlanRunRow) {
  return {
    id: row.id,
    userId: row.userId,
    projectId: row.projectId,
    episodeId: row.episodeId,
    commandId: row.commandId,
    planId: row.planId,
    goal: row.goal,
    status: asPlanRunStatus(row.status),
    currentStepKey: row.currentStepKey,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    cancelRequestedAt: toIso(row.cancelRequestedAt),
    queuedAt: row.queuedAt.toISOString(),
    startedAt: toIso(row.startedAt),
    finishedAt: toIso(row.finishedAt),
    lastSeq: row.lastSeq,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function mapPlanStep(row: PlanStepRunRow) {
  return {
    id: row.id,
    planRunId: row.planRunId,
    stepKey: row.stepKey,
    skillId: row.skillId,
    operationId: row.operationId,
    taskId: row.taskId,
    status: row.status,
    stepIndex: row.stepIndex,
    stepTotal: row.stepTotal,
    dependsOn: toStringArray(row.dependsOnJson),
    inputArtifacts: toStringArray(row.inputArtifactsJson),
    outputArtifacts: toStringArray(row.outputArtifactsJson),
    input: toRecord(row.inputJson),
    output: toRecord(row.outputJson),
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    startedAt: toIso(row.startedAt),
    finishedAt: toIso(row.finishedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function mapPlanEvent(row: PlanRunEventRow) {
  return {
    id: row.id.toString(),
    planRunId: row.planRunId,
    projectId: row.projectId,
    userId: row.userId,
    seq: row.seq,
    eventType: row.eventType,
    stepKey: row.stepKey,
    payload: toRecord(row.payload),
    createdAt: row.createdAt.toISOString(),
  }
}

function mapPlanArtifact(row: PlanArtifactRow) {
  return {
    id: row.id,
    planRunId: row.planRunId,
    stepKey: row.stepKey || null,
    artifactType: row.artifactType,
    refId: row.refId,
    payload: toRecord(row.payload),
    createdAt: row.createdAt.toISOString(),
  }
}

function asStepStatus(status: PlanStepStatus): PlanStepStatus {
  return status
}

export async function createPlanRun(input: CreatePlanRunInput) {
  return await runtimeClient.$transaction(async (tx) => {
    const planId = input.planId?.trim() || null
    if (planId) {
      const plan = await tx.executionPlan.findFirst({
        where: {
          id: planId,
          projectId: input.projectId,
        },
        select: { id: true },
      })
      if (!plan) throw new Error(`PLAN_NOT_FOUND:${planId}`)
    }

    const run = await tx.planRun.create({
      data: {
        userId: input.userId,
        projectId: input.projectId,
        episodeId: input.episodeId || null,
        commandId: input.commandId || null,
        planId,
        goal: input.goal || null,
        status: PLAN_RUN_STATUS.QUEUED,
      },
    })
    const steps = input.steps ?? []
    if (steps.length > 0) {
      await tx.planStepRun.createMany({
        data: steps.map((step) => ({
          planRunId: run.id,
          stepKey: step.stepKey,
          skillId: step.skillId || null,
          operationId: step.operationId,
          taskId: step.taskId || null,
          status: PLAN_STEP_STATUS.PENDING,
          stepIndex: step.stepIndex,
          stepTotal: step.stepTotal,
          dependsOnJson: step.dependsOn ?? [],
          inputArtifactsJson: step.inputArtifacts ?? [],
          outputArtifactsJson: step.outputArtifacts ?? [],
          inputJson: step.input || null,
        })),
      })
    }
    return mapPlanRun(run)
  })
}

export async function startPlanStep(params: {
  planRunId: string
  userId: string
  projectId: string
  stepKey: string
}) {
  return await runtimeClient.$transaction(async (tx) => {
    const now = new Date()
    const step = await tx.planStepRun.update({
      where: {
        planRunId_stepKey: {
          planRunId: params.planRunId,
          stepKey: params.stepKey,
        },
      },
      data: {
        status: asStepStatus(PLAN_STEP_STATUS.RUNNING),
        startedAt: now,
        errorCode: null,
        errorMessage: null,
      },
    })
    const run = await tx.planRun.update({
      where: { id: params.planRunId },
      data: {
        status: PLAN_RUN_STATUS.RUNNING,
        currentStepKey: params.stepKey,
        startedAt: now,
      },
    })
    const eventRun = await tx.planRun.update({
      where: { id: params.planRunId },
      data: { lastSeq: { increment: 1 } },
    })
    await tx.planRunEvent.create({
      data: {
        planRunId: params.planRunId,
        projectId: params.projectId,
        userId: params.userId,
        seq: eventRun.lastSeq,
        eventType: PLAN_RUN_EVENT_TYPE.STEP_START,
        stepKey: params.stepKey,
        payload: {
          operationId: step.operationId,
        },
      },
    })
    return {
      planRun: mapPlanRun(run),
      step: mapPlanStep(step),
    }
  })
}

export async function completePlanStep(params: {
  planRunId: string
  userId: string
  projectId: string
  stepKey: string
  output?: Record<string, unknown> | null
  taskId?: string | null
}) {
  return await runtimeClient.$transaction(async (tx) => {
    const stepStatus = params.taskId ? PLAN_STEP_STATUS.WAITING_TASK : PLAN_STEP_STATUS.COMPLETED
    const step = await tx.planStepRun.update({
      where: {
        planRunId_stepKey: {
          planRunId: params.planRunId,
          stepKey: params.stepKey,
        },
      },
      data: {
        status: asStepStatus(stepStatus),
        taskId: params.taskId || null,
        outputJson: params.output || null,
        ...(params.taskId ? {} : { finishedAt: new Date() }),
      },
    })
    const eventRun = await tx.planRun.update({
      where: { id: params.planRunId },
      data: { lastSeq: { increment: 1 } },
    })
    await tx.planRunEvent.create({
      data: {
        planRunId: params.planRunId,
        projectId: params.projectId,
        userId: params.userId,
        seq: eventRun.lastSeq,
        eventType: PLAN_RUN_EVENT_TYPE.STEP_COMPLETE,
        stepKey: params.stepKey,
        payload: {
          status: stepStatus,
          ...(params.taskId ? { taskId: params.taskId } : {}),
        },
      },
    })
    return mapPlanStep(step)
  })
}

export async function failPlanStep(params: {
  planRunId: string
  userId: string
  projectId: string
  stepKey: string
  errorCode: string
  errorMessage: string
}) {
  return await runtimeClient.$transaction(async (tx) => {
    const now = new Date()
    const step = await tx.planStepRun.update({
      where: {
        planRunId_stepKey: {
          planRunId: params.planRunId,
          stepKey: params.stepKey,
        },
      },
      data: {
        status: PLAN_STEP_STATUS.FAILED,
        errorCode: params.errorCode,
        errorMessage: params.errorMessage,
        finishedAt: now,
      },
    })
    await tx.planRun.update({
      where: { id: params.planRunId },
      data: {
        status: PLAN_RUN_STATUS.FAILED,
        errorCode: params.errorCode,
        errorMessage: params.errorMessage,
        finishedAt: now,
      },
    })
    const eventRun = await tx.planRun.update({
      where: { id: params.planRunId },
      data: { lastSeq: { increment: 1 } },
    })
    await tx.planRunEvent.create({
      data: {
        planRunId: params.planRunId,
        projectId: params.projectId,
        userId: params.userId,
        seq: eventRun.lastSeq,
        eventType: PLAN_RUN_EVENT_TYPE.STEP_ERROR,
        stepKey: params.stepKey,
        payload: {
          errorCode: params.errorCode,
          message: params.errorMessage,
        },
      },
    })
    return mapPlanStep(step)
  })
}

export async function completePlanRun(params: {
  planRunId: string
  userId: string
  projectId: string
}) {
  await appendPlanRunEventWithSeq({
    planRunId: params.planRunId,
    projectId: params.projectId,
    userId: params.userId,
    eventType: PLAN_RUN_EVENT_TYPE.PLAN_COMPLETE,
    payload: {
      message: 'Plan run completed',
    },
  })
  return await getPlanRunSnapshot(params.planRunId)
}

export async function listPlanRuns(input: ListPlanRunsInput) {
  const rows = await runtimeClient.planRun.findMany({
    where: {
      userId: input.userId,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.episodeId ? { episodeId: input.episodeId } : {}),
      ...(input.statuses && input.statuses.length > 0 ? { status: { in: input.statuses } } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    take: input.limit ?? 20,
  })
  return rows.map(mapPlanRun)
}

export async function getPlanRunById(planRunId: string) {
  const row = await runtimeClient.planRun.findUnique({ where: { id: planRunId } })
  return row ? mapPlanRun(row) : null
}

export async function getPlanRunSnapshot(planRunId: string) {
  const [run, steps, artifacts] = await Promise.all([
    runtimeClient.planRun.findUnique({ where: { id: planRunId } }),
    runtimeClient.planStepRun.findMany({ where: { planRunId }, orderBy: { stepIndex: 'asc' } }),
    runtimeClient.planArtifact.findMany({ where: { planRunId }, orderBy: { createdAt: 'asc' } }),
  ])
  if (!run) return null
  return {
    planRun: mapPlanRun(run),
    steps: steps.map(mapPlanStep),
    artifacts: artifacts.map(mapPlanArtifact),
  }
}

export async function appendPlanRunEventWithSeq(input: PlanRunEventInput) {
  return await runtimeClient.$transaction(async (tx) => {
    const run = await tx.planRun.update({
      where: { id: input.planRunId },
      data: { lastSeq: { increment: 1 } },
    })
    const seq = run.lastSeq
    const event = await tx.planRunEvent.create({
      data: {
        planRunId: input.planRunId,
        projectId: input.projectId,
        userId: input.userId,
        seq,
        eventType: input.eventType,
        stepKey: input.stepKey || null,
        payload: input.payload || null,
      },
    })

    if (input.eventType === PLAN_RUN_EVENT_TYPE.PLAN_START) {
      await tx.planRun.update({
        where: { id: input.planRunId },
        data: { status: PLAN_RUN_STATUS.RUNNING, startedAt: new Date() },
      })
    } else if (input.eventType === PLAN_RUN_EVENT_TYPE.PLAN_COMPLETE) {
      await tx.planRun.update({
        where: { id: input.planRunId },
        data: { status: PLAN_RUN_STATUS.COMPLETED, finishedAt: new Date() },
      })
    } else if (input.eventType === PLAN_RUN_EVENT_TYPE.PLAN_ERROR) {
      await tx.planRun.update({
        where: { id: input.planRunId },
        data: {
          status: PLAN_RUN_STATUS.FAILED,
          errorCode: typeof input.payload?.errorCode === 'string' ? input.payload.errorCode : 'PLAN_RUN_FAILED',
          errorMessage: typeof input.payload?.message === 'string' ? input.payload.message : null,
          finishedAt: new Date(),
        },
      })
    } else if (input.eventType === PLAN_RUN_EVENT_TYPE.PLAN_CANCELED) {
      await tx.planRun.update({
        where: { id: input.planRunId },
        data: { status: PLAN_RUN_STATUS.CANCELED, finishedAt: new Date() },
      })
    }
    return mapPlanEvent(event)
  })
}

export async function listPlanRunEventsAfterSeq(params: {
  planRunId: string
  userId: string
  afterSeq?: number
  limit?: number
}) {
  const rows = await runtimeClient.planRunEvent.findMany({
    where: {
      planRunId: params.planRunId,
      userId: params.userId,
      seq: { gt: params.afterSeq ?? 0 },
    },
    orderBy: { seq: 'asc' },
    take: params.limit ?? 200,
  })
  return rows.map(mapPlanEvent)
}

export async function requestPlanRunCancel(params: {
  planRunId: string
  userId: string
}) {
  const result = await runtimeClient.planRun.updateMany({
    where: {
      id: params.planRunId,
      userId: params.userId,
      status: { in: [PLAN_RUN_STATUS.QUEUED, PLAN_RUN_STATUS.RUNNING, PLAN_RUN_STATUS.CANCELING] },
    },
    data: {
      status: PLAN_RUN_STATUS.CANCELING,
      cancelRequestedAt: new Date(),
    },
  })
  if (result.count === 0) return null
  return await getPlanRunById(params.planRunId)
}

function collectDownstreamSteps(steps: ReturnType<typeof mapPlanStep>[], stepKey: string) {
  const invalidated = new Set<string>([stepKey])
  let changed = true
  while (changed) {
    changed = false
    for (const step of steps) {
      if (invalidated.has(step.stepKey)) continue
      if (step.dependsOn.some((dependency) => invalidated.has(dependency))) {
        invalidated.add(step.stepKey)
        changed = true
      }
    }
  }
  return invalidated
}

export async function retryPlanStep(params: {
  planRunId: string
  userId: string
  stepKey: string
}) {
  return await runtimeClient.$transaction(async (tx) => {
    const run = await tx.planRun.findUnique({ where: { id: params.planRunId } })
    if (!run || run.userId !== params.userId) return null
    const step = await tx.planStepRun.findUnique({
      where: {
        planRunId_stepKey: {
          planRunId: params.planRunId,
          stepKey: params.stepKey,
        },
      },
    })
    if (!step) throw new Error('PLAN_STEP_NOT_FOUND')
    if (step.status !== PLAN_STEP_STATUS.FAILED) throw new Error('PLAN_STEP_NOT_FAILED')

    const rows = await tx.planStepRun.findMany({
      where: { planRunId: params.planRunId },
      orderBy: { stepIndex: 'asc' },
    })
    const invalidated = collectDownstreamSteps(rows.map(mapPlanStep), params.stepKey)
    await tx.planStepRun.updateMany({
      where: {
        planRunId: params.planRunId,
        stepKey: { in: Array.from(invalidated) },
      },
      data: {
        status: PLAN_STEP_STATUS.PENDING,
        errorCode: null,
        errorMessage: null,
        startedAt: null,
        finishedAt: null,
        outputJson: null,
      },
    })
    await tx.planArtifact.deleteMany({
      where: {
        planRunId: params.planRunId,
        stepKey: { in: Array.from(invalidated) },
      },
    })
    const updatedRun = await tx.planRun.update({
      where: { id: params.planRunId },
      data: {
        status: PLAN_RUN_STATUS.RUNNING,
        currentStepKey: params.stepKey,
        errorCode: null,
        errorMessage: null,
        finishedAt: null,
      },
    })
    return {
      planRun: mapPlanRun(updatedRun),
      invalidatedStepKeys: Array.from(invalidated),
    }
  })
}

export async function createPlanArtifact(params: {
  planRunId: string
  stepKey?: string | null
  artifactType: string
  refId: string
  payload?: Record<string, unknown> | null
}) {
  const row = await runtimeClient.planArtifact.upsert({
    where: {
      planRunId_stepKey_artifactType_refId: {
        planRunId: params.planRunId,
        stepKey: params.stepKey || '',
        artifactType: params.artifactType,
        refId: params.refId,
      },
    },
    create: {
      planRunId: params.planRunId,
      stepKey: params.stepKey || '',
      artifactType: params.artifactType,
      refId: params.refId,
      payload: params.payload || null,
    },
    update: {
      payload: params.payload || null,
    },
  })
  return mapPlanArtifact(row)
}

export async function listPlanArtifacts(params: {
  planRunId: string
  limit?: number
}) {
  const rows = await runtimeClient.planArtifact.findMany({
    where: { planRunId: params.planRunId },
    orderBy: { createdAt: 'desc' },
    take: params.limit ?? 20,
  })
  return rows.map(mapPlanArtifact)
}
