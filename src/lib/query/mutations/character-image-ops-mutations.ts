import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../keys'
import {
    clearTaskTargetOverlay,
    upsertTaskTargetOverlay,
} from '../task-target-overlay'
import {
    getPageLocale,
    invalidateQueryTemplates,
    requestJsonWithError,
} from './mutation-shared'

export function useModifyProjectCharacterImage(projectId: string) {
    const queryClient = useQueryClient()
    const invalidateProjectAssetAndProjectData = () =>
        invalidateQueryTemplates(queryClient, [
            queryKeys.projectAssets.all(projectId),
            queryKeys.projectData(projectId),
        ])

    return useMutation({
        mutationFn: async (params: {
            characterId: string
            appearanceId: string
            imageIndex: number
            modifyPrompt: string
            extraImageUrls?: string[]
        }) => {
            return await requestJsonWithError(`/api/novel-promotion/${projectId}/modify-asset-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'character',
                    ...params,
                }),
            }, 'Failed to modify image')
        },
        onMutate: ({ appearanceId }) => {
            upsertTaskTargetOverlay(queryClient, {
                projectId,
                targetType: 'CharacterAppearance',
                targetId: appearanceId,
                intent: 'modify',
            })
        },
        onError: (_error, { appearanceId }) => {
            clearTaskTargetOverlay(queryClient, {
                projectId,
                targetType: 'CharacterAppearance',
                targetId: appearanceId,
            })
        },
        onSettled: invalidateProjectAssetAndProjectData,
    })
}

/**
 * 修改项目场景图片
 */

export function useRegenerateCharacterGroup(projectId: string) {
    const queryClient = useQueryClient()
    const invalidateProjectAssets = () =>
        invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])

    return useMutation({
        mutationFn: async ({ characterId, appearanceId }: { characterId: string; appearanceId: string }) => {
            return await requestJsonWithError(`/api/novel-promotion/${projectId}/regenerate-group`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'character',
                    id: characterId,
                    appearanceId,
                })
            }, 'Failed to regenerate group')
        },
        onMutate: ({ appearanceId }) => {
            upsertTaskTargetOverlay(queryClient, {
                projectId,
                targetType: 'CharacterAppearance',
                targetId: appearanceId,
                intent: 'regenerate',
            })
        },
        onError: (_error, { appearanceId }) => {
            clearTaskTargetOverlay(queryClient, {
                projectId,
                targetType: 'CharacterAppearance',
                targetId: appearanceId,
            })
        },
        onSettled: invalidateProjectAssets,
    })
}

/**
 * 重新生成单张角色图片
 */

export function useRegenerateSingleCharacterImage(projectId: string) {
    const queryClient = useQueryClient()
    const invalidateProjectAssets = () =>
        invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])

    return useMutation({
        mutationFn: async ({
            characterId,
            appearanceId,
            imageIndex,
        }: {
            characterId: string
            appearanceId: string
            imageIndex: number
        }) => {
            return await requestJsonWithError(`/api/novel-promotion/${projectId}/regenerate-single-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'character',
                    id: characterId,
                    appearanceId,
                    imageIndex,
                })
            }, 'Failed to regenerate image')
        },
        onMutate: ({ appearanceId }) => {
            upsertTaskTargetOverlay(queryClient, {
                projectId,
                targetType: 'CharacterAppearance',
                targetId: appearanceId,
                intent: 'regenerate',
            })
        },
        onError: (_error, { appearanceId }) => {
            clearTaskTargetOverlay(queryClient, {
                projectId,
                targetType: 'CharacterAppearance',
                targetId: appearanceId,
            })
        },
        onSettled: invalidateProjectAssets,
    })
}

/**
 * 重新生成场景组图片
 */

export function useUpdateProjectAppearanceDescription(projectId: string) {
    const queryClient = useQueryClient()
    const invalidateProjectAssets = () =>
        invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])

    return useMutation({
        mutationFn: async ({
            characterId,
            appearanceId,
            description,
            descriptionIndex,
        }: {
            characterId: string
            appearanceId: string
            description: string
            descriptionIndex?: number
        }) => {
            return await requestJsonWithError(`/api/novel-promotion/${projectId}/character/appearance`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    characterId,
                    appearanceId,
                    description,
                    descriptionIndex: typeof descriptionIndex === 'number' ? descriptionIndex : 0,
                }),
            }, 'Failed to update appearance description')
        },
        onSuccess: invalidateProjectAssets,
    })
}

export function useBatchGenerateCharacterImages(projectId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (items: Array<{ characterId: string; appearanceId: string }>) => {
            const results = await Promise.allSettled(
                items.map(item =>
                    fetch(`/api/novel-promotion/${projectId}/generate-image`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-App-Locale': getPageLocale() },
                        body: JSON.stringify({
                            type: 'character',
                            id: item.characterId,
                            appearanceId: item.appearanceId
                        })
                    })
                )
            )
            return results
        },
        onMutate: (items) => {
            for (const item of items) {
                upsertTaskTargetOverlay(queryClient, {
                    projectId,
                    targetType: 'CharacterAppearance',
                    targetId: item.appearanceId,
                    intent: 'generate',
                })
            }
        },
        onError: (_error, items) => {
            for (const item of items) {
                clearTaskTargetOverlay(queryClient, {
                    projectId,
                    targetType: 'CharacterAppearance',
                    targetId: item.appearanceId,
                })
            }
        },
        onSettled: () => {
            invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])
        }
    })
}
