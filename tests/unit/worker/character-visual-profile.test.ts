import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  projectCharacter: {
    findFirst: vi.fn(),
    update: vi.fn(async () => ({})),
    delete: vi.fn(async () => ({})),
  },
  characterAppearance: {
    create: vi.fn(async () => ({})),
    deleteMany: vi.fn(async () => ({ count: 1 })),
  },
}))

const llmMock = vi.hoisted(() => ({
  getCompletionContent: vi.fn(),
}))

const helperMock = vi.hoisted(() => ({
  resolveProjectModel: vi.fn(async () => ({
    projectId: 'project-1',
    analysisModel: 'llm::analysis-1',
  })),
}))

const workerMock = vi.hoisted(() => ({
  reportTaskProgress: vi.fn(async () => undefined),
  assertTaskActive: vi.fn(async () => undefined),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/ai-exec/engine', () => ({
  executeAiTextStep: vi.fn(async () => ({
    text: llmMock.getCompletionContent(),
    reasoning: '',
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    completion: { id: 'completion-1' },
  })),
}))
vi.mock('@/types/character-profile', () => ({
  validateProfileData: vi.fn(() => true),
  stringifyProfileData: vi.fn((value: unknown) => JSON.stringify(value)),
}))
vi.mock('@/lib/llm-observe/internal-stream-context', () => ({
  getInternalLLMStreamCallbacks: vi.fn(() => null),
  withInternalLLMStreamCallbacks: vi.fn(async (_callbacks: unknown, fn: () => Promise<unknown>) => await fn()),
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
vi.mock('@/lib/workers/handlers/character-visual-profile-helpers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/workers/handlers/character-visual-profile-helpers')>(
    '@/lib/workers/handlers/character-visual-profile-helpers',
  )
  return {
    ...actual,
    resolveProjectModel: helperMock.resolveProjectModel,
  }
})
vi.mock('@/lib/ai-prompts', () => ({
  AI_PROMPT_IDS: { CHARACTER_VISUAL_PROFILE: 'character-visual-profile' },
  buildAiPrompt: vi.fn(() => 'character-visual-prompt'),
}))

import {
  generateCharacterVisualProfile,
  generateCreatedCharacterVisualProfile,
} from '@/lib/workers/handlers/character-visual-profile'

function buildJob(): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-analyze-global-1',
      type: TASK_TYPE.ANALYZE_GLOBAL,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: null,
      targetType: 'Project',
      targetId: 'project-1',
      payload: {},
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker character visual profile behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => Promise<unknown>) => {
      return await callback(prismaMock)
    })

    llmMock.getCompletionContent.mockReturnValue(
      JSON.stringify({
        characters: [
          {
            appearances: [
              {
                change_reason: '默认形象',
                descriptions: ['黑发，冷静，风衣'],
              },
            ],
          },
        ],
      }),
    )

    prismaMock.projectCharacter.findFirst.mockImplementation(async (args: { where: { id: string } }) => ({
      id: args.where.id,
      name: 'Hero',
      profileData: JSON.stringify({ archetype: 'lead' }),
      profileConfirmed: false,
      projectId: 'project-1',
    }))
  })

  it('generates visual profile -> rebuilds appearances and marks profileConfirmed', async () => {
    const result = await generateCharacterVisualProfile(buildJob(), { characterId: 'character-1' })

    expect(prismaMock.characterAppearance.deleteMany).toHaveBeenCalledWith({
      where: { characterId: 'character-1' },
    })
    expect(prismaMock.characterAppearance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        characterId: 'character-1',
        appearanceIndex: 0,
        changeReason: '默认形象',
        description: '黑发，冷静，风衣',
      }),
    })

    expect(prismaMock.projectCharacter.update).toHaveBeenCalledWith({
      where: { id: 'character-1' },
      data: {
        profileData: JSON.stringify({ archetype: 'lead' }),
        profileConfirmed: true,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      success: true,
      character: expect.objectContaining({
        id: 'character-1',
        profileConfirmed: true,
      }),
    }))
  })

  it('newly created character visual profile failure -> deletes the created character before rethrowing', async () => {
    llmMock.getCompletionContent.mockReturnValue(JSON.stringify({ characters: [{ appearances: [] }] }))

    await expect(generateCreatedCharacterVisualProfile(
      buildJob(),
      'character-1',
      { suppressProgress: true },
    )).rejects.toThrow('AI返回格式错误: 缺少 appearances')

    expect(prismaMock.projectCharacter.delete).toHaveBeenCalledWith({
      where: { id: 'character-1' },
    })
  })
})
