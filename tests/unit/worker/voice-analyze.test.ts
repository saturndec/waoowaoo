import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const txState = vi.hoisted(() => ({
  createdRows: [] as Array<Record<string, unknown>>,
}))

const prismaMock = vi.hoisted(() => ({
  project: { findUnique: vi.fn() },
  novelPromotionProject: { findUnique: vi.fn() },
  novelPromotionEpisode: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}))

const llmMock = vi.hoisted(() => ({
  chatCompletion: vi.fn(async () => ({ id: 'completion-1' })),
  getCompletionContent: vi.fn(() => 'voice-line-json'),
}))

const helperMock = vi.hoisted(() => ({
  parseVoiceLinesJson: vi.fn(),
  buildStoryboardJson: vi.fn(() => 'storyboard-json'),
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
  buildCharactersIntroduction: vi.fn(() => 'characters-introduction'),
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
vi.mock('@/lib/workers/handlers/voice-analyze-helpers', () => ({
  buildStoryboardJson: helperMock.buildStoryboardJson,
  parseVoiceLinesJson: helperMock.parseVoiceLinesJson,
}))
vi.mock('@/lib/prompt-i18n', () => ({
  PROMPT_IDS: { NP_VOICE_ANALYSIS: 'np_voice_analysis' },
  buildPromptWithPolicy: vi.fn(() => ({
    prompt: 'voice-analysis-prompt',
    telemetry: {
      prompt_language: 'en',
      output_language: 'zh',
      contract_language: 'en',
      contract_valid: true,
      fallback_applied: true,
      route_reason: 'test',
    },
  })),
}))

import { handleVoiceAnalyzeTask } from '@/lib/workers/handlers/voice-analyze'

function buildJob(payload: Record<string, unknown>, episodeId: string | null = 'episode-1'): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-voice-analyze-1',
      type: TASK_TYPE.VOICE_ANALYZE,
      locale: 'zh',
      projectId: 'project-1',
      episodeId,
      targetType: 'NovelPromotionEpisode',
      targetId: 'episode-1',
      payload,
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker voice-analyze behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    txState.createdRows = []

    prismaMock.project.findUnique.mockResolvedValue({ id: 'project-1', mode: 'novel-promotion' })
    prismaMock.novelPromotionProject.findUnique.mockResolvedValue({
      id: 'np-project-1',
      analysisModel: 'llm::analysis-1',
      characters: [{ id: 'char-1', name: 'Hero' }],
    })

    prismaMock.novelPromotionEpisode.findUnique.mockResolvedValue({
      id: 'episode-1',
      novelPromotionProjectId: 'np-project-1',
      novelText: '这是可以用于台词分析的文本',
      storyboards: [
        {
          id: 'storyboard-1',
          clip: { id: 'clip-1' },
          panels: [{ id: 'panel-1', panelIndex: 0 }],
        },
      ],
    })

    helperMock.parseVoiceLinesJson.mockReturnValue([
      {
        lineIndex: 1,
        speaker: 'Hero',
        content: '第一句台词',
        emotionStrength: 0.7,
        matchedPanel: {
          storyboardId: 'storyboard-1',
          panelIndex: 0,
        },
      },
      {
        lineIndex: 2,
        speaker: 'Narrator',
        content: '第二句旁白',
        emotionStrength: 0.5,
      },
    ])

    prismaMock.$transaction.mockImplementation(async (fn: (tx: {
      novelPromotionVoiceLine: {
        deleteMany: (args: { where: { episodeId: string } }) => Promise<unknown>
        create: (args: { data: Record<string, unknown>; select: { id: boolean; speaker: boolean; matchedStoryboardId: boolean } }) => Promise<{
          id: string
          speaker: string
          matchedStoryboardId: string | null
        }>
      }
    }) => Promise<unknown>) => {
      const tx = {
        novelPromotionVoiceLine: {
          deleteMany: async () => undefined,
          create: async (args: { data: Record<string, unknown>; select: { id: boolean; speaker: boolean; matchedStoryboardId: boolean } }) => {
            txState.createdRows.push(args.data)
            const speaker = typeof args.data.speaker === 'string' ? args.data.speaker : 'unknown'
            const matchedStoryboardId = typeof args.data.matchedStoryboardId === 'string'
              ? args.data.matchedStoryboardId
              : null
            return {
              id: `line-${txState.createdRows.length}`,
              speaker,
              matchedStoryboardId,
            }
          },
        },
      }
      return await fn(tx)
    })
  })

  it('missing episodeId -> explicit error', async () => {
    const job = buildJob({}, null)
    await expect(handleVoiceAnalyzeTask(job)).rejects.toThrow('episodeId is required')
  })

  it('success path -> persists mapped panelId and speaker stats', async () => {
    const job = buildJob({ episodeId: 'episode-1' })
    const result = await handleVoiceAnalyzeTask(job)

    expect(result).toEqual({
      episodeId: 'episode-1',
      count: 2,
      matchedCount: 1,
      speakerStats: {
        Hero: 1,
        Narrator: 1,
      },
    })

    expect(txState.createdRows[0]).toEqual(expect.objectContaining({
      episodeId: 'episode-1',
      lineIndex: 1,
      speaker: 'Hero',
      content: '第一句台词',
      matchedPanelId: 'panel-1',
      matchedStoryboardId: 'storyboard-1',
      matchedPanelIndex: 0,
    }))
  })

  it('line references non-existent storyboard panel -> explicit error', async () => {
    helperMock.parseVoiceLinesJson.mockImplementation(() => [
      {
        lineIndex: 1,
        speaker: 'Hero',
        content: 'bad line',
        emotionStrength: 0.8,
        matchedPanel: {
          storyboardId: 'storyboard-404',
          panelIndex: 0,
        },
      },
    ])

    const job = buildJob({ episodeId: 'episode-1' })
    await expect(handleVoiceAnalyzeTask(job)).rejects.toThrow('references non-existent panel')
  })
})
