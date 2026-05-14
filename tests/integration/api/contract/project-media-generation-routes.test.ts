import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authState = vi.hoisted(() => ({
  authenticated: true,
}))

const apiAdapterMock = vi.hoisted(() => ({
  executeProjectAgentOperationFromApi: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => {
  const unauthorized = () => new Response(
    JSON.stringify({ error: { code: 'UNAUTHORIZED' } }),
    { status: 401, headers: { 'content-type': 'application/json' } },
  )

  return {
    isErrorResponse: (value: unknown) => value instanceof Response,
    requireProjectAuthLight: async (projectId: string) => {
      if (!authState.authenticated) return unauthorized()
      return {
        session: { user: { id: 'user-1' } },
        project: { id: projectId, userId: 'user-1', name: 'Project' },
      }
    },
  }
})

vi.mock('@/lib/adapters/api/execute-project-agent-operation', () => apiAdapterMock)

import { POST as modifyAssetImagePost } from '@/app/api/projects/[projectId]/modify-asset-image/route'
import { POST as voiceGeneratePost } from '@/app/api/projects/[projectId]/voice-generate/route'
import { POST as generateVideoPost } from '@/app/api/projects/[projectId]/generate-video/route'
import { POST as finalVideoRenderPost } from '@/app/api/projects/[projectId]/final-video-render/route'
import { POST as regeneratePanelImagePost } from '@/app/api/projects/[projectId]/regenerate-panel-image/route'

describe('api contract - project media generation routes (operation adapter)', () => {
  beforeEach(() => {
    authState.authenticated = true
    vi.clearAllMocks()
  })

  it('POST /api/projects/[projectId]/modify-asset-image -> routes character/location to explicit operations', async () => {
    apiAdapterMock.executeProjectAgentOperationFromApi
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })

    const characterRes = await modifyAssetImagePost(
      buildMockRequest({
        path: '/api/projects/project-1/modify-asset-image',
        method: 'POST',
        body: { type: 'character', characterId: 'character-1' },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    const locationRes = await modifyAssetImagePost(
      buildMockRequest({
        path: '/api/projects/project-1/modify-asset-image',
        method: 'POST',
        body: { type: 'location', locationId: 'location-1' },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(characterRes.status).toBe(200)
    expect(locationRes.status).toBe(200)
    expect(apiAdapterMock.executeProjectAgentOperationFromApi).toHaveBeenNthCalledWith(1, expect.objectContaining({
      operationId: 'modify_character_image',
    }))
    expect(apiAdapterMock.executeProjectAgentOperationFromApi).toHaveBeenNthCalledWith(2, expect.objectContaining({
      operationId: 'modify_location_image',
    }))
  })

  it('POST /api/projects/[projectId]/regenerate-panel-image -> forwards reference image usage notes', async () => {
    apiAdapterMock.executeProjectAgentOperationFromApi.mockResolvedValueOnce({ success: true })

    const res = await regeneratePanelImagePost(
      buildMockRequest({
        path: '/api/projects/project-1/regenerate-panel-image',
        method: 'POST',
        body: {
          panelId: 'panel-1',
          referencePanelIds: ['panel-previous'],
          extraImageUrls: ['https://example.com/asset-ref.png'],
          referenceImageNotes: [
            {
              source: 'storyboard',
              referencePanelId: 'panel-previous',
              label: 'previous panel',
              instruction: 'Use for continuity',
            },
            {
              source: 'character',
              url: 'https://example.com/asset-ref.png',
              label: 'hero asset',
              instruction: 'Use for identity',
            },
          ],
        },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(res.status).toBe(200)
    expect(apiAdapterMock.executeProjectAgentOperationFromApi).toHaveBeenCalledWith(expect.objectContaining({
      operationId: 'regenerate_panel_image',
      input: expect.objectContaining({
        panelId: 'panel-1',
        referencePanelIds: ['panel-previous'],
        extraImageUrls: ['https://example.com/asset-ref.png'],
        referenceImageNotes: [
          {
            source: 'storyboard',
            referencePanelId: 'panel-previous',
            label: 'previous panel',
            instruction: 'Use for continuity',
          },
          {
            source: 'character',
            url: 'https://example.com/asset-ref.png',
            label: 'hero asset',
            instruction: 'Use for identity',
          },
        ],
      }),
    }))
  })

  it('POST /api/projects/[projectId]/voice-generate -> routes single/batch to explicit operations', async () => {
    apiAdapterMock.executeProjectAgentOperationFromApi
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })

    const singleRes = await voiceGeneratePost(
      buildMockRequest({
        path: '/api/projects/project-1/voice-generate',
        method: 'POST',
        body: { episodeId: 'episode-1', lineId: 'line-1' },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    const batchRes = await voiceGeneratePost(
      buildMockRequest({
        path: '/api/projects/project-1/voice-generate',
        method: 'POST',
        body: { episodeId: 'episode-1', all: true },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(singleRes.status).toBe(200)
    expect(batchRes.status).toBe(200)
    expect(apiAdapterMock.executeProjectAgentOperationFromApi).toHaveBeenNthCalledWith(1, expect.objectContaining({
      operationId: 'generate_voice_line_audio',
    }))
    expect(apiAdapterMock.executeProjectAgentOperationFromApi).toHaveBeenNthCalledWith(2, expect.objectContaining({
      operationId: 'generate_episode_voice_audio',
    }))
  })

  it('POST /api/projects/[projectId]/generate-video -> routes single/batch to explicit operations', async () => {
    apiAdapterMock.executeProjectAgentOperationFromApi
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })

    const singleRes = await generateVideoPost(
      buildMockRequest({
        path: '/api/projects/project-1/generate-video',
        method: 'POST',
        body: { panelId: 'panel-1', videoModel: 'provider/model' },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    const batchRes = await generateVideoPost(
      buildMockRequest({
        path: '/api/projects/project-1/generate-video',
        method: 'POST',
        body: { episodeId: 'episode-1', all: true, videoModel: 'provider/model' },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    const gridSingleRes = await generateVideoPost(
      buildMockRequest({
        path: '/api/projects/project-1/generate-video',
        method: 'POST',
        body: {
          episodeId: 'episode-1',
          mode: 'grid',
          gridMode: '2x2',
          shotNumbers: [1, 2, 3, 4],
          videoModel: 'provider/model',
        },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    const gridBatchRes = await generateVideoPost(
      buildMockRequest({
        path: '/api/projects/project-1/generate-video',
        method: 'POST',
        body: {
          episodeId: 'episode-1',
          mode: 'grid',
          gridMode: '3x3',
          all: true,
          videoModel: 'provider/model',
        },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    const autoBatchRes = await generateVideoPost(
      buildMockRequest({
        path: '/api/projects/project-1/generate-video',
        method: 'POST',
        body: {
          episodeId: 'episode-1',
          mode: 'auto',
          all: true,
          videoModel: 'provider/model',
          groupVideoModel: 'ark::doubao-seedance-2-0-260128',
        },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    const assetReferenceSingleRes = await generateVideoPost(
      buildMockRequest({
        path: '/api/projects/project-1/generate-video',
        method: 'POST',
        body: {
          episodeId: 'episode-1',
          mode: 'asset-reference',
          blockIndex: 0,
          videoModel: 'provider/model',
          referenceImageUrls: ['https://example.com/character.png'],
        },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    const assetReferenceBatchRes = await generateVideoPost(
      buildMockRequest({
        path: '/api/projects/project-1/generate-video',
        method: 'POST',
        body: {
          episodeId: 'episode-1',
          mode: 'asset-reference',
          all: true,
          videoModel: 'provider/model',
          referenceImageUrls: ['https://example.com/character.png'],
        },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(singleRes.status).toBe(200)
    expect(batchRes.status).toBe(200)
    expect(gridSingleRes.status).toBe(200)
    expect(gridBatchRes.status).toBe(200)
    expect(autoBatchRes.status).toBe(200)
    expect(assetReferenceSingleRes.status).toBe(200)
    expect(assetReferenceBatchRes.status).toBe(200)
    expect(apiAdapterMock.executeProjectAgentOperationFromApi).toHaveBeenNthCalledWith(1, expect.objectContaining({
      operationId: 'generate_panel_video',
    }))
    expect(apiAdapterMock.executeProjectAgentOperationFromApi).toHaveBeenNthCalledWith(2, expect.objectContaining({
      operationId: 'generate_episode_videos',
    }))
    expect(apiAdapterMock.executeProjectAgentOperationFromApi).toHaveBeenNthCalledWith(3, expect.objectContaining({
      operationId: 'generate_video_group',
      input: expect.objectContaining({
        gridMode: '2x2',
        shotNumbers: [1, 2, 3, 4],
      }),
    }))
    expect(apiAdapterMock.executeProjectAgentOperationFromApi).toHaveBeenNthCalledWith(4, expect.objectContaining({
      operationId: 'generate_episode_video_groups',
      input: expect.objectContaining({
        gridMode: '3x3',
      }),
    }))
    expect(apiAdapterMock.executeProjectAgentOperationFromApi).toHaveBeenNthCalledWith(5, expect.objectContaining({
      operationId: 'generate_episode_videos_auto',
      input: expect.objectContaining({
        mode: 'auto',
        groupVideoModel: 'ark::doubao-seedance-2-0-260128',
      }),
    }))
    expect(apiAdapterMock.executeProjectAgentOperationFromApi).toHaveBeenNthCalledWith(6, expect.objectContaining({
      operationId: 'generate_asset_reference_video',
      input: expect.objectContaining({
        mode: 'asset-reference',
        blockIndex: 0,
        referenceImageUrls: ['https://example.com/character.png'],
      }),
    }))
    expect(apiAdapterMock.executeProjectAgentOperationFromApi).toHaveBeenNthCalledWith(7, expect.objectContaining({
      operationId: 'generate_episode_asset_reference_videos',
      input: expect.objectContaining({
        mode: 'asset-reference',
        referenceImageUrls: ['https://example.com/character.png'],
      }),
    }))
  })

  it('POST /api/projects/[projectId]/generate-video -> rejects blank video model before submitting an operation', async () => {
    const response = await generateVideoPost(
      buildMockRequest({
        path: '/api/projects/project-1/generate-video',
        method: 'POST',
        body: { panelId: 'panel-1', videoModel: '   ' },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toMatchObject({
      code: 'INVALID_PARAMS',
      details: {
        code: 'VIDEO_MODEL_REQUIRED',
        field: 'videoModel',
      },
    })
    expect(apiAdapterMock.executeProjectAgentOperationFromApi).not.toHaveBeenCalled()
  })

  it('POST /api/projects/[projectId]/final-video-render -> routes to final render operation with confirmation', async () => {
    apiAdapterMock.executeProjectAgentOperationFromApi.mockResolvedValueOnce({ success: true })

    const res = await finalVideoRenderPost(
      buildMockRequest({
        path: '/api/projects/project-1/final-video-render',
        method: 'POST',
        body: { episodeId: 'episode-1', confirmed: true, bgmVolume: 0.35 },
      }),
      { params: Promise.resolve({ projectId: 'project-1' }) },
    )

    expect(res.status).toBe(200)
    expect(apiAdapterMock.executeProjectAgentOperationFromApi).toHaveBeenCalledWith(expect.objectContaining({
      operationId: 'render_final_video',
      projectId: 'project-1',
      userId: 'user-1',
      context: { episodeId: 'episode-1' },
      input: {
        confirmed: true,
        episodeId: 'episode-1',
        bgmVolume: 0.35,
      },
      source: 'project-ui',
    }))
  })
})
