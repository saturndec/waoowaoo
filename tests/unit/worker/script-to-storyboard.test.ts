import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

type VoiceLineInput = {
  lineIndex: number
  speaker: string
  content: string
  emotionStrength: number
  matchedPanel: {
    storyboardId: string
    panelIndex: number
  }
}

const reportTaskProgressMock = vi.hoisted(() => vi.fn(async () => undefined))
const assertTaskActiveMock = vi.hoisted(() => vi.fn(async () => undefined))
const chatCompletionMock = vi.hoisted(() => vi.fn(async () => ({ responseId: 'resp-1' })))
const getCompletionPartsMock = vi.hoisted(() => vi.fn(() => ({ text: 'voice lines json', reasoning: '' })))
const withInternalLLMStreamCallbacksMock = vi.hoisted(() =>
  vi.fn(async (_callbacks: unknown, fn: () => Promise<unknown>) => await fn()),
)
const resolveProjectModelCapabilityGenerationOptionsMock = vi.hoisted(() =>
  vi.fn(async () => ({ reasoningEffort: 'high' })),
)
const runScriptToStoryboardOrchestratorMock = vi.hoisted(() =>
  vi.fn(async () => ({
    clipPanels: [
      {
        clipId: 'clip-1',
        panels: [
          {
            panelIndex: 1,
            shotType: 'close-up',
            cameraMove: 'static',
            description: 'panel desc',
            videoPrompt: 'panel prompt',
            location: 'room',
            characters: ['Narrator'],
          },
        ],
      },
    ],
    summary: {
      totalPanelCount: 1,
      totalStepCount: 4,
    },
  })),
)
const graphExecutorMock = vi.hoisted(() => ({
  executePipelineGraph: vi.fn(async (input: {
    runId: string
    projectId: string
    userId: string
    state: Record<string, unknown>
    nodes: Array<{ key: string; run: (ctx: Record<string, unknown>) => Promise<unknown> }>
  }) => {
    for (const node of input.nodes) {
      await node.run({
        runId: input.runId,
        projectId: input.projectId,
        userId: input.userId,
        nodeKey: node.key,
        attempt: 1,
        state: input.state,
      })
    }
    return input.state
  }),
}))

const parseVoiceLinesJsonMock = vi.hoisted(() => vi.fn())
const persistStoryboardsAndPanelsMock = vi.hoisted(() => vi.fn())

const txState = vi.hoisted(() => ({
  createdRows: [] as Array<Record<string, unknown>>,
}))

const prismaMock = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(),
  },
  novelPromotionProject: {
    findUnique: vi.fn(),
  },
  novelPromotionEpisode: {
    findUnique: vi.fn(),
  },
  $transaction: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

vi.mock('@/lib/llm-client', () => ({
  chatCompletion: chatCompletionMock,
  getCompletionParts: getCompletionPartsMock,
  getCompletionContent: vi.fn(() => 'voice lines json'),
}))

vi.mock('@/lib/config-service', () => ({
  resolveProjectModelCapabilityGenerationOptions: resolveProjectModelCapabilityGenerationOptionsMock,
}))

vi.mock('@/lib/llm-observe/internal-stream-context', () => ({
  withInternalLLMStreamCallbacks: withInternalLLMStreamCallbacksMock,
}))

vi.mock('@/lib/logging/semantic', () => ({
  logAIAnalysis: vi.fn(),
}))

vi.mock('@/lib/logging/file-writer', () => ({
  onProjectNameAvailable: vi.fn(),
}))

vi.mock('@/lib/constants', () => ({
  buildCharactersIntroduction: vi.fn(() => 'characters-introduction'),
}))

vi.mock('@/lib/workers/shared', () => ({
  reportTaskProgress: reportTaskProgressMock,
}))

vi.mock('@/lib/workers/utils', () => ({
  assertTaskActive: assertTaskActiveMock,
}))

vi.mock('@/lib/novel-promotion/script-to-storyboard/orchestrator', () => ({
  runScriptToStoryboardOrchestrator: runScriptToStoryboardOrchestratorMock,
  JsonParseError: class JsonParseError extends Error {
    rawText: string

    constructor(message: string, rawText: string) {
      super(message)
      this.name = 'JsonParseError'
      this.rawText = rawText
    }
  },
}))
vi.mock('@/lib/run-runtime/graph-executor', () => ({
  executePipelineGraph: graphExecutorMock.executePipelineGraph,
}))

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
    NP_AGENT_STORYBOARD_PLAN: 'plan',
    NP_AGENT_CINEMATOGRAPHER: 'cinematographer',
    NP_AGENT_ACTING_DIRECTION: 'acting',
    NP_AGENT_STORYBOARD_DETAIL: 'detail',
    NP_VOICE_ANALYSIS: 'voice-analysis',
  },
  getPromptTemplate: vi.fn(() => 'prompt-template'),
  buildPrompt: vi.fn(() => 'voice-analysis-prompt'),
}))

vi.mock('@/lib/workers/handlers/script-to-storyboard-helpers', () => ({
  asJsonRecord: (value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as Record<string, unknown>
  },
  buildStoryboardJson: vi.fn(() => '[]'),
  parseEffort: vi.fn(() => null),
  parseTemperature: vi.fn(() => 0.7),
  parseVoiceLinesJson: parseVoiceLinesJsonMock,
  persistStoryboardsAndPanels: persistStoryboardsAndPanelsMock,
  toPositiveInt: (value: unknown) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null
    const n = Math.floor(value)
    return n > 0 ? n : null
  },
}))

import { handleScriptToStoryboardTask } from '@/lib/workers/handlers/script-to-storyboard'

function buildJob(payload: Record<string, unknown>, episodeId: string | null = 'episode-1'): Job<TaskJobData> {
  const runId = typeof payload.runId === 'string' && payload.runId.trim() ? payload.runId.trim() : 'run-test-storyboard'
  const payloadMeta = payload.meta && typeof payload.meta === 'object' && !Array.isArray(payload.meta)
    ? (payload.meta as Record<string, unknown>)
    : {}
  const normalizedPayload: Record<string, unknown> = {
    ...payload,
    runId,
    meta: {
      ...payloadMeta,
      runId,
    },
  }
  return {
    data: {
      taskId: 'task-1',
      type: TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN,
      locale: 'zh',
      projectId: 'project-1',
      episodeId,
      targetType: 'NovelPromotionEpisode',
      targetId: 'episode-1',
      payload: normalizedPayload,
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

function baseVoiceRows(): VoiceLineInput[] {
  return [
    {
      lineIndex: 1,
      speaker: 'Narrator',
      content: 'Hello world',
      emotionStrength: 0.8,
      matchedPanel: {
        storyboardId: 'storyboard-1',
        panelIndex: 1,
      },
    },
  ]
}

describe('worker script-to-storyboard behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    txState.createdRows = []

    prismaMock.project.findUnique.mockResolvedValue({
      id: 'project-1',
      name: 'Project One',
      mode: 'novel-promotion',
    })

    prismaMock.novelPromotionProject.findUnique.mockResolvedValue({
      id: 'np-project-1',
      analysisModel: 'llm::analysis-model',
      characters: [{ id: 'char-1', name: 'Narrator' }],
      locations: [{ id: 'loc-1', name: 'Office' }],
    })

    prismaMock.novelPromotionEpisode.findUnique.mockResolvedValue({
      id: 'episode-1',
      novelPromotionProjectId: 'np-project-1',
      novelText: 'A complete chapter text for voice analyze.',
      clips: [
        {
          id: 'clip-1',
          content: 'clip content',
          characters: JSON.stringify(['Narrator']),
          location: 'Office',
          screenplay: 'Screenplay text',
        },
      ],
    })

    prismaMock.$transaction.mockImplementation(async (fn: (tx: {
      novelPromotionVoiceLine: {
        deleteMany: (args: { where: { episodeId: string } }) => Promise<unknown>
        create: (args: { data: Record<string, unknown>; select: { id: boolean } }) => Promise<{ id: string }>
      }
    }) => Promise<unknown>) => {
      const tx = {
        novelPromotionVoiceLine: {
          deleteMany: async () => undefined,
          create: async (args: { data: Record<string, unknown>; select: { id: boolean } }) => {
            txState.createdRows.push(args.data)
            return { id: `voice-${txState.createdRows.length}` }
          },
        },
      }
      return await fn(tx)
    })

    persistStoryboardsAndPanelsMock.mockResolvedValue([
      {
        storyboardId: 'storyboard-1',
        panels: [{ id: 'panel-1', panelIndex: 1 }],
      },
    ])

    parseVoiceLinesJsonMock.mockReturnValue(baseVoiceRows())
  })

  it('缺少 episodeId -> 显式失败', async () => {
    const job = buildJob({}, null)
    await expect(handleScriptToStoryboardTask(job)).rejects.toThrow('episodeId is required')
  })

  it('成功路径: 写入 voice line 时包含 matchedPanel 映射后的 panelId', async () => {
    const job = buildJob({ episodeId: 'episode-1' })

    const result = await handleScriptToStoryboardTask(job)

    expect(result).toEqual({
      episodeId: 'episode-1',
      storyboardCount: 1,
      panelCount: 1,
      voiceLineCount: 1,
    })

    expect(txState.createdRows).toHaveLength(1)
    expect(txState.createdRows[0]).toEqual(expect.objectContaining({
      episodeId: 'episode-1',
      lineIndex: 1,
      speaker: 'Narrator',
      content: 'Hello world',
      emotionStrength: 0.8,
      matchedPanelId: 'panel-1',
      matchedStoryboardId: 'storyboard-1',
      matchedPanelIndex: 1,
    }))
  })

  it('voice 解析失败后会重试一次再成功', async () => {
    parseVoiceLinesJsonMock
      .mockImplementationOnce(() => {
        throw new Error('invalid voice json')
      })
      .mockImplementationOnce(() => baseVoiceRows())

    const job = buildJob({ episodeId: 'episode-1' })
    const result = await handleScriptToStoryboardTask(job)

    expect(result).toEqual(expect.objectContaining({
      episodeId: 'episode-1',
      voiceLineCount: 1,
    }))
    expect(chatCompletionMock).toHaveBeenCalledTimes(2)
    expect(parseVoiceLinesJsonMock).toHaveBeenCalledTimes(2)
    expect(withInternalLLMStreamCallbacksMock).toHaveBeenCalledTimes(3)
    expect(chatCompletionMock.mock.calls[0]?.[3]).toEqual(expect.objectContaining({
      action: 'voice_analyze',
      streamStepId: 'voice_analyze',
      streamStepAttempt: 1,
    }))
    expect(chatCompletionMock.mock.calls[1]?.[3]).toEqual(expect.objectContaining({
      action: 'voice_analyze',
      streamStepId: 'voice_analyze',
      streamStepAttempt: 2,
    }))
    expect(reportTaskProgressMock).toHaveBeenCalledWith(
      job,
      84,
      expect.objectContaining({
        stage: 'script_to_storyboard_step',
        stepId: 'voice_analyze',
        stepAttempt: 2,
        message: '台词分析失败，准备重试 (2/2)',
      }),
    )
  })
})
