export const PLAN_RUN_STATUS = {
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELING: 'canceling',
  CANCELED: 'canceled',
} as const

export type PlanRunStatus = (typeof PLAN_RUN_STATUS)[keyof typeof PLAN_RUN_STATUS]

export const PLAN_STEP_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  WAITING_TASK: 'waiting_task',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELED: 'canceled',
} as const

export type PlanStepStatus = (typeof PLAN_STEP_STATUS)[keyof typeof PLAN_STEP_STATUS]

export const PLAN_RUN_EVENT_TYPE = {
  PLAN_START: 'plan.start',
  STEP_START: 'step.start',
  STEP_CHUNK: 'step.chunk',
  STEP_COMPLETE: 'step.complete',
  STEP_ERROR: 'step.error',
  PLAN_COMPLETE: 'plan.complete',
  PLAN_ERROR: 'plan.error',
  PLAN_CANCELED: 'plan.canceled',
} as const

export type PlanRunEventType = (typeof PLAN_RUN_EVENT_TYPE)[keyof typeof PLAN_RUN_EVENT_TYPE]

export interface PlanRunEventInput {
  planRunId: string
  projectId: string
  userId: string
  eventType: PlanRunEventType
  stepKey?: string | null
  payload?: Record<string, unknown> | null
}

export interface PlanRunStepInput {
  stepKey: string
  skillId?: string | null
  operationId: string
  taskId?: string | null
  stepIndex: number
  stepTotal: number
  dependsOn?: string[]
  inputArtifacts?: string[]
  outputArtifacts?: string[]
  input?: Record<string, unknown> | null
}

export interface CreatePlanRunInput {
  userId: string
  projectId: string
  episodeId?: string | null
  commandId?: string | null
  planId?: string | null
  goal?: string | null
  steps?: PlanRunStepInput[]
}

export interface ListPlanRunsInput {
  userId: string
  projectId?: string
  episodeId?: string
  statuses?: PlanRunStatus[]
  limit?: number
}
