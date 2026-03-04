import { beforeEach, describe, expect, it, vi } from 'vitest'

const taskFindManyMock = vi.hoisted(() => vi.fn())
const taskUpdateManyMock = vi.hoisted(() => vi.fn())
const taskFindUniqueMock = vi.hoisted(() => vi.fn())
const taskUpdateMock = vi.hoisted(() => vi.fn())
const taskCreateMock = vi.hoisted(() => vi.fn())
const taskFindFirstMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/prisma', () => ({
  prisma: {
    task: {
      findMany: taskFindManyMock,
      updateMany: taskUpdateManyMock,
      findUnique: taskFindUniqueMock,
      update: taskUpdateMock,
      create: taskCreateMock,
      findFirst: taskFindFirstMock,
    },
  },
}))

import { sweepStaleQueuedTasks } from '@/lib/task/service'

describe('queued watchdog timeout', () => {
  beforeEach(() => {
    taskFindManyMock.mockReset()
    taskUpdateManyMock.mockReset()
    taskFindUniqueMock.mockReset()
    taskUpdateMock.mockReset()
    taskCreateMock.mockReset()
    taskFindFirstMock.mockReset()
  })

  it('将长时间 queued 任务标记为 QUEUE_STUCK_TIMEOUT', async () => {
    taskFindManyMock.mockResolvedValueOnce([
      {
        id: 'task-queued-1',
        userId: 'user-1',
        projectId: 'project-1',
        episodeId: null,
        type: 'episode_split_llm',
        targetType: 'NovelPromotionProject',
        targetId: 'project-1',
        billingInfo: null,
      },
    ])
    taskUpdateManyMock.mockResolvedValueOnce({ count: 1 })

    const result = await sweepStaleQueuedTasks({
      queuedThresholdMs: 10,
      limit: 10,
    })

    expect(taskFindManyMock).toHaveBeenCalledTimes(1)
    expect(taskFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: 'queued',
        OR: [
          expect.objectContaining({
            enqueuedAt: expect.objectContaining({
              lt: expect.any(Date),
            }),
          }),
          expect.objectContaining({
            enqueuedAt: null,
            queuedAt: expect.objectContaining({
              lt: expect.any(Date),
            }),
          }),
        ],
      }),
    }))
    expect(taskUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'task-queued-1',
        status: 'queued',
      },
      data: expect.objectContaining({
        status: 'failed',
        errorCode: 'QUEUE_STUCK_TIMEOUT',
        dedupeKey: null,
      }),
    }))
    expect(result).toHaveLength(1)
    expect(result[0]?.errorCode).toBe('QUEUE_STUCK_TIMEOUT')
  })
})
