import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  executionPlan: {
    findUnique: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

import { assertApprovedDomainMutationContext } from '@/lib/domain/approvals/guard'

describe('domain approval guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows mutation when no planId is provided', async () => {
    await expect(assertApprovedDomainMutationContext({
      actor: 'operation',
      operationId: 'write_screenplay',
      runId: 'run-1',
      idempotencyKey: 'run-1:full',
    })).resolves.toBeUndefined()
  })

  it('fails when plan is not executable yet', async () => {
    prismaMock.executionPlan.findUnique.mockResolvedValue({
      id: 'plan-1',
      status: 'awaiting_approval',
      requiresApproval: true,
      command: {
        normalizedInput: {
          operationId: 'write_screenplay',
        },
      },
      approvals: [{ status: 'pending' }],
    })

    await expect(assertApprovedDomainMutationContext({
      actor: 'operation',
      operationId: 'write_screenplay',
      runId: 'run-1',
      planId: 'plan-1',
      idempotencyKey: 'run-1:full',
    })).rejects.toThrow('execution plan is not executable')
  })

  it('fails when operation id mismatches the approved plan', async () => {
    prismaMock.executionPlan.findUnique.mockResolvedValue({
      id: 'plan-1',
      status: 'approved',
      requiresApproval: true,
      command: {
        normalizedInput: {
          operationId: 'write_screenplay',
        },
      },
      approvals: [{ status: 'approved' }],
    })

    await expect(assertApprovedDomainMutationContext({
      actor: 'operation',
      operationId: 'finalize_storyboard',
      runId: 'run-1',
      planId: 'plan-1',
      idempotencyKey: 'run-1:full',
    })).rejects.toThrow('execution plan operation mismatch')
  })

  it('passes when approved plan and operation match mutation context', async () => {
    prismaMock.executionPlan.findUnique.mockResolvedValue({
      id: 'plan-1',
      status: 'running',
      requiresApproval: true,
      command: {
        normalizedInput: {
          operationId: 'finalize_storyboard',
        },
      },
      approvals: [{ status: 'approved' }],
    })

    await expect(assertApprovedDomainMutationContext({
      actor: 'operation',
      operationId: 'finalize_storyboard',
      runId: 'run-1',
      planId: 'plan-1',
      idempotencyKey: 'run-1:full',
    })).resolves.toBeUndefined()
  })
})
