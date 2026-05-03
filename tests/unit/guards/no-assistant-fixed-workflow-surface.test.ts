import { describe, expect, it } from 'vitest'
import { inspectAssistantFixedWorkflowSurface } from '../../../scripts/guards/no-assistant-fixed-workflow-surface.mjs'

describe('no assistant fixed workflow surface guard', () => {
  it('allows generic Agent Skill instructions', () => {
    expect(inspectAssistantFixedWorkflowSurface(
      'skills/agent/screenwriting/SKILL.md',
      'Use this skill to decide whether direct script writing is enough.',
    )).toEqual([])
  })

  it('flags old fixed workflow identifiers', () => {
    expect(inspectAssistantFixedWorkflowSurface(
      'src/lib/project-agent/copy.ts',
      'call create_workflow_plan for story-to-script',
    )).toEqual([
      'src/lib/project-agent/copy.ts contains story-to-script',
      'src/lib/project-agent/copy.ts contains create_workflow_plan',
    ])
  })
})
