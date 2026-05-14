import type { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const txMock = vi.hoisted(() => ({
  projectEditScript: {
    upsert: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  },
  projectEditAssetRequirement: {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
}))

const prismaMock = vi.hoisted(() => ({
  projectEpisode: {
    findFirst: vi.fn(),
  },
  project: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  projectEditScript: {
    upsert: vi.fn(),
    findFirst: vi.fn(),
  },
  projectCharacter: {
    findMany: vi.fn(),
  },
  projectLocation: {
    findMany: vi.fn(),
  },
  task: {
    findFirst: vi.fn(),
  },
  $transaction: vi.fn(async (callback: (tx: typeof txMock) => Promise<unknown>) => callback(txMock)),
}))

const aiExecMock = vi.hoisted(() => ({
  executeAiTextStep: vi.fn(),
}))

const billingMock = vi.hoisted(() => ({
  withTextBilling: vi.fn(async (
    _userId: string,
    _model: string,
    _maxInputTokens: number,
    _maxOutputTokens: number,
    _billingMeta: unknown,
    runCompletion: () => Promise<unknown>,
  ) => await runCompletion()),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/config-service', () => ({
  getProjectModelConfig: vi.fn(async () => ({ analysisModel: 'analysis-model-1' })),
}))
vi.mock('@/lib/ai-exec/engine', () => aiExecMock)
vi.mock('@/lib/billing', () => billingMock)
vi.mock('@/lib/edit-script/asset-design', () => ({
  designEditAssetRequirements: vi.fn(async (input: { requirements: unknown }) => input.requirements),
}))
vi.mock('@/lib/assets/services/asset-actions', () => ({ submitAssetGenerateTask: vi.fn() }))

import { generateProjectEditScript } from '@/lib/edit-script/service'

function createRequest(): NextRequest {
  return new Request('http://localhost/api/projects/project-1/edit-script', {
    method: 'POST',
    headers: { 'accept-language': 'zh' },
  }) as unknown as NextRequest
}

function mockSuccessfulAiSteps() {
  aiExecMock.executeAiTextStep
    .mockResolvedValueOnce({ text: '{"videoBlocks":[]}' })
    .mockResolvedValueOnce({ text: '{"visualActions":[]}' })
    .mockResolvedValueOnce({ text: '{"camera":[]}' })
    .mockResolvedValueOnce({ text: '{"audio":[]}' })
    .mockResolvedValueOnce({
      text: JSON.stringify({
        title: 'Sci-Fi Short',
        logline: 'A quiet signal wakes a station.',
        durationSec: 3,
        shots: [
          {
            shotNumber: 1,
            durationSec: 3,
            visualAction: 'A station corridor flickers awake.',
            charactersAndScene: 'Station corridor',
            camera: 'slow push in',
            videoPrompt: 'A cinematic station corridor flickers awake.',
            sound: 'low electrical hum',
          },
        ],
        videoBlocks: [
          {
            type: 'single',
            shotNumbers: [1],
            reason: 'Single establishing shot.',
            prompt: 'A cinematic station corridor flickers awake, slow push in.',
          },
        ],
      }),
    })
    .mockResolvedValueOnce({
      text: JSON.stringify({
        assets: [
          {
            kind: 'location',
            name: 'Station Corridor',
            description: 'A cold sci-fi corridor.',
            shotNumbers: [1],
          },
        ],
      }),
    })
}

describe('edit script generation status persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.projectEpisode.findFirst.mockResolvedValue({ id: 'episode-1' })
    prismaMock.project.findFirst.mockResolvedValue({
      id: 'project-1',
      artStyle: 'realistic',
      directorStyleDoc: null,
      videoRatio: '9:16',
    })
    prismaMock.projectCharacter.findMany.mockResolvedValue([])
    prismaMock.projectLocation.findMany.mockResolvedValue([])
    prismaMock.task.findFirst.mockResolvedValue(null)
    txMock.projectEditScript.upsert.mockResolvedValue({ id: 'edit-1' })
    txMock.projectEditAssetRequirement.deleteMany.mockResolvedValue({ count: 0 })
    txMock.projectEditAssetRequirement.createMany.mockResolvedValue({ count: 1 })
    txMock.projectEditScript.findUniqueOrThrow.mockResolvedValue({
      id: 'edit-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      userPrompt: '做一个科幻短片',
      title: 'Sci-Fi Short',
      logline: 'A quiet signal wakes a station.',
      durationSec: 3,
      shotCount: 1,
      status: 'ready',
      shotsJson: [
        {
          shotNumber: 1,
          durationSec: 3,
          visualAction: 'A station corridor flickers awake.',
          charactersAndScene: 'Station corridor',
          camera: 'slow push in',
          videoPrompt: 'A cinematic station corridor flickers awake.',
          sound: 'low electrical hum',
        },
      ],
      videoBlocksJson: [
        {
          kind: 'single',
          shotNumbers: [1],
          reason: 'Single establishing shot.',
          prompt: 'A cinematic station corridor flickers awake, slow push in.',
        },
      ],
      requirements: [],
    })
  })

  it('persists a generating edit script before running the AI chain', async () => {
    mockSuccessfulAiSteps()

    await generateProjectEditScript({
      request: createRequest(),
      projectId: 'project-1',
      episodeId: 'episode-1',
      userId: 'user-1',
      locale: 'zh',
      prompt: '做一个科幻短片',
    })

    expect(prismaMock.projectEditScript.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { episodeId: 'episode-1' },
      create: expect.objectContaining({
        status: 'generating',
        userPrompt: '做一个科幻短片',
        shotCount: 0,
        shotsJson: [],
        videoBlocksJson: [],
      }),
      update: expect.objectContaining({
        status: 'generating',
        userPrompt: '做一个科幻短片',
      }),
    }))
    expect(prismaMock.projectEditScript.upsert.mock.invocationCallOrder[0]).toBeLessThan(
      aiExecMock.executeAiTextStep.mock.invocationCallOrder[0],
    )
    expect(txMock.projectEditScript.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ status: 'ready' }),
    }))
  })

  it('marks the persisted edit script failed when generation throws', async () => {
    aiExecMock.executeAiTextStep.mockRejectedValueOnce(new Error('LLM_DOWN'))

    await expect(generateProjectEditScript({
      request: createRequest(),
      projectId: 'project-1',
      episodeId: 'episode-1',
      userId: 'user-1',
      locale: 'zh',
      prompt: '做一个科幻短片',
    })).rejects.toThrow('LLM_DOWN')

    expect(prismaMock.projectEditScript.upsert).toHaveBeenCalledTimes(2)
    expect(prismaMock.projectEditScript.upsert).toHaveBeenLastCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        status: 'failed',
        logline: 'LLM_DOWN',
      }),
    }))
  })
})
