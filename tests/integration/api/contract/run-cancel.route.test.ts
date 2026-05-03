import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authState = vi.hoisted(() => ({ authenticated: true }))
const getPlanRunByIdMock = vi.hoisted(() => vi.fn())
const requestPlanRunCancelMock = vi.hoisted(() => vi.fn())
const publishPlanRunEventMock = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('@/lib/api-auth', () => {
  const unauthorized = () => new Response(
    JSON.stringify({ error: { code: 'UNAUTHORIZED' } }),
    { status: 401, headers: { 'content-type': 'application/json' } },
  )

  return {
    isErrorResponse: (value: unknown) => value instanceof Response,
    requireUserAuth: async () => {
      if (!authState.authenticated) return unauthorized()
      return { session: { user: { id: 'user-1' } } }
    },
  }
})

vi.mock('@/lib/plan-run-runtime/service', () => ({
  getPlanRunById: getPlanRunByIdMock,
  requestPlanRunCancel: requestPlanRunCancelMock,
}))

vi.mock('@/lib/plan-run-runtime/publisher', () => ({
  publishPlanRunEvent: publishPlanRunEventMock,
}))

describe('api contract - plan run cancel route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.authenticated = true
    getPlanRunByIdMock.mockResolvedValue({
      id: 'plan-run-1',
      userId: 'user-1',
      projectId: 'project-1',
    })
    requestPlanRunCancelMock.mockResolvedValue({
      id: 'plan-run-1',
      userId: 'user-1',
      projectId: 'project-1',
      status: 'canceling',
    })
  })

  it('marks the plan run canceled and publishes a plan event', async () => {
    const { POST } = await import('@/app/api/plan-runs/[planRunId]/cancel/route')

    const req = buildMockRequest({
      path: '/api/plan-runs/plan-run-1/cancel',
      method: 'POST',
    })
    const res = await POST(req, {
      params: Promise.resolve({ planRunId: 'plan-run-1' }),
    })

    expect(res.status).toBe(200)
    const payload = await res.json() as {
      success: boolean
      planRun: {
        id: string
        status: string
      }
    }
    expect(payload.success).toBe(true)
    expect(payload.planRun).toMatchObject({
      id: 'plan-run-1',
      status: 'canceling',
    })
    expect(publishPlanRunEventMock).toHaveBeenCalledWith(expect.objectContaining({
      planRunId: 'plan-run-1',
      eventType: 'plan.canceled',
    }))
  })
})
