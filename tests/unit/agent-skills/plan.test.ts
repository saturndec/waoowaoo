import { describe, expect, it } from 'vitest'
import { validateAgentPlan } from '@/lib/agent-skills/plan'

describe('agent plan validation', () => {
  it('accepts operations allowed by loaded Agent Skills', () => {
    const result = validateAgentPlan({
      goal: '把当前镜头换一个场景',
      loadedSkillIds: ['location-selection'],
      steps: [
        {
          stepKey: 'read_context',
          skillId: 'location-selection',
          operationId: 'get_project_context',
          reason: '先读取当前选择和项目场景',
        },
        {
          stepKey: 'select_location',
          skillId: 'location-selection',
          operationId: 'confirm_location_selection',
          reason: '确认用户选定的场景',
          dependsOn: ['read_context'],
          requiresApproval: true,
        },
      ],
    })

    expect(result.ok).toBe(true)
    expect(result.issues).toEqual([])
  })

  it('rejects operations not allowed by the loaded skill', () => {
    const result = validateAgentPlan({
      goal: '换场景',
      loadedSkillIds: ['location-selection'],
      steps: [
        {
          stepKey: 'bad',
          skillId: 'location-selection',
          operationId: 'generate_project_music',
          reason: '不相关操作',
          requiresApproval: true,
        },
      ],
    })

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'OPERATION_NOT_ALLOWED_BY_SKILL',
        stepKey: 'bad',
        operationId: 'generate_project_music',
      }),
    ])
  })

  it('rejects fixed workflow references', () => {
    const result = validateAgentPlan({
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

    expect(result.ok).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toContain('BANNED_FIXED_WORKFLOW_REFERENCE')
  })
})
