import { describe, expect, it, vi } from 'vitest'
import { executeRunRequest } from '@/lib/query/hooks/run-stream/run-request-executor'
import type { RunStreamEvent } from '@/lib/novel-promotion/run-stream/types'

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  })
}

describe('run-request-executor run events path', () => {
  it('uses /api/runs/:runId/events when async response includes runId', async () => {
    const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        async: true,
        taskId: 'task_1',
        runId: 'run_1',
      }))
      .mockResolvedValueOnce(jsonResponse({
        runId: 'run_1',
        afterSeq: 0,
        events: [
          {
            seq: 1,
            eventType: 'run.start',
            payload: { message: 'started' },
            createdAt: '2026-02-28T00:00:00.000Z',
          },
          {
            seq: 2,
            eventType: 'step.start',
            stepKey: 'step_a',
            attempt: 1,
            payload: {
              stepTitle: 'Step A',
              stepIndex: 1,
              stepTotal: 1,
            },
            createdAt: '2026-02-28T00:00:01.000Z',
          },
          {
            seq: 3,
            eventType: 'step.chunk',
            stepKey: 'step_a',
            attempt: 1,
            lane: 'text',
            payload: {
              stream: {
                delta: 'hello',
                seq: 1,
              },
            },
            createdAt: '2026-02-28T00:00:01.100Z',
          },
          {
            seq: 4,
            eventType: 'step.complete',
            stepKey: 'step_a',
            attempt: 1,
            payload: {
              text: 'hello',
            },
            createdAt: '2026-02-28T00:00:02.000Z',
          },
          {
            seq: 5,
            eventType: 'run.complete',
            payload: {
              summary: { ok: true },
            },
            createdAt: '2026-02-28T00:00:03.000Z',
          },
        ],
      }))

    const originalFetch = globalThis.fetch
    // @ts-expect-error test override
    globalThis.fetch = fetchMock

    try {
      const captured: RunStreamEvent[] = []
      const controller = new AbortController()
      const result = await executeRunRequest({
        endpointUrl: '/api/novel-promotion/project_1/story-to-script-stream',
        requestBody: { episodeId: 'episode_1' },
        controller,
        taskStreamTimeoutMs: 30_000,
        applyAndCapture: (event) => {
          captured.push(event)
        },
        finalResultRef: { current: null },
      })

      expect(result.status).toBe('completed')
      expect(result.runId).toBe('run_1')
      expect(captured.some((event) => event.event === 'step.chunk' && event.textDelta === 'hello')).toBe(true)
      expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/runs/run_1/events?afterSeq=0&limit=500')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
