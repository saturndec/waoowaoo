import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authState = vi.hoisted(() => ({
  authenticated: true,
}))

const serviceMock = vi.hoisted(() => ({
  readProjectEditScript: vi.fn(async () => ({
    id: 'edit-1',
    projectId: 'project-1',
    episodeId: 'episode-1',
    userPrompt: 'one minute sci-fi',
    title: 'Orbital Silence',
    logline: 'A pilot meets a machine intelligence.',
    durationSec: 60,
    shotCount: 8,
    status: 'ready',
    shots: [],
    requirements: [],
  })),
  generateProjectEditScript: vi.fn(async () => ({
    id: 'edit-1',
    projectId: 'project-1',
    episodeId: 'episode-1',
    userPrompt: 'one minute sci-fi',
    title: 'Orbital Silence',
    logline: 'A pilot meets a machine intelligence.',
    durationSec: 60,
    shotCount: 8,
    status: 'ready',
    shots: [],
    requirements: [
      {
        id: 'req-1',
        kind: 'character',
        name: 'Pilot',
        description: 'A quiet astronaut.',
        shotNumbers: [1, 2],
        status: 'pending',
        targetId: null,
        errorMessage: null,
      },
    ],
  })),
  generateProjectEditScriptAssets: vi.fn(async () => ({
    id: 'edit-1',
    projectId: 'project-1',
    episodeId: 'episode-1',
    userPrompt: 'one minute sci-fi',
    title: 'Orbital Silence',
    logline: 'A pilot meets a machine intelligence.',
    durationSec: 60,
    shotCount: 8,
    status: 'ready',
    shots: [],
    requirements: [
      {
        id: 'req-1',
        kind: 'character',
        name: 'Pilot',
        description: 'A quiet astronaut.',
        shotNumbers: [1, 2],
        status: 'generating',
        targetId: 'character-1',
        errorMessage: null,
      },
    ],
  })),
}))

vi.mock('@/lib/api-auth', () => {
  const unauthorized = () => new Response(
    JSON.stringify({ error: { code: 'UNAUTHORIZED' } }),
    { status: 401, headers: { 'content-type': 'application/json' } },
  )

  const authResult = (projectId: string) => {
    if (!authState.authenticated) return unauthorized()
    return {
      session: { user: { id: 'user-1' } },
      project: { id: projectId, userId: 'user-1' },
    }
  }

  return {
    isErrorResponse: (value: unknown) => value instanceof Response,
    requireProjectAuth: async (projectId: string) => authResult(projectId),
    requireProjectAuthLight: async (projectId: string) => authResult(projectId),
  }
})

vi.mock('@/lib/edit-script/service', () => serviceMock)

import {
  GET as editScriptGet,
  POST as editScriptPost,
} from '@/app/api/projects/[projectId]/edit-script/route'
import {
  POST as editScriptAssetsGeneratePost,
} from '@/app/api/projects/[projectId]/edit-script/assets/generate/route'

describe('project edit script route', () => {
  beforeEach(() => {
    authState.authenticated = true
    vi.clearAllMocks()
  })

  it('POST /api/projects/[projectId]/edit-script -> triggers the edit-first orchestration instead of assistant skills', async () => {
    const request = buildMockRequest({
      path: '/api/projects/project-1/edit-script',
      method: 'POST',
      headers: { 'accept-language': 'zh' },
      body: {
        episodeId: 'episode-1',
        prompt: '给我一个一分钟科幻短片',
      },
    })

    const response = await editScriptPost(request, { params: Promise.resolve({ projectId: 'project-1' }) })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.editScript.shotCount).toBe(8)
    expect(serviceMock.generateProjectEditScript).toHaveBeenCalledTimes(1)
    expect(serviceMock.generateProjectEditScript).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      episodeId: 'episode-1',
      userId: 'user-1',
      locale: 'zh',
      prompt: '给我一个一分钟科幻短片',
    }))
  })

  it('GET /api/projects/[projectId]/edit-script -> returns the persisted edit table and requirements', async () => {
    const request = buildMockRequest({
      path: '/api/projects/project-1/edit-script?episodeId=episode-1',
      method: 'GET',
    })

    const response = await editScriptGet(request, { params: Promise.resolve({ projectId: 'project-1' }) })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.editScript.title).toBe('Orbital Silence')
    expect(serviceMock.readProjectEditScript).toHaveBeenCalledWith({
      projectId: 'project-1',
      episodeId: 'episode-1',
    })
  })

  it('POST /api/projects/[projectId]/edit-script/assets/generate -> submits required character and location asset generation', async () => {
    const request = buildMockRequest({
      path: '/api/projects/project-1/edit-script/assets/generate',
      method: 'POST',
      headers: { 'accept-language': 'zh' },
      body: {
        episodeId: 'episode-1',
        editScriptId: 'edit-1',
      },
    })

    const response = await editScriptAssetsGeneratePost(request, { params: Promise.resolve({ projectId: 'project-1' }) })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.editScript.requirements[0].status).toBe('generating')
    expect(serviceMock.generateProjectEditScriptAssets).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      episodeId: 'episode-1',
      editScriptId: 'edit-1',
      userId: 'user-1',
      locale: 'zh',
    }))
  })
})
