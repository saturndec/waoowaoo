import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authState = vi.hoisted(() => ({
  authenticated: true,
}))

const executorMock = vi.hoisted(() => ({
  approveProjectPlan: vi.fn(),
  rejectProjectPlan: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => {
  const unauthorized = () => new Response(
    JSON.stringify({ error: { code: 'UNAUTHORIZED' } }),
    { status: 401, headers: { 'content-type': 'application/json' } },
  )

  return {
    isErrorResponse: (value: unknown) => value instanceof Response,
    requireProjectAuth: async (projectId: string) => {
      if (!authState.authenticated) return unauthorized()
      return {
        session: { user: { id: 'user-1' } },
        project: { id: projectId, userId: 'user-1' },
      }
    },
  }
})

vi.mock('@/lib/command-center/executor', () => executorMock)

import { POST as approvePost } from '@/app/api/projects/[projectId]/plans/[planId]/approve/route'
import { POST as rejectPost } from '@/app/api/projects/[projectId]/plans/[planId]/reject/route'

describe('api contract - plan approval routes', () => {
  beforeEach(() => {
    authState.authenticated = true
    vi.clearAllMocks()
  })

  it('POST /projects/[projectId]/plans/[planId]/approve -> approves command-center plan', async () => {
    executorMock.approveProjectPlan.mockResolvedValueOnce({
      commandId: 'command-1',
      planId: 'plan-1',
      linkedTaskId: 'task-1',
      status: 'running',
      summary: 'summary',
      steps: [{ skillId: 's1' }],
    })

    const res = await approvePost(
      buildMockRequest({
        path: '/api/projects/project-1/plans/plan-1/approve',
        method: 'POST',
        body: {},
      }),
      { params: Promise.resolve({ projectId: 'project-1', planId: 'plan-1' }) },
    )

    expect(res.status).toBe(200)
    expect(executorMock.approveProjectPlan).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      planId: 'plan-1',
    }))

    await expect(res.json()).resolves.toEqual(expect.objectContaining({
      success: true,
      commandId: 'command-1',
      planId: 'plan-1',
      taskId: 'task-1',
      status: 'running',
    }))
  })

  it('POST /projects/[projectId]/plans/[planId]/reject -> rejects command-center plan with note', async () => {
    executorMock.rejectProjectPlan.mockResolvedValueOnce({
      commandId: 'command-1',
      planId: 'plan-1',
      status: 'rejected',
      summary: 'summary',
      steps: [],
    })

    const res = await rejectPost(
      buildMockRequest({
        path: '/api/projects/project-1/plans/plan-1/reject',
        method: 'POST',
        body: {
          note: 'no',
        },
      }),
      { params: Promise.resolve({ projectId: 'project-1', planId: 'plan-1' }) },
    )

    expect(res.status).toBe(200)
    expect(executorMock.rejectProjectPlan).toHaveBeenCalledWith(expect.objectContaining({
      planId: 'plan-1',
      note: 'no',
    }))
  })
})
