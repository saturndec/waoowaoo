import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Project } from '@/types/project'
import { resolveTaskResponse } from '@/lib/task/client'
import { queryKeys } from '../keys'
import {
  invalidateQueryTemplates,
  requestJsonWithError,
  requestTaskResponseWithError,
} from './mutation-shared'

type AsyncTaskSubmission = {
    async: true
    taskId: string
    runId?: string | null
    status?: string | null
    deduped?: boolean
}

function isAsyncTaskSubmission(value: unknown): value is AsyncTaskSubmission {
    if (!value || typeof value !== 'object') return false
    const payload = value as Record<string, unknown>
    return payload.async === true && typeof payload.taskId === 'string' && payload.taskId.length > 0
}

export function useAnalyzeProjectGlobalAssets(projectId: string) {
    return useMutation({
        mutationFn: async () => {
            const response = await requestTaskResponseWithError(
                `/api/projects/${projectId}/analyze-global`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ async: true }),
                },
                'Failed to analyze global assets',
            )
            const data = await response.json().catch(() => null)
            if (!isAsyncTaskSubmission(data)) {
                throw new Error('Failed to submit global asset analysis task')
            }
            return data
        },
    })
}

/**
 * 从资产中心复制到项目资产
 */

export function useCopyProjectAssetFromGlobal(projectId: string) {
    const queryClient = useQueryClient()
    const invalidateProjectAssets = () =>
        invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])

    return useMutation({
        mutationFn: async ({
            type,
            targetId,
            globalAssetId,
        }: {
            type: 'character' | 'location' | 'prop' | 'voice'
            targetId: string
            globalAssetId: string
        }) => {
            return await requestJsonWithError(`/api/assets/${targetId}/copy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    kind: type,
                    projectId,
                    globalAssetId,
                }),
            }, 'Failed to copy from global')
        },
        onSuccess: invalidateProjectAssets,
    })
}

/**
 * AI 修改镜头提示词（项目）
 */

type ProjectConfigMutationInput =
    | { key: string; value: unknown }
    | { patch: Record<string, unknown> }

function resolveProjectConfigPatch(input: ProjectConfigMutationInput): Record<string, unknown> {
    if ('patch' in input) return input.patch
    return { [input.key]: input.value }
}

export function useUpdateProjectConfig(projectId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (input: ProjectConfigMutationInput) =>
            await requestJsonWithError(
                `/api/projects/${projectId}/config`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(resolveProjectConfigPatch(input)),
                },
                'Failed to update config',
            ),
        onMutate: async (input) => {
            const projectQueryKey = queryKeys.projectData(projectId)
            await queryClient.cancelQueries({ queryKey: projectQueryKey })
            const previousProject = queryClient.getQueryData<Project>(projectQueryKey)
            const patch = resolveProjectConfigPatch(input)

            queryClient.setQueryData<Project | undefined>(projectQueryKey, (prev) => {
                if (!prev) return prev
                return {
                    ...prev,
                    ...patch,
                }
            })

            return { previousProject }
        },
        onError: (_error, _variables, context) => {
            if (context?.previousProject) {
                queryClient.setQueryData(queryKeys.projectData(projectId), context.previousProject)
            }
        },
        onSettled: () => {
            invalidateQueryTemplates(queryClient, [queryKeys.projectData(projectId)])
        },
    })
}

/**
 * 分析项目资产（异步任务）
 */

export function useAnalyzeProjectAssets(projectId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ episodeId }: { episodeId: string }) => {
            const response = await requestTaskResponseWithError(
                `/api/projects/${projectId}/analyze`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ episodeId, async: true }),
                },
                'Failed to analyze assets',
            )
            return resolveTaskResponse(response)
        },
        onSettled: (_, __, variables) => {
            invalidateQueryTemplates(queryClient, [
                queryKeys.episodeData(projectId, variables.episodeId),
                queryKeys.projectAssets.all(projectId),
            ])
        },
    })
}

/**
 * 获取下游分镜统计（用于重建确认）
 */

export function useGetProjectStoryboardStats(projectId: string) {
    return useMutation({
        mutationFn: async ({ episodeId }: { episodeId: string }) => {
            const data = await requestJsonWithError<{ storyboards?: Array<{ panels?: unknown[] }> }>(
                `/api/projects/${projectId}/storyboards?episodeId=${encodeURIComponent(episodeId)}`,
                { method: 'GET' },
                'storyboards check failed',
            )
            const storyboards = Array.isArray(data?.storyboards) ? data.storyboards : []
            const storyboardCount = storyboards.length
            const panelCount = storyboards.reduce((sum: number, storyboard) => {
                const panels = Array.isArray(storyboard?.panels) ? storyboard.panels.length : 0
                return sum + panels
            }, 0)
            return {
                storyboardCount,
                panelCount,
            }
        },
    })
}

/**
 * 获取 VoiceStage 所需数据
 */
