import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskType } from '@/lib/task/types'
import { TASK_TYPE } from '@/lib/task/types'

const state = vi.hoisted(() => ({
  createTaskResult: {
    task: {
      id: 'task-1',
      status: 'queued',
      billingInfo: null as unknown,
      priority: 0,
    },
    deduped: false as const,
  },
  isAiTaskType: false,
  isBillableTaskType: true,
  computedBillingInfo: null as unknown,
  prepareTaskBillingResult: null as unknown,
}))

const createTaskMock = vi.hoisted(() => vi.fn(async () => state.createTaskResult))
const markTaskFailedMock = vi.hoisted(() => vi.fn(async () => true))
const markTaskEnqueuedMock = vi.hoisted(() => vi.fn(async () => true))
const markTaskEnqueueFailedMock = vi.hoisted(() => vi.fn(async () => true))
const updateTaskBillingInfoMock = vi.hoisted(() => vi.fn(async () => true))
const updateTaskPayloadMock = vi.hoisted(() => vi.fn(async () => true))
const rollbackTaskBillingForTaskMock = vi.hoisted(() => vi.fn(async () => ({ attempted: false, rolledBack: true })))

const addTaskJobMock = vi.hoisted(() => vi.fn(async () => ({ id: 'job-1' })))
const publishTaskEventMock = vi.hoisted(() => vi.fn(async () => true))

const createRunMock = vi.hoisted(() => vi.fn(async () => ({ id: 'run-1' })))
const attachTaskToRunMock = vi.hoisted(() => vi.fn(async () => true))

vi.mock('@/lib/logging/core', () => ({
  createScopedLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}))

vi.mock('@/lib/task/service', () => ({
  createTask: createTaskMock,
  markTaskFailed: markTaskFailedMock,
  markTaskEnqueued: markTaskEnqueuedMock,
  markTaskEnqueueFailed: markTaskEnqueueFailedMock,
  updateTaskBillingInfo: updateTaskBillingInfoMock,
  updateTaskPayload: updateTaskPayloadMock,
  rollbackTaskBillingForTask: rollbackTaskBillingForTaskMock,
}))

vi.mock('@/lib/task/queues', () => ({
  addTaskJob: addTaskJobMock,
}))

vi.mock('@/lib/task/publisher', () => ({
  publishTaskEvent: publishTaskEventMock,
}))

vi.mock('@/lib/billing', () => ({
  buildDefaultTaskBillingInfo: vi.fn(() => state.computedBillingInfo),
  isBillableTaskType: vi.fn(() => state.isBillableTaskType),
  prepareTaskBilling: vi.fn(async () => state.prepareTaskBillingResult),
  InsufficientBalanceError: class InsufficientBalanceError extends Error {
    required = 0
    available = 0
  },
}))

vi.mock('@/lib/llm-observe/stage-pipeline', () => ({
  getTaskFlowMeta: vi.fn(() => ({
    flowId: 'flow-a',
    flowStageTitle: 'stage-a',
    flowStageIndex: 1,
    flowStageTotal: 1,
  })),
}))

vi.mock('@/lib/run-runtime/workflow', () => ({
  isAiTaskType: vi.fn(() => state.isAiTaskType),
  workflowTypeFromTaskType: vi.fn(() => 'story_to_script'),
}))

vi.mock('@/lib/run-runtime/service', () => ({
  createRun: createRunMock,
  attachTaskToRun: attachTaskToRunMock,
}))

import { submitTask } from '@/lib/task/submitter'

async function submitWith(params?: {
  type?: TaskType
  billingInfo?: unknown
  payload?: Record<string, unknown>
}) {
  return await submitTask({
    userId: 'user-1',
    locale: 'zh',
    projectId: 'project-1',
    type: params?.type || TASK_TYPE.VOICE_LINE,
    targetType: 'VoiceLine',
    targetId: 'line-1',
    payload: params?.payload || { maxSeconds: 5 },
    billingInfo: (params?.billingInfo as never) || null,
  })
}

describe('submitter billing guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.isAiTaskType = false
    state.isBillableTaskType = true
    state.computedBillingInfo = null
    state.prepareTaskBillingResult = null
    state.createTaskResult = {
      task: {
        id: 'task-1',
        status: 'queued',
        billingInfo: null,
        priority: 0,
      },
      deduped: false,
    }
  })

  it('accepts caller billingInfo when computed billingInfo is null', async () => {
    const externalBillingInfo = {
      billable: true,
      source: 'task',
      taskType: TASK_TYPE.VOICE_LINE,
      apiType: 'voice',
      model: 'index-tts2',
      quantity: 5,
      unit: 'second',
      maxFrozenCost: 1,
      action: TASK_TYPE.VOICE_LINE,
      status: 'quoted',
    }

    state.prepareTaskBillingResult = externalBillingInfo

    const result = await submitWith({
      billingInfo: externalBillingInfo,
    })

    expect(result.success).toBe(true)
    expect(markTaskFailedMock).not.toHaveBeenCalled()
    expect(addTaskJobMock).toHaveBeenCalledTimes(1)
  })

  it('fails when resolved billingInfo is missing for billable task', async () => {
    await expect(submitWith({ billingInfo: null })).rejects.toMatchObject({ code: 'INVALID_PARAMS' })

    expect(markTaskFailedMock).toHaveBeenCalledWith(
      'task-1',
      'INVALID_PARAMS',
      expect.stringContaining('missing billingInfo for billable task type'),
    )
    expect(addTaskJobMock).not.toHaveBeenCalled()
  })

  it('skips guard for non-billable task types', async () => {
    state.isBillableTaskType = false

    const result = await submitWith({
      type: TASK_TYPE.AI_CREATE_CHARACTER,
      billingInfo: null,
    })

    expect(result.success).toBe(true)
    expect(markTaskFailedMock).not.toHaveBeenCalled()
    expect(addTaskJobMock).toHaveBeenCalledTimes(1)
  })
})
