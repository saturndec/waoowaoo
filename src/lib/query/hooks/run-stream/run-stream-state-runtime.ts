'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RunStreamEvent } from '@/lib/novel-promotion/run-stream/types'
import { applyRunStreamEvent } from './state-machine'
import { clearRunSnapshot, loadRunSnapshot, saveRunSnapshot } from './snapshot'
import { subscribeRecoveredRun } from './recovered-run-subscription'
import { executeRunRequest } from './run-request-executor'
import { deriveRunStreamView } from './run-stream-view'
import type { RunResult, RunState, UseRunStreamStateOptions } from './types'

export type {
  RunResult,
  RunState,
  RunStepState,
  UseRunStreamStateOptions,
} from './types'

const TERMINAL_CLEANUP_MS = 15_000
const TASK_STREAM_TIMEOUT_MS = 1000 * 60 * 30
const PROBE_COOLDOWN_MS = 60_000
const probedScopes = new Map<string, number>()

export function useRunStreamState<TParams>(options: UseRunStreamStateOptions<TParams>) {
  const {
    projectId,
    endpoint,
    storageKeyPrefix,
    storageScopeKey,
    buildRequestBody,
    validateParams,
    resolveActiveRunId,
  } = options
  const [runState, setRunState] = useState<RunState | null>(null)
  const runStateRef = useRef<RunState | null>(null)
  const [clock, setClock] = useState(() => Date.now())
  const [isLiveRunning, setIsLiveRunning] = useState(false)
  const [isRecoveredRunning, setIsRecoveredRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const finalResultRef = useRef<RunResult | null>(null)
  const hydratedStorageKeyRef = useRef<string | null>(null)
  const resolveActiveRunIdRef = useRef(resolveActiveRunId)
  const storageKey = useMemo(() => {
    if (storageScopeKey) {
      return `${storageKeyPrefix}:${projectId}:${storageScopeKey}`
    }
    return `${storageKeyPrefix}:${projectId}`
  }, [projectId, storageKeyPrefix, storageScopeKey])

  const applyEvent = useCallback((event: RunStreamEvent) => {
    setRunState((prev) => applyRunStreamEvent(prev, event))
  }, [])

  useEffect(() => {
    runStateRef.current = runState
  }, [runState])

  useEffect(() => {
    resolveActiveRunIdRef.current = resolveActiveRunId
  }, [resolveActiveRunId])

  useEffect(() => {
    if (!projectId) return
    if (hydratedStorageKeyRef.current === storageKey) return
    hydratedStorageKeyRef.current = storageKey
    const snapshotRunState = loadRunSnapshot(storageKey)
    if (!snapshotRunState) return
    setRunState(snapshotRunState)
    if (snapshotRunState.status === 'running') {
      setIsRecoveredRunning(true)
    }
  }, [projectId, storageKey])

  useEffect(() => {
    if (!projectId || !resolveActiveRunIdRef.current) return

    const lastProbed = probedScopes.get(storageKey)
    if (lastProbed && Date.now() - lastProbed < PROBE_COOLDOWN_MS) return
    probedScopes.set(storageKey, Date.now())

    if (runStateRef.current) return
    const existingSnapshot = loadRunSnapshot(storageKey)
    if (existingSnapshot) return

    let cancelled = false
    void (async () => {
      const activeRunId = await resolveActiveRunIdRef.current?.({
        projectId,
        storageScopeKey,
      }).catch(() => null)
      if (cancelled || !activeRunId) return
      const now = Date.now()
      setRunState((prev) => {
        if (prev) return prev
        return {
          runId: activeRunId,
          status: 'running',
          startedAt: now,
          updatedAt: now,
          terminalAt: null,
          errorMessage: '',
          summary: null,
          payload: null,
          stepsById: {},
          stepOrder: [],
          activeStepId: null,
          selectedStepId: null,
        }
      })
      setIsRecoveredRunning(true)
    })()

    return () => {
      cancelled = true
    }
  }, [projectId, storageKey, storageScopeKey])

  useEffect(() => {
    if (!projectId || !isRecoveredRunning || isLiveRunning) return
    const runId = runState?.runId || ''
    if (!runId || runState?.status !== 'running') return

    return subscribeRecoveredRun({
      runId,
      taskStreamTimeoutMs: TASK_STREAM_TIMEOUT_MS,
      applyAndCapture: applyEvent,
      onSettled: () => {
        setIsRecoveredRunning(false)
      },
    })
  }, [
    applyEvent,
    isLiveRunning,
    isRecoveredRunning,
    projectId,
    runState?.runId,
    runState?.status,
  ])

  useEffect(() => {
    if (!isRecoveredRunning) return
    if (!runState) {
      setIsRecoveredRunning(false)
      return
    }
    if (runState.status === 'completed' || runState.status === 'failed') {
      setIsRecoveredRunning(false)
    }
  }, [isRecoveredRunning, runState, runState?.status])

  useEffect(() => {
    if (!projectId) return
    saveRunSnapshot(storageKey, runState)
  }, [projectId, runState, storageKey])

  const run = useCallback(
    async (params: TParams): Promise<RunResult> => {
      if (!projectId) {
        throw new Error('projectId is required')
      }
      validateParams?.(params)

      abortRef.current?.abort()
      setIsRecoveredRunning(false)
      setIsLiveRunning(true)
      const controller = new AbortController()
      abortRef.current = controller
      finalResultRef.current = null

      try {
        const requestBody = buildRequestBody(params)
        return await executeRunRequest({
          endpointUrl: endpoint(projectId),
          requestBody,
          controller,
          taskStreamTimeoutMs: TASK_STREAM_TIMEOUT_MS,
          applyAndCapture: applyEvent,
          finalResultRef,
        })
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null
        }
        setIsLiveRunning(false)
      }
    },
    [
      applyEvent,
      buildRequestBody,
      endpoint,
      projectId,
      validateParams,
    ],
  )

  const stop = useCallback(() => {
    const runningRunId = runState?.status === 'running' ? runState.runId : ''
    if (runningRunId) {
      void fetch(`/api/runs/${runningRunId}/cancel`, {
        method: 'POST',
      }).catch(() => null)
      applyEvent({
        runId: runningRunId,
        event: 'run.error',
        ts: new Date().toISOString(),
        status: 'failed',
        message: 'aborted',
      })
    }
    abortRef.current?.abort()
    abortRef.current = null
    setIsLiveRunning(false)
  }, [applyEvent, runState?.runId, runState?.status])

  const reset = useCallback(() => {
    stop()
    setRunState(null)
    finalResultRef.current = null
    setIsRecoveredRunning(false)
    clearRunSnapshot(storageKey)
  }, [storageKey, stop])

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!runState?.terminalAt) return
    const timer = window.setTimeout(() => {
      setRunState((prev) => {
        if (!prev || !prev.terminalAt) return prev
        if (Date.now() - prev.terminalAt < TERMINAL_CLEANUP_MS) return prev
        return null
      })
    }, TERMINAL_CLEANUP_MS + 100)
    return () => window.clearTimeout(timer)
  }, [runState?.terminalAt])

  const view = useMemo(() => {
    return deriveRunStreamView({
      runState,
      isLiveRunning,
      clock,
    })
  }, [clock, isLiveRunning, runState])

  const selectStep = useCallback((stepId: string) => {
    setRunState((prev) => {
      if (!prev || !prev.stepsById[stepId]) return prev
      return {
        ...prev,
        selectedStepId: stepId,
      }
    })
  }, [])

  return {
    runState,
    runId: runState?.runId || '',
    status: runState?.status || 'idle',
    isRunning: isLiveRunning,
    isRecoveredRunning,
    isVisible: view.isVisible,
    errorMessage: runState?.errorMessage || '',
    summary: runState?.summary || null,
    payload: runState?.payload || null,
    stages: view.stages,
    orderedSteps: view.orderedSteps,
    activeStepId: view.activeStepId,
    selectedStep: view.selectedStep,
    outputText: view.outputText,
    overallProgress: view.overallProgress,
    activeMessage: view.activeMessage,
    run,
    stop,
    reset,
    selectStep,
  }
}
