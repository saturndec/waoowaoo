import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Job } from 'bullmq'
import { TaskTerminatedError } from '@/lib/task/errors'
import type { TaskJobData } from '@/lib/task/types'

const loggerInfoMock = vi.hoisted(() => vi.fn())
const loggerWarnMock = vi.hoisted(() => vi.fn())
const loggerErrorMock = vi.hoisted(() => vi.fn())
const tryUpdateTaskProgressMock = vi.hoisted(() => vi.fn())
const touchTaskHeartbeatMock = vi.hoisted(() => vi.fn())
const tryMarkTaskProcessingMock = vi.hoisted(() => vi.fn())
const tryMarkTaskCompletedMock = vi.hoisted(() => vi.fn())
const tryMarkTaskFailedMock = vi.hoisted(() => vi.fn())
const publishTaskEventMock = vi.hoisted(() => vi.fn())
const projectFindUniqueMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/logging/core', () => ({
  createScopedLogger: () => ({
    info: loggerInfoMock,
    warn: loggerWarnMock,
    error: loggerErrorMock,
  }),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    project: {
      findUnique: projectFindUniqueMock,
    },
  },
}))

vi.mock('@/lib/task/service', () => ({
  rollbackTaskBillingForTask: vi.fn(async () => ({ attempted: false, rolledBack: true, billingInfo: null })),
  touchTaskHeartbeat: touchTaskHeartbeatMock,
  tryMarkTaskCompleted: tryMarkTaskCompletedMock,
  tryMarkTaskFailed: tryMarkTaskFailedMock,
  tryMarkTaskProcessing: tryMarkTaskProcessingMock,
  tryUpdateTaskProgress: tryUpdateTaskProgressMock,
  updateTaskBillingInfo: vi.fn(async () => true),
}))

vi.mock('@/lib/task/publisher', () => ({
  publishTaskEvent: publishTaskEventMock,
  publishTaskStreamEvent: vi.fn(async () => ({})),
}))

vi.mock('@/lib/billing', () => ({
  rollbackTaskBilling: vi.fn(async ({ billingInfo }: { billingInfo: unknown }) => billingInfo),
  settleTaskBilling: vi.fn(async ({ billingInfo }: { billingInfo: unknown }) => billingInfo),
}))

vi.mock('@/lib/billing/runtime-usage', () => ({
  withTextUsageCollection: vi.fn(async (executor: () => Promise<Record<string, unknown> | void>) => ({
    result: await executor(),
    textUsage: null,
  })),
}))

vi.mock('@/lib/logging/file-writer', () => ({
  onProjectNameAvailable: vi.fn(),
}))

vi.mock('@/lib/errors/normalize', () => ({
  normalizeAnyError: vi.fn((error: unknown) => ({
    code: 'INTERNAL_ERROR',
    message: error instanceof Error ? error.message : String(error),
    retryable: false,
    provider: null,
  })),
}))

import { reportTaskProgress, withTaskLifecycle } from '@/lib/workers/shared'

function createJob(overrides?: Partial<TaskJobData>): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-test-1',
      type: 'episode_split_llm',
      locale: 'zh',
      projectId: 'project-test-1',
      episodeId: null,
      targetType: 'NovelPromotionProject',
      targetId: 'project-test-1',
      payload: {
        flowId: 'single:episode_split_llm',
        flowStageIndex: 1,
        flowStageTotal: 1,
        flowStageTitle: 'progress.taskType.episodeSplitLlm',
        runId: 'run-test-1',
      },
      billingInfo: null,
      userId: 'user-test-1',
      trace: null,
      ...(overrides || {}),
    },
    queueName: 'text',
    opts: { attempts: 1 },
    attemptsMade: 0,
  } as unknown as Job<TaskJobData>
}

describe('workers/shared locale & heartbeat', () => {
  beforeEach(() => {
    loggerInfoMock.mockReset()
    loggerWarnMock.mockReset()
    loggerErrorMock.mockReset()
    tryUpdateTaskProgressMock.mockReset()
    touchTaskHeartbeatMock.mockReset()
    tryMarkTaskProcessingMock.mockReset()
    tryMarkTaskCompletedMock.mockReset()
    tryMarkTaskFailedMock.mockReset()
    publishTaskEventMock.mockReset()
    projectFindUniqueMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('reportTaskProgress 会把 locale 保留到 payload 与 meta', async () => {
    tryUpdateTaskProgressMock.mockResolvedValueOnce(true)
    publishTaskEventMock.mockResolvedValueOnce({})
    const job = createJob()

    await reportTaskProgress(job, 35, {
      stage: 'episode_split_match',
      stageLabel: '匹配剧集内容范围',
    })

    const call = tryUpdateTaskProgressMock.mock.calls[0]
    expect(call?.[0]).toBe('task-test-1')
    expect(call?.[1]).toBe(35)
    expect(call?.[2]).toEqual(expect.objectContaining({
      locale: 'zh',
      meta: expect.objectContaining({
        locale: 'zh',
      }),
      runId: 'run-test-1',
    }))
  })

  it('心跳写库失败不会导致 withTaskLifecycle 崩溃', async () => {
    vi.useFakeTimers()
    tryMarkTaskProcessingMock.mockResolvedValueOnce(true)
    tryMarkTaskCompletedMock.mockResolvedValueOnce(true)
    touchTaskHeartbeatMock
      .mockRejectedValueOnce(new Error('db unavailable'))
      .mockResolvedValue(true)
    publishTaskEventMock.mockResolvedValue({})
    const job = createJob()

    const promise = withTaskLifecycle(job, async () => {
      await vi.advanceTimersByTimeAsync(10_050)
      return { success: true }
    })

    await expect(promise).resolves.toBeUndefined()
    expect(touchTaskHeartbeatMock).toHaveBeenCalledTimes(1)
    expect(loggerErrorMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'worker.heartbeat.failed',
    }))
  })

  it('TaskTerminatedError 发生时会把 active 任务标记为 failed', async () => {
    tryMarkTaskProcessingMock.mockResolvedValueOnce(true)
    tryMarkTaskFailedMock.mockResolvedValueOnce(true)
    touchTaskHeartbeatMock.mockResolvedValue(true)
    publishTaskEventMock.mockResolvedValue({})
    const job = createJob()

    await expect(
      withTaskLifecycle(job, async () => {
        throw new TaskTerminatedError(job.data.taskId, 'Task terminated during worker_llm_stream')
      }),
    ).rejects.toThrow('Task terminated: Task terminated during worker_llm_stream')

    expect(tryMarkTaskFailedMock).toHaveBeenCalledWith(
      'task-test-1',
      'WORKER_EXECUTION_ERROR',
      'Task terminated during worker_llm_stream',
    )
    expect(publishTaskEventMock).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-test-1',
      type: 'task.failed',
      payload: expect.objectContaining({
        stage: 'terminated',
        errorCode: 'WORKER_EXECUTION_ERROR',
      }),
    }))
  })
})
