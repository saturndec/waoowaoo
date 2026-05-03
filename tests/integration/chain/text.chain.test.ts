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
}))

const prismaMock = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(async () => ({ id: 'project-1' })),
  },
}))

const llmMock = vi.hoisted(() => ({
  chatCompletion: vi.fn(async () => ({ id: 'completion-1' })),
  getCompletionContent: vi.fn(() => JSON.stringify({
    episodes: [
      {
        number: 1,
        title: '第一集',
        summary: '开端',
        startMarker: 'START_MARKER',
        endMarker: 'END_MARKER',
      },
    ],
  })),
}))

const configMock = vi.hoisted(() => ({
  getUserModelConfig: vi.fn(async () => ({ analysisModel: 'llm::analysis-1' })),
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
vi.mock('@/lib/ai-exec/llm-helpers', () => llmMock)
vi.mock('@/lib/ai-exec/engine', () => ({
  executeAiTextStep: vi.fn(async () => ({
    text: llmMock.getCompletionContent(),
    reasoning: '',
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    completion: { id: 'completion-1' },
  })),
}))
vi.mock('@/lib/config-service', () => configMock)
vi.mock('@/lib/workers/shared', () => ({ reportTaskProgress: workerMock.reportTaskProgress }))
vi.mock('@/lib/workers/utils', () => ({ assertTaskActive: workerMock.assertTaskActive }))
vi.mock('@/lib/llm-observe/internal-stream-context', () => ({
  getInternalLLMStreamCallbacks: vi.fn(() => null),
  withInternalLLMStreamCallbacks: vi.fn(async (_callbacks: unknown, fn: () => Promise<unknown>) => await fn()),
}))
vi.mock('@/lib/workers/handlers/llm-stream', () => ({
  createWorkerLLMStreamContext: vi.fn(() => ({ streamId: 'run-1' })),
  createWorkerLLMStreamCallbacks: vi.fn(() => ({ flush: vi.fn(async () => undefined) })),
}))
vi.mock('@/lib/ai-prompts', () => ({
  AI_PROMPT_IDS: { SCRIPT_EPISODE_SPLIT: 'script-episode-split' },
  buildAiPrompt: vi.fn(() => 'episode-split-prompt'),
}))
vi.mock('@/lib/text-processing/clip-matching', () => ({
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

describe('chain contract - text queue behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queueState.addCallsByQueue.clear()
  })

  it('text tasks are enqueued into text queue', async () => {
    const { addTaskJob, QUEUE_NAME } = await import('@/lib/task/queues')

    await addTaskJob({
      taskId: 'task-text-1',
      type: TASK_TYPE.SCREENPLAY_CONVERT,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'ProjectEpisode',
      targetId: 'episode-1',
      payload: { episodeId: 'episode-1' },
      userId: 'user-1',
    })

    const calls = queueState.addCallsByQueue.get(QUEUE_NAME.TEXT) || []
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual(expect.objectContaining({
      jobName: TASK_TYPE.SCREENPLAY_CONVERT,
      options: expect.objectContaining({ jobId: 'task-text-1', priority: 0 }),
    }))
  })

  it('preserves explicit queue attempts for atomic text tasks', async () => {
    const { addTaskJob, QUEUE_NAME } = await import('@/lib/task/queues')

    await addTaskJob({
      taskId: 'task-text-story-1',
      type: TASK_TYPE.CLIPS_BUILD,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'ProjectEpisode',
      targetId: 'episode-1',
      payload: { episodeId: 'episode-1' },
      userId: 'user-1',
    }, { attempts: 5 })

    const calls = queueState.addCallsByQueue.get(QUEUE_NAME.TEXT) || []
    expect(calls).toHaveLength(1)
    expect(calls[0]?.options).toEqual(expect.objectContaining({
      jobId: 'task-text-story-1',
      attempts: 5,
    }))
  })

  it('explicit priority is preserved for text queue jobs', async () => {
    const { addTaskJob, QUEUE_NAME } = await import('@/lib/task/queues')

    await addTaskJob({
      taskId: 'task-text-2',
      type: TASK_TYPE.REFERENCE_TO_CHARACTER,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: null,
      targetType: 'Project',
      targetId: 'project-1',
      payload: { referenceImageUrl: 'https://example.com/ref.png' },
      userId: 'user-1',
    }, { priority: 7 })

    const calls = queueState.addCallsByQueue.get(QUEUE_NAME.TEXT) || []
    expect(calls).toHaveLength(1)
    expect(calls[0]?.options).toEqual(expect.objectContaining({ priority: 7, jobId: 'task-text-2' }))
  })

  it('queued text job payload can be consumed by text handler and resolve episode boundaries', async () => {
    const { addTaskJob, QUEUE_NAME } = await import('@/lib/task/queues')
    const { handleEpisodeSplitTask } = await import('@/lib/workers/handlers/episode-split')

    const content = [
      '前置内容用于凑长度，确保文本超过一百字。这一段会重复两次以保证长度满足阈值。',
      '前置内容用于凑长度，确保文本超过一百字。这一段会重复两次以保证长度满足阈值。',
      'START_MARKER',
      '这里是第一集的正文内容，包含角色冲突与场景推进，长度足够用于链路测试验证。',
      'END_MARKER',
      '后置内容用于确保边界外还有文本，并继续补足长度。',
    ].join('')

    await addTaskJob({
      taskId: 'task-text-chain-worker-1',
      type: TASK_TYPE.EPISODE_SPLIT_LLM,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: null,
      targetType: 'Project',
      targetId: 'project-1',
      payload: { content },
      userId: 'user-1',
    })

    const calls = queueState.addCallsByQueue.get(QUEUE_NAME.TEXT) || []
    const queued = calls[0]?.data
    expect(queued?.type).toBe(TASK_TYPE.EPISODE_SPLIT_LLM)

    const result = await handleEpisodeSplitTask(toJob(queued!))
    expect(result.success).toBe(true)
    expect(result.episodes).toHaveLength(1)
    expect(result.episodes[0]?.title).toBe('第一集')
    expect(result.episodes[0]?.content).toContain('START_MARKER')
    expect(result.episodes[0]?.content).toContain('END_MARKER')
  })
})
