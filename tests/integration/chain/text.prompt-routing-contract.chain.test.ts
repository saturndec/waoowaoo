import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

type AddCall = {
  jobName: string
  data: TaskJobData
  options: Record<string, unknown>
}

const queueState = vi.hoisted(() => ({
  addCallsByQueue: new Map<string, AddCall[]>(),
  promptTelemetryCalls: [] as Array<Record<string, unknown> | undefined>,
  promptBuildCalls: [] as Array<Record<string, unknown>>,
}))

const prismaMock = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(async () => ({ id: 'project-1', mode: 'novel-promotion' })),
  },
  novelPromotionProject: {
    findFirst: vi.fn(async () => ({ id: 'np-project-1' })),
  },
}))

const llmMock = vi.hoisted(() => ({
  chatCompletion: vi.fn(async (_userId: string, _model: string | null | undefined, _messages: unknown, options?: { promptTelemetry?: Record<string, unknown> }) => {
    queueState.promptTelemetryCalls.push(options?.promptTelemetry)
    return {
      id: 'completion-1',
      usage: {
        prompt_tokens: 12,
        completion_tokens: 8,
        total_tokens: 20,
      },
      choices: [
        {
          message: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  episodes: [
                    {
                      number: 1,
                      title: 'Episode 1',
                      summary: 'Opening',
                      startMarker: 'START_MARKER',
                      endMarker: 'END_MARKER',
                    },
                  ],
                }),
              },
            ],
          },
        },
      ],
    }
  }),
  getCompletionContent: vi.fn(() => JSON.stringify({
    episodes: [
      {
        number: 1,
        title: 'Episode 1',
        summary: 'Opening',
        startMarker: 'START_MARKER',
        endMarker: 'END_MARKER',
      },
    ],
  })),
}))

const configMock = vi.hoisted(() => ({
  getUserModelConfig: vi.fn(async () => ({ analysisModel: 'openai-compatible::gpt-4.1-mini' })),
}))

const workerMock = vi.hoisted(() => ({
  reportTaskProgress: vi.fn(async () => undefined),
  assertTaskActive: vi.fn(async () => undefined),
}))

vi.mock('bullmq', () => ({
  Queue: class {
    private readonly queueName: string

    constructor(queueName: string) {
      this.queueName = queueName
    }

    async add(jobName: string, data: TaskJobData, options: Record<string, unknown>) {
      const list = queueState.addCallsByQueue.get(this.queueName) || []
      list.push({ jobName, data, options })
      queueState.addCallsByQueue.set(this.queueName, list)
      return { id: data.taskId }
    }

    async getJob() {
      return null
    }
  },
}))

vi.mock('@/lib/redis', () => ({ queueRedis: {} }))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/llm-client', () => llmMock)
vi.mock('@/lib/config-service', () => configMock)
vi.mock('@/lib/workers/shared', () => ({ reportTaskProgress: workerMock.reportTaskProgress }))
vi.mock('@/lib/workers/utils', () => ({ assertTaskActive: workerMock.assertTaskActive }))
vi.mock('@/lib/llm-observe/internal-stream-context', () => ({
  withInternalLLMStreamCallbacks: vi.fn(async (_callbacks: unknown, fn: () => Promise<unknown>) => await fn()),
}))
vi.mock('@/lib/workers/handlers/llm-stream', () => ({
  createWorkerLLMStreamContext: vi.fn(() => ({ streamId: 'run-1' })),
  createWorkerLLMStreamCallbacks: vi.fn(() => ({ flush: vi.fn(async () => undefined) })),
}))
vi.mock('@/lib/prompt-i18n', async () => {
  const actual = await vi.importActual<typeof import('@/lib/prompt-i18n')>('@/lib/prompt-i18n')
  return {
    ...actual,
    buildPromptWithPolicy: vi.fn((input: Record<string, unknown>) => {
      queueState.promptBuildCalls.push(input)
      return actual.buildPromptWithPolicy(input as Parameters<typeof actual.buildPromptWithPolicy>[0])
    }),
  }
})
vi.mock('@/lib/novel-promotion/story-to-script/clip-matching', () => ({
  createTextMarkerMatcher: (content: string) => ({
    matchMarker: (marker: string, fromIndex = 0) => {
      const startIndex = content.indexOf(marker, fromIndex)
      if (startIndex === -1) return null
      return { startIndex, endIndex: startIndex + marker.length }
    },
  }),
}))

function toJob(data: TaskJobData): Job<TaskJobData> {
  return { data } as unknown as Job<TaskJobData>
}

describe('chain contract - prompt routing telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queueState.addCallsByQueue.clear()
    queueState.promptTelemetryCalls = []
    queueState.promptBuildCalls = []
  })

  it('propagates prompt_language/output_language/contract_valid through text chain', async () => {
    const { addTaskJob, QUEUE_NAME } = await import('@/lib/task/queues')
    const { handleEpisodeSplitTask } = await import('@/lib/workers/handlers/episode-split')

    const content = [
      'This is long enough text for episode split contract test. '.repeat(3),
      'START_MARKER',
      'Episode body for telemetry chain contract assertion.',
      'END_MARKER',
      'tail',
    ].join('')

    await addTaskJob({
      taskId: 'task-text-routing-contract-1',
      type: TASK_TYPE.EPISODE_SPLIT_LLM,
      locale: 'vi',
      projectId: 'project-1',
      episodeId: null,
      targetType: 'NovelPromotionProject',
      targetId: 'project-1',
      payload: { content },
      userId: 'user-1',
    })

    const calls = queueState.addCallsByQueue.get(QUEUE_NAME.TEXT) || []
    expect(calls).toHaveLength(1)

    const result = await handleEpisodeSplitTask(toJob(calls[0]!.data))

    expect(result.success).toBe(true)
    expect(queueState.promptBuildCalls).toHaveLength(1)

    expect(queueState.promptTelemetryCalls).toHaveLength(1)
    expect(queueState.promptTelemetryCalls[0]).toEqual(expect.objectContaining({
      prompt_language: 'en',
      output_language: 'vi',
      contract_valid: true,
      contract_language: 'en',
    }))
  })
})
