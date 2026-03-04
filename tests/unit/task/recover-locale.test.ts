import { beforeEach, describe, expect, it, vi } from 'vitest'

const graphRunFindUniqueMock = vi.hoisted(() => vi.fn())
const taskEventFindManyMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/prisma', () => ({
  prisma: {
    graphRun: {
      findUnique: graphRunFindUniqueMock,
    },
    taskEvent: {
      findMany: taskEventFindManyMock,
    },
  },
}))

import { normalizeTaskPayloadLocale, resolveRecoverableTaskLocale } from '@/lib/task/recover-locale'

describe('task recover locale', () => {
  beforeEach(() => {
    graphRunFindUniqueMock.mockReset()
    taskEventFindManyMock.mockReset()
  })

  it('优先使用 payload 中已有的 locale', async () => {
    const locale = await resolveRecoverableTaskLocale({
      taskId: 'task-1',
      payload: {
        meta: {
          locale: 'zh',
        },
      },
    })

    expect(locale).toBe('zh')
    expect(graphRunFindUniqueMock).not.toHaveBeenCalled()
    expect(taskEventFindManyMock).not.toHaveBeenCalled()
  })

  it('payload 缺失 locale 时可从 graph run input 恢复', async () => {
    graphRunFindUniqueMock
      .mockResolvedValueOnce({
        input: {
          meta: {
            locale: 'en',
          },
        },
      })

    const locale = await resolveRecoverableTaskLocale({
      taskId: 'task-2',
      payload: {
        runId: 'run-2',
      },
    })

    expect(locale).toBe('en')
    expect(graphRunFindUniqueMock).toHaveBeenCalledWith({
      where: { id: 'run-2' },
      select: { input: true },
    })
  })

  it('graph run 缺失时从 task events 恢复 locale', async () => {
    graphRunFindUniqueMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
    taskEventFindManyMock.mockResolvedValueOnce([
      {
        payload: {
          stage: 'running',
        },
      },
      {
        payload: {
          meta: {
            locale: 'zh',
          },
        },
      },
    ])

    const locale = await resolveRecoverableTaskLocale({
      taskId: 'task-3',
      payload: {},
    })

    expect(locale).toBe('zh')
    expect(taskEventFindManyMock).toHaveBeenCalledWith({
      where: { taskId: 'task-3' },
      orderBy: { id: 'desc' },
      take: 10,
      select: { payload: true },
    })
  })

  it('normalizeTaskPayloadLocale 会补齐顶层与 meta.locale', () => {
    const normalized = normalizeTaskPayloadLocale(
      {
        runId: 'run-4',
        meta: {
          route: '/api/foo',
        },
      },
      'en',
    )

    expect(normalized.locale).toBe('en')
    expect(normalized.meta).toEqual({
      route: '/api/foo',
      locale: 'en',
    })
    expect(normalized.runId).toBe('run-4')
  })
})

