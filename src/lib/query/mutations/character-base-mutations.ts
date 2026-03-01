import { useMutation, useQueryClient } from '@tanstack/react-query'
import { logError as _ulogError } from '@/lib/logging/core'
import { useRef } from 'react'
import type { Character, Project } from '@/types/project'
import { queryKeys } from '../keys'
import type { ProjectAssetsData } from '../hooks/useProjectAssets'
import {
    clearTaskTargetOverlay,
    upsertTaskTargetOverlay,
} from '../task-target-overlay'
import {
    getPageLocale,
    invalidateQueryTemplates,
    requestJsonWithError,
    requestVoidWithError,
} from './mutation-shared'

interface SelectProjectCharacterImageContext {
    previousAssets: ProjectAssetsData | undefined
    previousProject: Project | undefined
    targetKey: string
    requestId: number
}

interface DeleteProjectCharacterContext {
    previousAssets: ProjectAssetsData | undefined
    previousProject: Project | undefined
}

function applyCharacterSelectionToCharacters(
    characters: Character[],
    characterId: string,
    appearanceId: string,
    selectedIndex: number | null,
): Character[] {
    return characters.map((character) => {
        if (character.id !== characterId) return character
        return {
            ...character,
            appearances: (character.appearances || []).map((appearance) => {
                if (appearance.id !== appearanceId) return appearance
                const selectedUrl =
                    selectedIndex !== null && selectedIndex >= 0
                        ? (appearance.imageUrls[selectedIndex] ?? null)
                        : null
                return {
                    ...appearance,
                    selectedIndex,
                    imageUrl: selectedUrl ?? appearance.imageUrl ?? null,
                }
            }),
        }
    })
}

function applyCharacterSelectionToAssets(
    previous: ProjectAssetsData | undefined,
    characterId: string,
    appearanceId: string,
    selectedIndex: number | null,
): ProjectAssetsData | undefined {
    if (!previous) return previous
    return {
        ...previous,
        characters: applyCharacterSelectionToCharacters(previous.characters || [], characterId, appearanceId, selectedIndex),
    }
}

function applyCharacterSelectionToProject(
    previous: Project | undefined,
    characterId: string,
    appearanceId: string,
    selectedIndex: number | null,
): Project | undefined {
    if (!previous?.novelPromotionData) return previous
    const currentCharacters = previous.novelPromotionData.characters || []
    return {
        ...previous,
        novelPromotionData: {
            ...previous.novelPromotionData,
            characters: applyCharacterSelectionToCharacters(currentCharacters, characterId, appearanceId, selectedIndex),
        },
    }
}

function removeCharacterFromAssets(
    previous: ProjectAssetsData | undefined,
    characterId: string,
): ProjectAssetsData | undefined {
    if (!previous) return previous
    return {
        ...previous,
        characters: (previous.characters || []).filter((character) => character.id !== characterId),
    }
}

function removeCharacterFromProject(
    previous: Project | undefined,
    characterId: string,
): Project | undefined {
    if (!previous?.novelPromotionData) return previous
    const currentCharacters = previous.novelPromotionData.characters || []
    return {
        ...previous,
        novelPromotionData: {
            ...previous.novelPromotionData,
            characters: currentCharacters.filter((character) => character.id !== characterId),
        },
    }
}

export function useGenerateProjectCharacterImage(projectId: string) {
    const queryClient = useQueryClient()
    const invalidateProjectAssets = () =>
        invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])

    return useMutation({
        mutationFn: async ({ characterId, appearanceId }: { characterId: string; appearanceId: string }) => {
            return await requestJsonWithError(`/api/novel-promotion/${projectId}/generate-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'character',
                    id: characterId,
                    appearanceId
                })
            }, 'Failed to generate image')
        },
        onMutate: ({ appearanceId }) => {
            upsertTaskTargetOverlay(queryClient, {
                projectId,
                targetType: 'CharacterAppearance',
                targetId: appearanceId,
                intent: 'generate',
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
 * 上传项目角色图片
 */

export function useUploadProjectCharacterImage(projectId: string) {
    const queryClient = useQueryClient()
    const invalidateProjectAssets = () =>
        invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])

    return useMutation({
        mutationFn: async ({
            file, characterId, appearanceId, imageIndex, labelText
        }: {
            file: File
            characterId: string
            appearanceId: string
            imageIndex?: number
            labelText?: string
        }) => {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('type', 'character')
            formData.append('id', characterId)
            formData.append('appearanceId', appearanceId)
            if (imageIndex !== undefined) formData.append('imageIndex', imageIndex.toString())
            if (labelText) formData.append('labelText', labelText)

            return await requestJsonWithError(`/api/novel-promotion/${projectId}/upload-asset-image`, {
                method: 'POST',
                body: formData
            }, 'Failed to upload image')
        },
        onSuccess: invalidateProjectAssets,
    })
}

/**
 * 选择项目角色图片
 */

export function useSelectProjectCharacterImage(projectId: string) {
    const queryClient = useQueryClient()
    const latestRequestIdByTargetRef = useRef<Record<string, number>>({})
    const invalidateProjectAssets = () =>
        invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])

    return useMutation({
        mutationFn: async ({
            characterId, appearanceId, imageIndex
        }: {
            characterId: string
            appearanceId: string
            imageIndex: number | null
            confirm?: boolean
        }) => {
            return await requestJsonWithError(`/api/novel-promotion/${projectId}/select-character-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    characterId,
                    appearanceId,
                    selectedIndex: imageIndex,
                })
            }, 'Failed to select image')
        },
        onMutate: async (variables): Promise<SelectProjectCharacterImageContext> => {
            const targetKey = `${variables.characterId}:${variables.appearanceId}`
            const requestId = (latestRequestIdByTargetRef.current[targetKey] ?? 0) + 1
            latestRequestIdByTargetRef.current[targetKey] = requestId

            const assetsQueryKey = queryKeys.projectAssets.all(projectId)
            const projectQueryKey = queryKeys.projectData(projectId)

            await queryClient.cancelQueries({ queryKey: assetsQueryKey })
            await queryClient.cancelQueries({ queryKey: projectQueryKey })

            const previousAssets = queryClient.getQueryData<ProjectAssetsData>(assetsQueryKey)
            const previousProject = queryClient.getQueryData<Project>(projectQueryKey)

            queryClient.setQueryData<ProjectAssetsData | undefined>(assetsQueryKey, (previous) =>
                applyCharacterSelectionToAssets(previous, variables.characterId, variables.appearanceId, variables.imageIndex),
            )
            queryClient.setQueryData<Project | undefined>(projectQueryKey, (previous) =>
                applyCharacterSelectionToProject(previous, variables.characterId, variables.appearanceId, variables.imageIndex),
            )

            return {
                previousAssets,
                previousProject,
                targetKey,
                requestId,
            }
        },
        onError: (_error, _variables, context) => {
            if (!context) return
            const latestRequestId = latestRequestIdByTargetRef.current[context.targetKey]
            if (latestRequestId !== context.requestId) return
            queryClient.setQueryData(queryKeys.projectAssets.all(projectId), context.previousAssets)
            queryClient.setQueryData(queryKeys.projectData(projectId), context.previousProject)
        },
        onSettled: (_data, _error, variables) => {
            if (variables.confirm) {
                void invalidateProjectAssets()
            }
        },
    })
}

/**
 * 撤回项目角色图片
 */

export function useUndoProjectCharacterImage(projectId: string) {
    const queryClient = useQueryClient()
    const invalidateProjectAssets = () =>
        invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])

    return useMutation({
        mutationFn: async ({ characterId, appearanceId }: { characterId: string; appearanceId: string }) => {
            return await requestJsonWithError(`/api/novel-promotion/${projectId}/undo-regenerate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'character',
                    id: characterId,
                    appearanceId
                })
            }, 'Failed to undo image')
        },
        onSuccess: invalidateProjectAssets,
    })
}

/**
 * 删除项目角色
 */

export function useDeleteProjectCharacter(projectId: string) {
    const queryClient = useQueryClient()
    const invalidateProjectAssets = () =>
        invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])

    return useMutation({
        mutationFn: async (characterId: string) => {
            await requestVoidWithError(
                `/api/novel-promotion/${projectId}/character?id=${encodeURIComponent(characterId)}`,
                { method: 'DELETE' },
                'Failed to delete character',
            )
        },
        onMutate: async (characterId): Promise<DeleteProjectCharacterContext> => {
            const assetsQueryKey = queryKeys.projectAssets.all(projectId)
            const projectQueryKey = queryKeys.projectData(projectId)

            await queryClient.cancelQueries({ queryKey: assetsQueryKey })
            await queryClient.cancelQueries({ queryKey: projectQueryKey })

            const previousAssets = queryClient.getQueryData<ProjectAssetsData>(assetsQueryKey)
            const previousProject = queryClient.getQueryData<Project>(projectQueryKey)

            queryClient.setQueryData<ProjectAssetsData | undefined>(assetsQueryKey, (previous) =>
                removeCharacterFromAssets(previous, characterId),
            )
            queryClient.setQueryData<Project | undefined>(projectQueryKey, (previous) =>
                removeCharacterFromProject(previous, characterId),
            )

            return {
                previousAssets,
                previousProject,
            }
        },
        onError: (_error, _characterId, context) => {
            if (!context) return
            queryClient.setQueryData(queryKeys.projectAssets.all(projectId), context.previousAssets)
            queryClient.setQueryData(queryKeys.projectData(projectId), context.previousProject)
        },
        onSettled: invalidateProjectAssets,
    })
}

/**
 * 删除项目角色形象
 */

export function useDeleteProjectAppearance(projectId: string) {
    const queryClient = useQueryClient()
    const invalidateProjectAssets = () =>
        invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])

    return useMutation({
        mutationFn: async ({ characterId, appearanceId }: { characterId: string; appearanceId: string }) => {
            await requestVoidWithError(
                `/api/novel-promotion/${projectId}/character/appearance?characterId=${encodeURIComponent(characterId)}&appearanceId=${encodeURIComponent(appearanceId)}`,
                { method: 'DELETE' },
                'Failed to delete appearance',
            )
        },
        onSuccess: invalidateProjectAssets,
    })
}

/**
 * 更新项目角色名字
 */

export function useUpdateProjectCharacterName(projectId: string) {
    const queryClient = useQueryClient()
    const invalidateProjectAssets = () =>
        invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])

    return useMutation({
        mutationFn: async ({ characterId, name }: { characterId: string; name: string }) => {
            const res = await requestJsonWithError(`/api/novel-promotion/${projectId}/character`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ characterId, name })
            }, 'Failed to update character name')

            // 等待图片标签更新完成，确保 onSuccess invalidate 后前端能立即看到新标签
            try {
                await fetch(`/api/novel-promotion/${projectId}/update-asset-label`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-App-Locale': getPageLocale() },
                    body: JSON.stringify({
                        type: 'character',
                        id: characterId,
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
