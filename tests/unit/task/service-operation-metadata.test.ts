import { beforeEach, describe, expect, it, vi } from 'vitest'

const taskModelMock = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  findUnique: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    task: taskModelMock,
  },
}))

vi.mock('@/lib/billing', () => ({
  rollbackTaskBilling: vi.fn(),
}))

vi.mock('@/lib/prisma-retry', () => ({
  withPrismaRetry: vi.fn(async (fn: () => Promise<unknown>) => await fn()),
}))

import { createTask } from '@/lib/task/service'
import { TASK_TYPE } from '@/lib/task/types'

describe('task service operation metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    taskModelMock.findFirst.mockResolvedValue(null)
    taskModelMock.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'task-1',
      ...data,
      createdAt: new Date('2026-05-02T00:00:00.000Z'),
      updatedAt: new Date('2026-05-02T00:00:00.000Z'),
    }))
  })

  it('writes operation metadata as first-class task fields', async () => {
    const result = await createTask({
      userId: 'user-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      type: TASK_TYPE.MUSIC_GENERATE,
      targetType: 'Project',
      targetId: 'project-1',
      payload: { prompt: 'theme' },
      operationId: 'generate_project_music',
      operationSource: 'assistant-confirmation',
      operationConfirmed: true,
      operationRequestId: 'req-1',
    })

    expect(result.deduped).toBe(false)
    expect(taskModelMock.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operationId: 'generate_project_music',
        operationSource: 'assistant-confirmation',
        operationConfirmed: true,
        operationRequestId: 'req-1',
      }),
    })
  })
})
