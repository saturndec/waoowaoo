import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { NextRequest } from 'next/server'
import type { ProjectAgentOperationRegistry } from '@/lib/operations/types'
import type { ProjectAgentRouteDecision } from '@/lib/project-agent/router'
import { EFFECTS_BILLABLE, EFFECTS_NONE, makeTestOperation } from '../../helpers/project-agent-operations'

const streamState = vi.hoisted(() => ({
  capturedToolNames: [] as string[],
  capturedSystem: '',
  routeResult: {
    intent: 'query' as const,
    domains: ['asset'] as const,
    requestedGroups: [['asset', 'character']] as const,
    needsClarification: false,
    clarifyingQuestion: null as string | null,
    reasoning: ['route to character asset tools'],
    latestUserText: 'show character info',
  } as ProjectAgentRouteDecision,
  writerEvents: [] as Array<Record<string, unknown>>,
}))

const registryState = vi.hoisted(() => ({
  registry: {} as ProjectAgentOperationRegistry,
}))

const loggerState = vi.hoisted(() => ({
  info: vi.fn(),
}))

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai')
  return {
    ...actual,
    safeValidateUIMessages: vi.fn(async ({ messages }) => ({ success: true, data: messages })),
    convertToModelMessages: vi.fn(async (messages) => messages),
    tool: vi.fn((definition) => definition),
    streamText: vi.fn((input) => {
      streamState.capturedToolNames = Object.keys(input.tools ?? {})
      streamState.capturedSystem = input.system
      return {
        toUIMessageStream: () => ({
          pipeThrough: () => undefined,
        }),
      }
    }),
    createUIMessageStream: vi.fn(({ execute }) => {
      const writer = {
        write: (chunk: Record<string, unknown>) => {
          streamState.writerEvents.push(chunk)
        },
        merge: vi.fn(),
      }
      void execute({ writer })
      return { writer }
    }),
    createUIMessageStreamResponse: vi.fn(() => new Response('ok', { status: 200 })),
  }
})

vi.mock('@/lib/config-service', () => ({
  getUserModelConfig: vi.fn(async () => ({ analysisModel: 'llm::mock' })),
}))

vi.mock('@/lib/project-agent/model', () => ({
  resolveProjectAgentLanguageModel: vi.fn(async () => ({ languageModel: {} as never })),
}))

vi.mock('@/lib/project-agent/message-compression', () => ({
  compressMessages: vi.fn(async ({ messages }) => messages),
}))

vi.mock('@/lib/project-agent/project-phase', () => ({
  resolveProjectPhase: vi.fn(async () => ({
    phase: 'storyboard_ready',
    progress: {
      clipCount: 1,
      screenplayClipCount: 1,
      storyboardCount: 1,
      panelCount: 1,
      voiceLineCount: 0,
    },
    activeRuns: [],
    activeRunCount: 0,
    failedItems: [],
    staleArtifacts: [],
    availableActions: {
      actMode: [],
      planMode: [],
    },
  })),
}))

vi.mock('@/lib/project-agent/router', () => ({
  routeProjectAgentRequest: vi.fn(async () => streamState.routeResult),
}))

vi.mock('@/lib/project-agent/stop-conditions', () => ({
  createProjectAgentStopController: vi.fn(() => ({
    stopWhen: undefined,
    buildStopPart: () => null,
  })),
}))

vi.mock('@/lib/adapters/tools/execute-project-agent-operation', () => ({
  executeProjectAgentOperationFromTool: vi.fn(async () => ({ ok: true, data: {} })),
}))

vi.mock('@/lib/operations/registry', () => ({
  createProjectAgentOperationRegistry: () => registryState.registry,
}))

vi.mock('@/lib/logging/core', () => ({
  createScopedLogger: vi.fn(() => ({
    info: (...args: unknown[]) => loggerState.info(...args),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    event: vi.fn(),
    child: vi.fn(),
  })),
}))

vi.mock('@/lib/api-errors', () => ({
  getRequestId: vi.fn(() => 'req-1'),
}))

import { createProjectAgentChatResponse } from '@/lib/project-agent/runtime'

function buildRequest(): NextRequest {
  return new Request('http://localhost') as unknown as NextRequest
}

async function flushAsyncWork() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('project agent runtime tool routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    streamState.capturedToolNames = []
    streamState.capturedSystem = ''
    streamState.writerEvents = []
    loggerState.info.mockReset()
    registryState.registry = {
      get_character_detail: makeTestOperation({
        id: 'get_character_detail',
        summary: 'Get character detail',
        intent: 'query',
        groupPath: ['asset', 'character'],
        effects: EFFECTS_NONE,
        inputSchema: z.object({}),
        outputSchema: z.unknown(),
        execute: async () => ({}),
      }),
      regenerate_panel_image: makeTestOperation({
        id: 'regenerate_panel_image',
        summary: 'Regenerate panel image',
        intent: 'act',
        groupPath: ['media'],
        prerequisites: { episodeId: 'required' },
        effects: EFFECTS_BILLABLE,
        confirmation: { required: true, summary: 'billable operation' },
        inputSchema: z.object({}),
        outputSchema: z.unknown(),
        execute: async () => ({}),
      }),
      get_project_phase: makeTestOperation({
        id: 'get_project_phase',
        summary: 'Get project phase',
        intent: 'query',
        groupPath: ['project', 'read'],
        effects: EFFECTS_NONE,
        inputSchema: z.object({}),
        outputSchema: z.unknown(),
        execute: async () => ({}),
      }),
      search_skills: makeTestOperation({
        id: 'search_skills',
        summary: 'Search skills',
        intent: 'query',
        groupPath: ['skill'],
        effects: EFFECTS_NONE,
        inputSchema: z.object({}),
        outputSchema: z.unknown(),
        execute: async () => ({}),
      }),
      create_plan: makeTestOperation({
        id: 'create_plan',
        summary: 'Create plan',
        intent: 'plan',
        groupPath: ['skill'],
        effects: EFFECTS_NONE,
        inputSchema: z.object({}),
        outputSchema: z.unknown(),
        execute: async () => ({}),
      }),
    }
  })

  it('does not inject direct business tools when router requests non-skill groups', async () => {
    streamState.routeResult = {
      intent: 'query',
      domains: ['asset'],
      requestedGroups: [['asset', 'character']],
      needsClarification: false,
      clarifyingQuestion: null,
      reasoning: ['character asset read request'],
      latestUserText: 'show character',
    }

    const response = await createProjectAgentChatResponse({
      request: buildRequest(),
      userId: 'user-1',
      projectId: 'project-1',
      context: { episodeId: 'ep-1', currentStage: 'storyboard' },
      messages: [
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'show character' }] },
      ],
    })
    await flushAsyncWork()

    expect(response.status).toBe(200)
    expect(streamState.capturedToolNames).not.toContain('get_character_detail')
    expect(streamState.capturedToolNames).not.toContain('regenerate_panel_image')
    expect(streamState.capturedSystem).toContain('get_project_phase')
    expect(loggerState.info).toHaveBeenCalledWith(expect.objectContaining({
      action: 'assistant.tool.selection.result',
      requestId: 'req-1',
      projectId: 'project-1',
      details: expect.objectContaining({
        operationIds: expect.not.arrayContaining(['get_character_detail']),
        requestedGroups: [],
      }),
    }))
  })

  it('does not inject panel media tools directly when router requests media group', async () => {
    streamState.routeResult = {
      intent: 'act',
      domains: ['storyboard'],
      requestedGroups: [['media']],
      needsClarification: false,
      clarifyingQuestion: null,
      reasoning: ['panel image regeneration request'],
      latestUserText: 'regenerate panel image',
    }

    await createProjectAgentChatResponse({
      request: buildRequest(),
      userId: 'user-1',
      projectId: 'project-1',
      context: { episodeId: 'ep-1', currentStage: 'storyboard' },
      messages: [
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'regenerate panel image' }] },
      ],
    })
    await flushAsyncWork()

    expect(streamState.capturedToolNames).not.toContain('regenerate_panel_image')
    expect(streamState.capturedSystem).toContain('get_project_phase')
  })

  it('returns clarification stream without selecting tools when router requires clarification', async () => {
    streamState.routeResult = {
      intent: 'query',
      domains: ['unknown'],
      requestedGroups: [['project', 'read']],
      needsClarification: true,
      clarifyingQuestion: 'Please clarify which part of the project you want me to inspect.',
      reasoning: ['request is ambiguous'],
      latestUserText: 'help me with this',
    }

    await createProjectAgentChatResponse({
      request: buildRequest(),
      userId: 'user-1',
      projectId: 'project-1',
      context: { currentStage: 'config' },
      messages: [
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'help me with this' }] },
      ],
    })
    await flushAsyncWork()

    expect(streamState.capturedToolNames).toEqual([])
    expect(streamState.writerEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'text-delta', delta: 'Please clarify which part of the project you want me to inspect.' }),
    ]))
  })

  it('does not inject act tools in plan interaction mode', async () => {
    streamState.routeResult = {
      intent: 'act',
      domains: ['storyboard'],
      requestedGroups: [['media'], ['skill']],
      needsClarification: false,
      clarifyingQuestion: null,
      reasoning: ['user wants a plan before acting'],
      latestUserText: 'plan this storyboard change',
    }

    await createProjectAgentChatResponse({
      request: buildRequest(),
      userId: 'user-1',
      projectId: 'project-1',
      context: { episodeId: 'ep-1', currentStage: 'storyboard', interactionMode: 'plan' },
      messages: [
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'plan this storyboard change' }] },
      ],
    })
    await flushAsyncWork()

    expect(streamState.capturedToolNames).not.toContain('regenerate_panel_image')
  })

  it('injects skill planning tools for open-ended creative plans', async () => {
    streamState.routeResult = {
      intent: 'plan',
      domains: ['skill'],
      requestedGroups: [['skill']],
      needsClarification: false,
      clarifyingQuestion: null,
      reasoning: ['open creative goal needs capability planning'],
      latestUserText: '给我一个希区柯克风格恐怖片计划',
    }

    await createProjectAgentChatResponse({
      request: buildRequest(),
      userId: 'user-1',
      projectId: 'project-1',
      context: { episodeId: 'ep-1', currentStage: 'concept', interactionMode: 'plan' },
      messages: [
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: '给我一个希区柯克风格恐怖片计划' }] },
      ],
    })
    await flushAsyncWork()

    expect(streamState.capturedToolNames).toContain('search_skills')
    expect(streamState.capturedToolNames).toContain('create_plan')
    expect(streamState.capturedToolNames).not.toContain('regenerate_panel_image')
  })

  it('keeps business act tools behind the skill gateway in auto interaction mode', async () => {
    streamState.routeResult = {
      intent: 'act',
      domains: ['storyboard'],
      requestedGroups: [['media']],
      needsClarification: false,
      clarifyingQuestion: null,
      reasoning: ['auto mode should honor act intent'],
      latestUserText: 'regenerate panel image',
    }

    await createProjectAgentChatResponse({
      request: buildRequest(),
      userId: 'user-1',
      projectId: 'project-1',
      context: { episodeId: 'ep-1', currentStage: 'storyboard', interactionMode: 'auto' },
      messages: [
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'regenerate panel image' }] },
      ],
    })
    await flushAsyncWork()

    expect(streamState.capturedToolNames).not.toContain('regenerate_panel_image')
  })
})
