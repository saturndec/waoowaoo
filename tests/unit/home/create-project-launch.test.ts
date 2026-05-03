import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildHomeWorkspaceLaunchTarget,
  createHomeProjectLaunch,
} from '@/lib/home/create-project-launch'

function buildJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('createHomeProjectLaunch', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('creates project, config, first episode, and returns an auto-run workspace target', async () => {
    const apiFetch = vi
      .fn<(
        input: string,
        init?: RequestInit,
      ) => Promise<Response>>()
      .mockResolvedValueOnce(buildJsonResponse({
        project: { id: 'project-1' },
      }, 201))
      .mockResolvedValueOnce(buildJsonResponse({ success: true }, 200))
      .mockResolvedValueOnce(buildJsonResponse({
        episode: { id: 'episode-1' },
      }, 201))

    const result = await createHomeProjectLaunch({
      apiFetch,
      projectName: '开场白',
      storyText: '第一章内容',
      videoRatio: '9:16',
      artStyle: 'american-comic',
      directorStylePresetId: 'horror-suspense',
      episodeName: '第 1 集',
    })

    expect(apiFetch).toHaveBeenNthCalledWith(1, '/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '开场白',
        directorStylePresetId: 'horror-suspense',
      }),
    })
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/projects/project-1/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoRatio: '9:16',
        artStyle: 'american-comic',
      }),
    })
    expect(apiFetch).toHaveBeenNthCalledWith(3, '/api/projects/project-1/episodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '第 1 集',
        novelText: '第一章内容',
      }),
    })
    expect(result).toEqual({
      projectId: 'project-1',
      episodeId: 'episode-1',
      target: {
        pathname: '/workspace/project-1',
        query: {
          episode: 'episode-1',
        },
      },
    })
  })

  it('fails explicitly when first episode creation does not return an episode id', async () => {
    const apiFetch = vi
      .fn<(
        input: string,
        init?: RequestInit,
      ) => Promise<Response>>()
      .mockResolvedValueOnce(buildJsonResponse({
        project: { id: 'project-1' },
      }, 201))
      .mockResolvedValueOnce(buildJsonResponse({ success: true }, 200))
      .mockResolvedValueOnce(buildJsonResponse({
        episode: {},
      }, 201))

    await expect(createHomeProjectLaunch({
      apiFetch,
      projectName: '开场白',
      storyText: '第一章内容',
      videoRatio: '9:16',
      artStyle: 'american-comic',
      episodeName: '第 1 集',
    })).rejects.toThrow('Episode creation response missing episode id')
  })
})

describe('buildHomeWorkspaceLaunchTarget', () => {
  it('points workspace launch to the created episode', () => {
    expect(buildHomeWorkspaceLaunchTarget('project-9', 'episode-4')).toEqual({
      pathname: '/workspace/project-9',
      query: {
        episode: 'episode-4',
      },
    })
  })
})
