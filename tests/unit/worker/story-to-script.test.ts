import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const prismaMock = vi.hoisted(() => ({
  project: { findUnique: vi.fn() },
  novelPromotionProject: { findUnique: vi.fn() },
  novelPromotionEpisode: { findUnique: vi.fn() },
  novelPromotionClip: { update: vi.fn(async () => ({})) },
}))

const workerMock = vi.hoisted(() => ({
  reportTaskProgress: vi.fn(async () => undefined),
  assertTaskActive: vi.fn(async () => undefined),
}))

const configMock = vi.hoisted(() => ({
  getProjectModelConfig: vi.fn(async () => ({ analysisModel: 'llm::analysis-1' })),
  resolveProjectModelCapabilityGenerationOptions: vi.fn(async () => ({ reasoningEffort: 'high' })),
}))

const orchestratorMock = vi.hoisted(() => ({
  runStoryToScriptOrchestrator: vi.fn(),
}))

const helperMock = vi.hoisted(() => ({
  persistAnalyzedCharacters: vi.fn(async () => [{ id: 'character-new-1' }]),
  persistAnalyzedLocations: vi.fn(async () => [{ id: 'location-new-1' }]),
  persistClips: vi.fn(async () => [{ clipKey: 'clip-1', id: 'clip-row-1' }]),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/llm-client', () => ({
  chatCompletion: vi.fn(),
  getCompletionParts: vi.fn(() => ({ text: '', reasoning: '' })),
}))
vi.mock('@/lib/config-service', () => configMock)
vi.mock('@/lib/llm-observe/internal-stream-context', () => ({
  withInternalLLMStreamCallbacks: vi.fn(async (_callbacks: unknown, fn: () => Promise<unknown>) => await fn()),
}))
vi.mock('@/lib/logging/semantic', () => ({ logAIAnalysis: vi.fn() }))
vi.mock('@/lib/logging/file-writer', () => ({ onProjectNameAvailable: vi.fn() }))
vi.mock('@/lib/workers/shared', () => ({ reportTaskProgress: workerMock.reportTaskProgress }))
vi.mock('@/lib/workers/utils', () => ({ assertTaskActive: workerMock.assertTaskActive }))
vi.mock('@/lib/novel-promotion/story-to-script/orchestrator', () => orchestratorMock)
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
    NP_AGENT_CHARACTER_PROFILE: 'a',
    NP_SELECT_LOCATION: 'b',
    NP_AGENT_CLIP: 'c',
    NP_SCREENPLAY_CONVERSION: 'd',
  },
  getPromptTemplate: vi.fn(() => 'prompt-template'),
}))
vi.mock('@/lib/workers/handlers/story-to-script-helpers', () => ({
  asString: (value: unknown) => (typeof value === 'string' ? value : ''),
  parseEffort: vi.fn(() => null),
  parseTemperature: vi.fn(() => 0.7),
  persistAnalyzedCharacters: helperMock.persistAnalyzedCharacters,
  persistAnalyzedLocations: helperMock.persistAnalyzedLocations,
  persistClips: helperMock.persistClips,
  resolveClipRecordId: (clipIdMap: Map<string, string>, clipId: string) => clipIdMap.get(clipId) ?? null,
}))

import { handleStoryToScriptTask } from '@/lib/workers/handlers/story-to-script'

function buildJob(payload: Record<string, unknown>, episodeId: string | null = 'episode-1'): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-story-to-script-1',
      type: TASK_TYPE.STORY_TO_SCRIPT_RUN,
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

describe('worker story-to-script behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    prismaMock.project.findUnique.mockResolvedValue({
      id: 'project-1',
      name: 'Project One',
      mode: 'novel-promotion',
    })

    prismaMock.novelPromotionProject.findUnique.mockResolvedValue({
      id: 'np-project-1',
      analysisModel: null,
      characters: [{ id: 'char-1', name: 'Hero', introduction: 'hero intro' }],
      locations: [{ id: 'loc-1', name: 'Old Town', summary: 'town' }],
    })

    prismaMock.novelPromotionEpisode.findUnique
      .mockResolvedValueOnce({
        id: 'episode-1',
        novelPromotionProjectId: 'np-project-1',
        novelText: 'episode text',
      })
      .mockResolvedValueOnce({ id: 'episode-1' })

    orchestratorMock.runStoryToScriptOrchestrator.mockResolvedValue({
      analyzedCharacters: [{ name: 'New Hero' }],
      analyzedLocations: [{ name: 'Market' }],
      clipList: [{ clipId: 'clip-1', content: 'clip content' }],
      screenplayResults: [
        {
          clipId: 'clip-1',
          success: true,
          screenplay: { scenes: [{ shot: 'close-up' }] },
        },
      ],
      summary: {
        clipCount: 1,
        screenplaySuccessCount: 1,
        screenplayFailedCount: 0,
      },
    })
  })

  it('missing episodeId -> explicit error', async () => {
    const job = buildJob({}, null)
    await expect(handleStoryToScriptTask(job)).rejects.toThrow('episodeId is required')
  })

  it('success path -> persists clips and screenplay with concrete fields', async () => {
    const job = buildJob({ episodeId: 'episode-1', content: 'input content' })
    const result = await handleStoryToScriptTask(job)

    expect(result).toEqual({
      episodeId: 'episode-1',
      clipCount: 1,
      screenplaySuccessCount: 1,
      screenplayFailedCount: 0,
      persistedCharacters: 1,
      persistedLocations: 1,
      persistedClips: 1,
    })

    expect(helperMock.persistClips).toHaveBeenCalledWith({
      episodeId: 'episode-1',
      clipList: [{ clipId: 'clip-1', content: 'clip content' }],
    })

    expect(prismaMock.novelPromotionClip.update).toHaveBeenCalledWith({
      where: { id: 'clip-row-1' },
      data: {
        screenplay: JSON.stringify({ scenes: [{ shot: 'close-up' }] }),
      },
    })
  })

  it('orchestrator partial failure summary -> throws explicit error', async () => {
    orchestratorMock.runStoryToScriptOrchestrator.mockResolvedValueOnce({
      analyzedCharacters: [],
      analyzedLocations: [],
      clipList: [],
      screenplayResults: [
        {
          clipId: 'clip-3',
          success: false,
          error: 'bad screenplay json',
        },
      ],
      summary: {
        clipCount: 1,
        screenplaySuccessCount: 0,
        screenplayFailedCount: 1,
      },
    })

    const job = buildJob({ episodeId: 'episode-1', content: 'input content' })
    await expect(handleStoryToScriptTask(job)).rejects.toThrow('STORY_TO_SCRIPT_PARTIAL_FAILED')
  })

  it('bug: analysisModel from UserPreference when NovelPromotionProject.analysisModel is null', async () => {
    // Regression test: worker should use getProjectModelConfig which falls back to UserPreference
    configMock.getProjectModelConfig.mockResolvedValueOnce({
      analysisModel: 'llm::user-preference-model',
    })

    const job = buildJob({ episodeId: 'episode-1', content: 'input content' })
    await handleStoryToScriptTask(job)

    expect(configMock.getProjectModelConfig).toHaveBeenCalledWith('project-1', 'user-1')
    expect(configMock.resolveProjectModelCapabilityGenerationOptions).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      modelType: 'llm',
      modelKey: 'llm::user-preference-model',
    })
  })

  it('bug: analysisModel not configured -> explicit error', async () => {
    // Regression test: should fail explicitly when no analysisModel is configured
    configMock.getProjectModelConfig.mockResolvedValueOnce({
      analysisModel: null,
    })

    const job = buildJob({ episodeId: 'episode-1', content: 'input content' })
    await expect(handleStoryToScriptTask(job)).rejects.toThrow('analysisModel is not configured')
  })
})
