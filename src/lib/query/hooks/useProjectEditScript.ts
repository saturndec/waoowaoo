'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-fetch'
import { resolveTaskErrorMessage } from '@/lib/task/error-message'
import type { EditScriptBriefQuestionsPayload } from '@/lib/edit-script/types'
import type { EditScriptVideoRatio } from '@/lib/edit-script/types'
import type { ArtStyleValue } from '@/lib/constants'
import type { ProjectEditScript } from '@/types/project'
import { queryKeys } from '../keys'

interface EditScriptResponse {
  editScript: ProjectEditScript | null
}

interface CreateEditScriptInput {
  episodeId: string
  prompt: string
  videoRatio?: EditScriptVideoRatio
  artStyle?: ArtStyleValue
}

interface CreateEditScriptBriefQuestionsInput {
  episodeId: string
  prompt: string
}

interface EditScriptBriefQuestionsResponse {
  briefQuestions: EditScriptBriefQuestionsPayload
}

interface GenerateEditScriptAssetsInput {
  episodeId: string
  editScriptId?: string
  requirementId?: string
}

interface GenerateEditScriptStoryboardInput {
  episodeId: string
  editScriptId?: string
}

interface GenerateEditScriptStoryboardResponse {
  storyboardId: string
  panelCount: number
  submittedImageTasks: number
}

interface UpdateEditScriptVideoBlockPromptInput {
  episodeId: string
  editScriptId: string
  blockIndex: number
  prompt: string
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

export function useCreateProjectEditScriptBriefQuestions(projectId: string | null) {
  return useMutation({
    mutationFn: async (input: CreateEditScriptBriefQuestionsInput) => {
      if (!projectId) throw new Error('Project ID is required')
      const response = await apiFetch(`/api/projects/${projectId}/edit-script/brief-questions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!response.ok) {
        throw await readJsonError(response, 'Failed to generate edit brief questions')
      }
      const data = await response.json() as EditScriptBriefQuestionsResponse
      return data.briefQuestions
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

export function useGenerateProjectEditScriptStoryboard(projectId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: GenerateEditScriptStoryboardInput) => {
      if (!projectId) throw new Error('Project ID is required')
      const response = await apiFetch(`/api/projects/${projectId}/edit-script/storyboard/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!response.ok) {
        throw await readJsonError(response, 'Failed to generate storyboard')
      }
      return await response.json() as GenerateEditScriptStoryboardResponse
    },
    onSuccess: async (_result, variables) => {
      if (!projectId) return
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.storyboards.all(variables.episodeId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.episodeData(projectId, variables.episodeId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.projectData(projectId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks.pending(projectId, variables.episodeId) }),
      ])
    },
  })
}

export function useUpdateProjectEditScriptVideoBlockPrompt(projectId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateEditScriptVideoBlockPromptInput) => {
      if (!projectId) throw new Error('Project ID is required')
      const response = await apiFetch(`/api/projects/${projectId}/edit-script`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!response.ok) {
        throw await readJsonError(response, 'Failed to update video arrangement prompt')
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
