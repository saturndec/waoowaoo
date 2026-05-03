import { prisma } from '@/lib/prisma'
import { DomainValidationError, type DomainMutationContext } from '@/lib/domain/shared'

function readOperationIdFromNormalizedInput(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const operationId = (value as Record<string, unknown>).operationId
  return typeof operationId === 'string' && operationId.trim() ? operationId.trim() : null
}

export async function assertApprovedDomainMutationContext(input: DomainMutationContext) {
  if (!input.planId?.trim()) return

  const plan = await prisma.executionPlan.findUnique({
    where: { id: input.planId },
    include: {
      command: {
        select: {
          normalizedInput: true,
        },
      },
      approvals: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          status: true,
        },
      },
    },
  })

  if (!plan) {
    throw new DomainValidationError(`execution plan not found: ${input.planId}`)
  }

  const allowedStatuses = new Set(['approved', 'running', 'completed'])
  if (!allowedStatuses.has(plan.status)) {
    throw new DomainValidationError(`execution plan is not executable: ${plan.status}`)
  }

  if (plan.requiresApproval) {
    const latestApproval = plan.approvals[0] || null
    if (!latestApproval || latestApproval.status !== 'approved') {
      throw new DomainValidationError('execution plan approval is missing or not approved')
    }
  }

  const expectedOperationId = readOperationIdFromNormalizedInput(plan.command.normalizedInput)
  if (expectedOperationId && input.operationId && expectedOperationId !== input.operationId) {
    throw new DomainValidationError(
      `execution plan operation mismatch: expected ${expectedOperationId}, received ${input.operationId}`,
    )
  }
}
