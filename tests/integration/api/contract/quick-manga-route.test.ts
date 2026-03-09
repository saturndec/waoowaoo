import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authState = vi.hoisted(() => ({ authenticated: true }))
const listRunsMock = vi.hoisted(() => vi.fn())
const maybeSubmitLLMTaskMock = vi.hoisted(() => vi.fn())

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
        project: { id: projectId, userId: 'user-1', mode: 'novel-promotion' },
      }
    },
  }
})

vi.mock('@/lib/run-runtime/service', () => ({
  listRuns: listRunsMock,
}))

vi.mock('@/lib/llm-observe/route-task', () => ({
  maybeSubmitLLMTask: maybeSubmitLLMTaskMock,
}))

describe('api contract - quick manga route continuity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.authenticated = true
    listRunsMock.mockResolvedValue([
      {
        id: 'run-source',
        userId: 'user-1',
        projectId: 'project-1',
        workflowType: 'story_to_script_run',
        taskId: 'task-1',
        status: 'completed',
        input: {
          quickManga: {
            enabled: true,
            preset: 'action-battle',
            layout: 'cinematic',
            colorMode: 'black-white',
            style: 'ink',
          },
        },
      },
    ])
    maybeSubmitLLMTaskMock.mockResolvedValue(new Response(JSON.stringify({ success: true, runId: 'run-new' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
  })

  it('normalizes continuity metadata when source run is valid', async () => {
    const { POST } = await import('@/app/api/novel-promotion/[projectId]/quick-manga/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/quick-manga',
      method: 'POST',
      body: {
        episodeId: 'episode-1',
        stage: 'story-to-script',
        content: 'story content',
        quickManga: {
          enabled: true,
          preset: 'auto',
          layout: 'auto',
          colorMode: 'auto',
          style: null,
        },
        continuity: {
          sourceRunId: 'run-source',
          sourceStage: 'story-to-script',
          shortcut: 'history-regenerate',
          fallbackContentUsed: true,
          reusedOptions: {
            preset: 'slice-of-life',
            layout: 'vertical-scroll',
            colorMode: 'full-color',
            style: 'line-art',
          },
        },
      },
    })

    const res = await POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)

    expect(listRunsMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      projectId: 'project-1',
    }))

    expect(maybeSubmitLLMTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({
        continuity: {
          sourceRunId: 'run-source',
          sourceStage: 'story-to-script',
          shortcut: 'history-regenerate',
          fallbackContentUsed: true,
          reusedOptions: {
            preset: 'slice-of-life',
            layout: 'vertical-scroll',
            colorMode: 'full-color',
            style: 'line-art',
          },
        },
      }),
    }))
  })

  it('rejects continuity shortcut when source run missing', async () => {
    listRunsMock.mockResolvedValueOnce([])
    const { POST } = await import('@/app/api/novel-promotion/[projectId]/quick-manga/route')
    const req = buildMockRequest({
      path: '/api/novel-promotion/project-1/quick-manga',
      method: 'POST',
      body: {
        episodeId: 'episode-1',
        stage: 'story-to-script',
        content: 'story content',
        continuity: {
          sourceRunId: 'run-source',
          sourceStage: 'story-to-script',
          shortcut: 'history-regenerate',
          fallbackContentUsed: false,
          reusedOptions: {
            preset: 'auto',
            layout: 'auto',
            colorMode: 'auto',
            style: null,
          },
        },
      },
    })

    const res = await POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(404)
    const payload = await res.json() as { error?: { code?: string; message?: string } }
    expect(payload.error?.code).toBe('NOT_FOUND')
    expect(payload.error?.message).toBe('source run not found')
  })
})
