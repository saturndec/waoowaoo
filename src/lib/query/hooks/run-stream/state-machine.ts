import type {
  RunStepStatus,
  RunStreamEvent,
  RunStreamLane,
  RunStreamStatus,
} from '@/lib/novel-promotion/run-stream/types'
import type {
  RunState,
  RunStepState,
  StageViewStatus,
} from './types'

export function toTimestamp(ts: string | undefined, fallback: number): number {
  if (!ts) return fallback
  const parsed = Date.parse(ts)
  return Number.isFinite(parsed) ? parsed : fallback
}

function rankStepStatus(status: RunStepStatus): number {
  if (status === 'pending') return 0
  if (status === 'running') return 1
  if (status === 'completed') return 2
  return 3
}

function rankRunStatus(status: RunStreamStatus): number {
  if (status === 'idle') return 0
  if (status === 'running') return 1
  if (status === 'completed') return 2
  return 3
}

function lockForwardStepStatus(prev: RunStepStatus, next: RunStepStatus): RunStepStatus {
  if (prev === 'completed' || prev === 'failed') return prev
  return rankStepStatus(next) >= rankStepStatus(prev) ? next : prev
}

function lockForwardRunStatus(prev: RunStreamStatus, next: RunStreamStatus): RunStreamStatus {
  if (prev === 'completed' || prev === 'failed') return prev
  return rankRunStatus(next) >= rankRunStatus(prev) ? next : prev
}

function normalizeLane(value: unknown): RunStreamLane {
  return value === 'reasoning' ? 'reasoning' : 'text'
}

function parseStepIdentity(rawStepId: string): {
  canonicalStepId: string
  attempt: number
} {
  const matched = rawStepId.match(/^(.*)_r([0-9]+)$/)
  if (!matched) {
    return {
      canonicalStepId: rawStepId,
      attempt: 1,
    }
  }
  const baseStepId = matched[1]?.trim()
  const attempt = Number.parseInt(matched[2] || '1', 10)
  if (!baseStepId || !Number.isFinite(attempt) || attempt < 2) {
    return {
      canonicalStepId: rawStepId,
      attempt: 1,
    }
  }
  return {
    canonicalStepId: baseStepId,
    attempt,
  }
}

function normalizeStepStatus(value: unknown): RunStepStatus {
  if (value === 'running' || value === 'completed' || value === 'failed') return value
  return 'pending'
}

function normalizeRunStatus(value: unknown): RunStreamStatus {
  if (value === 'running' || value === 'completed' || value === 'failed') return value
  return 'idle'
}

export function toStageViewStatus(status: RunStepStatus): StageViewStatus {
  if (status === 'running') return 'processing'
  if (status === 'pending') return 'pending'
  if (status === 'completed') return 'completed'
  return 'failed'
}

function buildDefaultStep(event: RunStreamEvent, now: number): RunStepState {
  const stepId = event.stepId || 'unknown_step'
  const stepAttempt =
    typeof event.stepAttempt === 'number' && Number.isFinite(event.stepAttempt)
      ? Math.max(1, Math.floor(event.stepAttempt))
      : 1
  const stepTitle = typeof event.stepTitle === 'string' && event.stepTitle.trim() ? event.stepTitle : stepId
  const stepIndex =
    typeof event.stepIndex === 'number' && Number.isFinite(event.stepIndex)
      ? Math.max(1, Math.floor(event.stepIndex))
      : 1
  const stepTotal =
    typeof event.stepTotal === 'number' && Number.isFinite(event.stepTotal)
      ? Math.max(stepIndex, Math.floor(event.stepTotal))
      : stepIndex

  return {
    id: stepId,
    attempt: stepAttempt,
    title: stepTitle,
    stepIndex,
    stepTotal,
    status: 'pending',
    textOutput: '',
    reasoningOutput: '',
    textLength: 0,
    reasoningLength: 0,
    message: '',
    errorMessage: '',
    updatedAt: now,
    seqByLane: {
      text: 0,
      reasoning: 0,
    },
  }
}

function resetStepForRetry(step: RunStepState, attempt: number) {
  step.attempt = attempt
  step.status = 'pending'
  step.textOutput = ''
  step.reasoningOutput = ''
  step.textLength = 0
  step.reasoningLength = 0
  step.message = ''
  step.errorMessage = ''
  step.seqByLane = {
    text: 0,
    reasoning: 0,
  }
}

function createInitialRunState(runId: string, now: number): RunState {
  return {
    runId,
    status: 'running',
    startedAt: now,
    updatedAt: now,
    terminalAt: null,
    errorMessage: '',
    summary: null,
    payload: null,
    stepsById: {},
    stepOrder: [],
    activeStepId: null,
    selectedStepId: null,
  }
}

export function applyRunStreamEvent(prev: RunState | null, event: RunStreamEvent): RunState | null {
  const now = toTimestamp(event.ts, Date.now())
  const runId = event.runId || prev?.runId || ''
  if (!runId) return prev

  const base: RunState =
    prev && prev.runId === runId
      ? { ...prev }
      : createInitialRunState(runId, now)

  base.updatedAt = now

  if (event.event === 'run.start') {
    const nextStatus = normalizeRunStatus(event.status)
    base.status = lockForwardRunStatus(base.status, nextStatus === 'idle' ? 'running' : nextStatus)
    if (event.payload && typeof event.payload === 'object') {
      base.payload = event.payload
    }
    return base
  }

  if (event.event === 'run.complete') {
    base.status = lockForwardRunStatus(base.status, 'completed')
    base.summary =
      event.payload?.summary && typeof event.payload.summary === 'object'
        ? (event.payload.summary as Record<string, unknown>)
        : event.payload || base.summary
    base.payload = event.payload || base.payload
    const finalizedSteps: Record<string, RunStepState> = { ...base.stepsById }
    for (const stepId of base.stepOrder) {
      const currentStep = finalizedSteps[stepId]
      if (!currentStep) continue
      if (currentStep.status === 'completed' || currentStep.status === 'failed') continue
      finalizedSteps[stepId] = {
        ...currentStep,
        status: 'completed',
        updatedAt: now,
      }
    }
    base.stepsById = finalizedSteps
    base.terminalAt = now
    return base
  }

  if (event.event === 'run.error') {
    base.status = lockForwardRunStatus(base.status, 'failed')
    const runErrorMessage = typeof event.message === 'string' ? event.message : base.errorMessage
    base.errorMessage = runErrorMessage
    // When only run.error is emitted (without step.error), mark unfinished steps failed
    // so the UI does not keep showing "processing" forever.
    const nextStepsById: Record<string, RunStepState> = { ...base.stepsById }
    for (const stepId of base.stepOrder) {
      const currentStep = nextStepsById[stepId]
      if (!currentStep) continue
      if (currentStep.status === 'completed' || currentStep.status === 'failed') continue
      nextStepsById[stepId] = {
        ...currentStep,
        status: 'failed',
        errorMessage: currentStep.errorMessage || runErrorMessage,
        updatedAt: now,
      }
    }
    base.stepsById = nextStepsById
    base.terminalAt = now
    return base
  }

  const rawStepId = event.stepId
  if (!rawStepId) return base
  const stepIdentity = parseStepIdentity(rawStepId)
  const stepId = stepIdentity.canonicalStepId
  const incomingAttempt =
    typeof event.stepAttempt === 'number' && Number.isFinite(event.stepAttempt)
      ? Math.max(1, Math.floor(event.stepAttempt))
      : stepIdentity.attempt
  const existingStep = base.stepsById[stepId]
  const step = existingStep
    ? { ...existingStep }
    : buildDefaultStep({ ...event, stepId, stepAttempt: incomingAttempt }, now)
  if (!Number.isFinite(step.attempt) || step.attempt < 1) {
    step.attempt = 1
  }

  if (incomingAttempt < step.attempt) {
    return base
  }

  if (incomingAttempt > step.attempt) {
    resetStepForRetry(step, incomingAttempt)
    base.errorMessage = ''
  }

  step.updatedAt = now
  if (typeof event.stepTitle === 'string' && event.stepTitle.trim()) {
    step.title = event.stepTitle.trim()
  }
  if (typeof event.stepIndex === 'number' && Number.isFinite(event.stepIndex)) {
    step.stepIndex = Math.max(1, Math.floor(event.stepIndex))
  }
  if (typeof event.stepTotal === 'number' && Number.isFinite(event.stepTotal)) {
    step.stepTotal = Math.max(step.stepIndex, Math.floor(event.stepTotal))
  }

  if (event.event === 'step.start') {
    step.status = lockForwardStepStatus(step.status, 'running')
    base.status = lockForwardRunStatus(base.status, 'running')
  }

  if (event.event === 'step.chunk') {
    const lane = normalizeLane(event.lane)
    const seq =
      typeof event.seq === 'number' && Number.isFinite(event.seq)
        ? Math.max(1, Math.floor(event.seq))
        : null
    const lastSeq = step.seqByLane[lane]
    if (seq === null || seq > lastSeq) {
      if (step.status === 'completed') {
        // Late chunks can arrive after a premature step.complete event.
        // Reopen the step so UI does not show "completed" while output is still growing.
        step.status = 'running'
      }
      if (seq !== null) {
        step.seqByLane = {
          ...step.seqByLane,
          [lane]: seq,
        }
      }

      if (lane === 'reasoning') {
        const delta =
          typeof event.reasoningDelta === 'string'
            ? event.reasoningDelta
            : typeof event.textDelta === 'string'
              ? event.textDelta
              : ''
        if (delta) step.reasoningOutput += delta
      } else {
        const delta =
          typeof event.textDelta === 'string'
            ? event.textDelta
            : typeof event.reasoningDelta === 'string'
              ? event.reasoningDelta
              : ''
        if (delta) step.textOutput += delta
      }
    }

    step.status = lockForwardStepStatus(step.status, 'running')
    step.textLength = step.textOutput.length
    step.reasoningLength = step.reasoningOutput.length
    base.status = lockForwardRunStatus(base.status, 'running')
  }

  if (event.event === 'step.complete') {
    if (typeof event.text === 'string' && event.text.length >= step.textOutput.length) {
      step.textOutput = event.text
    }
    if (typeof event.reasoning === 'string' && event.reasoning.length >= step.reasoningOutput.length) {
      step.reasoningOutput = event.reasoning
    }
    step.textLength = step.textOutput.length
    step.reasoningLength = step.reasoningOutput.length
    step.status = lockForwardStepStatus(
      step.status,
      normalizeStepStatus(event.status) === 'failed' ? 'failed' : 'completed',
    )
  }

  if (event.event === 'step.error') {
    step.status = lockForwardStepStatus(step.status, 'failed')
    step.errorMessage = typeof event.message === 'string' ? event.message : step.errorMessage
    base.errorMessage = step.errorMessage || base.errorMessage
  }

  if (typeof event.message === 'string' && event.message) {
    step.message = event.message
  }

  base.stepsById = {
    ...base.stepsById,
    [stepId]: step,
  }
  if (!base.stepOrder.includes(stepId)) {
    base.stepOrder = [...base.stepOrder, stepId]
  }
  base.stepOrder = [...base.stepOrder].sort((a, b) => {
    const sa = base.stepsById[a]
    const sb = base.stepsById[b]
    if (!sa || !sb) return 0
    if (sa.stepIndex !== sb.stepIndex) return sa.stepIndex - sb.stepIndex
    if (sa.updatedAt !== sb.updatedAt) return sa.updatedAt - sb.updatedAt
    return sa.id.localeCompare(sb.id)
  })

  const runningSteps = Object.values(base.stepsById).filter((item) => item.status === 'running')
  if (runningSteps.length > 0) {
    const maxRunningStepIndex = Math.max(...runningSteps.map((item) => item.stepIndex))
    const topCandidates = runningSteps
      .filter((item) => item.stepIndex === maxRunningStepIndex)
      .sort((a, b) => {
        if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt
        return a.id.localeCompare(b.id)
      })
    const keepCurrentActive =
      base.activeStepId && topCandidates.some((item) => item.id === base.activeStepId)
        ? base.activeStepId
        : null
    base.activeStepId = keepCurrentActive || topCandidates[0]?.id || null
  } else {
    const allSteps = Object.values(base.stepsById)
    if (allSteps.length === 0) {
      base.activeStepId = null
    } else {
      const maxStepIndex = Math.max(...allSteps.map((item) => item.stepIndex))
      const topCandidates = allSteps
        .filter((item) => item.stepIndex === maxStepIndex)
        .sort((a, b) => {
          if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt
          return a.id.localeCompare(b.id)
        })
      base.activeStepId = topCandidates[0]?.id || null
    }
  }

  if (!base.selectedStepId || !base.stepsById[base.selectedStepId]) {
    base.selectedStepId = base.activeStepId
  }

  return base
}

export function getStageOutput(step: RunStepState | null) {
  if (!step) return ''
  if (step.reasoningOutput && step.textOutput) {
    return `【思考过程】\n${step.reasoningOutput}\n\n【最终结果】\n${step.textOutput}`
  }
  if (step.reasoningOutput) return `【思考过程】\n${step.reasoningOutput}`
  if (step.textOutput) return `【最终结果】\n${step.textOutput}`
  if (step.status === 'failed' && step.errorMessage) return `【错误】\n${step.errorMessage}`
  return ''
}
