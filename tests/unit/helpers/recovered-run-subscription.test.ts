import { afterEach, describe, expect, it, vi } from 'vitest'
import { subscribeRecoveredRun } from '@/lib/query/hooks/run-stream/recovered-run-subscription'

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    json: async () => payload,
  }
}

async function waitForCondition(condition: () => boolean, timeoutMs = 1000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('condition not met before timeout')
}

describe('recovered run subscription', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    if (originalFetch) {
      globalThis.fetch = originalFetch
    } else {
      Reflect.deleteProperty(globalThis, 'fetch')
    }
  })

  it('replays run events and keeps recovering when no terminal event is present', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        events: [
          {
            seq: 1,
            eventType: 'step.start',
            stepKey: 'clip_1_phase1',
            attempt: 1,
            payload: {
              stepTitle: '分镜规划',
              stepIndex: 1,
              stepTotal: 4,
              message: 'running',
            },
            createdAt: '2026-02-28T00:00:01.000Z',
          },
        ],
      }),
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const applyAndCapture = vi.fn()
    const onSettled = vi.fn()

    const cleanup = subscribeRecoveredRun({
      runId: 'run-1',
      taskStreamTimeoutMs: 10_000,
      applyAndCapture,
      onSettled,
    })

    await waitForCondition(() => fetchMock.mock.calls.length > 0 && applyAndCapture.mock.calls.length > 0)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/runs/run-1/events?afterSeq=0&limit=500',
      expect.objectContaining({ method: 'GET', cache: 'no-store' }),
    )
    expect(applyAndCapture).toHaveBeenCalledWith(expect.objectContaining({
      event: 'step.start',
      runId: 'run-1',
      stepId: 'clip_1_phase1',
    }))
    expect(onSettled).not.toHaveBeenCalled()
    cleanup()
  })

  it('settles recovery when replay hits terminal run event', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        events: [
          {
            seq: 1,
            eventType: 'run.error',
            payload: {
              message: 'exception TypeError: fetch failed sending request',
            },
            createdAt: '2026-02-28T00:00:02.000Z',
          },
        ],
      }),
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const applyAndCapture = vi.fn()
    const onSettled = vi.fn()

    subscribeRecoveredRun({
      runId: 'run-1',
      taskStreamTimeoutMs: 10_000,
      applyAndCapture,
      onSettled,
    })

    await waitForCondition(() => onSettled.mock.calls.length === 1 && applyAndCapture.mock.calls.length > 0)
    expect(onSettled).toHaveBeenCalledTimes(1)
    expect(applyAndCapture).toHaveBeenCalledWith(expect.objectContaining({
      event: 'run.error',
      runId: 'run-1',
    }))
  })

  it('replays step.chunk output so refresh keeps prior text', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        events: [
          {
            seq: 1,
            eventType: 'step.chunk',
            stepKey: 'clip_1_phase1',
            payload: {
              stream: {
                kind: 'text',
                lane: 'main',
                seq: 1,
                delta: '旧输出',
              },
            },
            createdAt: '2026-02-28T00:00:03.000Z',
          },
        ],
      }),
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const applyAndCapture = vi.fn()
    const onSettled = vi.fn()

    const cleanup = subscribeRecoveredRun({
      runId: 'run-1',
      taskStreamTimeoutMs: 10_000,
      applyAndCapture,
      onSettled,
    })

    await waitForCondition(() => applyAndCapture.mock.calls.some((call) => call[0]?.event === 'step.chunk'))
    expect(applyAndCapture).toHaveBeenCalledWith(expect.objectContaining({
      event: 'step.chunk',
      runId: 'run-1',
      stepId: 'clip_1_phase1',
      textDelta: '旧输出',
    }))
    cleanup()
  })
})
