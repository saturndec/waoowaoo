import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

type RouteContext = {
  params: Promise<{ planRunId: string; stepKey: string }>
}

const authState = vi.hoisted(() => ({ authenticated: true }))
const retryPlanStepMock = vi.hoisted(() => vi.fn())

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
  retryPlanStep: retryPlanStepMock,
}))

describe('api contract - plan run step retry route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.authenticated = true

    retryPlanStepMock.mockResolvedValue({
      planRun: { id: 'plan-run-1' },
      invalidatedStepKeys: ['screenplay_clip_2', 'finalize_storyboard'],
    })
  })

  it('rejects retry when step is not failed', async () => {
    retryPlanStepMock.mockRejectedValue(new Error('PLAN_STEP_NOT_FAILED'))
    const route = await import('@/app/api/plan-runs/[planRunId]/steps/[stepKey]/retry/route')

    const req = buildMockRequest({
      path: '/api/plan-runs/plan-run-1/steps/screenplay_clip_2/retry',
      method: 'POST',
    })
    const res = await route.POST(req, {
      params: Promise.resolve({ planRunId: 'plan-run-1', stepKey: 'screenplay_clip_2' }),
    } as RouteContext)

    expect(res.status).toBe(400)
  })

  it('resets a failed plan step and its downstream steps without submitting a fixed task', async () => {
    const route = await import('@/app/api/plan-runs/[planRunId]/steps/[stepKey]/retry/route')

    const req = buildMockRequest({
      path: '/api/plan-runs/plan-run-1/steps/screenplay_clip_2/retry',
      method: 'POST',
      body: { reason: 'manual retry' },
    })
    const res = await route.POST(req, {
      params: Promise.resolve({ planRunId: 'plan-run-1', stepKey: 'screenplay_clip_2' }),
    } as RouteContext)

    expect(res.status).toBe(200)
    const payload = await res.json() as {
      success: boolean
      planRunId: string
      stepKey: string
      invalidatedStepKeys: string[]
    }
    expect(payload.success).toBe(true)
    expect(payload.planRunId).toBe('plan-run-1')
    expect(payload.stepKey).toBe('screenplay_clip_2')
    expect(payload.invalidatedStepKeys).toEqual(['screenplay_clip_2', 'finalize_storyboard'])

    expect(retryPlanStepMock).toHaveBeenCalledWith(expect.objectContaining({
      planRunId: 'plan-run-1',
      userId: 'user-1',
      stepKey: 'screenplay_clip_2',
    }))
  })
})
