import { z } from 'zod'
import { ARTIFACT_TYPES } from '@/lib/artifact-system/types'
import { createProjectAgentOperationRegistryForApi } from '@/lib/operations/registry'
import type { OperationEffects } from '@/lib/operations/types'
import {
  getAgentSkillManifest,
  isAgentSkillId,
} from './registry'
import type {
  AgentPlanDraft,
  AgentPlanStep,
  AgentPlanValidationResult,
  PlanValidationIssue,
} from './types'

export const agentPlanStepInputSchema = z.object({
  stepKey: z.string().min(1),
  skillId: z.string().min(1),
  operationId: z.string().min(1),
  reason: z.string().min(1),
  inputArtifacts: z.array(z.string().min(1)).optional(),
  outputArtifacts: z.array(z.string().min(1)).optional(),
  dependsOn: z.array(z.string().min(1)).optional(),
  requiresApproval: z.boolean().optional(),
  input: z.record(z.unknown()).optional(),
})

export const agentPlanInputSchema = z.object({
  goal: z.string().min(1),
  loadedSkillIds: z.array(z.string().min(1)).min(1).max(12),
  steps: z.array(agentPlanStepInputSchema).min(1).max(30),
})

export type AgentPlanInput = z.infer<typeof agentPlanInputSchema>

const bannedReferences = [
  ['story', 'to', 'script'].join('-'),
  ['script', 'to', 'storyboard'].join('-'),
  ['story', 'to', 'script', 'run'].join('_'),
  ['script', 'to', 'storyboard', 'run'].join('_'),
  ['create', 'workflow', 'plan'].join('_'),
  ['approve', 'plan'].join('_'),
  ['reject', 'plan'].join('_'),
  'workflow',
] as const

function containsBannedReference(value: string): boolean {
  const lower = value.toLowerCase()
  return bannedReferences.some((reference) => lower.includes(reference))
}

function operationRequiresApproval(effects: OperationEffects): boolean {
  return (
    effects.writes
    || effects.billable
    || effects.destructive
    || effects.overwrite
    || effects.bulk
    || effects.externalSideEffects
    || effects.longRunning
  )
}

function isKnownArtifact(value: string): boolean {
  return Object.values(ARTIFACT_TYPES).includes(value as (typeof ARTIFACT_TYPES)[keyof typeof ARTIFACT_TYPES])
}

function pushBannedIssue(params: {
  issues: PlanValidationIssue[]
  stepKey?: string
  skillId?: string
  operationId?: string
  value: string
}) {
  if (!containsBannedReference(params.value)) return
  params.issues.push({
    code: 'BANNED_FIXED_WORKFLOW_REFERENCE',
    message: `Fixed workflow reference is not allowed: ${params.value}`,
    stepKey: params.stepKey,
    skillId: params.skillId,
    operationId: params.operationId,
  })
}

export function validateAgentPlan(input: AgentPlanInput): AgentPlanValidationResult {
  const issues: PlanValidationIssue[] = []
  const registry = createProjectAgentOperationRegistryForApi()
  const loadedSkillIds = new Set(input.loadedSkillIds)
  const stepKeys = new Set<string>()
  const knownStepKeys = new Set(input.steps.map((step) => step.stepKey))

  pushBannedIssue({ issues, value: input.goal })
  for (const skillId of input.loadedSkillIds) {
    if (!isAgentSkillId(skillId)) {
      issues.push({
        code: 'UNKNOWN_SKILL',
        message: `Unknown skill: ${skillId}`,
        skillId,
      })
      continue
    }
    pushBannedIssue({ issues, skillId, value: skillId })
  }

  const normalizedSteps: AgentPlanStep[] = []
  for (const step of input.steps) {
    pushBannedIssue({
      issues,
      stepKey: step.stepKey,
      skillId: step.skillId,
      operationId: step.operationId,
      value: [step.stepKey, step.skillId, step.operationId, step.reason].join(' '),
    })

    if (stepKeys.has(step.stepKey)) {
      issues.push({
        code: 'DUPLICATE_STEP_KEY',
        message: `Duplicate stepKey: ${step.stepKey}`,
        stepKey: step.stepKey,
        skillId: step.skillId,
        operationId: step.operationId,
      })
      continue
    }
    stepKeys.add(step.stepKey)

    const manifest = getAgentSkillManifest(step.skillId)
    if (!manifest) {
      issues.push({
        code: 'UNKNOWN_SKILL',
        message: `Unknown skill: ${step.skillId}`,
        stepKey: step.stepKey,
        skillId: step.skillId,
        operationId: step.operationId,
      })
    } else if (!loadedSkillIds.has(step.skillId)) {
      issues.push({
        code: 'UNKNOWN_SKILL',
        message: `Skill must be loaded before planning: ${step.skillId}`,
        stepKey: step.stepKey,
        skillId: step.skillId,
        operationId: step.operationId,
      })
    }

    const operation = registry[step.operationId]
    if (!operation) {
      issues.push({
        code: 'UNKNOWN_OPERATION',
        message: `Unknown operation: ${step.operationId}`,
        stepKey: step.stepKey,
        skillId: step.skillId,
        operationId: step.operationId,
      })
    } else if (manifest && !manifest.allowedOperationIds.includes(step.operationId)) {
      issues.push({
        code: 'OPERATION_NOT_ALLOWED_BY_SKILL',
        message: `Operation ${step.operationId} is not allowed by skill ${step.skillId}.`,
        stepKey: step.stepKey,
        skillId: step.skillId,
        operationId: step.operationId,
      })
    }

    for (const artifact of [...(step.inputArtifacts ?? []), ...(step.outputArtifacts ?? [])]) {
      if (!isKnownArtifact(artifact)) {
        issues.push({
          code: 'UNKNOWN_ARTIFACT',
          message: `Unknown artifact: ${artifact}`,
          stepKey: step.stepKey,
          skillId: step.skillId,
          operationId: step.operationId,
        })
      }
    }

    for (const dependency of step.dependsOn ?? []) {
      if (!knownStepKeys.has(dependency)) {
        issues.push({
          code: 'UNKNOWN_DEPENDENCY',
          message: `Unknown dependency: ${dependency}`,
          stepKey: step.stepKey,
          skillId: step.skillId,
          operationId: step.operationId,
        })
      }
    }

    const requiresApproval = operation ? operationRequiresApproval(operation.effects) : step.requiresApproval === true
    if (requiresApproval && step.requiresApproval === false) {
      issues.push({
        code: 'CONFIRMATION_REQUIRED',
        message: `Operation ${step.operationId} requires approval and cannot be marked approval-free.`,
        stepKey: step.stepKey,
        skillId: step.skillId,
        operationId: step.operationId,
      })
    }

    if (manifest && operation) {
      normalizedSteps.push({
        stepKey: step.stepKey,
        skillId: manifest.id,
        operationId: operation.id,
        reason: step.reason,
        inputArtifacts: step.inputArtifacts ?? [],
        outputArtifacts: step.outputArtifacts ?? [],
        dependsOn: step.dependsOn ?? [],
        requiresApproval: requiresApproval || step.requiresApproval === true,
      })
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    steps: normalizedSteps,
  }
}

export function buildAgentPlanDraft(params: {
  draftPlanId: string
  input: AgentPlanInput
}): AgentPlanDraft {
  const validation = validateAgentPlan(params.input)
  return {
    draftPlanId: params.draftPlanId,
    goal: params.input.goal,
    summary: validation.ok
      ? `Plan for: ${params.input.goal}`
      : `Plan requires revision: ${params.input.goal}`,
    requiresApproval: validation.steps.some((step) => step.requiresApproval),
    validation,
    steps: validation.steps,
  }
}
