import { prisma } from '@/lib/prisma'
import {
  RUN_EVENT_TYPE,
  RUN_STATE_MAX_BYTES,
  RUN_STATUS,
  RUN_STEP_STATUS,
  type CreateRunInput,
  type ListRunsInput,
  type RunEvent,
  type RunEventInput,
  type RunStatus,
  type StateRef,
} from './types'

type JsonRecord = Record<string, unknown>

type GraphRunRow = {
  id: string
  userId: string
  projectId: string
  episodeId: string | null
  workflowType: string
  taskType: string | null
  taskId: string | null
  targetType: string
  targetId: string
  status: string
  input: unknown
  output: unknown
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

type GraphStepRow = {
  id: string
  runId: string
  stepKey: string
  stepTitle: string
  status: string
  currentAttempt: number
  stepIndex: number
  stepTotal: number
  startedAt: Date | null
  finishedAt: Date | null
  lastErrorCode: string | null
  lastErrorMessage: string | null
  createdAt: Date
  updatedAt: Date
}

type GraphEventRow = {
  id: bigint
  runId: string
  projectId: string
  userId: string
  seq: number
  eventType: string
  stepKey: string | null
  attempt: number | null
  lane: string | null
  payload: unknown
  createdAt: Date
}

type GraphRunModel = {
  create: (args: unknown) => Promise<GraphRunRow>
  update: (args: unknown) => Promise<GraphRunRow>
  updateMany: (args: unknown) => Promise<{ count: number }>
  findUnique: (args: unknown) => Promise<GraphRunRow | null>
  findMany: (args: unknown) => Promise<GraphRunRow[]>
}

type GraphStepModel = {
  upsert: (args: unknown) => Promise<GraphStepRow>
  findMany: (args: unknown) => Promise<GraphStepRow[]>
  updateMany: (args: unknown) => Promise<{ count: number }>
}

type GraphStepAttemptModel = {
  upsert: (args: unknown) => Promise<unknown>
}

type GraphEventModel = {
  create: (args: unknown) => Promise<GraphEventRow>
  findMany: (args: unknown) => Promise<GraphEventRow[]>
}

type GraphCheckpointModel = {
  create: (args: unknown) => Promise<unknown>
  findMany: (args: unknown) => Promise<Array<{
    id: string
    runId: string
    nodeKey: string
    version: number
    stateJson: unknown
    stateBytes: number
    createdAt: Date
  }>>
}

type GraphRuntimeTx = {
  graphRun: GraphRunModel
  graphStep: GraphStepModel
  graphStepAttempt: GraphStepAttemptModel
  graphEvent: GraphEventModel
  graphCheckpoint: GraphCheckpointModel
}

type GraphRuntimeClient = GraphRuntimeTx & {
  $transaction: <T>(fn: (tx: GraphRuntimeTx) => Promise<T>) => Promise<T>
}

const runtimeClient = prisma as unknown as GraphRuntimeClient

function toObject(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as JsonRecord
}

function asRunStatus(value: string): RunStatus {
  if (
    value === RUN_STATUS.QUEUED ||
    value === RUN_STATUS.RUNNING ||
    value === RUN_STATUS.COMPLETED ||
    value === RUN_STATUS.FAILED ||
    value === RUN_STATUS.CANCELING ||
    value === RUN_STATUS.CANCELED
  ) {
    return value
  }
  return RUN_STATUS.FAILED
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null
}

function readString(payload: JsonRecord, key: string): string | null {
  const value = payload[key]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function readInt(payload: JsonRecord, key: string): number | null {
  const value = payload[key]
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.floor(value))
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed)) return Math.max(1, parsed)
  }
  return null
}

function resolveErrorMessage(payload: JsonRecord): string | null {
  const direct = readString(payload, 'message') || readString(payload, 'errorMessage')
  if (direct) return direct
  const errorPayload = toObject(payload.error)
  return readString(errorPayload, 'message') || readString(errorPayload, 'errorMessage')
}

function normalizeLane(lane: string | null): 'text' | 'reasoning' | null {
  if (lane === 'reasoning') return 'reasoning'
  if (lane === 'text') return 'text'
  return null
}

function mapEventRow(row: GraphEventRow): RunEvent {
  return {
    id: row.id.toString(),
    runId: row.runId,
    projectId: row.projectId,
    userId: row.userId,
    seq: row.seq,
    eventType: row.eventType as RunEvent['eventType'],
    stepKey: row.stepKey,
    attempt: row.attempt,
    lane: normalizeLane(row.lane),
    payload: toObject(row.payload),
    createdAt: row.createdAt.toISOString(),
  }
}

function mapRunRow(run: GraphRunRow) {
  return {
    id: run.id,
    userId: run.userId,
    projectId: run.projectId,
    episodeId: run.episodeId,
    workflowType: run.workflowType,
    taskType: run.taskType,
    taskId: run.taskId,
    targetType: run.targetType,
    targetId: run.targetId,
    status: asRunStatus(run.status),
    input: toObject(run.input),
    output: toObject(run.output),
    errorCode: run.errorCode,
    errorMessage: run.errorMessage,
    cancelRequestedAt: toIso(run.cancelRequestedAt),
    queuedAt: run.queuedAt.toISOString(),
    startedAt: toIso(run.startedAt),
    finishedAt: toIso(run.finishedAt),
    lastSeq: run.lastSeq,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  }
}

function mapStepRow(step: GraphStepRow) {
  return {
    id: step.id,
    runId: step.runId,
    stepKey: step.stepKey,
    stepTitle: step.stepTitle,
    status: step.status as
      | typeof RUN_STEP_STATUS.PENDING
      | typeof RUN_STEP_STATUS.RUNNING
      | typeof RUN_STEP_STATUS.COMPLETED
      | typeof RUN_STEP_STATUS.FAILED
      | typeof RUN_STEP_STATUS.CANCELED,
    currentAttempt: step.currentAttempt,
    stepIndex: step.stepIndex,
    stepTotal: step.stepTotal,
    startedAt: toIso(step.startedAt),
    finishedAt: toIso(step.finishedAt),
    lastErrorCode: step.lastErrorCode,
    lastErrorMessage: step.lastErrorMessage,
    createdAt: step.createdAt.toISOString(),
    updatedAt: step.updatedAt.toISOString(),
  }
}

function buildStepProjection(input: RunEventInput) {
  const payload = toObject(input.payload)
  const stepKey = input.stepKey || readString(payload, 'stepKey') || readString(payload, 'stepId')
  if (!stepKey) return null
  const stepTitle = readString(payload, 'stepTitle') || stepKey
  const stepIndex = readInt(payload, 'stepIndex') || 1
  const stepTotal = Math.max(stepIndex, readInt(payload, 'stepTotal') || stepIndex)
  const attempt = input.attempt && input.attempt > 0 ? input.attempt : (readInt(payload, 'stepAttempt') || 1)
  return {
    stepKey,
    stepTitle,
    stepIndex,
    stepTotal,
    attempt,
    payload,
  }
}

async function applyRunProjection(tx: GraphRuntimeTx, input: RunEventInput) {
  const payload = toObject(input.payload)
  const now = new Date()
  if (input.eventType === RUN_EVENT_TYPE.RUN_START) {
    await tx.graphRun.update({
      where: { id: input.runId },
      data: {
        status: RUN_STATUS.RUNNING,
        startedAt: now,
      },
    })
    return
  }

  if (input.eventType === RUN_EVENT_TYPE.RUN_COMPLETE) {
    await tx.graphRun.update({
      where: { id: input.runId },
      data: {
        status: RUN_STATUS.COMPLETED,
        output: payload,
        finishedAt: now,
      },
    })
    await tx.graphStep.updateMany({
      where: {
        runId: input.runId,
        status: {
          in: [RUN_STEP_STATUS.PENDING, RUN_STEP_STATUS.RUNNING],
        },
      },
      data: {
        status: RUN_STEP_STATUS.COMPLETED,
        finishedAt: now,
      },
    })
    return
  }

  if (input.eventType === RUN_EVENT_TYPE.RUN_ERROR) {
    await tx.graphRun.update({
      where: { id: input.runId },
      data: {
        status: RUN_STATUS.FAILED,
        errorCode: readString(payload, 'errorCode'),
        errorMessage: resolveErrorMessage(payload),
        finishedAt: now,
      },
    })
    await tx.graphStep.updateMany({
      where: {
        runId: input.runId,
        status: {
          in: [RUN_STEP_STATUS.PENDING, RUN_STEP_STATUS.RUNNING],
        },
      },
      data: {
        status: RUN_STEP_STATUS.FAILED,
        finishedAt: now,
        lastErrorCode: readString(payload, 'errorCode'),
        lastErrorMessage: resolveErrorMessage(payload),
      },
    })
    return
  }

  if (input.eventType === RUN_EVENT_TYPE.RUN_CANCELED) {
    await tx.graphRun.update({
      where: { id: input.runId },
      data: {
        status: RUN_STATUS.CANCELED,
        finishedAt: now,
      },
    })
    await tx.graphStep.updateMany({
      where: {
        runId: input.runId,
        status: {
          in: [RUN_STEP_STATUS.PENDING, RUN_STEP_STATUS.RUNNING],
        },
      },
      data: {
        status: RUN_STEP_STATUS.CANCELED,
        finishedAt: now,
        lastErrorCode: 'CANCELED',
        lastErrorMessage: 'Run cancelled',
      },
    })
    return
  }

  const stepProjection = buildStepProjection(input)
  if (!stepProjection) return

  const isStepFailed = input.eventType === RUN_EVENT_TYPE.STEP_ERROR
  const isStepCompleted = input.eventType === RUN_EVENT_TYPE.STEP_COMPLETE
  const nextStatus = isStepFailed
    ? RUN_STEP_STATUS.FAILED
    : isStepCompleted
      ? RUN_STEP_STATUS.COMPLETED
      : RUN_STEP_STATUS.RUNNING
  await tx.graphRun.updateMany({
    where: {
      id: input.runId,
      status: {
        in: [RUN_STATUS.QUEUED, RUN_STATUS.RUNNING],
      },
    },
    data: {
      status: RUN_STATUS.RUNNING,
      startedAt: now,
    },
  })

  await tx.graphStep.upsert({
    where: {
      runId_stepKey: {
        runId: input.runId,
        stepKey: stepProjection.stepKey,
      },
    },
    create: {
      runId: input.runId,
      stepKey: stepProjection.stepKey,
      stepTitle: stepProjection.stepTitle,
      status: nextStatus,
      currentAttempt: stepProjection.attempt,
      stepIndex: stepProjection.stepIndex,
      stepTotal: stepProjection.stepTotal,
      startedAt: now,
      finishedAt: isStepCompleted || isStepFailed ? now : null,
      lastErrorCode: isStepFailed ? readString(stepProjection.payload, 'errorCode') : null,
      lastErrorMessage: isStepFailed
        ? (readString(stepProjection.payload, 'message') || readString(stepProjection.payload, 'errorMessage'))
        : null,
    },
    update: {
      stepTitle: stepProjection.stepTitle,
      status: nextStatus,
      currentAttempt: stepProjection.attempt,
      stepIndex: stepProjection.stepIndex,
      stepTotal: stepProjection.stepTotal,
      startedAt: undefined,
      finishedAt: isStepCompleted || isStepFailed ? now : null,
      lastErrorCode: isStepFailed ? readString(stepProjection.payload, 'errorCode') : null,
      lastErrorMessage: isStepFailed
        ? resolveErrorMessage(stepProjection.payload)
        : null,
    },
  })

  await tx.graphStepAttempt.upsert({
    where: {
      runId_stepKey_attempt: {
        runId: input.runId,
        stepKey: stepProjection.stepKey,
        attempt: stepProjection.attempt,
      },
    },
    create: {
      runId: input.runId,
      stepKey: stepProjection.stepKey,
      attempt: stepProjection.attempt,
      status: nextStatus,
      outputText: isStepCompleted ? readString(stepProjection.payload, 'text') : null,
      outputReasoning: isStepCompleted ? readString(stepProjection.payload, 'reasoning') : null,
      errorCode: isStepFailed ? readString(stepProjection.payload, 'errorCode') : null,
      errorMessage: isStepFailed ? resolveErrorMessage(stepProjection.payload) : null,
      startedAt: now,
      finishedAt: isStepCompleted || isStepFailed ? now : null,
      usageJson: toObject(stepProjection.payload.usage),
    },
    update: {
      status: nextStatus,
      outputText: isStepCompleted ? readString(stepProjection.payload, 'text') : null,
      outputReasoning: isStepCompleted ? readString(stepProjection.payload, 'reasoning') : null,
      errorCode: isStepFailed ? readString(stepProjection.payload, 'errorCode') : null,
      errorMessage: isStepFailed ? resolveErrorMessage(stepProjection.payload) : null,
      finishedAt: isStepCompleted || isStepFailed ? now : null,
      usageJson: toObject(stepProjection.payload.usage),
    },
  })
}

export async function createRun(input: CreateRunInput) {
  const row = await runtimeClient.graphRun.create({
    data: {
      userId: input.userId,
      projectId: input.projectId,
      episodeId: input.episodeId || null,
      workflowType: input.workflowType,
      taskType: input.taskType || null,
      taskId: input.taskId || null,
      targetType: input.targetType,
      targetId: input.targetId,
      status: RUN_STATUS.QUEUED,
      input: input.input || null,
      queuedAt: new Date(),
      lastSeq: 0,
    },
  })
  return mapRunRow(row)
}

export async function attachTaskToRun(runId: string, taskId: string) {
  const row = await runtimeClient.graphRun.update({
    where: { id: runId },
    data: {
      taskId,
    },
  })
  return mapRunRow(row)
}

export async function getRunById(runId: string) {
  const row = await runtimeClient.graphRun.findUnique({
    where: { id: runId },
  })
  if (!row) return null
  return mapRunRow(row)
}

export async function getRunSnapshot(runId: string) {
  const [run, steps] = await Promise.all([
    runtimeClient.graphRun.findUnique({
      where: { id: runId },
    }),
    runtimeClient.graphStep.findMany({
      where: { runId },
      orderBy: [
        { stepIndex: 'asc' },
        { updatedAt: 'asc' },
      ],
    }),
  ])
  if (!run) return null
  return {
    run: mapRunRow(run),
    steps: steps.map(mapStepRow),
  }
}

export async function listRuns(input: ListRunsInput) {
  const safeLimit = Number.isFinite(input.limit || 50)
    ? Math.min(Math.max(Math.floor(input.limit || 50), 1), 200)
    : 50
  const statusFilter = Array.isArray(input.statuses) && input.statuses.length > 0
    ? { in: input.statuses }
    : undefined
  const rows = await runtimeClient.graphRun.findMany({
    where: {
      userId: input.userId,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.workflowType ? { workflowType: input.workflowType } : {}),
      ...(input.targetType ? { targetType: input.targetType } : {}),
      ...(input.targetId ? { targetId: input.targetId } : {}),
      ...(input.episodeId ? { episodeId: input.episodeId } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: safeLimit,
  })
  return rows.map(mapRunRow)
}

export async function requestRunCancel(params: {
  runId: string
  userId: string
}) {
  await runtimeClient.graphRun.updateMany({
    where: {
      id: params.runId,
      userId: params.userId,
      status: {
        in: [RUN_STATUS.QUEUED, RUN_STATUS.RUNNING],
      },
    },
    data: {
      status: RUN_STATUS.CANCELING,
      cancelRequestedAt: new Date(),
    },
  })
  const row = await runtimeClient.graphRun.findUnique({
    where: { id: params.runId },
  })
  return row ? mapRunRow(row) : null
}

export async function appendRunEventWithSeq(input: RunEventInput): Promise<RunEvent> {
  return await runtimeClient.$transaction(async (tx) => {
    const run = await tx.graphRun.update({
      where: { id: input.runId },
      data: {
        lastSeq: { increment: 1 },
      },
      select: {
        id: true,
        lastSeq: true,
      },
    })

    const created = await tx.graphEvent.create({
      data: {
        runId: input.runId,
        projectId: input.projectId,
        userId: input.userId,
        seq: run.lastSeq,
        eventType: input.eventType,
        stepKey: input.stepKey || null,
        attempt: input.attempt || null,
        lane: input.lane || null,
        payload: input.payload || null,
      },
    })

    await applyRunProjection(tx, input)
    return mapEventRow(created)
  })
}

export async function listRunEventsAfterSeq(params: {
  runId: string
  userId: string
  afterSeq?: number
  limit?: number
}) {
  const run = await runtimeClient.graphRun.findUnique({
    where: { id: params.runId },
    select: {
      id: true,
      userId: true,
    },
  })
  if (!run || run.userId !== params.userId) return []
  const safeAfterSeq = Number.isFinite(params.afterSeq || 0) ? Math.max(0, Math.floor(params.afterSeq || 0)) : 0
  const safeLimit = Number.isFinite(params.limit || 200)
    ? Math.min(Math.max(Math.floor(params.limit || 200), 1), 2000)
    : 200
  const rows = await runtimeClient.graphEvent.findMany({
    where: {
      runId: params.runId,
      seq: {
        gt: safeAfterSeq,
      },
    },
    orderBy: { seq: 'asc' },
    take: safeLimit,
  })
  return rows.map(mapEventRow)
}

export function assertCheckpointStateSize(state: JsonRecord) {
  const serialized = JSON.stringify(state)
  const bytes = Buffer.byteLength(serialized, 'utf8')
  if (bytes > RUN_STATE_MAX_BYTES) {
    throw new Error(`checkpoint state too large: ${bytes} bytes (max ${RUN_STATE_MAX_BYTES})`)
  }
  return bytes
}

export function buildLeanState(params: {
  refs: StateRef
  meta?: JsonRecord
}) {
  return {
    refs: {
      scriptId: params.refs.scriptId || null,
      storyboardId: params.refs.storyboardId || null,
      voiceLineBatchId: params.refs.voiceLineBatchId || null,
      versionHash: params.refs.versionHash || null,
      cursor: params.refs.cursor || null,
    },
    meta: params.meta || {},
  }
}

export async function createCheckpoint(params: {
  runId: string
  nodeKey: string
  version: number
  state: JsonRecord
}) {
  const bytes = assertCheckpointStateSize(params.state)
  return await runtimeClient.graphCheckpoint.create({
    data: {
      runId: params.runId,
      nodeKey: params.nodeKey,
      version: params.version,
      stateJson: params.state,
      stateBytes: bytes,
    },
  })
}

export async function listCheckpoints(params: {
  runId: string
  nodeKey?: string
  limit?: number
}) {
  const safeLimit = Number.isFinite(params.limit || 20)
    ? Math.min(Math.max(Math.floor(params.limit || 20), 1), 200)
    : 20
  return await runtimeClient.graphCheckpoint.findMany({
    where: {
      runId: params.runId,
      ...(params.nodeKey ? { nodeKey: params.nodeKey } : {}),
    },
    orderBy: { version: 'desc' },
    take: safeLimit,
  })
}
