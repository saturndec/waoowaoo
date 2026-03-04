import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-errors'

const getWorkersMock = vi.hoisted(() => vi.fn())
const createTaskMock = vi.hoisted(() => vi.fn())
const loggerErrorMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/logging/core', () => ({
  createScopedLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: loggerErrorMock,
  }),
}))

vi.mock('@/lib/task/queues', () => ({
  addTaskJob: vi.fn(async () => ({})),
  getQueueTypeByTaskType: vi.fn(() => 'text'),
  getQueueByType: vi.fn(() => ({
    getWorkers: getWorkersMock,
  })),
}))

vi.mock('@/lib/task/service', () => ({
  createTask: createTaskMock,
  markTaskEnqueueFailed: vi.fn(async () => ({})),
  markTaskFailed: vi.fn(async () => true),
  rollbackTaskBillingForTask: vi.fn(async () => ({ attempted: false, rolledBack: true, billingInfo: null })),
  updateTaskBillingInfo: vi.fn(async () => ({})),
  updateTaskPayload: vi.fn(async () => ({})),
}))

vi.mock('@/lib/task/publisher', () => ({
  publishTaskEvent: vi.fn(async () => ({})),
}))

vi.mock('@/lib/billing', () => ({
  buildDefaultTaskBillingInfo: vi.fn(() => null),
  isBillableTaskType: vi.fn(() => false),
  prepareTaskBilling: vi.fn(async () => null),
  InsufficientBalanceError: class InsufficientBalanceError extends Error {
    required = 0
    available = 0
  },
}))

vi.mock('@/lib/llm-observe/stage-pipeline', () => ({
  getTaskFlowMeta: vi.fn(() => ({
    flowId: 'single:analyze_global',
    flowStageIndex: 1,
    flowStageTotal: 1,
    flowStageTitle: 'progress.taskType.analyzeGlobal',
  })),
}))

vi.mock('@/lib/run-runtime/service', () => ({
  attachTaskToRun: vi.fn(async () => ({})),
  createRun: vi.fn(async () => ({ id: 'run-mock-1' })),
}))

vi.mock('@/lib/run-runtime/workflow', () => ({
  isAiTaskType: vi.fn(() => false),
  workflowTypeFromTaskType: vi.fn(() => 'single'),
}))

import { submitTask } from '@/lib/task/submitter'

describe('submitTask worker availability', () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalRequireActive = process.env.TASK_REQUIRE_ACTIVE_WORKER

  beforeEach(() => {
    process.env.NODE_ENV = 'development'
    process.env.TASK_REQUIRE_ACTIVE_WORKER = 'true'
    getWorkersMock.mockReset()
    createTaskMock.mockReset()
    loggerErrorMock.mockReset()
  })

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    process.env.TASK_REQUIRE_ACTIVE_WORKER = originalRequireActive
    vi.restoreAllMocks()
  })

  it('无活跃 worker 时直接抛出 WORKER_UNAVAILABLE', async () => {
    getWorkersMock.mockResolvedValueOnce([])

    await expect(
      submitTask({
        userId: 'user-1',
        locale: 'zh',
        projectId: 'project-1',
        type: 'analyze_global',
        targetType: 'NovelPromotionProject',
        targetId: 'project-1',
        payload: {
          content: 'hello',
        },
      }),
    ).rejects.toMatchObject<ApiError>({
      code: 'WORKER_UNAVAILABLE',
    })

    expect(createTaskMock).not.toHaveBeenCalled()
    expect(loggerErrorMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'task.submit.worker_unavailable',
      errorCode: 'WORKER_UNAVAILABLE',
    }))
  })
})

