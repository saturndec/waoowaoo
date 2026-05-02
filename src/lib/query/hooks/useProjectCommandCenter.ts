'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-fetch'
import { queryKeys } from '../keys'
import { resolveTaskErrorMessage } from '@/lib/task/error-message'
import type { CommandListItem, CommandStatus } from '@/lib/command-center/types'
import type { ProjectContextSnapshot } from '@/lib/project-context/types'

interface ProjectCommandsResponse {
  commands: CommandListItem[]
}

interface ProjectContextResponse {
  context: ProjectContextSnapshot
}

interface CommandMutationResult {
  success: boolean
  async?: boolean
  commandId: string
  planId: string
  taskId?: string
  runId?: string
  status: CommandStatus
  summary: string
}

export function useProjectCommands(projectId: string | null, episodeId?: string | null) {
  return useQuery({
    queryKey: queryKeys.project.commands(projectId || '', episodeId || ''),
    queryFn: async () => {
      if (!projectId) throw new Error('projectId is required')
      const search = new URLSearchParams()
      if (episodeId) search.set('episodeId', episodeId)
      search.set('limit', '20')
      const response = await apiFetch(`/api/projects/${projectId}/commands?${search.toString()}`)
      if (!response.ok) {
        const error = await response.json().catch(() => null)
        throw new Error(resolveTaskErrorMessage(error, 'Failed to load project commands'))
      }
      const data = await response.json() as ProjectCommandsResponse
      return data.commands
    },
    enabled: !!projectId,
    refetchInterval: 3000,
    staleTime: 2000,
  })
}

export function useProjectContext(projectId: string | null, params?: {
  episodeId?: string | null
  currentStage?: string | null
  scopeRef?: string | null
  selectedPanelId?: string | null
  selectedClipId?: string | null
  selectedAssetId?: string | null
}) {
  return useQuery({
    queryKey: queryKeys.project.context(
      projectId || '',
      params?.episodeId || '',
      [
        params?.currentStage || '',
        params?.scopeRef || '',
        params?.selectedPanelId || '',
        params?.selectedClipId || '',
        params?.selectedAssetId || '',
      ].join(':'),
    ),
    queryFn: async () => {
      if (!projectId) throw new Error('projectId is required')
      const search = new URLSearchParams()
      if (params?.episodeId) search.set('episodeId', params.episodeId)
      if (params?.currentStage) search.set('currentStage', params.currentStage)
      if (params?.scopeRef) search.set('scopeRef', params.scopeRef)
      if (params?.selectedPanelId) search.set('selectedPanelId', params.selectedPanelId)
      if (params?.selectedClipId) search.set('selectedClipId', params.selectedClipId)
      if (params?.selectedAssetId) search.set('selectedAssetId', params.selectedAssetId)
      const response = await apiFetch(`/api/projects/${projectId}/context?${search.toString()}`)
      if (!response.ok) {
        const error = await response.json().catch(() => null)
        throw new Error(resolveTaskErrorMessage(error, 'Failed to load project context'))
      }
      const data = await response.json() as ProjectContextResponse
      return data.context
    },
    enabled: !!projectId,
    staleTime: 5000,
  })
}

export function useApproveProjectPlan(projectId: string | null, episodeId?: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (planId: string) => {
      if (!projectId) throw new Error('projectId is required')
      const response = await apiFetch(`/api/projects/${projectId}/plans/${planId}/approve`, {
        method: 'POST',
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(resolveTaskErrorMessage(data, 'Failed to approve plan'))
      }
      return data as CommandMutationResult
    },
    onSuccess: async () => {
      if (!projectId) return
      await queryClient.invalidateQueries({ queryKey: queryKeys.project.commands(projectId, episodeId || '') })
    },
  })
}

export function useRejectProjectPlan(projectId: string | null, episodeId?: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: { planId: string; note?: string }) => {
      if (!projectId) throw new Error('projectId is required')
      const response = await apiFetch(`/api/projects/${projectId}/plans/${params.planId}/reject`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          note: params.note || undefined,
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(resolveTaskErrorMessage(data, 'Failed to reject plan'))
      }
      return data as CommandMutationResult
    },
    onSuccess: async () => {
      if (!projectId) return
      await queryClient.invalidateQueries({ queryKey: queryKeys.project.commands(projectId, episodeId || '') })
    },
  })
}
