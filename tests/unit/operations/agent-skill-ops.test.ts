import { describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { createAgentSkillOperations } from '@/lib/operations/domains/agent-skill/agent-skill-ops'
import type { ProjectAgentOperationContext } from '@/lib/operations/types'

const executeAgentPlanMock = vi.hoisted(() => vi.fn(async (_params: {
  userId: string
  projectId: string
  episodeId?: string | null
  planId?: string | null
  input: unknown
  invokeStep: unknown
}) => ({
  success: true,
  planRunId: 'plan-run-1',
  status: 'completed',
  executedStepKeys: ['write_first_scene_script'],
  waitingTaskId: null,
  snapshot: {
    planRun: {
      id: 'plan-run-1',
      planId: null,
    },
  },
})))

vi.mock('@/lib/plan-run-runtime/executor', () => ({
  executeAgentPlan: executeAgentPlanMock,
}))

function buildContext(writerEvents: Array<Record<string, unknown>> = []): ProjectAgentOperationContext {
  return {
    request: new Request('http://localhost') as unknown as NextRequest,
    userId: 'user-1',
    projectId: 'project-1',
    context: { episodeId: 'episode-1', locale: 'zh' },
    source: 'assistant-panel',
    writer: {
      write: (chunk: Record<string, unknown>) => {
        writerEvents.push(chunk)
      },
      merge: () => undefined,
      onError: () => undefined,
    } as unknown as ProjectAgentOperationContext['writer'],
  }
}

const searchSkillsOutputSchema = z.object({
  skills: z.array(z.object({
    id: z.string(),
  })),
})

const loadSkillOutputSchema = z.object({
  skill: z.object({
    id: z.string(),
    instructions: z.string(),
    operations: z.array(z.object({
      id: z.string(),
    })),
  }),
})

const planDraftOutputSchema = z.object({
  draftPlanId: z.string(),
  validation: z.object({
    ok: z.boolean(),
  }),
})

describe('agent skill operations', () => {
  it('search_skills returns Agent Skill summaries', async () => {
    const operations = createAgentSkillOperations()
    const raw = await operations.search_skills.execute(buildContext(), {
      query: '换场景 location',
    })
    const result = searchSkillsOutputSchema.parse(raw)

    expect(result.skills.map((skill) => skill.id)).toContain('location-selection')
  })

  it('load_skill returns instructions and allowed operation contracts', async () => {
    const operations = createAgentSkillOperations()
    const raw = await operations.load_skill.execute(buildContext(), {
      skillId: 'location-selection',
    })
    const result = loadSkillOutputSchema.parse(raw)

    expect(result.skill.instructions).toContain('Never invent location ids')
    expect(result.skill.operations.map((operation) => operation.id)).toContain('confirm_location_selection')
  })

  it('create_plan emits data-plan and rejects fixed workflow references through validation', async () => {
    const writerEvents: Array<Record<string, unknown>> = []
    const operations = createAgentSkillOperations()
    const fixedWorkflowOperationId = ['run', 'workflow', 'package'].join('_')
    const raw = await operations.create_plan.execute(buildContext(writerEvents), {
      goal: 'run fixed workflow',
      loadedSkillIds: ['screenwriting'],
      steps: [
        {
          stepKey: 'legacy',
          skillId: 'screenwriting',
          operationId: fixedWorkflowOperationId,
          reason: 'legacy workflow',
          requiresApproval: true,
        },
      ],
    })
    const result = planDraftOutputSchema.parse(raw)

    expect(result.draftPlanId).toMatch(/^draft_plan_/)
    expect(result.validation.ok).toBe(false)
    expect(writerEvents).toEqual([
      expect.objectContaining({
        type: 'data-plan',
        data: expect.objectContaining({
          draftPlanId: result.draftPlanId,
          validation: expect.objectContaining({ ok: false }),
        }),
      }),
    ])
  })

  it('execute_plan keeps draftPlanId out of the persisted PlanRun relation', async () => {
    executeAgentPlanMock.mockClear()
    const operations = createAgentSkillOperations()

    const raw = await operations.execute_plan.execute(buildContext(), {
      goal: '编写《星尘记录者》第一幕开场场景的剧本。',
      loadedSkillIds: ['screenwriting'],
      draftPlanId: 'draft_plan_1',
      confirmed: true,
      steps: [
        {
          stepKey: 'write_first_scene_script',
          skillId: 'screenwriting',
          operationId: 'write_screenplay',
          reason: '根据大纲编写第一幕开场场景的剧本内容。',
          requiresApproval: true,
        },
      ],
    })

    expect(raw).toMatchObject({
      success: true,
      planRunId: 'plan-run-1',
    })
    expect(executeAgentPlanMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      planId: null,
      input: expect.objectContaining({
        draftPlanId: 'draft_plan_1',
      }),
    }))
  })

  it('invoke_operation requests confirmation through the gateway operation', async () => {
    const writerEvents: Array<Record<string, unknown>> = []
    const operations = createAgentSkillOperations()

    await operations.invoke_operation.execute(buildContext(writerEvents), {
      skillId: 'media-generation',
      operationId: 'generate_project_music',
      input: {
        prompt: 'quiet suspense theme',
        durationSeconds: 30,
      },
    })

    expect(writerEvents).toEqual([
      expect.objectContaining({
        type: 'data-confirmation-request',
        data: expect.objectContaining({
          operationId: 'invoke_operation',
          argsHint: expect.objectContaining({
            skillId: 'media-generation',
            operationId: 'generate_project_music',
            input: expect.objectContaining({
              confirmed: true,
            }),
          }),
        }),
      }),
    ])
  })
})
