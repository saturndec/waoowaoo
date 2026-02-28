import type { RunStepStatus, RunStreamLane, RunStreamStatus } from '@/lib/novel-promotion/run-stream/types'

export type RunStepState = {
  id: string
  attempt: number
  title: string
  stepIndex: number
  stepTotal: number
  status: RunStepStatus
  textOutput: string
  reasoningOutput: string
  textLength: number
  reasoningLength: number
  message: string
  errorMessage: string
  updatedAt: number
  seqByLane: Record<RunStreamLane, number>
}

export type RunState = {
  runId: string
  status: RunStreamStatus
  startedAt: number
  updatedAt: number
  terminalAt: number | null
  errorMessage: string
  summary: Record<string, unknown> | null
  payload: Record<string, unknown> | null
  stepsById: Record<string, RunStepState>
  stepOrder: string[]
  activeStepId: string | null
  selectedStepId: string | null
}

export type RunResult = {
  runId: string
  status: RunStreamStatus
  summary: Record<string, unknown> | null
  payload: Record<string, unknown> | null
  errorMessage: string
}

export type StageViewStatus = 'pending' | 'queued' | 'processing' | 'completed' | 'failed'

export type RunStageView = {
  id: string
  title: string
  subtitle?: string
  status: StageViewStatus
  progress: number
}

export type UseRunStreamStateOptions<TParams> = {
  projectId: string
  endpoint: (projectId: string) => string
  storageKeyPrefix: string
  storageScopeKey?: string
  buildRequestBody: (params: TParams) => Record<string, unknown>
  validateParams?: (params: TParams) => void
  resolveActiveRunId?: (context: { projectId: string; storageScopeKey?: string }) => Promise<string | null>
}
