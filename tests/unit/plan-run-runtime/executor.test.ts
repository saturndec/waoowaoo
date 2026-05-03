import { beforeEach, describe, expect, it, vi } from 'vitest'
import { executeAgentPlan } from '@/lib/plan-run-runtime/executor'

const serviceMock = vi.hoisted(() => ({
  completePlanRun: vi.fn(async () => ({ planRun: { id: 'plan-run-1' } })),
  completePlanStep: vi.fn(async () => ({})),
  createPlanArtifact: vi.fn(async () => ({})),
  createPlanRun: vi.fn(async () => ({ id: 'plan-run-1' })),
  failPlanStep: vi.fn(async () => ({})),
  getPlanRunSnapshot: vi.fn(async () => ({
    planRun: { id: 'plan-run-1', status: 'completed' },
    steps: [],
    artifacts: [],
  })),
  startPlanStep: vi.fn(async () => ({})),
}))

vi.mock('@/lib/plan-run-runtime/service', () => serviceMock)

describe('plan run executor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('runs ready steps in dependency order and completes the plan', async () => {
    const invokeStep = vi.fn(async () => ({
      ok: true as const,
      data: {
        value: 'done',
      },
    }))

    const result = await executeAgentPlan({
      userId: 'user-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      input: {
        goal: 'make a tiny plan',
        steps: [
          {
            stepKey: 'context',
            skillId: 'creative-direction',
            operationId: 'get_project_context',
            outputArtifacts: ['creative.brief'],
          },
          {
            stepKey: 'snapshot',
            skillId: 'creative-direction',
            operationId: 'get_project_snapshot',
            dependsOn: ['context'],
          },
        ],
      },
      invokeStep,
    })

    expect(result).toMatchObject({
      success: true,
      status: 'completed',
      planRunId: 'plan-run-1',
      executedStepKeys: ['context', 'snapshot'],
    })
    expect(serviceMock.createPlanRun).toHaveBeenCalledWith(expect.objectContaining({
      goal: 'make a tiny plan',
      steps: expect.arrayContaining([
        expect.objectContaining({
          stepKey: 'context',
          stepIndex: 1,
          stepTotal: 2,
        }),
      ]),
    }))
    expect(invokeStep).toHaveBeenNthCalledWith(1, expect.objectContaining({
      operationId: 'get_project_context',
      input: { confirmed: true },
    }))
    expect(invokeStep).toHaveBeenNthCalledWith(2, expect.objectContaining({
      operationId: 'get_project_snapshot',
      input: { confirmed: true },
    }))
    expect(serviceMock.completePlanRun).toHaveBeenCalledWith({
      planRunId: 'plan-run-1',
      userId: 'user-1',
      projectId: 'project-1',
    })
  })

  it('stops after an async task submission and records the waiting task', async () => {
    const invokeStep = vi.fn(async () => ({
      ok: true as const,
      data: {
        taskId: 'task-1',
      },
    }))

    const result = await executeAgentPlan({
      userId: 'user-1',
      projectId: 'project-1',
      input: {
        goal: 'generate media',
        steps: [
          {
            stepKey: 'music',
            skillId: 'media-generation',
            operationId: 'generate_project_music',
          },
          {
            stepKey: 'video',
            skillId: 'media-generation',
            operationId: 'generate_panel_video',
            dependsOn: ['music'],
          },
        ],
      },
      invokeStep,
    })

    expect(result).toMatchObject({
      success: true,
      status: 'waiting_task',
      waitingTaskId: 'task-1',
      executedStepKeys: ['music'],
    })
    expect(invokeStep).toHaveBeenCalledTimes(1)
    expect(serviceMock.completePlanStep).toHaveBeenCalledWith(expect.objectContaining({
      planRunId: 'plan-run-1',
      stepKey: 'music',
      taskId: 'task-1',
    }))
    expect(serviceMock.completePlanRun).not.toHaveBeenCalled()
  })

  it('fails the current step when an operation returns an error', async () => {
    const invokeStep = vi.fn(async () => ({
      ok: false as const,
      error: {
        code: 'OPERATION_EXECUTION_FAILED' as const,
        message: 'provider failed',
        operationId: 'generate_project_music',
      },
    }))

    const result = await executeAgentPlan({
      userId: 'user-1',
      projectId: 'project-1',
      input: {
        goal: 'generate media',
        steps: [
          {
            stepKey: 'music',
            skillId: 'media-generation',
            operationId: 'generate_project_music',
          },
        ],
      },
      invokeStep,
    })

    expect(result).toMatchObject({
      success: false,
      planRunId: 'plan-run-1',
      failedStepKey: 'music',
      error: {
        code: 'OPERATION_EXECUTION_FAILED',
        message: 'provider failed',
      },
    })
    expect(serviceMock.failPlanStep).toHaveBeenCalledWith(expect.objectContaining({
      planRunId: 'plan-run-1',
      stepKey: 'music',
      errorCode: 'OPERATION_EXECUTION_FAILED',
      errorMessage: 'provider failed',
    }))
  })
})
