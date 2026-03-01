import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Project } from '@/types/project'
import { queryKeys } from '../keys'
import { resolveTaskResponse } from '@/lib/task/client'
import {
  invalidateQueryTemplates,
  requestJsonWithError,
  requestTaskResponseWithError,
} from './mutation-shared'
import { getPageLocale } from './mutation-shared'

export function useAnalyzeProjectGlobalAssets(projectId: string) {
    const queryClient = useQueryClient()
    const invalidateProjectAssets = () =>
        invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])

    return useMutation({
        mutationFn: async () => {
            const res = await requestTaskResponseWithError(
                `/api/novel-promotion/${projectId}/analyze-global`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept-Language': getPageLocale() },
                    body: JSON.stringify({ async: true }),
                },
                'Failed to analyze global assets',
            )
            return resolveTaskResponse<{ stats?: { newCharacters?: number; newLocations?: number } }>(res)
        },
        onSuccess: invalidateProjectAssets,
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
            type: 'character' | 'location' | 'voice'
            targetId: string
            globalAssetId: string
        }) => {
            return await requestJsonWithError(`/api/novel-promotion/${projectId}/copy-from-global`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, targetId, globalAssetId }),
            }, 'Failed to copy from global')
        },
        onSuccess: invalidateProjectAssets,
    })
}

/**
 * AI 修改镜头提示词（项目）
 */

export function useUpdateProjectConfig(projectId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ key, value }: { key: string; value: unknown }) =>
            await requestJsonWithError(
                `/api/novel-promotion/${projectId}`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ [key]: value }),
                },
                'Failed to update config',
            ),
        onMutate: async ({ key, value }) => {
            const projectQueryKey = queryKeys.projectData(projectId)
            await queryClient.cancelQueries({ queryKey: projectQueryKey })
            const previousProject = queryClient.getQueryData<Project>(projectQueryKey)

            queryClient.setQueryData<Project | undefined>(projectQueryKey, (prev) => {
                if (!prev?.novelPromotionData) return prev
                return {
                    ...prev,
                    novelPromotionData: {
                        ...prev.novelPromotionData,
                        [key]: value,
                    },
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
                `/api/novel-promotion/${projectId}/analyze`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept-Language': getPageLocale() },
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
                `/api/novel-promotion/${projectId}/storyboards?episodeId=${encodeURIComponent(episodeId)}`,
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
