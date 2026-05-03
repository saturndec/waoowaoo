import { ApiError } from '@/lib/api-errors'
import type { ProjectAgentToolResult } from '@/lib/operations/types'
import {
  completePlanRun,
  completePlanStep,
  createPlanArtifact,
  createPlanRun,
  failPlanStep,
  getPlanRunSnapshot,
  startPlanStep,
} from './service'

type JsonRecord = Record<string, unknown>

export interface ExecutablePlanStep {
  stepKey: string
  skillId: string
  operationId: string
  inputArtifacts?: string[]
  outputArtifacts?: string[]
  dependsOn?: string[]
  input?: JsonRecord | null
}

export interface ExecutablePlanInput {
  goal: string
  steps: ExecutablePlanStep[]
}

export type PlanStepInvoker = (params: {
  skillId: string
  operationId: string
  input: JsonRecord
}) => Promise<ProjectAgentToolResult<unknown>>

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[MaxDepth]'
  if (typeof value === 'string') {
    if (value.startsWith('data:')) return '[OmittedDataUrl]'
    if (value.length > 4000) return `${value.slice(0, 4000)}...[truncated]`
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeValue(item, depth + 1))
  if (!isRecord(value)) return null
  const next: JsonRecord = {}
  for (const [key, item] of Object.entries(value)) {
    const lowerKey = key.toLowerCase()
    if (lowerKey.includes('raw') && lowerKey.includes('response')) continue
    if (lowerKey.includes('base64')) continue
    next[key] = sanitizeValue(item, depth + 1)
  }
  return next
}

function sanitizeOutput(value: unknown): JsonRecord {
  const sanitized = sanitizeValue(value)
  return isRecord(sanitized) ? sanitized : { value: sanitized }
}

function extractTaskId(result: unknown): string | null {
  if (!isRecord(result)) return null
  return readString(result.taskId)
    || readString(result.id)
    || (isRecord(result.data) ? readString(result.data.taskId) : null)
}

function artifactRefId(params: {
  stepKey: string
  taskId: string | null
  output: JsonRecord
}): string {
  return readString(params.output.mediaId)
    || readString(params.output.imageMediaId)
    || readString(params.output.videoMediaId)
    || readString(params.output.audioMediaId)
    || readString(params.output.panelId)
    || readString(params.output.clipId)
    || readString(params.output.assetId)
    || params.taskId
    || params.stepKey
}

function runnableStep(params: {
  steps: ExecutablePlanStep[]
  completedStepKeys: Set<string>
  startedStepKeys: Set<string>
}) {
  return params.steps.find((step) => {
    if (params.completedStepKeys.has(step.stepKey)) return false
    if (params.startedStepKeys.has(step.stepKey)) return false
    return (step.dependsOn ?? []).every((dependency) => params.completedStepKeys.has(dependency))
  }) ?? null
}

export async function executeAgentPlan(params: {
  userId: string
  projectId: string
  episodeId?: string | null
  planId?: string | null
  input: ExecutablePlanInput
  invokeStep: PlanStepInvoker
}) {
  const planRun = await createPlanRun({
    userId: params.userId,
    projectId: params.projectId,
    episodeId: params.episodeId || null,
    planId: params.planId || null,
    goal: params.input.goal,
    steps: params.input.steps.map((step, index) => ({
      stepKey: step.stepKey,
      skillId: step.skillId,
      operationId: step.operationId,
      stepIndex: index + 1,
      stepTotal: params.input.steps.length,
      dependsOn: step.dependsOn ?? [],
      inputArtifacts: step.inputArtifacts ?? [],
      outputArtifacts: step.outputArtifacts ?? [],
      input: step.input ?? null,
    })),
  })

  const completedStepKeys = new Set<string>()
  const startedStepKeys = new Set<string>()
  const executedStepKeys: string[] = []
  let waitingTaskId: string | null = null

  while (completedStepKeys.size < params.input.steps.length) {
    const step = runnableStep({
      steps: params.input.steps,
      completedStepKeys,
      startedStepKeys,
    })
    if (!step) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'PLAN_HAS_NO_RUNNABLE_STEP',
        message: 'plan has no runnable step',
      })
    }

    startedStepKeys.add(step.stepKey)
    await startPlanStep({
      planRunId: planRun.id,
      userId: params.userId,
      projectId: params.projectId,
      stepKey: step.stepKey,
    })

    const operationInput = {
      ...(step.input ?? {}),
      confirmed: true,
    }
    const result = await params.invokeStep({
      skillId: step.skillId,
      operationId: step.operationId,
      input: operationInput,
    })

    if (!result.ok) {
      await failPlanStep({
        planRunId: planRun.id,
        userId: params.userId,
        projectId: params.projectId,
        stepKey: step.stepKey,
        errorCode: result.error.code,
        errorMessage: result.error.message,
      })
      return {
        success: false,
        planRunId: planRun.id,
        failedStepKey: step.stepKey,
        error: result.error,
        snapshot: await getPlanRunSnapshot(planRun.id),
      }
    }

    const output = sanitizeOutput(result.data)
    const taskId = extractTaskId(result.data)
    await completePlanStep({
      planRunId: planRun.id,
      userId: params.userId,
      projectId: params.projectId,
      stepKey: step.stepKey,
      output,
      taskId,
    })
    for (const artifactType of step.outputArtifacts ?? []) {
      await createPlanArtifact({
        planRunId: planRun.id,
        stepKey: step.stepKey,
        artifactType,
        refId: artifactRefId({
          stepKey: step.stepKey,
          taskId,
          output,
        }),
        payload: output,
      })
    }

    executedStepKeys.push(step.stepKey)
    if (taskId) {
      waitingTaskId = taskId
      break
    }
    completedStepKeys.add(step.stepKey)
  }

  if (!waitingTaskId && completedStepKeys.size === params.input.steps.length) {
    await completePlanRun({
      planRunId: planRun.id,
      userId: params.userId,
      projectId: params.projectId,
    })
  }

  return {
    success: true,
    planRunId: planRun.id,
    status: waitingTaskId ? 'waiting_task' : 'completed',
    executedStepKeys,
    waitingTaskId,
    snapshot: await getPlanRunSnapshot(planRun.id),
  }
}
