import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const txMock = vi.hoisted(() => ({
  projectClip: {
    create: vi.fn(),
    update: vi.fn(),
  },
  projectStoryboard: {
    create: vi.fn(),
    update: vi.fn(),
  },
}))

const prismaMock = vi.hoisted(() => ({
  projectEditScript: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  projectCharacter: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  projectLocation: {
    findFirst: vi.fn(),
  },
  task: {
    findFirst: vi.fn(),
  },
  projectStoryboard: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  projectPanel: {
    create: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(async (callback: (tx: typeof txMock) => Promise<unknown>) => callback(txMock)),
}))

const configMock = vi.hoisted(() => ({
  getProjectModelConfig: vi.fn(),
}))

const runtimeConfigMock = vi.hoisted(() => ({
  resolveModelSelection: vi.fn(),
}))

const operationMock = vi.hoisted(() => ({
  executeProjectAgentOperationFromApi: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/config-service', () => configMock)
vi.mock('@/lib/user-api/runtime-config', () => runtimeConfigMock)
vi.mock('@/lib/adapters/api/execute-project-agent-operation', () => operationMock)
vi.mock('@/lib/ai-exec/engine', () => ({ executeAiTextStep: vi.fn() }))
vi.mock('@/lib/billing', () => ({ withTextBilling: vi.fn(), buildDefaultTaskBillingInfo: vi.fn() }))
vi.mock('@/lib/assets/services/asset-actions', () => ({ submitAssetGenerateTask: vi.fn() }))

import {
  generateProjectEditScriptStoryboard,
  updateProjectEditScriptVideoBlockPrompt,
} from '@/lib/edit-script/service'

function createRequest(): NextRequest {
  return new Request('http://localhost/api/projects/project-1/edit-script/storyboard/generate', {
    method: 'POST',
    headers: { 'accept-language': 'zh' },
  }) as unknown as NextRequest
}

describe('generateProjectEditScriptStoryboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    configMock.getProjectModelConfig.mockResolvedValue({ storyboardModel: 'image-model' })
    runtimeConfigMock.resolveModelSelection.mockResolvedValue({ id: 'image-model' })
    operationMock.executeProjectAgentOperationFromApi.mockResolvedValue({ taskId: 'task-1', status: 'queued' })
    prismaMock.task.findFirst.mockResolvedValue(null)
  })

  it('updates a video arrangement prompt without changing the rest of the plan', async () => {
    prismaMock.projectEditScript.findFirst.mockResolvedValue({
      id: 'edit-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      userPrompt: 'one minute sci-fi',
      title: 'Orbital Silence',
      logline: 'A pilot meets a machine intelligence.',
      durationSec: 8,
      shotCount: 2,
      status: 'ready',
      shotsJson: [
        {
          shotNumber: 1,
          durationSec: 4,
          visualAction: 'Pilot watches the station rotate.',
          charactersAndScene: 'Pilot / Station',
          camera: 'wide locked shot',
          videoPrompt: 'old prompt 1',
          sound: 'low hum',
        },
        {
          shotNumber: 2,
          durationSec: 4,
          visualAction: 'A monitor flickers.',
          charactersAndScene: 'Monitor / Station',
          camera: 'close-up',
          videoPrompt: 'old prompt 2',
          sound: 'static pulse',
        },
      ],
      videoBlocksJson: [
        {
          kind: 'group',
          shotNumbers: [1, 2],
          gridMode: '2x2',
          reason: 'continuous station movement',
          prompt: 'old combined prompt',
        },
      ],
      requirements: [],
    })
    prismaMock.projectEditScript.update.mockResolvedValue({
      id: 'edit-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      userPrompt: 'one minute sci-fi',
      title: 'Orbital Silence',
      logline: 'A pilot meets a machine intelligence.',
      durationSec: 8,
      shotCount: 2,
      status: 'ready',
      shotsJson: [
        {
          shotNumber: 1,
          durationSec: 4,
          visualAction: 'Pilot watches the station rotate.',
          charactersAndScene: 'Pilot / Station',
          camera: 'wide locked shot',
          videoPrompt: 'old prompt 1',
          sound: 'low hum',
        },
        {
          shotNumber: 2,
          durationSec: 4,
          visualAction: 'A monitor flickers.',
          charactersAndScene: 'Monitor / Station',
          camera: 'close-up',
          videoPrompt: 'old prompt 2',
          sound: 'static pulse',
        },
      ],
      videoBlocksJson: [
        {
          kind: 'group',
          shotNumbers: [1, 2],
          gridMode: '2x2',
          reason: 'continuous station movement',
          prompt: 'new combined prompt',
        },
      ],
      requirements: [],
    })

    const updated = await updateProjectEditScriptVideoBlockPrompt({
      projectId: 'project-1',
      episodeId: 'episode-1',
      editScriptId: 'edit-1',
      blockIndex: 0,
      prompt: ' new combined prompt ',
    })

    expect(updated.videoBlocks[0]).toMatchObject({
      kind: 'group',
      shotNumbers: [1, 2],
      gridMode: '2x2',
      reason: 'continuous station movement',
      prompt: 'new combined prompt',
    })
    expect(prismaMock.projectEditScript.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'edit-1' },
      data: {
        videoBlocksJson: [
          {
            kind: 'group',
            shotNumbers: [1, 2],
            gridMode: '2x2',
            reason: 'continuous station movement',
            prompt: 'new combined prompt',
          },
        ],
      },
    }))
  })

  it('converts completed edit-script shots into storyboard panels and submits panel image tasks', async () => {
    prismaMock.projectEditScript.findFirst.mockResolvedValue({
      id: 'edit-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      userPrompt: 'one minute sci-fi',
      title: 'Orbital Silence',
      logline: 'A pilot meets a machine intelligence.',
      durationSec: 60,
      shotCount: 1,
      status: 'ready',
      shotsJson: [
        {
          shotNumber: 1,
          durationSec: 60,
          visualAction: 'Pilot watches the station rotate.',
          charactersAndScene: 'Pilot / Station',
          camera: 'locked symmetrical wide shot',
          videoPrompt: 'A pilot watches a rotating space station.',
          sound: 'low air hum',
        },
      ],
      videoBlocksJson: [
        {
          kind: 'single',
          shotNumbers: [1],
          reason: 'single beat from edit script',
          prompt: 'A quiet storyboard beat about the pilot and station.',
        },
      ],
      requirements: [
        {
          id: 'req-character',
          kind: 'character',
          name: 'Pilot',
          description: 'A quiet astronaut.',
          shotIndexes: [1],
          status: 'completed',
          targetId: 'character-1',
          errorMessage: null,
        },
        {
          id: 'req-location',
          kind: 'location',
          name: 'Station',
          description: 'A rotating orbital station.',
          shotIndexes: [1],
          status: 'completed',
          targetId: 'location-1',
          errorMessage: null,
        },
      ],
    })
    prismaMock.projectCharacter.findFirst.mockResolvedValue({
      id: 'character-1',
      appearances: [
        {
          id: 'appearance-1',
          imageUrl: 'images/character.jpg',
          imageMediaId: null,
          imageUrls: JSON.stringify(['images/character.jpg']),
        },
      ],
    })
    prismaMock.projectLocation.findFirst.mockResolvedValue({
      id: 'location-1',
      images: [
        {
          imageUrl: 'images/location.jpg',
          imageMediaId: null,
        },
      ],
    })
    prismaMock.projectCharacter.findMany.mockResolvedValue([
      {
        id: 'character-1',
        name: 'Pilot',
        appearances: [
          {
            id: 'appearance-1',
            appearanceIndex: 0,
            changeReason: 'primary',
          },
        ],
      },
    ])
    prismaMock.projectStoryboard.findFirst.mockResolvedValue(null)
    txMock.projectClip.create.mockResolvedValue({ id: 'clip-1' })
    txMock.projectStoryboard.create.mockResolvedValue({
      id: 'storyboard-1',
      clipId: 'clip-1',
      panels: [],
    })
    prismaMock.projectPanel.create.mockResolvedValue({
      id: 'panel-1',
      panelIndex: 0,
      imageUrl: null,
      candidateImages: null,
    })
    prismaMock.projectStoryboard.update.mockResolvedValue({ id: 'storyboard-1' })

    const result = await generateProjectEditScriptStoryboard({
      request: createRequest(),
      projectId: 'project-1',
      episodeId: 'episode-1',
      userId: 'user-1',
      locale: 'zh',
      editScriptId: 'edit-1',
    })

    expect(result).toEqual({
      storyboardId: 'storyboard-1',
      panelCount: 1,
      submittedImageTasks: 1,
    })
    expect(prismaMock.projectPanel.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storyboardId: 'storyboard-1',
        panelIndex: 0,
        panelNumber: 1,
        shotType: 'locked symmetrical wide shot',
        cameraMove: 'locked symmetrical wide shot',
        location: 'Station',
        videoPrompt: 'A pilot watches a rotating space station.',
      }),
    })
    const panelCreateData = prismaMock.projectPanel.create.mock.calls[0]?.[0]?.data
    expect(panelCreateData?.imagePrompt).toContain('A pilot watches a rotating space station.')
    expect(panelCreateData?.imagePrompt).toContain('single beat from edit script')
    expect(panelCreateData?.photographyRules).toBe(JSON.stringify({
      source: 'edit_script',
      sourceType: 'editScriptShot',
      editScriptId: 'edit-1',
      sourceShotNumber: 1,
      sourceVideoBlockId: 'edit-1:videoBlock:1',
      sourceVideoBlockIndex: 0,
      sourceVideoBlockKind: 'single',
    }))
    expect(panelCreateData?.characters).toBe(JSON.stringify([
      {
        characterId: 'character-1',
        name: 'Pilot',
        appearanceId: 'appearance-1',
        appearanceIndex: 0,
        appearance: 'primary',
      },
    ]))
    const storyboardCreateData = txMock.projectStoryboard.create.mock.calls[0]?.[0]?.data
    expect(storyboardCreateData?.storyboardTextJson).toContain('"sourceType":"editScriptStoryboard"')
    expect(storyboardCreateData?.storyboardTextJson).toContain('"sourceVideoBlockId":"edit-1:videoBlock:1"')
    expect(operationMock.executeProjectAgentOperationFromApi).toHaveBeenCalledWith(expect.objectContaining({
      operationId: 'regenerate_panel_image',
      projectId: 'project-1',
      userId: 'user-1',
      input: {
        panelId: 'panel-1',
        count: 1,
      },
    }))
  })

  it('updates existing edit-script storyboard panels without duplicating panels or image tasks', async () => {
    prismaMock.projectEditScript.findFirst.mockResolvedValue({
      id: 'edit-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      userPrompt: 'one minute sci-fi',
      title: 'Orbital Silence Revised',
      logline: 'A pilot meets a machine intelligence.',
      durationSec: 8,
      shotCount: 2,
      status: 'ready',
      shotsJson: [
        {
          shotNumber: 1,
          durationSec: 4,
          visualAction: 'Pilot watches the station rotate.',
          charactersAndScene: 'Pilot / Station',
          camera: 'wide shot',
          videoPrompt: 'Updated pilot prompt.',
          sound: 'low hum',
        },
        {
          shotNumber: 2,
          durationSec: 4,
          visualAction: 'The station lights pulse.',
          charactersAndScene: 'Station',
          camera: 'insert shot',
          videoPrompt: 'Updated station prompt.',
          sound: 'soft pulse',
        },
      ],
      videoBlocksJson: [
        {
          kind: 'group',
          shotNumbers: [1, 2],
          gridMode: '2x2',
          reason: 'continuous station movement',
          prompt: 'Updated combined video block prompt.',
        },
      ],
      requirements: [
        {
          id: 'req-character',
          kind: 'character',
          name: 'Pilot',
          description: 'A quiet astronaut.',
          shotIndexes: [1],
          status: 'completed',
          targetId: 'character-1',
          errorMessage: null,
        },
        {
          id: 'req-location',
          kind: 'location',
          name: 'Station',
          description: 'A rotating orbital station.',
          shotIndexes: [1, 2],
          status: 'completed',
          targetId: 'location-1',
          errorMessage: null,
        },
      ],
    })
    prismaMock.projectCharacter.findMany.mockResolvedValue([
      {
        id: 'character-1',
        name: 'Pilot',
        appearances: [
          {
            id: 'appearance-1',
            appearanceIndex: 0,
            changeReason: 'primary',
          },
        ],
      },
    ])
    prismaMock.projectStoryboard.findFirst.mockResolvedValue({
      id: 'storyboard-1',
      clipId: 'clip-1',
      panels: [
        {
          id: 'panel-1',
          panelIndex: 0,
          imageUrl: 'images/panel-1.jpg',
          candidateImages: null,
        },
        {
          id: 'panel-2',
          panelIndex: 1,
          imageUrl: null,
          candidateImages: '["images/panel-2-a.jpg"]',
        },
      ],
    })
    txMock.projectStoryboard.update.mockResolvedValue({
      id: 'storyboard-1',
      clipId: 'clip-1',
      panels: [
        {
          id: 'panel-1',
          panelIndex: 0,
          imageUrl: 'images/panel-1.jpg',
          candidateImages: null,
        },
        {
          id: 'panel-2',
          panelIndex: 1,
          imageUrl: null,
          candidateImages: '["images/panel-2-a.jpg"]',
        },
      ],
    })
    prismaMock.projectPanel.update
      .mockResolvedValueOnce({
        id: 'panel-1',
        panelIndex: 0,
        imageUrl: 'images/panel-1.jpg',
        candidateImages: null,
      })
      .mockResolvedValueOnce({
        id: 'panel-2',
        panelIndex: 1,
        imageUrl: null,
        candidateImages: '["images/panel-2-a.jpg"]',
      })
    prismaMock.projectStoryboard.update.mockResolvedValue({ id: 'storyboard-1' })

    const result = await generateProjectEditScriptStoryboard({
      request: createRequest(),
      projectId: 'project-1',
      episodeId: 'episode-1',
      userId: 'user-1',
      locale: 'zh',
      editScriptId: 'edit-1',
    })

    expect(result).toEqual({
      storyboardId: 'storyboard-1',
      panelCount: 2,
      submittedImageTasks: 0,
    })
    expect(prismaMock.projectPanel.create).not.toHaveBeenCalled()
    expect(prismaMock.projectPanel.update).toHaveBeenCalledTimes(2)
    expect(prismaMock.projectPanel.update).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { id: 'panel-1' },
      data: expect.objectContaining({
        panelNumber: 1,
        videoPrompt: 'Updated pilot prompt.',
        photographyRules: JSON.stringify({
          source: 'edit_script',
          sourceType: 'editScriptShot',
          editScriptId: 'edit-1',
          sourceShotNumber: 1,
          sourceVideoBlockId: 'edit-1:videoBlock:1',
          sourceVideoBlockIndex: 0,
          sourceVideoBlockKind: 'group',
        }),
      }),
    }))
    expect(txMock.projectStoryboard.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'storyboard-1' },
      data: expect.objectContaining({
        panelCount: 2,
        storyboardTextJson: expect.stringContaining('"panelNumbers":[1,2]'),
      }),
    }))
    expect(operationMock.executeProjectAgentOperationFromApi).not.toHaveBeenCalled()
  })
})
