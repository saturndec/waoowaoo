import { describe, expect, it } from 'vitest'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { createAgentSkillOperations } from '@/lib/operations/domains/agent-skill/agent-skill-ops'
import type { ProjectAgentOperationContext } from '@/lib/operations/types'

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
  planId: z.string(),
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
    const raw = await operations.create_plan.execute(buildContext(writerEvents), {
      goal: 'run story-to-script',
      loadedSkillIds: ['screenwriting'],
      steps: [
        {
          stepKey: 'legacy',
          skillId: 'screenwriting',
          operationId: 'story_to_script_run',
          reason: 'legacy workflow',
          requiresApproval: true,
        },
      ],
    })
    const result = planDraftOutputSchema.parse(raw)

    expect(result.validation.ok).toBe(false)
    expect(writerEvents).toEqual([
      expect.objectContaining({
        type: 'data-plan',
        data: expect.objectContaining({
          validation: expect.objectContaining({ ok: false }),
        }),
      }),
    ])
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
