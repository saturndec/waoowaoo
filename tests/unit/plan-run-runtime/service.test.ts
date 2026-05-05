import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPlanRun } from '@/lib/plan-run-runtime/service'

const prismaState = vi.hoisted(() => {
  const tx = {
    executionPlan: {
      findFirst: vi.fn(),
    },
    planRun: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    planStepRun: {
      createMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    planRunEvent: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    planArtifact: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  }

  return {
    tx,
    prisma: {
      ...tx,
      $transaction: vi.fn(async <T>(fn: (txArg: typeof tx) => Promise<T>): Promise<T> => fn(tx)),
    },
  }
})

vi.mock('@/lib/prisma', () => ({
  prisma: prismaState.prisma,
}))

function buildPlanRunRow(planId: string | null) {
  const now = new Date('2026-05-05T00:00:00.000Z')
  return {
    id: 'plan-run-1',
    userId: 'user-1',
    projectId: 'project-1',
    episodeId: 'episode-1',
    commandId: null,
    planId,
    goal: 'write scene',
    status: 'queued',
    currentStepKey: null,
    errorCode: null,
    errorMessage: null,
    cancelRequestedAt: null,
    queuedAt: now,
    startedAt: null,
    finishedAt: null,
    lastSeq: 0,
    createdAt: now,
    updatedAt: now,
  }
}

describe('plan run runtime service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaState.tx.executionPlan.findFirst.mockResolvedValue({ id: 'execution-plan-1' })
    prismaState.tx.planRun.create.mockResolvedValue(buildPlanRunRow('execution-plan-1'))
    prismaState.tx.planStepRun.createMany.mockResolvedValue({ count: 0 })
  })

  it('links a PlanRun only to an existing ExecutionPlan in the same project', async () => {
    const planRun = await createPlanRun({
      userId: 'user-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      planId: 'execution-plan-1',
      goal: 'write scene',
    })

    expect(planRun.planId).toBe('execution-plan-1')
    expect(prismaState.tx.executionPlan.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'execution-plan-1',
        projectId: 'project-1',
      },
      select: { id: true },
    })
    expect(prismaState.tx.planRun.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        planId: 'execution-plan-1',
      }),
    }))
  })

  it('fails before creating a PlanRun when the supplied planId is not persisted', async () => {
    prismaState.tx.executionPlan.findFirst.mockResolvedValue(null)

    await expect(createPlanRun({
      userId: 'user-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      planId: 'draft_plan_1',
      goal: 'write scene',
    })).rejects.toThrow('PLAN_NOT_FOUND:draft_plan_1')

    expect(prismaState.tx.executionPlan.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'draft_plan_1',
        projectId: 'project-1',
      },
      select: { id: true },
    })
    expect(prismaState.tx.planRun.create).not.toHaveBeenCalled()
  })
})
