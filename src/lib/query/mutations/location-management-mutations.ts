import { useMutation, useQueryClient } from '@tanstack/react-query'
import { logError as _ulogError } from '@/lib/logging/core'
import type { Project } from '@/types/project'
import { queryKeys } from '../keys'
import type { ProjectAssetsData } from '../hooks/useProjectAssets'
import { resolveTaskResponse } from '@/lib/task/client'
import {
    clearTaskTargetOverlay,
    upsertTaskTargetOverlay,
} from '../task-target-overlay'
import {
    getPageLocale,
    invalidateQueryTemplates,
    requestJsonWithError,
    requestTaskResponseWithError,
    requestVoidWithError,
} from './mutation-shared'

interface DeleteProjectLocationContext {
    previousAssets: ProjectAssetsData | undefined
    previousProject: Project | undefined
}

function removeLocationFromAssets(
    previous: ProjectAssetsData | undefined,
    locationId: string,
): ProjectAssetsData | undefined {
    if (!previous) return previous
    return {
        ...previous,
        locations: (previous.locations || []).filter((location) => location.id !== locationId),
    }
}

function removeLocationFromProject(
    previous: Project | undefined,
    locationId: string,
): Project | undefined {
    if (!previous?.novelPromotionData) return previous
    const currentLocations = previous.novelPromotionData.locations || []
    return {
        ...previous,
        novelPromotionData: {
            ...previous.novelPromotionData,
            locations: currentLocations.filter((location) => location.id !== locationId),
        },
    }
}

export function useDeleteProjectLocation(projectId: string) {
    const queryClient = useQueryClient()
    const invalidateProjectAssets = () =>
        invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])

    return useMutation({
        mutationFn: async (locationId: string) => {
            await requestVoidWithError(
                `/api/novel-promotion/${projectId}/location?id=${encodeURIComponent(locationId)}`,
                { method: 'DELETE' },
                'Failed to delete location',
            )
        },
        onMutate: async (locationId): Promise<DeleteProjectLocationContext> => {
            const assetsQueryKey = queryKeys.projectAssets.all(projectId)
            const projectQueryKey = queryKeys.projectData(projectId)

            await queryClient.cancelQueries({ queryKey: assetsQueryKey })
            await queryClient.cancelQueries({ queryKey: projectQueryKey })

            const previousAssets = queryClient.getQueryData<ProjectAssetsData>(assetsQueryKey)
            const previousProject = queryClient.getQueryData<Project>(projectQueryKey)

            queryClient.setQueryData<ProjectAssetsData | undefined>(assetsQueryKey, (previous) =>
                removeLocationFromAssets(previous, locationId),
            )
            queryClient.setQueryData<Project | undefined>(projectQueryKey, (previous) =>
                removeLocationFromProject(previous, locationId),
            )

            return {
                previousAssets,
                previousProject,
            }
        },
        onError: (_error, _locationId, context) => {
            if (!context) return
            queryClient.setQueryData(queryKeys.projectAssets.all(projectId), context.previousAssets)
            queryClient.setQueryData(queryKeys.projectData(projectId), context.previousProject)
        },
        onSettled: invalidateProjectAssets,
    })
}

/**
 * 更新项目场景名字
 */

export function useUpdateProjectLocationName(projectId: string) {
    const queryClient = useQueryClient()
    const invalidateProjectAssets = () =>
        invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])

    return useMutation({
        mutationFn: async ({ locationId, name }: { locationId: string; name: string }) => {
            const res = await requestJsonWithError(`/api/novel-promotion/${projectId}/location`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ locationId, name })
            }, 'Failed to update location name')

            // 等待图片标签更新完成，确保 onSuccess invalidate 后前端能立即看到新标签
            try {
                await fetch(`/api/novel-promotion/${projectId}/update-asset-label`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-App-Locale': getPageLocale() },
                    body: JSON.stringify({
                        type: 'location',
                        id: locationId,
                        newName: name
                    })
                })
            } catch (e) {
                _ulogError('更新图片标签失败:', e)
            }

            return res
        },
        onSuccess: invalidateProjectAssets,
    })
}

/**
 * 更新项目角色形象描述
 */

export function useUpdateProjectLocationDescription(projectId: string) {
    const queryClient = useQueryClient()
    const invalidateProjectAssets = () =>
        invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])

    return useMutation({
        mutationFn: async ({
            locationId,
            description,
            imageIndex,
        }: {
            locationId: string
            description: string
            imageIndex?: number
        }) => {
            return await requestJsonWithError(`/api/novel-promotion/${projectId}/location`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    locationId,
                    imageIndex: typeof imageIndex === 'number' ? imageIndex : 0,
                    description,
                }),
            }, 'Failed to update location description')
        },
        onSuccess: invalidateProjectAssets,
    })
}

/**
 * 更新项目角色介绍
 */

export function useAiModifyProjectLocationDescription(projectId: string) {
    return useMutation({
        mutationFn: async ({
            locationId,
            currentDescription,
            modifyInstruction,
            imageIndex,
        }: {
            locationId: string
            currentDescription: string
            modifyInstruction: string
            imageIndex?: number
        }) => {
            const response = await requestTaskResponseWithError(
                `/api/novel-promotion/${projectId}/ai-modify-location`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        locationId,
                        imageIndex: typeof imageIndex === 'number' ? imageIndex : 0,
                        currentDescription,
                        modifyInstruction,
                    }),
                },
                'Failed to modify location description',
            )
            return resolveTaskResponse<{ prompt?: string; modifiedDescription?: string }>(response)
        },
    })
}

/**
 * AI 设计项目场景描述
 */

export function useAiCreateProjectLocation(projectId: string) {
    return useMutation({
        mutationFn: async (payload: { userInstruction: string }) => {
            const response = await requestTaskResponseWithError(
                `/api/novel-promotion/${projectId}/ai-create-location`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                },
                'Failed to design location',
            )
            return await resolveTaskResponse<{ prompt?: string }>(response)
        },
    })
}

/**
 * 创建项目场景
 */

export function useCreateProjectLocation(projectId: string) {
    const queryClient = useQueryClient()
    const invalidateProjectAssets = () =>
        invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])

    return useMutation({
        mutationFn: async (payload: {
            name: string
            description: string
            artStyle?: string
        }) =>
            await requestJsonWithError(
                `/api/novel-promotion/${projectId}/location`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                },
                'Failed to create location',
            ),
        onSuccess: invalidateProjectAssets,
    })
}

/**
 * AI 设计项目角色文案
 */

export function useConfirmProjectLocationSelection(projectId: string) {
    const queryClient = useQueryClient()
    const invalidateProjectAssets = () =>
        invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])
    return useMutation({
        mutationFn: async ({ locationId }: { locationId: string }) =>
            await requestJsonWithError(
                `/api/novel-promotion/${projectId}/location/confirm-selection`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ locationId }),
                },
                '确认选择失败',
            ),
        onSettled: invalidateProjectAssets,
    })
}

/**
 * 确认角色档案并触发描述生成
 */

export function useBatchGenerateLocationImages(projectId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (locationIds: string[]) => {
            const results = await Promise.allSettled(
                locationIds.map(locationId =>
                    fetch(`/api/novel-promotion/${projectId}/generate-image`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-App-Locale': getPageLocale() },
                        body: JSON.stringify({
                            type: 'location',
                            id: locationId
                        })
                    })
                )
            )
            return results
        },
        onMutate: (locationIds) => {
            for (const locationId of locationIds) {
                upsertTaskTargetOverlay(queryClient, {
                    projectId,
                    targetType: 'LocationImage',
                    targetId: locationId,
                    intent: 'generate',
                })
            }
        },
        onError: (_error, locationIds) => {
            for (const locationId of locationIds) {
                clearTaskTargetOverlay(queryClient, {
                    projectId,
                    targetType: 'LocationImage',
                    targetId: locationId,
                })
            }
        },
        onSettled: () => {
            invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])
        }
    })
}
