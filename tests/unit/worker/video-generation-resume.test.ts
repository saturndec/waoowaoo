import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskJobData } from '@/lib/task/types'

const prismaMock = vi.hoisted(() => ({
  task: {
    findUnique: vi.fn(),
  },
}))

const taskServiceMock = vi.hoisted(() => ({
  isTaskActive: vi.fn(async () => true),
  trySetTaskExternalId: vi.fn(async () => true),
}))

const asyncPollMock = vi.hoisted(() => ({
  pollAsyncTask: vi.fn(),
}))

const generatorApiMock = vi.hoisted(() => ({
  generateImage: vi.fn(),
  generateVideo: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/task/service', () => taskServiceMock)
vi.mock('@/lib/async-poll', () => asyncPollMock)
vi.mock('@/lib/generator-api', () => generatorApiMock)
vi.mock('@/lib/kling', () => ({ generateLipSync: vi.fn() }))
vi.mock('@/lib/cos', () => ({
  getSignedUrl: vi.fn((value: string) => value),
  toFetchableUrl: vi.fn((value: string) => value),
}))
vi.mock('@/lib/fonts', () => ({ initializeFonts: vi.fn(), createLabelSVG: vi.fn() }))
vi.mock('@/lib/media-process', () => ({ processMediaResult: vi.fn() }))
vi.mock('@/lib/config-service', () => ({
  getProjectModelConfig: vi.fn(),
  getUserModelConfig: vi.fn(),
  resolveProjectModelCapabilityGenerationOptions: vi.fn(),
}))

import { resolveVideoSourceFromGeneration } from '@/lib/workers/utils'

function buildJob(): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-1',
      type: 'VIDEO_PANEL',
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'NovelPromotionPanel',
      targetId: 'panel-1',
      payload: {},
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker utils video generation resume', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('continues polling from existing externalId without re-submitting generation', async () => {
    const externalId = 'OPENAI:VIDEO:b3BlbmFpLWNvbXBhdGlibGU6b2EtMQ:vid_123'
    prismaMock.task.findUnique.mockResolvedValueOnce({ externalId })
    asyncPollMock.pollAsyncTask.mockResolvedValueOnce({
      status: 'completed',
      resultUrl: 'https://oa.test/v1/videos/vid_123/content',
      downloadHeaders: {
        Authorization: 'Bearer oa-key',
      },
    })

    const result = await resolveVideoSourceFromGeneration(buildJob(), {
      userId: 'user-1',
      modelId: 'openai-compatible:oa-1::sora-2',
      imageUrl: 'data:image/png;base64,QQ==',
      options: {
        prompt: 'animate this frame',
      },
    })

    expect(result).toEqual({
      url: 'https://oa.test/v1/videos/vid_123/content',
      downloadHeaders: {
        Authorization: 'Bearer oa-key',
      },
    })
    expect(asyncPollMock.pollAsyncTask).toHaveBeenCalledWith(externalId, 'user-1')
    expect(generatorApiMock.generateVideo).not.toHaveBeenCalled()
  })
})
