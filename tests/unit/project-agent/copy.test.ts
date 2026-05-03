import { describe, expect, it } from 'vitest'
import { buildProjectAgentSystemPrompt } from '@/lib/project-agent/copy'

describe('project agent prompt copy', () => {
  it('uses Agent Skill gateway rules instead of fixed workflow rules', () => {
    const prompt = buildProjectAgentSystemPrompt({
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      stage: 'concept',
      interactionMode: 'plan',
    })

    expect(prompt).toContain('search_skills')
    expect(prompt).toContain('load_skill')
    expect(prompt).toContain('create_plan')
    expect(prompt).toContain('validate_plan')
    expect(prompt).toContain('invoke_operation')
    expect(prompt).toContain('Skill 是指导 AI 如何使用 operations 的说明书')
    expect(prompt).not.toContain('只能通过固定 workflow package 执行')
    expect(prompt).not.toContain('workflow package 内部 skills 顺序不可更改')
  })
})
