import { beforeEach, describe, expect, it, vi } from 'vitest'

const taskEventFindManyMock = vi.hoisted(() => vi.fn(async () => []))
const taskEventCreateMock = vi.hoisted(() => vi.fn(async () => null))
const taskFindManyMock = vi.hoisted(() => vi.fn(async () => []))
const redisPublishMock = vi.hoisted(() => vi.fn(async () => 1))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    taskEvent: {
      findMany: taskEventFindManyMock,
      create: taskEventCreateMock,
    },
    task: {
      findMany: taskFindManyMock,
    },
  },
}))

vi.mock('@/lib/redis', () => ({
  redis: {
    publish: redisPublishMock,
  },
  shouldSkipRedisInBuild: () => false,
  shouldSuppressRedisErrorInBuild: () => false,
}))

import {
  listEventsAfter,
  listTaskLifecycleEvents,
  publishTaskEvent,
  publishTaskStreamEvent,
} from '@/lib/task/publisher'

describe('task publisher replay', () => {
  beforeEach(() => {
    taskEventFindManyMock.mockReset()
    taskEventCreateMock.mockReset()
    taskFindManyMock.mockReset()
    redisPublishMock.mockReset()
  })

  it('replays persisted lifecycle + stream rows in chronological order', async () => {
    taskEventFindManyMock.mockResolvedValueOnce([
      {
        id: 12,
        taskId: 'task-1',
        projectId: 'project-1',
        userId: 'user-1',
        eventType: 'task.stream',
        payload: {
          stepId: 'step-1',
          stream: {
            kind: 'text',
            seq: 2,
            lane: 'main',
            delta: 'world',
          },
        },
        createdAt: new Date('2026-02-27T00:00:02.000Z'),
      },
      {
        id: 11,
        taskId: 'task-1',
        projectId: 'project-1',
        userId: 'user-1',
        eventType: 'task.processing',
        payload: {
          lifecycleType: 'task.processing',
          stepId: 'step-1',
          stepTitle: '阶段1',
        },
        createdAt: new Date('2026-02-27T00:00:01.000Z'),
      },
      {
        id: 10,
        taskId: 'task-1',
        projectId: 'project-1',
        userId: 'user-1',
        eventType: 'task.ignored',
        payload: {},
        createdAt: new Date('2026-02-27T00:00:00.000Z'),
      },
    ])
    taskFindManyMock.mockResolvedValueOnce([
      {
        id: 'task-1',
        type: 'script_to_storyboard_run',
        targetType: 'episode',
        targetId: 'episode-1',
        episodeId: 'episode-1',
      },
    ])

    const events = await listTaskLifecycleEvents('task-1', 50)

    expect(taskEventFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { taskId: 'task-1' },
      orderBy: { id: 'desc' },
      take: 50,
    }))
    expect(events).toHaveLength(2)
    expect(events.map((event) => event.id)).toEqual(['11', '12'])
    expect(events.map((event) => event.type)).toEqual(['task.lifecycle', 'task.stream'])
    expect((events[1]?.payload as { stream?: { delta?: string } }).stream?.delta).toBe('world')
  })

  it('persists stream rows when persist=true', async () => {
    taskEventCreateMock.mockResolvedValueOnce({
      id: 99,
      taskId: 'task-1',
      projectId: 'project-1',
      userId: 'user-1',
      eventType: 'task.stream',
      payload: {
        stream: {
          kind: 'text',
          seq: 1,
          lane: 'main',
          delta: 'hello',
        },
      },
      createdAt: new Date('2026-02-27T00:00:03.000Z'),
    })
    redisPublishMock.mockResolvedValueOnce(1)

    const message = await publishTaskStreamEvent({
      taskId: 'task-1',
      projectId: 'project-1',
      userId: 'user-1',
      taskType: 'story_to_script_run',
      targetType: 'episode',
      targetId: 'episode-1',
      episodeId: 'episode-1',
      payload: {
        stepId: 'step-1',
        stream: {
          kind: 'text',
          seq: 1,
          lane: 'main',
          delta: 'hello',
        },
      },
      persist: true,
    })

    expect(taskEventCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        taskId: 'task-1',
        eventType: 'task.stream',
      }),
    }))
    expect(redisPublishMock).toHaveBeenCalledTimes(1)
    expect(message?.id).toBe('99')
    expect(message?.type).toBe('task.stream')
  })

  it('normalizes lifecycle payload to stable stage/message contract', async () => {
    taskEventCreateMock.mockResolvedValueOnce({
      id: 200,
      taskId: 'task-legacy-lifecycle',
      projectId: 'project-1',
      userId: 'user-1',
      eventType: 'task.processing',
      payload: {
        lifecycleType: 'task.processing',
        stage: 'analyze_global_prepare',
        stageLabel: '准备全局资产分析参数',
      },
      createdAt: new Date('2026-02-27T00:00:03.000Z'),
    })
    redisPublishMock.mockResolvedValueOnce(1)

    const message = await publishTaskEvent({
      taskId: 'task-legacy-lifecycle',
      projectId: 'project-1',
      userId: 'user-1',
      type: 'task.processing',
      taskType: 'analyze_global',
      targetType: 'GlobalCharacter',
      targetId: 'global-1',
      payload: {
        stage: 'analyze_global_prepare',
        stageLabel: '准备全局资产分析参数',
        message: '共 3 个切片',
      },
      persist: true,
    })

    expect(message?.payload?.stageLabel).toBe('progress.stage.analyzeGlobalPrepare')
    expect((message?.payload as Record<string, unknown>)?.message).toBeUndefined()
  })

  it('drops localized stream message and keeps stable contract payload', async () => {
    taskEventCreateMock.mockResolvedValueOnce({
      id: 201,
      taskId: 'task-legacy-stream',
      projectId: 'project-1',
      userId: 'user-1',
      eventType: 'task.stream',
      payload: {
        message: '模型输出中',
      },
      createdAt: new Date('2026-02-27T00:00:04.000Z'),
    })
    redisPublishMock.mockResolvedValueOnce(1)

    const message = await publishTaskStreamEvent({
      taskId: 'task-legacy-stream',
      projectId: 'project-1',
      userId: 'user-1',
      taskType: 'story_to_script_run',
      targetType: 'NovelPromotionEpisode',
      targetId: 'episode-1',
      payload: {
        stepId: 'step-1',
        message: '模型输出中',
        stream: {
          kind: 'text',
          seq: 1,
          lane: 'main',
          delta: 'hello',
        },
      },
      persist: true,
    })

    expect((message?.payload as Record<string, unknown>)?.message).toBeUndefined()
  })

  it('replays lifecycle + stream rows in listEventsAfter', async () => {
    taskEventFindManyMock.mockResolvedValueOnce([
      {
        id: 101,
        taskId: 'task-1',
        projectId: 'project-1',
        userId: 'user-1',
        eventType: 'task.stream',
        payload: {
          stepId: 'step-1',
          stream: {
            kind: 'text',
            seq: 3,
            lane: 'main',
            delta: 'chunk',
          },
        },
        createdAt: new Date('2026-02-27T00:00:03.000Z'),
      },
      {
        id: 102,
        taskId: 'task-1',
        projectId: 'project-1',
        userId: 'user-1',
        eventType: 'task.processing',
        payload: {
          lifecycleType: 'task.processing',
          stepId: 'step-1',
        },
        createdAt: new Date('2026-02-27T00:00:04.000Z'),
      },
    ])
    taskFindManyMock.mockResolvedValueOnce([
      {
        id: 'task-1',
        type: 'story_to_script_run',
        targetType: 'episode',
        targetId: 'episode-1',
        episodeId: 'episode-1',
      },
    ])

    const events = await listEventsAfter('project-1', 100, 20)

    expect(taskEventFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        projectId: 'project-1',
        id: { gt: 100 },
      },
      orderBy: { id: 'asc' },
    }))
    expect(events).toHaveLength(2)
    expect(events.map((event) => event.id)).toEqual(['101', '102'])
    expect(events.map((event) => event.type)).toEqual(['task.stream', 'task.lifecycle'])
    expect((events[0]?.payload as { stream?: { delta?: string } }).stream?.delta).toBe('chunk')
  })
})
