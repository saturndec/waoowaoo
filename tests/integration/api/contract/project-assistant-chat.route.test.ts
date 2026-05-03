import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { buildMockRequest } from '../../../helpers/request'

const authState = vi.hoisted(() => ({
  authenticated: true,
}))

const projectAgentMock = vi.hoisted(() => ({
  createProjectAgentChatResponse: vi.fn(async () => new Response('ok', { status: 200 })),
}))

const apiAdapterMock = vi.hoisted(() => ({
  executeProjectAgentOperationFromApi: vi.fn(async (): Promise<unknown> => ({
    status: 'submitted',
    taskId: 'task-1',
  })),
}))

const compressionState = vi.hoisted(() => ({
  shouldCompress: false,
  compressedMessages: [
    {
      id: 'summary-1',
      role: 'system',
      parts: [{ type: 'text', text: 'summary' }],
      metadata: { custom: { projectAgentConversationSummary: true } },
    },
  ] as Array<Record<string, unknown>>,
}))

const persistenceMock = vi.hoisted(() => ({
  loadProjectAssistantThread: vi.fn(async (): Promise<unknown> => null),
  saveProjectAssistantThread: vi.fn(async (): Promise<unknown> => ({
    id: 'thread-1',
    assistantId: 'workspace-command',
    projectId: 'project-1',
    episodeId: 'episode-1',
    scopeRef: 'episode:episode-1',
    messages: [],
    createdAt: '2026-04-13T00:00:00.000Z',
    updatedAt: '2026-04-13T00:00:00.000Z',
  })),
  clearProjectAssistantThread: vi.fn(async (): Promise<void> => undefined),
}))

const threadLogMock = vi.hoisted(() => ({
  writeWorkspaceAssistantThreadLog: vi.fn(async () => '/tmp/workspace-assistant.log'),
  serializeWorkspaceAssistantThreadLog: vi.fn(() => '# Workspace Assistant Thread Log'),
  buildWorkspaceAssistantThreadLogFileName: vi.fn(() => 'workspace-assistant__project-1__episode_episode-1__thread-1.log'),
}))

const modelConfigMock = vi.hoisted(() => ({
  getUserModelConfig: vi.fn(async () => ({
    analysisModel: 'llm::mock',
  })),
}))

const modelResolverMock = vi.hoisted(() => ({
  resolveProjectAgentLanguageModel: vi.fn(async () => ({
    languageModel: {} as never,
  })),
}))

const messageCompressionMock = vi.hoisted(() => ({
  shouldCompressMessages: vi.fn(() => compressionState.shouldCompress),
  compressMessages: vi.fn(async () => compressionState.compressedMessages),
}))

vi.mock('@/lib/api-auth', () => {
  const unauthorized = () => new Response(
    JSON.stringify({ error: { code: 'UNAUTHORIZED' } }),
    { status: 401, headers: { 'content-type': 'application/json' } },
  )

  return {
    isErrorResponse: (value: unknown) => value instanceof Response,
    requireProjectAuth: async (projectId: string) => {
      if (!authState.authenticated) return unauthorized()
      return {
        session: { user: { id: 'user-1' } },
        project: { id: projectId, userId: 'user-1' },
      }
    },
  }
})

vi.mock('@/lib/project-agent', () => projectAgentMock)
vi.mock('@/lib/adapters/api/execute-project-agent-operation', () => apiAdapterMock)
vi.mock('@/lib/project-agent/persistence', () => persistenceMock)
vi.mock('@/lib/project-agent/thread-log', () => threadLogMock)
vi.mock('@/lib/config-service', () => modelConfigMock)
vi.mock('@/lib/project-agent/model', () => modelResolverMock)
vi.mock('@/lib/project-agent/message-compression', () => messageCompressionMock)

import {
  DELETE as chatDelete,
  GET as chatGet,
  POST as chatPost,
  PUT as chatPut,
} from '@/app/api/projects/[projectId]/assistant/chat/route'
import { GET as chatLogGet } from '@/app/api/projects/[projectId]/assistant/chat/log/route'
import { POST as confirmOperationPost } from '@/app/api/projects/[projectId]/assistant/confirm-operation/route'

describe('project assistant chat route', () => {
  beforeEach(() => {
    authState.authenticated = true
    compressionState.shouldCompress = false
    vi.clearAllMocks()
  })

  it('POST /api/projects/[projectId]/assistant/chat -> forwards request to project agent runtime', async () => {
    const response = await chatPost(
      buildMockRequest({
        path: '/api/projects/project-1/assistant/chat',
        method: 'POST',
        body: {
          messages: [
            {
              id: 'u1',
              role: 'user',
              parts: [{ type: 'text', text: '运行故事到剧本' }],
            },
          ],
          context: {
            episodeId: 'episode-1',
            currentStage: 'config',
            selectedScopeRef: 'panel:panel-1',
            selectedPanelId: 'panel-1',
            selectedClipId: 'clip-1',
            selectedAssetId: 'asset-1',
          },
        },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(response.status).toBe(200)
    expect(projectAgentMock.createProjectAgentChatResponse).toHaveBeenCalledTimes(1)
    expect(projectAgentMock.createProjectAgentChatResponse).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      userId: 'user-1',
      context: {
        episodeId: 'episode-1',
        currentStage: 'config',
        selectedScopeRef: 'panel:panel-1',
        selectedPanelId: 'panel-1',
        selectedClipId: 'clip-1',
        selectedAssetId: 'asset-1',
      },
    }))
  })

  it('POST /api/projects/[projectId]/assistant/chat -> forwards compressed messages when long conversation threshold is hit', async () => {
    compressionState.shouldCompress = true
    compressionState.compressedMessages = [
      {
        id: 'summary-1',
        role: 'system',
        parts: [{ type: 'text', text: 'summary' }],
        metadata: { custom: { projectAgentConversationSummary: true } },
      },
      {
        id: 'u1',
        role: 'user',
        parts: [{ type: 'text', text: 'latest' }],
      },
    ]

    const response = await chatPost(
      buildMockRequest({
        path: '/api/projects/project-1/assistant/chat',
        method: 'POST',
        body: {
          messages: Array.from({ length: 60 }, (_value, index) => ({
            id: `m${index}`,
            role: index % 2 === 0 ? 'user' : 'assistant',
            parts: [{ type: 'text', text: `message-${index}` }],
          })),
          context: {
            locale: 'en',
          },
        },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(response.status).toBe(200)
    expect(modelConfigMock.getUserModelConfig).toHaveBeenCalledWith('user-1')
    expect(modelResolverMock.resolveProjectAgentLanguageModel).toHaveBeenCalledWith({
      userId: 'user-1',
      analysisModelKey: 'llm::mock',
    })
    expect(messageCompressionMock.compressMessages).toHaveBeenCalledTimes(1)
    expect(projectAgentMock.createProjectAgentChatResponse).toHaveBeenCalledWith(expect.objectContaining({
      messages: compressionState.compressedMessages,
    }))
  })

  it('POST /api/projects/[projectId]/assistant/chat -> rejects unauthenticated requests', async () => {
    authState.authenticated = false
    const response = await chatPost(
      buildMockRequest({
        path: '/api/projects/project-1/assistant/chat',
        method: 'POST',
        body: {
          messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hello' }] }],
        },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(response.status).toBe(401)
  })

  it('POST /api/projects/[projectId]/assistant/chat -> validates JSON body', async () => {
    const request = new NextRequest(new URL('http://localhost:3000/api/projects/project-1/assistant/chat'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    })

    const response = await chatPost(
      request,
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      error: expect.objectContaining({
        code: 'INVALID_PARAMS',
        details: expect.objectContaining({ code: 'BODY_PARSE_FAILED' }),
      }),
    }))
  })

  it('POST /api/projects/[projectId]/assistant/chat -> maps runtime errors into API error payloads', async () => {
    projectAgentMock.createProjectAgentChatResponse.mockRejectedValueOnce(new Error('PROJECT_AGENT_MODEL_NOT_CONFIGURED'))

    const response = await chatPost(
      buildMockRequest({
        path: '/api/projects/project-1/assistant/chat',
        method: 'POST',
        body: {
          messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hello' }] }],
        },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      error: expect.objectContaining({
        code: 'MISSING_CONFIG',
        details: expect.objectContaining({ code: 'PROJECT_AGENT_MODEL_NOT_CONFIGURED' }),
      }),
    }))
  })

  it('POST /api/projects/[projectId]/assistant/confirm-operation -> executes the saved operation arguments directly with confirmed=true', async () => {
    apiAdapterMock.executeProjectAgentOperationFromApi.mockResolvedValueOnce({
      status: 'submitted',
      taskId: 'task-music-1',
    })

    const response = await confirmOperationPost(
      buildMockRequest({
        path: '/api/projects/project-1/assistant/confirm-operation',
        method: 'POST',
        body: {
          operationId: 'generate_project_music',
          input: {
            prompt: 'lo-fi title theme',
            durationSeconds: 30,
            confirmed: false,
          },
          context: {
            locale: 'zh',
            episodeId: 'episode-1',
            currentStage: 'workspace',
            selectedScopeRef: 'panel:panel-1',
            selectedPanelId: 'panel-1',
            selectedClipId: 'clip-1',
            selectedAssetId: 'asset-1',
          },
        },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(response.status).toBe(200)
    expect(apiAdapterMock.executeProjectAgentOperationFromApi).toHaveBeenCalledTimes(1)
    expect(apiAdapterMock.executeProjectAgentOperationFromApi).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      userId: 'user-1',
      operationId: 'generate_project_music',
      source: 'assistant-confirmation',
      input: {
        prompt: 'lo-fi title theme',
        durationSeconds: 30,
        confirmed: true,
      },
      context: {
        locale: 'zh',
        episodeId: 'episode-1',
        currentStage: 'workspace',
        selectedScopeRef: 'panel:panel-1',
        selectedPanelId: 'panel-1',
        selectedClipId: 'clip-1',
        selectedAssetId: 'asset-1',
      },
    }))
    await expect(response.json()).resolves.toEqual({
      success: true,
      operationId: 'generate_project_music',
      result: {
        status: 'submitted',
        taskId: 'task-music-1',
      },
    })
  })

  it('POST /api/projects/[projectId]/assistant/confirm-operation -> rejects invalid operation input before execution', async () => {
    const response = await confirmOperationPost(
      buildMockRequest({
        path: '/api/projects/project-1/assistant/confirm-operation',
        method: 'POST',
        body: {
          operationId: 'generate_project_music',
          input: 'not-object',
        },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(response.status).toBe(400)
    expect(apiAdapterMock.executeProjectAgentOperationFromApi).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      error: expect.objectContaining({
        code: 'INVALID_PARAMS',
        details: expect.objectContaining({
          code: 'CONFIRM_OPERATION_INPUT_INVALID',
        }),
      }),
    }))
  })

  it('POST /api/projects/[projectId]/assistant/confirm-operation -> rejects unauthenticated requests', async () => {
    authState.authenticated = false

    const response = await confirmOperationPost(
      buildMockRequest({
        path: '/api/projects/project-1/assistant/confirm-operation',
        method: 'POST',
        body: {
          operationId: 'generate_project_music',
          input: {
            prompt: 'lo-fi title theme',
          },
        },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(response.status).toBe(401)
    expect(apiAdapterMock.executeProjectAgentOperationFromApi).not.toHaveBeenCalled()
  })

  it('GET /api/projects/[projectId]/assistant/chat -> loads persisted workspace thread from database service', async () => {
    persistenceMock.loadProjectAssistantThread.mockResolvedValueOnce({
      id: 'thread-1',
      assistantId: 'workspace-command',
      projectId: 'project-1',
      episodeId: 'episode-1',
      scopeRef: 'episode:episode-1',
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [{ type: 'text', text: 'persisted' }],
        },
      ],
      createdAt: '2026-04-13T00:00:00.000Z',
      updatedAt: '2026-04-13T00:00:00.000Z',
    })

    const response = await chatGet(
      buildMockRequest({
        path: '/api/projects/project-1/assistant/chat',
        method: 'GET',
        query: {
          episodeId: 'episode-1',
        },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(response.status).toBe(200)
    expect(persistenceMock.loadProjectAssistantThread).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      episodeId: 'episode-1',
      assistantId: 'workspace-command',
    })

    await expect(response.json()).resolves.toEqual({
      thread: expect.objectContaining({
        id: 'thread-1',
        scopeRef: 'episode:episode-1',
      }),
    })
  })

  it('GET /api/projects/[projectId]/assistant/chat -> rejects unauthenticated requests', async () => {
    authState.authenticated = false
    const response = await chatGet(
      buildMockRequest({
        path: '/api/projects/project-1/assistant/chat',
        method: 'GET',
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(response.status).toBe(401)
  })

  it('PUT /api/projects/[projectId]/assistant/chat -> saves workspace thread to database service', async () => {
    const response = await chatPut(
      buildMockRequest({
        path: '/api/projects/project-1/assistant/chat',
        method: 'PUT',
        body: {
          episodeId: 'episode-1',
          messages: [
            {
              id: 'user-1',
              role: 'user',
              parts: [{ type: 'text', text: '现在到什么进度了' }],
            },
          ],
        },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(response.status).toBe(200)
    expect(persistenceMock.saveProjectAssistantThread).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      episodeId: 'episode-1',
      assistantId: 'workspace-command',
      messages: [
        {
          id: 'user-1',
          role: 'user',
          parts: [{ type: 'text', text: '现在到什么进度了' }],
        },
      ],
    })
    expect(threadLogMock.writeWorkspaceAssistantThreadLog).toHaveBeenCalledTimes(1)
  })

  it('PUT /api/projects/[projectId]/assistant/chat -> accepts agent plan data parts for persistence', async () => {
    const planPart = {
      type: 'data-plan',
      data: {
        planId: 'plan_1',
        goal: '希区柯克风格恐怖短片',
        summary: '创作计划',
        requiresApproval: true,
        validation: {
          ok: true,
          issues: [],
        },
        steps: [
          {
            stepKey: 'context',
            skillId: 'creative-direction',
            operationId: 'get_project_context',
            reason: '先读取项目上下文',
            inputArtifacts: [],
            outputArtifacts: ['creative.brief'],
            dependsOn: [],
            requiresApproval: false,
          },
        ],
      },
    }

    const response = await chatPut(
      buildMockRequest({
        path: '/api/projects/project-1/assistant/chat',
        method: 'PUT',
        body: {
          episodeId: 'episode-1',
          messages: [
            {
              id: 'assistant-1',
              role: 'assistant',
              parts: [planPart],
            },
          ],
        },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(response.status).toBe(200)
    expect(persistenceMock.saveProjectAssistantThread).toHaveBeenCalledWith(expect.objectContaining({
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [planPart],
        },
      ],
    }))
  })

  it('PUT /api/projects/[projectId]/assistant/chat -> persists compressed thread when long conversation threshold is hit', async () => {
    compressionState.shouldCompress = true
    compressionState.compressedMessages = [
      {
        id: 'summary-1',
        role: 'system',
        parts: [{ type: 'text', text: 'summary' }],
        metadata: { custom: { projectAgentConversationSummary: true } },
      },
      {
        id: 'user-1',
        role: 'user',
        parts: [{ type: 'text', text: 'latest' }],
      },
    ]

    const response = await chatPut(
      buildMockRequest({
        path: '/api/projects/project-1/assistant/chat',
        method: 'PUT',
        body: {
          locale: 'en',
          messages: Array.from({ length: 60 }, (_value, index) => ({
            id: `m${index}`,
            role: index % 2 === 0 ? 'user' : 'assistant',
            parts: [{ type: 'text', text: `message-${index}` }],
          })),
        },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(response.status).toBe(200)
    expect(persistenceMock.saveProjectAssistantThread).toHaveBeenCalledWith(expect.objectContaining({
      messages: compressionState.compressedMessages,
    }))
  })

  it('DELETE /api/projects/[projectId]/assistant/chat -> clears workspace thread from database service', async () => {
    const response = await chatDelete(
      buildMockRequest({
        path: '/api/projects/project-1/assistant/chat',
        method: 'DELETE',
        query: {
          episodeId: 'episode-1',
        },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(response.status).toBe(200)
    expect(persistenceMock.clearProjectAssistantThread).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      episodeId: 'episode-1',
      assistantId: 'workspace-command',
    })
  })

  it('GET /api/projects/[projectId]/assistant/chat/log -> downloads current workspace thread log', async () => {
    persistenceMock.loadProjectAssistantThread.mockResolvedValueOnce({
      id: 'thread-1',
      assistantId: 'workspace-command',
      projectId: 'project-1',
      episodeId: 'episode-1',
      scopeRef: 'episode:episode-1',
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [{ type: 'text', text: 'persisted' }],
        },
      ],
      createdAt: '2026-04-13T00:00:00.000Z',
      updatedAt: '2026-04-13T00:00:00.000Z',
    })

    const response = await chatLogGet(
      buildMockRequest({
        path: '/api/projects/project-1/assistant/chat/log',
        method: 'GET',
        query: {
          episodeId: 'episode-1',
        },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(response.status).toBe(200)
    expect(threadLogMock.serializeWorkspaceAssistantThreadLog).toHaveBeenCalledTimes(1)
    expect(response.headers.get('content-disposition')).toContain('workspace-assistant__project-1__episode_episode-1__thread-1.log')
  })
})
