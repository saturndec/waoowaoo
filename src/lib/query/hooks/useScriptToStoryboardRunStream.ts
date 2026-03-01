'use client'

import { useRunStreamState, type RunResult } from './useRunStreamState'
import { TASK_TYPE } from '@/lib/task/types'

export type ScriptToStoryboardRunParams = {
  episodeId: string
  model?: string
  temperature?: number
  reasoning?: boolean
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high'
}

export type ScriptToStoryboardRunResult = RunResult

type UseScriptToStoryboardRunStreamOptions = {
  projectId: string
  episodeId?: string | null
  locale: string
}

export function useScriptToStoryboardRunStream({ projectId, episodeId, locale }: UseScriptToStoryboardRunStreamOptions) {
  return useRunStreamState<ScriptToStoryboardRunParams>({
    projectId,
    endpoint: (pid) => `/api/novel-promotion/${pid}/script-to-storyboard-stream`,
    storageKeyPrefix: 'novel-promotion:script-to-storyboard-run',
    storageScopeKey: episodeId || undefined,
    resolveActiveRunId: async ({ projectId: pid, storageScopeKey }) => {
      if (!storageScopeKey) return null
      const search = new URLSearchParams({
        projectId: pid,
        workflowType: TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN,
        targetType: 'NovelPromotionEpisode',
        targetId: storageScopeKey,
        episodeId: storageScopeKey,
        limit: '20',
      })
      search.append('status', 'queued')
      search.append('status', 'running')
      search.append('status', 'canceling')
      search.set('_v', '2')
      const response = await fetch(`/api/runs?${search.toString()}`, {
        method: 'GET',
        cache: 'no-store',
      })
      if (!response.ok) return null
      const data = await response.json().catch(() => null)
      const runs = data && typeof data === 'object' && Array.isArray((data as { runs?: unknown[] }).runs)
        ? (data as { runs: Array<{ id?: unknown; targetType?: unknown; targetId?: unknown; status?: unknown }> }).runs
        : []
      for (const run of runs) {
        if (!run || typeof run.id !== 'string' || !run.id) continue
        return run.id
      }
      return null
    },
    validateParams: (params) => {
      if (!params.episodeId) {
        throw new Error('episodeId is required')
      }
    },
    buildRequestBody: (params) => ({
      episodeId: params.episodeId,
      model: params.model || undefined,
      temperature: params.temperature,
      reasoning: params.reasoning,
      reasoningEffort: params.reasoningEffort,
      async: true,
      displayMode: 'detail',
      locale,
      meta: {
        locale,
      },
    }),
  })
}
