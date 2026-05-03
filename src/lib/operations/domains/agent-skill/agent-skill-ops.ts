import { z } from 'zod'
import type { NextRequest } from 'next/server'
import {
  buildAgentPlanDraft,
  agentPlanInputSchema,
  validateAgentPlan,
} from '@/lib/agent-skills/plan'
import {
  getAgentSkillManifest,
  loadAgentSkill,
  searchAgentSkills,
} from '@/lib/agent-skills/registry'
import type { AgentPlanDraft, AgentPlanValidationResult } from '@/lib/agent-skills/types'
import type { AgentPlanPartData, ConfirmationRequestPartData, ProjectAgentContext } from '@/lib/project-agent/types'
import { isConfirmedOperationInput, shouldRequireAssistantConfirmation } from '@/lib/operations/confirmation'
import { createProjectAgentOperationRegistryForApi } from '@/lib/operations/registry'
import type {
  ProjectAgentOperationContext,
  ProjectAgentOperationRegistryDraft,
  ProjectAgentToolResult,
} from '@/lib/operations/types'
import { writeOperationDataPart } from '@/lib/operations/types'
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

const searchSkillsOutputSchema = z.object({
  skills: z.array(z.object({
    id: z.string(),
    name: z.string(),
    summary: z.string(),
    description: z.string(),
    triggers: z.array(z.string()),
    riskLevel: z.enum(['low', 'medium', 'high']),
    requiresApproval: z.boolean(),
  })),
})

const loadSkillOutputSchema = z.object({
  skill: z.object({
    id: z.string(),
    name: z.string(),
    summary: z.string(),
    description: z.string(),
    triggers: z.array(z.string()),
    riskLevel: z.enum(['low', 'medium', 'high']),
    requiresApproval: z.boolean(),
    instructions: z.string(),
    operations: z.array(z.object({
      id: z.string(),
      summary: z.string(),
      intent: z.enum(['query', 'plan', 'act']),
      effects: z.object({
        writes: z.boolean(),
        billable: z.boolean(),
        destructive: z.boolean(),
        overwrite: z.boolean(),
        bulk: z.boolean(),
        externalSideEffects: z.boolean(),
        longRunning: z.boolean(),
      }),
      confirmationRequired: z.boolean(),
    })),
  }),
})

const planStepOutputSchema = z.object({
  stepKey: z.string(),
  skillId: z.string(),
  operationId: z.string(),
  reason: z.string(),
  inputArtifacts: z.array(z.string()),
  outputArtifacts: z.array(z.string()),
  dependsOn: z.array(z.string()),
  requiresApproval: z.boolean(),
})

const planIssueOutputSchema = z.object({
  code: z.string(),
  message: z.string(),
  stepKey: z.string().optional(),
  skillId: z.string().optional(),
  operationId: z.string().optional(),
})

const planValidationOutputSchema = z.object({
  ok: z.boolean(),
  issues: z.array(planIssueOutputSchema),
  steps: z.array(planStepOutputSchema),
})

const planDraftOutputSchema = z.object({
  planId: z.string(),
  goal: z.string(),
  summary: z.string(),
  requiresApproval: z.boolean(),
  validation: planValidationOutputSchema,
  steps: z.array(planStepOutputSchema),
})

const invokeOperationInputSchema = z.object({
  skillId: z.string().min(1),
  operationId: z.string().min(1),
  input: z.record(z.unknown()).optional(),
})

function operationRequiresConfirmation(operation: ReturnType<typeof createProjectAgentOperationRegistryForApi>[string]): boolean {
  return shouldRequireAssistantConfirmation(operation.confirmation)
}

function toPlanPartData(plan: AgentPlanDraft): AgentPlanPartData {
  return {
    planId: plan.planId,
    goal: plan.goal,
    summary: plan.summary,
    requiresApproval: plan.requiresApproval,
    validation: {
      ok: plan.validation.ok,
      issues: plan.validation.issues,
    },
    steps: plan.steps,
  }
}

function buildProjectAgentToolResultError(params: {
  code: 'OPERATION_NOT_FOUND' | 'OPERATION_NOT_ALLOWED' | 'CONFIRMATION_REQUIRED' | 'OPERATION_INPUT_INVALID' | 'OPERATION_EXECUTION_FAILED' | 'OPERATION_OUTPUT_INVALID' | 'OPERATION_PREREQUISITE_MISSING'
  message: string
  operationId: string
  details?: Record<string, unknown> | null
  issues?: unknown
}): ProjectAgentToolResult<unknown> {
  return {
    ok: false,
    ...(params.code === 'CONFIRMATION_REQUIRED' ? { confirmationRequired: true } : {}),
    error: {
      code: params.code,
      message: params.message,
      operationId: params.operationId,
      details: params.details ?? null,
      ...(params.issues !== undefined ? { issues: params.issues } : {}),
    },
  }
}

function effectiveEpisodeId(context: ProjectAgentContext, input: unknown): string {
  const contextEpisodeId = typeof context.episodeId === 'string' ? context.episodeId.trim() : ''
  if (contextEpisodeId) return contextEpisodeId
  if (!input || typeof input !== 'object' || Array.isArray(input)) return ''
  const value = (input as Record<string, unknown>).episodeId
  return typeof value === 'string' ? value.trim() : ''
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.trim() || 'OPERATION_EXECUTION_FAILED'
  if (typeof error === 'string' && error.trim()) return error.trim()
  return 'OPERATION_EXECUTION_FAILED'
}

async function invokeAllowedOperation(params: {
  ctx: ProjectAgentOperationContext
  skillId: string
  operationId: string
  input: Record<string, unknown>
}): Promise<ProjectAgentToolResult<unknown>> {
  const manifest = getAgentSkillManifest(params.skillId)
  if (!manifest) {
    return buildProjectAgentToolResultError({
      code: 'OPERATION_NOT_ALLOWED',
      message: `unknown skill: ${params.skillId}`,
      operationId: params.operationId,
    })
  }
  if (!manifest.allowedOperationIds.includes(params.operationId)) {
    return buildProjectAgentToolResultError({
      code: 'OPERATION_NOT_ALLOWED',
      message: `operation ${params.operationId} is not allowed by skill ${params.skillId}`,
      operationId: params.operationId,
    })
  }

  const registry = createProjectAgentOperationRegistryForApi()
  const operation = registry[params.operationId]
  if (!operation) {
    return buildProjectAgentToolResultError({
      code: 'OPERATION_NOT_FOUND',
      message: `operation not found: ${params.operationId}`,
      operationId: params.operationId,
    })
  }
  if (operation.id === 'invoke_operation') {
    return buildProjectAgentToolResultError({
      code: 'OPERATION_NOT_ALLOWED',
      message: 'invoke_operation cannot call itself',
      operationId: params.operationId,
    })
  }

  const parsed = operation.inputSchema.safeParse(params.input)
  if (!parsed.success) {
    return buildProjectAgentToolResultError({
      code: 'OPERATION_INPUT_INVALID',
      message: 'PROJECT_AGENT_INVALID_OPERATION_INPUT',
      operationId: params.operationId,
      issues: parsed.error.issues,
    })
  }

  const episodeId = effectiveEpisodeId(params.ctx.context, parsed.data)
  if (operation.prerequisites.episodeId === 'required' && !episodeId) {
    return buildProjectAgentToolResultError({
      code: 'OPERATION_PREREQUISITE_MISSING',
      message: 'PROJECT_AGENT_OPERATION_PREREQUISITE_EPISODE_REQUIRED',
      operationId: params.operationId,
    })
  }
  if (operation.prerequisites.episodeId === 'forbidden' && episodeId) {
    return buildProjectAgentToolResultError({
      code: 'OPERATION_PREREQUISITE_MISSING',
      message: 'PROJECT_AGENT_OPERATION_PREREQUISITE_EPISODE_FORBIDDEN',
      operationId: params.operationId,
    })
  }
  if (operationRequiresConfirmation(operation) && !isConfirmedOperationInput(params.input)) {
    const summary = operation.confirmation.summary
      || `Operation ${params.operationId} requires confirmation.`
    writeOperationDataPart<ConfirmationRequestPartData>(params.ctx.writer, 'data-confirmation-request', {
      operationId: 'invoke_operation',
      summary,
      argsHint: {
        skillId: params.skillId,
        operationId: params.operationId,
        input: {
          ...params.input,
          confirmed: true,
        },
      },
      ...(operation.confirmation.budget ? { budget: operation.confirmation.budget } : {}),
    })
    return buildProjectAgentToolResultError({
      code: 'CONFIRMATION_REQUIRED',
      message: summary,
      operationId: params.operationId,
      details: { skillId: params.skillId },
    })
  }

  try {
    const result = await operation.execute({
      request: params.ctx.request as NextRequest,
      userId: params.ctx.userId,
      projectId: params.ctx.projectId,
      context: params.ctx.context,
      source: params.ctx.source,
      writer: params.ctx.writer,
    }, parsed.data)
    const outputParsed = operation.outputSchema.safeParse(result)
    if (!outputParsed.success) {
      return buildProjectAgentToolResultError({
        code: 'OPERATION_OUTPUT_INVALID',
        message: 'PROJECT_AGENT_OPERATION_OUTPUT_INVALID',
        operationId: params.operationId,
        issues: outputParsed.error.issues,
      })
    }
    return {
      ok: true,
      data: outputParsed.data,
    }
  } catch (error) {
    return buildProjectAgentToolResultError({
      code: 'OPERATION_EXECUTION_FAILED',
      message: errorMessage(error),
      operationId: params.operationId,
    })
  }
}

export function createAgentSkillOperations(): ProjectAgentOperationRegistryDraft {
  return {
    search_skills: defineOperation({
      id: 'search_skills',
      summary: 'Search Agent Skills by user goal. Returns summaries only; use load_skill for full instructions and operation contracts.',
      intent: 'query',
      effects: EFFECTS_NONE,
      inputSchema: z.object({
        query: z.string().optional(),
        limit: z.number().int().min(1).max(20).optional(),
      }),
      outputSchema: searchSkillsOutputSchema,
      execute: async (_ctx, input) => ({
        skills: searchAgentSkills({
          query: input.query,
          limit: input.limit,
        }),
      }),
    }),
    load_skill: defineOperation({
      id: 'load_skill',
      summary: 'Load a full Agent Skill instruction document and the operation contracts allowed by that skill.',
      intent: 'query',
      effects: EFFECTS_NONE,
      inputSchema: z.object({
        skillId: z.string().min(1),
      }),
      outputSchema: loadSkillOutputSchema,
      execute: async (_ctx, input) => {
        const skill = loadAgentSkill(input.skillId)
        if (!skill) throw new Error(`AGENT_SKILL_NOT_FOUND:${input.skillId}`)
        const registry = createProjectAgentOperationRegistryForApi()
        return {
          skill: {
            ...skill,
            operations: skill.allowedOperationIds.map((operationId) => {
              const operation = registry[operationId]
              if (!operation) throw new Error(`AGENT_SKILL_OPERATION_NOT_FOUND:${skill.id}:${operationId}`)
              return {
                id: operation.id,
                summary: operation.summary,
                intent: operation.intent,
                effects: operation.effects,
                confirmationRequired: operationRequiresConfirmation(operation),
              }
            }),
          },
        }
      },
    }),
    create_plan: defineOperation({
      id: 'create_plan',
      summary: 'Create a one-off operation plan from loaded Agent Skills. This does not execute anything.',
      intent: 'plan',
      effects: EFFECTS_NONE,
      inputSchema: agentPlanInputSchema,
      outputSchema: planDraftOutputSchema,
      execute: async (ctx, input) => {
        const plan = buildAgentPlanDraft({
          planId: `plan_${crypto.randomUUID()}`,
          input,
        })
        writeOperationDataPart<AgentPlanPartData>(ctx.writer, 'data-plan', toPlanPartData(plan))
        return plan
      },
    }),
    validate_plan: defineOperation({
      id: 'validate_plan',
      summary: 'Validate a one-off operation plan against loaded Agent Skills, operation allowlists, artifacts, and approval rules.',
      intent: 'plan',
      effects: EFFECTS_NONE,
      inputSchema: agentPlanInputSchema,
      outputSchema: planValidationOutputSchema,
      execute: async (_ctx, input): Promise<AgentPlanValidationResult> => validateAgentPlan(input),
    }),
    execute_plan: defineOperation({
      id: 'execute_plan',
      summary: 'Execute an approved one-off plan step by step. The current implementation requires the caller to invoke each step explicitly.',
      intent: 'act',
      effects: EFFECTS_NONE,
      inputSchema: z.object({
        planId: z.string().min(1),
      }),
      outputSchema: z.object({
        ok: z.literal(false),
        reason: z.literal('PLAN_EXECUTOR_NOT_PERSISTED_YET'),
      }),
      execute: async () => ({
        ok: false as const,
        reason: 'PLAN_EXECUTOR_NOT_PERSISTED_YET' as const,
      }),
    }),
    invoke_operation: defineOperation({
      id: 'invoke_operation',
      summary: 'Invoke one real operation through a loaded Agent Skill allowlist. This is the only assistant-facing gateway to business operations.',
      intent: 'act',
      effects: EFFECTS_NONE,
      inputSchema: invokeOperationInputSchema,
      outputSchema: z.unknown(),
      execute: async (ctx, input) => invokeAllowedOperation({
        ctx,
        skillId: input.skillId,
        operationId: input.operationId,
        input: input.input ?? {},
      }),
    }),
  }
}
