import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const prismaMock = vi.hoisted(() => ({
  project: { findUnique: vi.fn() },
  novelPromotionProject: {
    findUnique: vi.fn(),
    update: vi.fn(async () => ({})),
  },
  novelPromotionEpisode: { findFirst: vi.fn() },
  novelPromotionCharacter: {
    create: vi.fn(async () => ({ id: 'char-new-1' })),
    createMany: vi.fn(async () => ({ count: 1 })),
    findMany: vi.fn(async () => [{ id: 'char-new-1' }]),
  },
  novelPromotionLocation: {
    create: vi.fn(async () => ({ id: 'loc-new-1' })),
    createMany: vi.fn(async () => ({ count: 1 })),
    findMany: vi.fn(async () => [{ id: 'loc-new-1', name: '新地点' }]),
  },
  locationImage: {
    create: vi.fn(async () => ({})),
    createMany: vi.fn(async () => ({ count: 1 })),
  },
}))

const llmMock = vi.hoisted(() => ({
  chatCompletion: vi.fn(async () => ({ id: 'completion-1' })),
  getCompletionContent: vi.fn(),
}))

const workerMock = vi.hoisted(() => ({
  reportTaskProgress: vi.fn(async () => undefined),
  assertTaskActive: vi.fn(async () => undefined),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/llm-client', () => llmMock)
vi.mock('@/lib/llm-observe/internal-stream-context', () => ({
  withInternalLLMStreamCallbacks: vi.fn(async (_callbacks: unknown, fn: () => Promise<unknown>) => await fn()),
}))
vi.mock('@/lib/constants', () => ({
  getArtStylePrompt: vi.fn(() => 'cinematic style'),
  removeLocationPromptSuffix: vi.fn((text: string) => text.replace(' [SUFFIX]', '')),
}))
vi.mock('@/lib/workers/shared', () => ({ reportTaskProgress: workerMock.reportTaskProgress }))
vi.mock('@/lib/workers/utils', () => ({ assertTaskActive: workerMock.assertTaskActive }))
vi.mock('@/lib/workers/handlers/llm-stream', () => ({
  createWorkerLLMStreamContext: vi.fn(() => ({ streamRunId: 'run-1', nextSeqByStepLane: {} })),
  createWorkerLLMStreamCallbacks: vi.fn(() => ({
    onStage: vi.fn(),
    onChunk: vi.fn(),
    onComplete: vi.fn(),
    onError: vi.fn(),
    flush: vi.fn(async () => undefined),
  })),
}))
vi.mock('@/lib/prompt-i18n', () => ({
  PROMPT_IDS: {
    NP_AGENT_CHARACTER_PROFILE: 'char',
    NP_SELECT_LOCATION: 'loc',
  },
  buildPrompt: vi.fn(() => 'analysis-prompt'),
}))

import { handleAnalyzeNovelTask } from '@/lib/workers/handlers/analyze-novel'

function buildJob(): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-analyze-novel-1',
      type: TASK_TYPE.ANALYZE_NOVEL,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'NovelPromotionProject',
      targetId: 'np-project-1',
      payload: {},
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker analyze-novel behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    prismaMock.project.findUnique.mockResolvedValue({
      id: 'project-1',
      mode: 'novel-promotion',
    })

    prismaMock.novelPromotionProject.findUnique.mockResolvedValue({
      id: 'np-project-1',
      analysisModel: 'llm::analysis-1',
      artStyle: 'cinematic',
      globalAssetText: '全局设定文本',
      characters: [{ id: 'char-existing', name: '已有角色' }],
      locations: [{ id: 'loc-existing', name: '已有场景', summary: 'old' }],
    })

    prismaMock.novelPromotionEpisode.findFirst.mockResolvedValue({
      novelText: '首集内容',
    })

    llmMock.getCompletionContent
      .mockReturnValueOnce(JSON.stringify({
        characters: [
          {
            name: '新角色',
            aliases: ['别名A'],
            role_level: 'main',
            personality_tags: ['冷静'],
            visual_keywords: ['黑发'],
          },
        ],
      }))
      .mockReturnValueOnce(JSON.stringify({
        locations: [
          {
            name: '新地点',
            summary: '雨夜街道',
            descriptions: ['雨夜街道 [SUFFIX]'],
          },
        ],
      }))
  })

  it('no global text and no episode text -> explicit error', async () => {
    prismaMock.novelPromotionProject.findUnique.mockResolvedValueOnce({
      id: 'np-project-1',
      analysisModel: 'llm::analysis-1',
      artStyle: 'cinematic',
      globalAssetText: '',
      characters: [],
      locations: [],
    })
    prismaMock.novelPromotionEpisode.findFirst.mockResolvedValueOnce({ novelText: '' })

    await expect(handleAnalyzeNovelTask(buildJob())).rejects.toThrow('请先填写全局资产设定或剧本内容')
  })

  it('success path -> creates character/location and persists cleaned location descriptions', async () => {
    const result = await handleAnalyzeNovelTask(buildJob())

    expect(result).toEqual({
      success: true,
      characters: [{ id: 'char-new-1' }],
      locations: [{ id: 'loc-new-1' }],
      characterCount: 1,
      locationCount: 1,
    })

    expect(prismaMock.novelPromotionCharacter.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            novelPromotionProjectId: 'np-project-1',
            name: '新角色',
            aliases: JSON.stringify(['别名A']),
          }),
        ]),
      }),
    )

    expect(prismaMock.novelPromotionLocation.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            novelPromotionProjectId: 'np-project-1',
            name: '新地点',
            summary: '雨夜街道',
          }),
        ]),
      }),
    )

    expect(prismaMock.locationImage.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            locationId: 'loc-new-1',
            imageIndex: 0,
            description: '雨夜街道',
          }),
        ]),
      }),
    )

    expect(prismaMock.novelPromotionProject.update).toHaveBeenCalledWith({
      where: { id: 'np-project-1' },
      data: { artStylePrompt: 'cinematic style' },
    })

    expect(workerMock.reportTaskProgress).toHaveBeenCalledWith(
      expect.anything(),
      60,
      expect.objectContaining({
        stepId: 'analyze_characters',
        done: true,
        output: expect.stringContaining('"characters"'),
      }),
    )

    expect(workerMock.reportTaskProgress).toHaveBeenCalledWith(
      expect.anything(),
      70,
      expect.objectContaining({
        stepId: 'analyze_locations',
        done: true,
        output: expect.stringContaining('"locations"'),
      }),
    )
  })
})
