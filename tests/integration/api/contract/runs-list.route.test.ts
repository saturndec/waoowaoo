import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authState = vi.hoisted(() => ({ authenticated: true }))
const listPlanRunsMock = vi.hoisted(() => vi.fn())
const createPlanRunMock = vi.hoisted(() => vi.fn())

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
  listPlanRuns: listPlanRunsMock,
  createPlanRun: createPlanRunMock,
}))

describe('api contract - plan runs list route', () => {
  const emptyRouteContext = {
    params: Promise.resolve({}),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    authState.authenticated = true
    listPlanRunsMock.mockResolvedValue([
      {
        id: 'plan-run-1',
        status: 'running',
      },
    ])
  })

  it('lists scoped active plan runs without fixed workflow filters', async () => {
    const { GET } = await import('@/app/api/plan-runs/route')

    const req = buildMockRequest({
      path: '/api/plan-runs?projectId=project-1&episodeId=episode-1&status=queued&status=running&status=canceling&limit=20',
      method: 'GET',
    })
    const res = await GET(req, emptyRouteContext)

    expect(res.status).toBe(200)
    expect(listPlanRunsMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      statuses: ['queued', 'running', 'canceling'],
      limit: 20,
    }))
  })

  it('keeps completed plan run queries as normal list requests', async () => {
    const { GET } = await import('@/app/api/plan-runs/route')

    const req = buildMockRequest({
      path: '/api/plan-runs?projectId=project-1&status=completed&limit=20',
      method: 'GET',
    })
    const res = await GET(req, emptyRouteContext)

    expect(res.status).toBe(200)
    expect(listPlanRunsMock).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      statuses: ['completed'],
      limit: 20,
    }))
  })
})
