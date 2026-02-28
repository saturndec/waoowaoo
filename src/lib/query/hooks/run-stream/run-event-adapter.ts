import type { RunStreamEvent } from '@/lib/novel-promotion/run-stream/types'

type JsonRecord = Record<string, unknown>

export type RunApiEvent = {
  seq: number
  eventType: string
  stepKey?: string | null
  attempt?: number | null
  lane?: string | null
  payload?: JsonRecord | null
  createdAt?: string
}

function toObject(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as JsonRecord
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function resolveErrorMessage(payload: JsonRecord, fallback: string): string {
  const direct = readText(payload.message)
  if (direct) return direct
  const nested = readText(toObject(payload.error).message)
  return nested || fallback
}

export function parseRunApiEventsPayload(payload: unknown): RunApiEvent[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return []
  const root = payload as JsonRecord
  if (!Array.isArray(root.events)) return []

  const rows: RunApiEvent[] = []
  for (const item of root.events) {
    const row = toObject(item)
    const seq = typeof row.seq === 'number' && Number.isFinite(row.seq)
      ? Math.max(1, Math.floor(row.seq))
      : 0
    if (seq <= 0) continue

    rows.push({
      seq,
      eventType: readText(row.eventType),
      stepKey: readText(row.stepKey) || null,
      attempt:
        typeof row.attempt === 'number' && Number.isFinite(row.attempt)
          ? Math.max(1, Math.floor(row.attempt))
          : null,
      lane: readText(row.lane) || null,
      payload: toObject(row.payload),
      createdAt: readText(row.createdAt) || undefined,
    })
  }

  return rows
}

export function toRunStreamEventFromRunApi(params: {
  runId: string
  event: RunApiEvent
}): RunStreamEvent | null {
  const payload = toObject(params.event.payload)
  const stepId = typeof params.event.stepKey === 'string' ? params.event.stepKey : undefined
  const stepAttempt =
    typeof params.event.attempt === 'number' && Number.isFinite(params.event.attempt)
      ? Math.max(1, Math.floor(params.event.attempt))
      : undefined
  const stepTitle = readText(payload.stepTitle) || undefined
  const stepIndex =
    typeof payload.stepIndex === 'number' && Number.isFinite(payload.stepIndex)
      ? Math.max(1, Math.floor(payload.stepIndex))
      : undefined
  const stepTotal =
    typeof payload.stepTotal === 'number' && Number.isFinite(payload.stepTotal)
      ? Math.max(stepIndex || 1, Math.floor(payload.stepTotal))
      : undefined
  const ts = readText(params.event.createdAt) || new Date().toISOString()
  const message = readText(payload.message) || undefined

  if (params.event.eventType === 'run.start') {
    return {
      runId: params.runId,
      event: 'run.start',
      ts,
      status: 'running',
      message,
      payload,
    }
  }

  if (params.event.eventType === 'run.complete') {
    return {
      runId: params.runId,
      event: 'run.complete',
      ts,
      status: 'completed',
      message,
      payload,
    }
  }

  if (params.event.eventType === 'run.error') {
    return {
      runId: params.runId,
      event: 'run.error',
      ts,
      status: 'failed',
      message: resolveErrorMessage(payload, 'run failed'),
      payload,
    }
  }

  if (params.event.eventType === 'run.canceled') {
    return {
      runId: params.runId,
      event: 'run.error',
      ts,
      status: 'failed',
      message: resolveErrorMessage(payload, 'run canceled'),
      payload,
    }
  }

  if (params.event.eventType === 'step.start') {
    if (!stepId) return null
    return {
      runId: params.runId,
      event: 'step.start',
      ts,
      status: 'running',
      stepId,
      stepAttempt,
      stepTitle,
      stepIndex,
      stepTotal,
      message,
    }
  }

  if (params.event.eventType === 'step.chunk') {
    if (!stepId) return null
    const stream = toObject(payload.stream)
    const lane =
      params.event.lane === 'reasoning' || stream.lane === 'reasoning' || stream.kind === 'reasoning'
        ? 'reasoning'
        : 'text'
    const delta = readText(stream.delta)
    if (!delta) return null
    const laneSeq =
      typeof stream.seq === 'number' && Number.isFinite(stream.seq)
        ? Math.max(1, Math.floor(stream.seq))
        : Math.max(1, Math.floor(params.event.seq))

    return {
      runId: params.runId,
      event: 'step.chunk',
      ts,
      status: 'running',
      stepId,
      stepAttempt,
      stepTitle,
      stepIndex,
      stepTotal,
      lane,
      seq: laneSeq,
      textDelta: lane === 'text' ? delta : undefined,
      reasoningDelta: lane === 'reasoning' ? delta : undefined,
      message,
    }
  }

  if (params.event.eventType === 'step.complete') {
    if (!stepId) return null
    const text = readText(payload.text) || readText(payload.output) || undefined
    const reasoning = readText(payload.reasoning) || undefined
    return {
      runId: params.runId,
      event: 'step.complete',
      ts,
      status: 'completed',
      stepId,
      stepAttempt,
      stepTitle,
      stepIndex,
      stepTotal,
      text,
      reasoning,
      message,
    }
  }

  if (params.event.eventType === 'step.error') {
    if (!stepId) return null
    return {
      runId: params.runId,
      event: 'step.error',
      ts,
      status: 'failed',
      stepId,
      stepAttempt,
      stepTitle,
      stepIndex,
      stepTotal,
      message: resolveErrorMessage(payload, 'step failed'),
      payload,
    }
  }

  return null
}

export async function fetchRunEventsPage(params: {
  runId: string
  afterSeq: number
  limit?: number
}): Promise<RunApiEvent[]> {
  const safeAfterSeq = Number.isFinite(params.afterSeq)
    ? Math.max(0, Math.floor(params.afterSeq))
    : 0
  const safeLimit = Number.isFinite(params.limit || 500)
    ? Math.min(Math.max(Math.floor(params.limit || 500), 1), 2000)
    : 500

  const response = await fetch(
    `/api/runs/${params.runId}/events?afterSeq=${safeAfterSeq}&limit=${safeLimit}`,
    {
      method: 'GET',
      cache: 'no-store',
    },
  )
  if (!response.ok) return []

  const payload = await response.json().catch(() => null)
  return parseRunApiEventsPayload(payload)
}
