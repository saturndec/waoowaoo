import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { ProjectAgentOperationRegistry } from '@/lib/operations/types'
import { selectProjectAgentOperationsByGroups } from '@/lib/project-agent/operation-injection'
import { EFFECTS_NONE, EFFECTS_WRITE, makeTestOperation } from '../../helpers/project-agent-operations'

function buildRegistry(): ProjectAgentOperationRegistry {
  return {
    ui_confirm: makeTestOperation({
      id: 'ui_confirm',
      intent: 'query',
      groupPath: ['ui'],
      effects: EFFECTS_NONE,
      inputSchema: z.object({ confirmed: z.boolean().optional() }),
      outputSchema: z.object({ ok: z.boolean() }),
      execute: async () => ({ ok: true }),
    }),
    get_project_phase: makeTestOperation({
      id: 'get_project_phase',
      intent: 'query',
      groupPath: ['project', 'read'],
      effects: EFFECTS_NONE,
      inputSchema: z.object({}),
      outputSchema: z.object({ ok: z.boolean() }),
      execute: async () => ({ ok: true }),
    }),
    get_character_detail: makeTestOperation({
      id: 'get_character_detail',
      intent: 'query',
      groupPath: ['asset', 'character'],
      effects: EFFECTS_NONE,
      inputSchema: z.object({}),
      outputSchema: z.object({ ok: z.boolean() }),
      execute: async () => ({ ok: true }),
    }),
    create_storyboard_group: makeTestOperation({
      id: 'create_storyboard_group',
      intent: 'act',
      groupPath: ['storyboard', 'edit'],
      effects: EFFECTS_WRITE,
      confirmation: { required: true, summary: 'writes' },
      inputSchema: z.object({}),
      outputSchema: z.object({ ok: z.boolean() }),
      execute: async () => ({ ok: true }),
    }),
    create_plan: makeTestOperation({
      id: 'create_plan',
      intent: 'plan',
      groupPath: ['skill'],
      effects: EFFECTS_NONE,
      inputSchema: z.object({}),
      outputSchema: z.object({ ok: z.boolean() }),
      execute: async () => ({ ok: true }),
    }),
    search_skills: makeTestOperation({
      id: 'search_skills',
      intent: 'query',
      groupPath: ['skill'],
      effects: EFFECTS_NONE,
      inputSchema: z.object({}),
      outputSchema: z.object({ ok: z.boolean() }),
      execute: async () => ({ ok: true }),
    }),
  }
}

describe('selectProjectAgentOperationsByGroups', () => {
  it('always injects ui + project/read groups', () => {
    const registry = buildRegistry()
    const result = selectProjectAgentOperationsByGroups({
      registry,
      requestedGroups: [],
      maxTools: 50,
      allowedIntents: ['query'],
    })
    expect(result.operationIds).toEqual(expect.arrayContaining(['ui_confirm', 'get_project_phase']))
  })

  it('fails loudly if an always-on operation carries side effects', () => {
    const registry: ProjectAgentOperationRegistry = {
      ui_confirm: makeTestOperation({
        id: 'ui_confirm',
        intent: 'query',
        groupPath: ['ui'],
        effects: EFFECTS_WRITE,
        confirmation: { required: true, summary: 'writes' },
        inputSchema: z.object({}),
        outputSchema: z.object({ ok: z.boolean() }),
        execute: async () => ({ ok: true }),
      }),
    }

    expect(
      () => selectProjectAgentOperationsByGroups({
        registry,
        requestedGroups: [],
        maxTools: 50,
        allowedIntents: ['query'],
      }),
      'If this fails, it means a write/billable/destructive tool was accidentally placed under an always-on group (ui or project/read), which would be injected into every prompt and increase accidental execution risk.',
    ).toThrow(/PROJECT_AGENT_ALWAYS_ON_OPERATION_SIDE_EFFECTS_NOT_ALLOWED/)
  })

  it('fails explicitly on invalid requestedGroups segments', () => {
    const registry = buildRegistry()
    expect(() => selectProjectAgentOperationsByGroups({
      registry,
      requestedGroups: [['asset', '']] as unknown as string[][],
      maxTools: 50,
      allowedIntents: ['query'],
    })).toThrow(/PROJECT_AGENT_INVALID_REQUESTED_GROUP_SEGMENT_EMPTY/)
  })

  it('injects requested group by prefix match', () => {
    const registry = buildRegistry()
    const result = selectProjectAgentOperationsByGroups({
      registry,
      requestedGroups: [['asset']],
      maxTools: 50,
      allowedIntents: ['query'],
    })
    expect(result.operationIds).toEqual(expect.arrayContaining(['get_character_detail']))
  })

  it('respects allowedIntents filter for requested groups', () => {
    const registry = buildRegistry()
    const planMode = selectProjectAgentOperationsByGroups({
      registry,
      requestedGroups: [['storyboard', 'edit'], ['skill']],
      maxTools: 50,
      allowedIntents: ['query', 'plan'],
    })
    expect(planMode.operationIds).not.toContain('create_storyboard_group')
    expect(planMode.operationIds).toContain('create_plan')
    expect(planMode.operationIds).toContain('search_skills')
  })
})
