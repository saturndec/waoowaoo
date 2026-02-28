import type { MutableRefObject } from 'react'
import type { RunStreamEvent } from '@/lib/novel-promotion/run-stream/types'
import { isAsyncTaskResponse } from '@/lib/task/client'
import { resolveTaskErrorMessage } from '@/lib/task/error-message'
import { toObject, toTerminalRunResult } from './event-parser'
import { streamSSEBody } from './run-stream-sse-body'
import { fetchRunEventsPage, toRunStreamEventFromRunApi } from './run-event-adapter'
import type { RunResult } from './types'

type RunRequestExecutorArgs = {
  endpointUrl: string
  requestBody: Record<string, unknown>
  controller: AbortController
  taskStreamTimeoutMs: number
  applyAndCapture: (streamEvent: RunStreamEvent) => void
  finalResultRef: MutableRefObject<RunResult | null>
}

const POLL_INTERVAL_MS = 1500
const RUN_EVENTS_LIMIT = 500

function buildFailedResult(runId: string, errorMessage: string): RunResult {
  return {
    runId,
    status: 'failed',
    summary: null,
    payload: null,
    errorMessage,
  }
}

async function waitRunEventsTerminal(args: {
  runId: string
  controller: AbortController
  taskStreamTimeoutMs: number
  applyAndCapture: (streamEvent: RunStreamEvent) => void
}): Promise<RunResult> {
  const startedAt = Date.now()
  let afterSeq = 0

  while (true) {
    if (args.controller.signal.aborted) {
      return buildFailedResult(args.runId, 'aborted')
    }
    if (Date.now() - startedAt > args.taskStreamTimeoutMs) {
      const timeoutMessage = `run stream timeout: ${args.runId}`
      args.applyAndCapture({
        runId: args.runId,
        event: 'run.error',
        ts: new Date().toISOString(),
        status: 'failed',
        message: timeoutMessage,
      })
      return buildFailedResult(args.runId, timeoutMessage)
    }

    try {
      const rows = await fetchRunEventsPage({
        runId: args.runId,
        afterSeq,
        limit: RUN_EVENTS_LIMIT,
      })

      for (const row of rows) {
        if (row.seq <= afterSeq) continue

        if (row.seq > afterSeq + 1) {
          const gapRows = await fetchRunEventsPage({
            runId: args.runId,
            afterSeq,
            limit: RUN_EVENTS_LIMIT,
          })
          if (gapRows.length > 0) {
            for (const gapRow of gapRows) {
              if (gapRow.seq <= afterSeq) continue
              afterSeq = gapRow.seq
              const gapEvent = toRunStreamEventFromRunApi({
                runId: args.runId,
                event: gapRow,
              })
              if (!gapEvent) continue
              args.applyAndCapture(gapEvent)
              const gapTerminal = toTerminalRunResult(gapEvent)
              if (gapTerminal) {
                return { ...gapTerminal, runId: args.runId }
              }
            }
          }
          continue
        }

        afterSeq = row.seq
        const streamEvent = toRunStreamEventFromRunApi({
          runId: args.runId,
          event: row,
        })
        if (!streamEvent) continue
        args.applyAndCapture(streamEvent)
        const terminalResult = toTerminalRunResult(streamEvent)
        if (terminalResult) {
          return {
            ...terminalResult,
            runId: args.runId,
          }
        }
      }
    } catch {
      // transient fetch error, keep polling
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
}

export async function executeRunRequest(args: RunRequestExecutorArgs): Promise<RunResult> {
  try {
    const response = await fetch(args.endpointUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args.requestBody),
      signal: args.controller.signal,
    })

    if (!response.ok) {
      const jsonPayload = await response.clone().json().catch(() => null)
      if (jsonPayload && typeof jsonPayload === 'object') {
        throw new Error(resolveTaskErrorMessage(jsonPayload as Record<string, unknown>, `HTTP ${response.status}`))
      }
      const message = await response.text().catch(() => '')
      throw new Error(message || `HTTP ${response.status}`)
    }

    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('text/event-stream') && response.body) {
      await streamSSEBody({
        responseBody: response.body,
        applyAndCapture: args.applyAndCapture,
      })
    } else {
      const data = await response.json().catch(() => null)
      if (isAsyncTaskResponse(data)) {
        const asyncPayload = toObject(data)
        const runId =
          typeof asyncPayload.runId === 'string' && asyncPayload.runId.trim()
            ? asyncPayload.runId.trim()
            : ''
        if (!runId) {
          throw new Error('async task response missing runId')
        }

        const result = await waitRunEventsTerminal({
          runId,
          controller: args.controller,
          taskStreamTimeoutMs: args.taskStreamTimeoutMs,
          applyAndCapture: args.applyAndCapture,
        })

        args.finalResultRef.current = result
        return result
      }

      const payload = toObject(data)
      const success = payload.success !== false
      const runId = typeof payload.runId === 'string' ? payload.runId : ''
      const result: RunResult = {
        runId,
        status: success ? 'completed' : 'failed',
        summary: payload,
        payload,
        errorMessage: success ? '' : (typeof payload.message === 'string' ? payload.message : 'run failed'),
      }
      args.finalResultRef.current = result
      return result
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      const aborted = args.finalResultRef.current || buildFailedResult('', 'aborted')
      args.finalResultRef.current = aborted
      return aborted
    }

    const message = error instanceof Error ? error.message : String(error)
    args.finalResultRef.current = buildFailedResult('', message)
    throw error
  }

  const fallback = args.finalResultRef.current || buildFailedResult('', 'stream closed without terminal event')
  args.finalResultRef.current = fallback
  return fallback
}
