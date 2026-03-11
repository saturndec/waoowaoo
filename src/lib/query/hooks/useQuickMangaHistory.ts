'use client'

import { useQuery } from '@tanstack/react-query'

export type QuickMangaHistoryStatus = 'all' | 'success' | 'failed' | 'cancelled'

export type QuickMangaHistoryItem = {
  runId: string
  taskId: string | null
  episodeId: string | null
  createdAt: string
  updatedAt: string
  stage: 'story-to-script' | 'script-to-storyboard'
  status: string
  statusBucket: Exclude<QuickMangaHistoryStatus, 'all'>
  options: {
    enabled: boolean
    preset: string
    layout: string
    colorMode: string
    panelTemplateId: string | null
    style: string | null
  }
  controls: {
    panelTemplateId: string | null
    styleLock: {
      enabled: boolean
      profile: 'auto' | 'line-consistent' | 'ink-contrast' | 'soft-tones'
      strength: number
    }
    chapterContinuity: {
      mode: 'off' | 'chapter-strict' | 'chapter-flex'
      chapterId: string | null
      conflictPolicy: 'balanced' | 'prefer-style-lock' | 'prefer-chapter-context'
    }
  }
  continuity: {
    sourceRunId: string
    sourceStage: 'story-to-script' | 'script-to-storyboard'
    shortcut: 'history-regenerate'
    fallbackContentUsed: boolean
    reusedOptions: {
      preset: string
      layout: string
      colorMode: string
      style: string | null
    }
    reusedControls?: {
      styleLock: {
        enabled: boolean
        profile: 'auto' | 'line-consistent' | 'ink-contrast' | 'soft-tones'
        strength: number
      }
      chapterContinuity: {
        mode: 'off' | 'chapter-strict' | 'chapter-flex'
        chapterId: string | null
        conflictPolicy: 'balanced' | 'prefer-style-lock' | 'prefer-chapter-context'
      }
    }
  } | null
  continuityConflictHint: 'balanced' | 'style-lock-priority' | 'chapter-context-priority'
  preview: {
    inputSnippet: string | null
    outputSnippet: string | null
  }
  errorMessage: string | null
  latestEventType: string | null
  latestEventAt: string | null
}

export function useQuickMangaHistory(params: {
  projectId?: string | null
  status?: QuickMangaHistoryStatus
  limit?: number
  enabled?: boolean
}) {
  const enabled = Boolean(params.enabled ?? true) && Boolean(params.projectId)
  const status = params.status || 'all'
  const limit = typeof params.limit === 'number'
    ? Math.min(Math.max(Math.floor(params.limit), 1), 20)
    : 20

  return useQuery({
    queryKey: ['quick-manga-history', params.projectId || '', status, limit],
    enabled,
    staleTime: 10_000,
    queryFn: async () => {
      const search = new URLSearchParams({
        status,
        limit: String(limit),
      })
      const response = await fetch(`/api/novel-promotion/${params.projectId}/quick-manga/history?${search.toString()}`)
      if (!response.ok) {
        throw new Error('Failed to fetch quick manga history')
      }
      const data = await response.json() as {
        history?: QuickMangaHistoryItem[]
      }
      return Array.isArray(data.history) ? data.history : []
    },
  })
}
