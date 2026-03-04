import { afterEach, describe, expect, it, vi } from 'vitest'
import { waitForTaskResult } from '@/lib/task/client'

describe('waitForTaskResult 队列超时保护', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('任务长期 queued 时停止轮询并抛错', async () => {
    vi.useFakeTimers()

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        task: {
          id: 'task-queued-timeout',
          status: 'queued',
        },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const pending = waitForTaskResult('task-queued-timeout', {
      intervalMs: 10,
      maxQueuedMs: 30,
    })
    const pendingAssertion = expect(pending).rejects.toThrow('任务排队超时')

    await vi.advanceTimersByTimeAsync(120)

    await pendingAssertion
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1)
  })

  it('未配置 maxQueuedMs 时不会触发排队超时', async () => {
    vi.useFakeTimers()

    const fetchMock = vi.fn(async () => {
      if (fetchMock.mock.calls.length >= 3) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            task: {
              id: 'task-queued-no-timeout',
              status: 'completed',
              result: { success: true },
            },
          }),
        }
      }
      return {
        ok: true,
        json: async () => ({
          success: true,
          task: {
            id: 'task-queued-no-timeout',
            status: 'queued',
          },
        }),
      }
    })
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const pending = waitForTaskResult('task-queued-no-timeout', {
      intervalMs: 10,
    })

    await vi.advanceTimersByTimeAsync(80)
    await expect(pending).resolves.toEqual({ success: true })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
