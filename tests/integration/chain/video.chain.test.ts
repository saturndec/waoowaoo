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

const workerState = vi.hoisted(() => ({
  processor: null as ((job: Job<TaskJobData>) => Promise<unknown>) | null,
}))

const workerMock = vi.hoisted(() => ({
  reportTaskProgress: vi.fn(async () => undefined),
  withTaskLifecycle: vi.fn(async (job: Job<TaskJobData>, handler: (j: Job<TaskJobData>) => Promise<unknown>) => await handler(job)),
}))

const utilsMock = vi.hoisted(() => ({
  assertTaskActive: vi.fn(async () => undefined),
  getProjectModels: vi.fn(async () => ({ videoRatio: '16:9' })),
  resolveLipSyncVideoSource: vi.fn(async () => 'https://provider.example/lipsync.mp4'),
  resolveVideoSourceFromGeneration: vi.fn(async () => 'https://provider.example/video.mp4'),
  toSignedUrlIfCos: vi.fn((url: string | null) => (url ? `https://signed.example/${url}` : null)),
  uploadVideoSourceToCos: vi.fn(async () => 'cos/lip-sync/video.mp4'),
}))
const configServiceMock = vi.hoisted(() => ({
  getUserWorkflowConcurrencyConfig: vi.fn(async () => ({
    analysis: 5,
    image: 5,
    video: 5,
  })),
}))
const concurrencyGateMock = vi.hoisted(() => ({
  withUserConcurrencyGate: vi.fn(async <T>(input: {
    run: () => Promise<T>
  }) => await input.run()),
}))

const prismaMock = vi.hoisted(() => ({
  projectPanel: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(async () => undefined),
  },
  projectVoiceLine: {
    findUnique: vi.fn(),
  },
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
  Worker: class {
    constructor(_name: string, processor: (job: Job<TaskJobData>) => Promise<unknown>) {
      workerState.processor = processor
    }
  },
}))

vi.mock('@/lib/redis', () => ({ queueRedis: {} }))
vi.mock('@/lib/workers/shared', () => ({
  reportTaskProgress: workerMock.reportTaskProgress,
  withTaskLifecycle: workerMock.withTaskLifecycle,
}))
vi.mock('@/lib/workers/utils', () => utilsMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/media/outbound-image', () => ({
  normalizeToBase64ForGeneration: vi.fn(async (input: string) => input),
}))
vi.mock('@/lib/ai-registry/capabilities-catalog', () => ({
  registerBuiltinCapabilityCatalogEntries: vi.fn(),
  resolveBuiltinCapabilitiesByModelKey: vi.fn(() => ({ video: { firstlastframe: true } })),
}))
vi.mock('@/lib/ai-registry/selection', () => ({
  composeModelKey: vi.fn((provider: string, modelId: string) => `${provider}::${modelId}`),
  parseModelKeyStrict: vi.fn(() => ({ provider: 'fal' })),
}))
vi.mock('@/lib/user-api/runtime-config', () => ({
  getProviderConfig: vi.fn(async () => ({ apiKey: 'api-key' })),
}))
vi.mock('@/lib/config-service', () => configServiceMock)
vi.mock('@/lib/workers/user-concurrency-gate', () => concurrencyGateMock)

function toJob(data: TaskJobData): Job<TaskJobData> {
  return { data } as unknown as Job<TaskJobData>
}

describe('chain contract - video queue behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queueState.addCallsByQueue.clear()
    workerState.processor = null
    prismaMock.projectPanel.findUnique.mockResolvedValue({
      id: 'panel-1',
      videoUrl: 'cos/base-video.mp4',
    })
    prismaMock.projectVoiceLine.findUnique.mockResolvedValue({
      id: 'line-1',
      audioUrl: 'cos/line-1.mp3',
    })
  })

  it('VIDEO_PANEL is enqueued into video queue', async () => {
    const { addTaskJob, QUEUE_NAME } = await import('@/lib/task/queues')

    await addTaskJob({
      taskId: 'task-video-1',
      type: TASK_TYPE.VIDEO_PANEL,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'ProjectPanel',
      targetId: 'panel-1',
      payload: { videoModel: 'fal::video-model' },
      userId: 'user-1',
    })

    const calls = queueState.addCallsByQueue.get(QUEUE_NAME.VIDEO) || []
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual(expect.objectContaining({
      jobName: TASK_TYPE.VIDEO_PANEL,
      options: expect.objectContaining({ jobId: 'task-video-1', priority: 0 }),
    }))
  })

  it('LIP_SYNC is enqueued into video queue', async () => {
    const { addTaskJob, QUEUE_NAME } = await import('@/lib/task/queues')

    await addTaskJob({
      taskId: 'task-video-2',
      type: TASK_TYPE.LIP_SYNC,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'ProjectPanel',
      targetId: 'panel-1',
      payload: { voiceLineId: 'line-1', lipSyncModel: 'fal::lipsync-model' },
      userId: 'user-1',
    })

    const calls = queueState.addCallsByQueue.get(QUEUE_NAME.VIDEO) || []
    expect(calls).toHaveLength(1)
    expect(calls[0]?.data.type).toBe(TASK_TYPE.LIP_SYNC)
  })

  it('queued video job payload can be consumed by video worker and persist lipSyncVideoUrl', async () => {
    const { addTaskJob, QUEUE_NAME } = await import('@/lib/task/queues')
    const { createVideoWorker } = await import('@/lib/workers/video.worker')
    createVideoWorker()
    const processor = workerState.processor
    expect(processor).toBeTruthy()

    await addTaskJob({
      taskId: 'task-video-chain-worker-1',
      type: TASK_TYPE.LIP_SYNC,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'ProjectPanel',
      targetId: 'panel-1',
      payload: { voiceLineId: 'line-1', lipSyncModel: 'fal::lipsync-model' },
      userId: 'user-1',
    })

    const calls = queueState.addCallsByQueue.get(QUEUE_NAME.VIDEO) || []
    const queued = calls[0]?.data
    expect(queued?.type).toBe(TASK_TYPE.LIP_SYNC)

    const result = await processor!(toJob(queued!)) as { panelId: string; voiceLineId: string; lipSyncVideoUrl: string }
    expect(result).toEqual({
      panelId: 'panel-1',
      voiceLineId: 'line-1',
      lipSyncVideoUrl: 'cos/lip-sync/video.mp4',
    })
    expect(prismaMock.projectPanel.update).toHaveBeenCalledWith({
      where: { id: 'panel-1' },
      data: {
        lipSyncVideoUrl: 'cos/lip-sync/video.mp4',
        lipSyncTaskId: null,
      },
    })
  })
})
