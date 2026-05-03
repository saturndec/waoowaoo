import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const prismaMock = vi.hoisted(() => ({
  project: { findUnique: vi.fn() },
  userPreference: { findUnique: vi.fn() },
  projectEpisode: { findUnique: vi.fn() },
  projectClip: {
    findMany: vi.fn(async () => []),
    update: vi.fn(async () => ({ id: 'clip-row-1' })),
    deleteMany: vi.fn(async () => ({})),
    create: vi.fn(async () => ({ id: 'clip-row-1' })),
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
vi.mock('@/lib/ai-exec/llm-helpers', () => llmMock)
vi.mock('@/lib/ai-exec/engine', () => ({
  executeAiTextStep: vi.fn(async () => ({
    text: llmMock.getCompletionContent(),
    reasoning: '',
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    completion: { id: 'completion-1' },
  })),
}))
vi.mock('@/lib/llm-observe/internal-stream-context', () => ({
  getInternalLLMStreamCallbacks: vi.fn(() => null),
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
vi.mock('@/lib/ai-prompts', () => ({
  AI_PROMPT_IDS: { SCRIPT_CLIP_SEGMENTS: 'script-clip-segments' },
  buildAiPrompt: vi.fn(() => 'clip-split-prompt'),
}))
vi.mock('@/lib/text-processing/clip-matching', () => ({
  createClipContentMatcher: (content: string) => ({
    matchBoundary: (start: string, end: string, fromIndex = 0) => {
      const startIndex = content.indexOf(start, fromIndex)
      if (startIndex === -1) return null
      const endStart = content.indexOf(end, startIndex)
      if (endStart === -1) return null
      return {
        startIndex,
        endIndex: endStart + end.length,
      }
    },
  }),
}))

import { handleClipsBuildTask } from '@/lib/workers/handlers/clips-build'

function buildJob(payload: Record<string, unknown>, episodeId: string | null = 'episode-1'): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-clips-build-1',
      type: TASK_TYPE.CLIPS_BUILD,
      locale: 'zh',
      projectId: 'project-1',
      episodeId,
      targetType: 'ProjectEpisode',
      targetId: 'episode-1',
      payload,
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker clips-build behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    prismaMock.project.findUnique.mockResolvedValue({
      id: 'project-1',
      analysisModel: 'llm::analysis-1',
      characters: [{ id: 'char-1', name: 'Hero' }],
      locations: [{ id: 'loc-1', name: 'Old Town' }],
    })

    prismaMock.projectEpisode.findUnique.mockResolvedValue({
      id: 'episode-1',
      name: '第一集',
      projectId: 'project-1',
      novelText: 'A START one END B START two END C',
    })
    prismaMock.projectClip.findMany.mockResolvedValue([])

    llmMock.getCompletionContent.mockReturnValue(
      JSON.stringify([
        {
          start: 'START one',
          end: 'END',
          summary: 'first clip',
          location: 'Old Town',
          characters: ['Hero'],
        },
      ]),
    )
  })

  it('missing episodeId -> explicit error', async () => {
    const job = buildJob({}, null)
    await expect(handleClipsBuildTask(job)).rejects.toThrow('episodeId is required')
  })

  it('success path -> creates clip row with concrete boundaries and characters payload', async () => {
    const job = buildJob({ episodeId: 'episode-1' })
    const result = await handleClipsBuildTask(job)

    expect(result).toEqual({
      episodeId: 'episode-1',
      count: 1,
    })

    expect(prismaMock.projectClip.create).toHaveBeenCalledWith({
      data: {
        episodeId: 'episode-1',
        startText: 'START one',
        endText: 'END',
        summary: 'first clip',
        location: 'Old Town',
        characters: JSON.stringify(['Hero']),
        props: null,
        content: 'START one END',
      },
      select: { id: true },
    })
  })

  it('AI boundaries cannot be matched -> explicit boundary error', async () => {
    llmMock.getCompletionContent.mockReturnValue(
      JSON.stringify([
        {
          start: 'NOT_FOUND_START',
          end: 'NOT_FOUND_END',
          summary: 'bad clip',
        },
      ]),
    )

    const job = buildJob({ episodeId: 'episode-1' })
    await expect(handleClipsBuildTask(job)).rejects.toThrow('split_clips boundary matching failed')
  })
})
