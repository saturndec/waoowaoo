import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_STATUS } from '@/lib/task/types'
import { buildMockRequest } from '../../../helpers/request'

type AuthState = {
  authenticated: boolean
}

type RouteContext = {
  params: Promise<Record<string, string>>
}

type TaskRecord = {
  id: string
  userId: string
  projectId: string
  type: string
  targetType: string
  targetId: string
  status: string
  errorCode: string | null
  errorMessage: string | null
}

const authState = vi.hoisted<AuthState>(() => ({
  authenticated: true,
}))

const queryTasksMock = vi.hoisted(() => vi.fn())
const dismissFailedTasksMock = vi.hoisted(() => vi.fn())
const getTaskByIdMock = vi.hoisted(() => vi.fn())
const cancelTaskMock = vi.hoisted(() => vi.fn())
const removeTaskJobMock = vi.hoisted(() => vi.fn(async () => true))
const publishTaskEventMock = vi.hoisted(() => vi.fn(async () => undefined))
const queryTaskTargetStatesMock = vi.hoisted(() => vi.fn())
const withPrismaRetryMock = vi.hoisted(() => vi.fn(async <T>(fn: () => Promise<T>) => await fn()))
const listEventsAfterMock = vi.hoisted(() => vi.fn(async () => []))
const listTaskLifecycleEventsMock = vi.hoisted(() => vi.fn(async () => []))
const addChannelListenerMock = vi.hoisted(() => vi.fn(async () => async () => undefined))
const getRunByIdMock = vi.hoisted(() => vi.fn())
const requestRunCancelMock = vi.hoisted(() => vi.fn())
const publishRunEventMock = vi.hoisted(() => vi.fn(async () => undefined))
const listRunEventsAfterSeqMock = vi.hoisted(() => vi.fn(async () => []))
const subscriberState = vi.hoisted(() => ({
  listener: null as ((message: string) => void) | null,
}))

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
    requireProjectAuthLight: async (projectId: string) => {
      if (!authState.authenticated) return unauthorized()
      return {
        session: { user: { id: 'user-1' } },
        project: { id: projectId, userId: 'user-1' },
      }
    },
  }
})

vi.mock('@/lib/task/service', () => ({
  queryTasks: queryTasksMock,
  dismissFailedTasks: dismissFailedTasksMock,
  getTaskById: getTaskByIdMock,
  cancelTask: cancelTaskMock,
}))

vi.mock('@/lib/task/queues', () => ({
  removeTaskJob: removeTaskJobMock,
}))

vi.mock('@/lib/task/publisher', () => ({
  publishTaskEvent: publishTaskEventMock,
  getProjectChannel: vi.fn((projectId: string) => `project:${projectId}`),
  listEventsAfter: listEventsAfterMock,
  listTaskLifecycleEvents: listTaskLifecycleEventsMock,
}))

vi.mock('@/lib/task/state-service', () => ({
  queryTaskTargetStates: queryTaskTargetStatesMock,
}))

vi.mock('@/lib/prisma-retry', () => ({
  withPrismaRetry: withPrismaRetryMock,
}))

vi.mock('@/lib/sse/shared-subscriber', () => ({
  getSharedSubscriber: vi.fn(() => ({
    addChannelListener: addChannelListenerMock,
  })),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    task: {
      findMany: vi.fn(async () => []),
    },
  },
}))

vi.mock('@/lib/run-runtime/service', () => ({
  getRunById: getRunByIdMock,
  requestRunCancel: requestRunCancelMock,
  listRunEventsAfterSeq: listRunEventsAfterSeqMock,
}))

vi.mock('@/lib/run-runtime/publisher', () => ({
  publishRunEvent: publishRunEventMock,
}))

const baseTask: TaskRecord = {
  id: 'task-1',
  userId: 'user-1',
  projectId: 'project-1',
  type: 'IMAGE_CHARACTER',
  targetType: 'CharacterAppearance',
  targetId: 'appearance-1',
  status: TASK_STATUS.FAILED,
  errorCode: null,
  errorMessage: null,
}

describe('api contract - task infra routes (behavior)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.authenticated = true
    subscriberState.listener = null

    queryTasksMock.mockResolvedValue([baseTask])
    dismissFailedTasksMock.mockResolvedValue(1)
    getTaskByIdMock.mockResolvedValue(baseTask)
    cancelTaskMock.mockResolvedValue({
      task: {
        ...baseTask,
        status: TASK_STATUS.FAILED,
        errorCode: 'TASK_CANCELLED',
        errorMessage: 'Task cancelled by user',
      },
      cancelled: true,
    })
    queryTaskTargetStatesMock.mockResolvedValue([
      {
        targetType: 'CharacterAppearance',
        targetId: 'appearance-1',
        active: true,
        status: TASK_STATUS.PROCESSING,
        taskId: 'task-1',
        updatedAt: new Date().toISOString(),
      },
    ])
    addChannelListenerMock.mockImplementation(async (_channel: string, listener: (message: string) => void) => {
      subscriberState.listener = listener
      return async () => undefined
    })
    listTaskLifecycleEventsMock.mockResolvedValue([])
    getRunByIdMock.mockResolvedValue({
      id: 'run-1',
      userId: 'user-1',
      projectId: 'project-1',
      taskId: 'task-1',
      status: 'running',
    })
    requestRunCancelMock.mockResolvedValue({
      id: 'run-1',
      userId: 'user-1',
      projectId: 'project-1',
      taskId: 'task-1',
      status: 'canceling',
    })
    listRunEventsAfterSeqMock.mockResolvedValue([])
  })

  it('GET /api/tasks: unauthenticated -> 401; authenticated -> 200 with caller-owned tasks', async () => {
    const { GET } = await import('@/app/api/tasks/route')

    authState.authenticated = false
    const unauthorizedReq = buildMockRequest({
      path: '/api/tasks',
      method: 'GET',
      query: { projectId: 'project-1', limit: 20 },
    })
    const unauthorizedRes = await GET(unauthorizedReq)
    expect(unauthorizedRes.status).toBe(401)

    authState.authenticated = true
    const req = buildMockRequest({
      path: '/api/tasks',
      method: 'GET',
      query: { projectId: 'project-1', limit: 20, targetId: 'appearance-1' },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)

    const payload = await res.json() as { tasks: TaskRecord[] }
    expect(payload.tasks).toHaveLength(1)
    expect(payload.tasks[0]?.id).toBe('task-1')
    expect(queryTasksMock).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      targetId: 'appearance-1',
      limit: 20,
    }))
  })

  it('POST /api/tasks/dismiss: invalid params -> 400; success -> dismissed count', async () => {
    const { POST } = await import('@/app/api/tasks/dismiss/route')

    const invalidReq = buildMockRequest({
      path: '/api/tasks/dismiss',
      method: 'POST',
      body: { taskIds: [] },
    })
    const invalidRes = await POST(invalidReq)
    expect(invalidRes.status).toBe(400)

    const req = buildMockRequest({
      path: '/api/tasks/dismiss',
      method: 'POST',
      body: { taskIds: ['task-1', 'task-2'] },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)

    const payload = await res.json() as { success: boolean; dismissed: number }
    expect(payload.success).toBe(true)
    expect(payload.dismissed).toBe(1)
    expect(dismissFailedTasksMock).toHaveBeenCalledWith(['task-1', 'task-2'], 'user-1')
  })

  it('POST /api/task-target-states: validates payload and returns queried states', async () => {
    const { POST } = await import('@/app/api/task-target-states/route')

    const invalidReq = buildMockRequest({
      path: '/api/task-target-states',
      method: 'POST',
      body: { projectId: 'project-1' },
    })
    const invalidRes = await POST(invalidReq)
    expect(invalidRes.status).toBe(400)

    const req = buildMockRequest({
      path: '/api/task-target-states',
      method: 'POST',
      body: {
        projectId: 'project-1',
        targets: [
          {
            targetType: 'CharacterAppearance',
            targetId: 'appearance-1',
            types: ['IMAGE_CHARACTER'],
          },
        ],
      },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)

    const payload = await res.json() as { states: Array<Record<string, unknown>> }
    expect(payload.states).toHaveLength(1)
    expect(withPrismaRetryMock).toHaveBeenCalledTimes(1)
    expect(queryTaskTargetStatesMock).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      targets: [
        {
          targetType: 'CharacterAppearance',
          targetId: 'appearance-1',
          types: ['IMAGE_CHARACTER'],
        },
      ],
    })
  })

  it('GET /api/tasks/[taskId]: enforces ownership and returns task detail', async () => {
    const route = await import('@/app/api/tasks/[taskId]/route')

    authState.authenticated = false
    const unauthorizedReq = buildMockRequest({ path: '/api/tasks/task-1', method: 'GET' })
    const unauthorizedRes = await route.GET(unauthorizedReq, { params: Promise.resolve({ taskId: 'task-1' }) })
    expect(unauthorizedRes.status).toBe(401)

    authState.authenticated = true
    getTaskByIdMock.mockResolvedValueOnce({ ...baseTask, userId: 'other-user' })
    const notFoundReq = buildMockRequest({ path: '/api/tasks/task-1', method: 'GET' })
    const notFoundRes = await route.GET(notFoundReq, { params: Promise.resolve({ taskId: 'task-1' }) })
    expect(notFoundRes.status).toBe(404)

    const req = buildMockRequest({ path: '/api/tasks/task-1', method: 'GET' })
    const res = await route.GET(req, { params: Promise.resolve({ taskId: 'task-1' }) })
    expect(res.status).toBe(200)

    const payload = await res.json() as { task: TaskRecord }
    expect(payload.task.id).toBe('task-1')
  })

  it('GET /api/tasks/[taskId]?includeEvents=1: returns lifecycle events for refresh replay', async () => {
    const route = await import('@/app/api/tasks/[taskId]/route')
    const replayEvents = [
      {
        id: '11',
        type: 'task.lifecycle',
        taskId: 'task-1',
        projectId: 'project-1',
        userId: 'user-1',
        ts: new Date().toISOString(),
        taskType: 'IMAGE_CHARACTER',
        targetType: 'CharacterAppearance',
        targetId: 'appearance-1',
        episodeId: null,
        payload: {
          lifecycleType: 'processing',
          stepId: 'clip_1_phase1',
          stepTitle: '分镜规划',
          stepIndex: 1,
          stepTotal: 3,
          message: 'running',
        },
      },
    ]
    listTaskLifecycleEventsMock.mockResolvedValueOnce(replayEvents)

    const req = buildMockRequest({
      path: '/api/tasks/task-1',
      method: 'GET',
      query: { includeEvents: '1', eventsLimit: '1200' },
    })
    const res = await route.GET(req, { params: Promise.resolve({ taskId: 'task-1' }) })
    expect(res.status).toBe(200)

    const payload = await res.json() as { task: TaskRecord; events: Array<Record<string, unknown>> }
    expect(payload.task.id).toBe('task-1')
    expect(payload.events).toHaveLength(1)
    expect(payload.events[0]?.id).toBe('11')
    expect(listTaskLifecycleEventsMock).toHaveBeenCalledWith('task-1', 1200)
  })

  it('DELETE /api/tasks/[taskId]: cancellation publishes cancelled event payload', async () => {
    const { DELETE } = await import('@/app/api/tasks/[taskId]/route')

    const req = buildMockRequest({ path: '/api/tasks/task-1', method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ taskId: 'task-1' }) } as RouteContext)
    expect(res.status).toBe(200)

    expect(removeTaskJobMock).toHaveBeenCalledWith('task-1')
    expect(publishTaskEventMock).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-1',
      projectId: 'project-1',
      payload: expect.objectContaining({
        cancelled: true,
        stage: 'cancelled',
      }),
    }))
  })

  it('GET /api/sse: missing projectId -> 400; unauthenticated with projectId -> 401', async () => {
    const { GET } = await import('@/app/api/sse/route')

    const invalidReq = buildMockRequest({ path: '/api/sse', method: 'GET' })
    const invalidRes = await GET(invalidReq)
    expect(invalidRes.status).toBe(400)

    authState.authenticated = false
    const unauthorizedReq = buildMockRequest({
      path: '/api/sse',
      method: 'GET',
      query: { projectId: 'project-1' },
    })
    const unauthorizedRes = await GET(unauthorizedReq)
    expect(unauthorizedRes.status).toBe(401)
  })

  it('GET /api/sse: authenticated replay request returns SSE stream and replays missed events', async () => {
    const { GET } = await import('@/app/api/sse/route')

    listEventsAfterMock.mockResolvedValueOnce([
      {
        id: '4',
        type: 'task.lifecycle',
        taskId: 'task-1',
        projectId: 'project-1',
        userId: 'user-1',
        ts: new Date().toISOString(),
        taskType: 'IMAGE_CHARACTER',
        targetType: 'CharacterAppearance',
        targetId: 'appearance-1',
        episodeId: null,
        payload: { lifecycleType: 'created' },
      },
    ])

    const req = buildMockRequest({
      path: '/api/sse',
      method: 'GET',
      query: { projectId: 'project-1' },
      headers: { 'last-event-id': '3' },
    })
    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect(listEventsAfterMock).toHaveBeenCalledWith('project-1', 3, 5000)
    expect(addChannelListenerMock).toHaveBeenCalledWith('project:project-1', expect.any(Function))

    const reader = res.body?.getReader()
    expect(reader).toBeTruthy()
    const firstChunk = await reader!.read()
    expect(firstChunk.done).toBe(false)
    const decoded = new TextDecoder().decode(firstChunk.value)
    expect(decoded).toContain('event:')
    await reader!.cancel()
  })

  it('GET /api/sse: channel lifecycle stream includes terminal completed event', async () => {
    const { GET } = await import('@/app/api/sse/route')
    listEventsAfterMock.mockResolvedValueOnce([])

    const req = buildMockRequest({
      path: '/api/sse',
      method: 'GET',
      query: { projectId: 'project-1' },
      headers: { 'last-event-id': '10' },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)

    const listener = subscriberState.listener
    expect(listener).toBeTruthy()

    listener!(JSON.stringify({
      id: '11',
      type: 'task.lifecycle',
      taskId: 'task-1',
      projectId: 'project-1',
      userId: 'user-1',
      ts: new Date().toISOString(),
      taskType: 'IMAGE_CHARACTER',
      targetType: 'CharacterAppearance',
      targetId: 'appearance-1',
      episodeId: null,
      payload: { lifecycleType: 'processing', progress: 60 },
    }))
    listener!(JSON.stringify({
      id: '12',
      type: 'task.lifecycle',
      taskId: 'task-1',
      projectId: 'project-1',
      userId: 'user-1',
      ts: new Date().toISOString(),
      taskType: 'IMAGE_CHARACTER',
      targetType: 'CharacterAppearance',
      targetId: 'appearance-1',
      episodeId: null,
      payload: { lifecycleType: 'completed', progress: 100 },
    }))

    const reader = res.body?.getReader()
    expect(reader).toBeTruthy()
    const chunk1 = await reader!.read()
    const chunk2 = await reader!.read()
    const merged = `${new TextDecoder().decode(chunk1.value)}${new TextDecoder().decode(chunk2.value)}`

    expect(merged).toContain('"lifecycleType":"processing"')
    expect(merged).toContain('"lifecycleType":"completed"')
    expect(merged).toContain('"taskId":"task-1"')
    await reader!.cancel()
  })

  it('GET /api/runs/[runId]/events: returns ordered run events for replay offset', async () => {
    const { GET } = await import('@/app/api/runs/[runId]/events/route')
    listRunEventsAfterSeqMock.mockResolvedValueOnce([
      {
        seq: 11,
        eventType: 'step.start',
        stepKey: 'clip_1_phase1',
        payload: { message: 'running' },
      },
    ])

    const req = buildMockRequest({
      path: '/api/runs/run-1/events',
      method: 'GET',
      query: { afterSeq: '10', limit: '50' },
    })
    const res = await GET(req, { params: Promise.resolve({ runId: 'run-1' }) })

    expect(res.status).toBe(200)
    expect(listRunEventsAfterSeqMock).toHaveBeenCalledWith({
      runId: 'run-1',
      userId: 'user-1',
      afterSeq: 10,
      limit: 50,
    })

    const payload = await res.json() as { runId: string; afterSeq: number; events: Array<{ seq: number; eventType: string }> }
    expect(payload.runId).toBe('run-1')
    expect(payload.afterSeq).toBe(10)
    expect(payload.events[0]?.seq).toBe(11)
    expect(payload.events[0]?.eventType).toBe('step.start')
  })

  it('POST /api/runs/[runId]/cancel: remains idempotent for already-canceling run', async () => {
    const { POST } = await import('@/app/api/runs/[runId]/cancel/route')
    getRunByIdMock.mockResolvedValueOnce({
      id: 'run-1',
      userId: 'user-1',
      projectId: 'project-1',
      taskId: 'task-1',
      status: 'canceling',
    })

    const req = buildMockRequest({
      path: '/api/runs/run-1/cancel',
      method: 'POST',
    })
    const res = await POST(req, { params: Promise.resolve({ runId: 'run-1' }) })

    expect(res.status).toBe(200)
    expect(requestRunCancelMock).not.toHaveBeenCalled()
    expect(cancelTaskMock).not.toHaveBeenCalled()
    expect(publishRunEventMock).not.toHaveBeenCalled()

    const payload = await res.json() as { success: boolean; run: { status: string } }
    expect(payload.success).toBe(true)
    expect(payload.run.status).toBe('canceling')
  })
})
