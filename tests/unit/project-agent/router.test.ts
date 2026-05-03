import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UIMessage } from 'ai'
import { PROJECT_PHASE, type ProjectPhaseSnapshot } from '@/lib/project-agent/project-phase'

const aiMock = vi.hoisted(() => ({
  generateObject: vi.fn(),
}))

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai')
  return {
    ...actual,
    generateObject: aiMock.generateObject,
  }
})

import { routeProjectAgentRequest } from '@/lib/project-agent/router'

function buildPhaseSnapshot(): ProjectPhaseSnapshot {
  return {
    phase: PROJECT_PHASE.STORYBOARD_READY,
    progress: {
      clipCount: 1,
      screenplayClipCount: 1,
      storyboardCount: 1,
      panelCount: 10,
      voiceLineCount: 0,
    },
    activeRuns: [],
    activeRunCount: 0,
    failedItems: [],
    staleArtifacts: [],
    availableActions: {
      actMode: ['regenerate_panel_image'],
      planMode: [],
    },
  }
}

function buildUserMessage(text: string): UIMessage {
  return {
    id: 'm-user-1',
    role: 'user',
    parts: [{ type: 'text', text }],
  }
}

describe('routeProjectAgentRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('[clear storyboard edit request] -> returns categories without clarification', async () => {
    aiMock.generateObject.mockResolvedValueOnce({
      object: {
        intent: 'act',
        domains: ['storyboard', 'asset'],
        requestedGroups: [['storyboard', 'edit'], ['asset', 'character']],
        needsClarification: false,
        clarifyingQuestion: null,
        reasoning: ['user wants to update storyboard text'],
      },
    })

    const route = await routeProjectAgentRequest({
      messages: [buildUserMessage('把角色A的人设应用到第12镜并修改镜头描述。')],
      phase: buildPhaseSnapshot(),
      context: { episodeId: 'ep-1', currentStage: 'storyboard-edit', locale: 'zh' },
      model: {} as never,
      allowedRequestedGroups: [['storyboard', 'edit'], ['asset', 'character'], ['project', 'read']],
    })

    expect(route.intent).toBe('act')
    expect(route.domains).toEqual(['storyboard', 'asset'])
    expect(route.requestedGroups).toEqual([['storyboard', 'edit'], ['asset', 'character']])
    expect(route.needsClarification).toBe(false)
    expect(route.clarifyingQuestion).toBeNull()
  })

  it('[ambiguous output without clarification] -> does not force clarification in router layer', async () => {
    aiMock.generateObject.mockResolvedValueOnce({
      object: {
        intent: 'query',
        domains: ['unknown'],
        requestedGroups: [['project', 'read']],
        needsClarification: false,
        clarifyingQuestion: null,
        reasoning: ['request is vague'],
      },
    })

    const route = await routeProjectAgentRequest({
      messages: [buildUserMessage('帮我处理一下这个项目')],
      phase: buildPhaseSnapshot(),
      context: { currentStage: 'config', locale: 'zh' },
      model: {} as never,
      allowedRequestedGroups: [['project', 'read'], ['skill'], ['storyboard', 'edit']],
    })

    expect(route.needsClarification).toBe(false)
    expect(route.clarifyingQuestion).toBeNull()
  })

  it('[open creative plan request] -> can request skill planning group', async () => {
    aiMock.generateObject.mockResolvedValueOnce({
      object: {
        intent: 'plan',
        domains: ['skill'],
        requestedGroups: [['skill']],
        needsClarification: false,
        clarifyingQuestion: null,
        reasoning: ['open creative goal needs Agent Skill planning'],
      },
    })

    const route = await routeProjectAgentRequest({
      messages: [buildUserMessage('给我一个希区柯克风格的恐怖短片计划。')],
      phase: buildPhaseSnapshot(),
      context: { currentStage: 'concept', locale: 'zh', interactionMode: 'plan' },
      model: {} as never,
      allowedRequestedGroups: [['project', 'read'], ['skill']],
    })

    expect(route.intent).toBe('plan')
    expect(route.domains).toEqual(['skill'])
    expect(route.requestedGroups).toEqual([['skill']])
  })

  it('[empty user text] -> returns direct clarification without model call', async () => {
    const route = await routeProjectAgentRequest({
      messages: [{
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'hello' }],
      }],
      phase: buildPhaseSnapshot(),
      context: { locale: 'en' },
      model: {} as never,
      allowedRequestedGroups: [['project', 'read']],
    })

    expect(aiMock.generateObject).not.toHaveBeenCalled()
    expect(route.needsClarification).toBe(true)
    expect(route.clarifyingQuestion).toBe('What do you want me to help with in this project?')
  })
})
