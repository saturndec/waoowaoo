'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-fetch'
import { resolveTaskErrorMessage } from '@/lib/task/error-message'
import type { ProjectEditScript } from '@/types/project'
import { queryKeys } from '../keys'

interface EditScriptResponse {
  editScript: ProjectEditScript | null
}

interface CreateEditScriptInput {
  episodeId: string
  prompt: string
}

interface GenerateEditScriptAssetsInput {
  episodeId: string
  editScriptId?: string
}

async function readJsonError(response: Response, fallback: string): Promise<Error> {
  const payload = await response.json().catch(() => null)
  return new Error(resolveTaskErrorMessage(payload, fallback))
}

export function useProjectEditScript(projectId: string | null, episodeId: string | null) {
  return useQuery({
    queryKey: queryKeys.project.editScript(projectId || '', episodeId || ''),
    queryFn: async () => {
      if (!projectId || !episodeId) throw new Error('Project ID and episode ID are required')
      const search = new URLSearchParams({ episodeId })
      const response = await apiFetch(`/api/projects/${projectId}/edit-script?${search.toString()}`)
      if (!response.ok) {
        throw await readJsonError(response, 'Failed to load edit script')
      }
      const data = await response.json() as EditScriptResponse
      return data.editScript
    },
    enabled: Boolean(projectId && episodeId),
    staleTime: 5000,
  })
}

export function useCreateProjectEditScript(projectId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateEditScriptInput) => {
      if (!projectId) throw new Error('Project ID is required')
      const response = await apiFetch(`/api/projects/${projectId}/edit-script`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!response.ok) {
        throw await readJsonError(response, 'Failed to generate edit script')
      }
      const data = await response.json() as EditScriptResponse
      if (!data.editScript) throw new Error('EDIT_SCRIPT_RESPONSE_EMPTY')
      return data.editScript
    },
    onSuccess: async (editScript) => {
      if (!projectId) return
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.project.editScript(projectId, editScript.episodeId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.episodeData(projectId, editScript.episodeId) }),
      ])
    },
  })
}

export function useGenerateProjectEditScriptAssets(projectId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: GenerateEditScriptAssetsInput) => {
      if (!projectId) throw new Error('Project ID is required')
      const response = await apiFetch(`/api/projects/${projectId}/edit-script/assets/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!response.ok) {
        throw await readJsonError(response, 'Failed to generate required assets')
      }
      const data = await response.json() as EditScriptResponse
      if (!data.editScript) throw new Error('EDIT_SCRIPT_RESPONSE_EMPTY')
      return data.editScript
    },
    onSuccess: async (editScript) => {
      if (!projectId) return
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.project.editScript(projectId, editScript.episodeId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.episodeData(projectId, editScript.episodeId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.projectData(projectId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.all('project', projectId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks.pending(projectId, editScript.episodeId) }),
      ])
    },
  })
}
