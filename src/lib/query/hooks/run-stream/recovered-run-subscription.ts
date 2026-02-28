import type { RunStreamEvent } from '@/lib/novel-promotion/run-stream/types'
import { toTerminalRunResult } from './event-parser'
import { fetchRunEventsPage, toRunStreamEventFromRunApi } from './run-event-adapter'

const POLL_INTERVAL_MS = 1500

type SubscribeRecoveredRunArgs = {
  runId: string
  taskStreamTimeoutMs: number
  applyAndCapture: (event: RunStreamEvent) => void
  onSettled: () => void
}

type Cleanup = () => void

export function subscribeRecoveredRun(args: SubscribeRecoveredRunArgs): Cleanup {
  let settled = false
  let polling = false
  let afterSeq = 0
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null

  function cleanup() {
    if (timeoutTimer) {
      clearTimeout(timeoutTimer)
      timeoutTimer = null
    }
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  function settle() {
    if (settled) return
    settled = true
    cleanup()
    args.onSettled()
  }

  async function pollRunEvents() {
    if (settled || polling) return
    polling = true
    try {
      const rows = await fetchRunEventsPage({
        runId: args.runId,
        afterSeq,
      })

      for (const row of rows) {
        if (row.seq <= afterSeq) continue

        if (row.seq > afterSeq + 1) {
          const gapRows = await fetchRunEventsPage({
            runId: args.runId,
            afterSeq,
          })
          for (const gapRow of gapRows) {
            if (gapRow.seq <= afterSeq) continue
            afterSeq = gapRow.seq
            const gapEvent = toRunStreamEventFromRunApi({
              runId: args.runId,
              event: gapRow,
            })
            if (!gapEvent) continue
            args.applyAndCapture(gapEvent)
            if (toTerminalRunResult(gapEvent)) {
              settle()
              return
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
        if (toTerminalRunResult(streamEvent)) {
          settle()
          return
        }
      }
    } finally {
      polling = false
    }
  }

  timeoutTimer = setTimeout(() => {
    settle()
  }, args.taskStreamTimeoutMs)

  pollTimer = setInterval(() => {
    void pollRunEvents()
  }, POLL_INTERVAL_MS)

  void pollRunEvents()

  return cleanup
}
