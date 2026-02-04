/**
 * 项目工作区 Mutations
 * 用于项目级资产的数据修改操作
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../keys'

// ==================== 角色图片操作 ====================

/**
 * 生成项目角色图片
 */
export function useGenerateProjectCharacterImage(projectId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ characterId, appearanceId }: { characterId: string; appearanceId: string }) => {
            const res = await fetch(`/api/novel-promotion/${projectId}/generate-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'character',
                    characterId,
                    appearanceId
                })
            })
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Failed to generate image')
            }
            return res.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(projectId) })
        }
    })
}

/**
 * 上传项目角色图片
 */
export function useUploadProjectCharacterImage(projectId: string) {
    const queryClient = useQueryClient()

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
            formData.append('characterId', characterId)
            formData.append('appearanceId', appearanceId)
            if (imageIndex !== undefined) formData.append('imageIndex', imageIndex.toString())
            if (labelText) formData.append('labelText', labelText)

            const res = await fetch(`/api/novel-promotion/${projectId}/upload-image`, {
                method: 'POST',
                body: formData
            })
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Failed to upload image')
            }
            return res.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(projectId) })
        }
    })
}

/**
 * 选择项目角色图片
 */
export function useSelectProjectCharacterImage(projectId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({
            characterId, appearanceId, imageIndex, confirm
        }: {
            characterId: string
            appearanceId: string
            imageIndex: number | null
            confirm?: boolean
        }) => {
            const res = await fetch(`/api/novel-promotion/${projectId}/select-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'character',
                    characterId,
                    appearanceId,
                    imageIndex,
                    confirm
                })
            })
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Failed to select image')
            }
            return res.json()
        },
        onSuccess: (_, variables) => {
            // 只有确认选择时才刷新
            if (variables.confirm) {
                queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(projectId) })
            }
        }
    })
}

/**
 * 撤回项目角色图片
 */
export function useUndoProjectCharacterImage(projectId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ characterId, appearanceId }: { characterId: string; appearanceId: string }) => {
            const res = await fetch(`/api/novel-promotion/${projectId}/undo-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'character',
                    characterId,
                    appearanceId
                })
            })
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Failed to undo image')
            }
            return res.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(projectId) })
        }
    })
}

/**
 * 删除项目角色
 */
export function useDeleteProjectCharacter(projectId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (characterId: string) => {
            const res = await fetch(`/api/novel-promotion/${projectId}/characters/${characterId}`, {
                method: 'DELETE'
            })
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Failed to delete character')
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(projectId) })
        }
    })
}

/**
 * 删除项目角色形象
 */
export function useDeleteProjectAppearance(projectId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ characterId, appearanceId }: { characterId: string; appearanceId: string }) => {
            const res = await fetch(`/api/novel-promotion/${projectId}/appearances/${appearanceId}`, {
                method: 'DELETE'
            })
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Failed to delete appearance')
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(projectId) })
        }
    })
}

/**
 * 更新项目角色名字
 */
export function useUpdateProjectCharacterName(projectId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ characterId, name }: { characterId: string; name: string }) => {
            const res = await fetch(`/api/novel-promotion/${projectId}/characters/${characterId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            })
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Failed to update character name')
            }

            // 后台更新图片标签（不阻塞）
            fetch(`/api/novel-promotion/${projectId}/update-asset-label`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'character',
                    id: characterId,
                    newName: name
                })
            }).catch(e => console.error('更新图片标签失败:', e))

            return res.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(projectId) })
        }
    })
}

/**
 * 上传项目角色音色
 */
export function useUploadProjectCharacterVoice(projectId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ file, characterId }: { file: File; characterId: string }) => {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('characterId', characterId)

            const res = await fetch(`/api/novel-promotion/${projectId}/character-voice`, {
                method: 'POST',
                body: formData
            })
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Failed to upload voice')
            }
            return res.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(projectId) })
        }
    })
}

// ==================== 场景图片操作 ====================

/**
 * 生成项目场景图片
 */
export function useGenerateProjectLocationImage(projectId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ locationId, imageIndex }: { locationId: string; imageIndex?: number }) => {
            const res = await fetch(`/api/novel-promotion/${projectId}/generate-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'location',
                    locationId,
                    imageIndex
                })
            })
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Failed to generate image')
            }
            return res.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(projectId) })
        }
    })
}

/**
 * 上传项目场景图片
 */
export function useUploadProjectLocationImage(projectId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({
            file, locationId, imageIndex, labelText
        }: {
            file: File
            locationId: string
            imageIndex?: number
            labelText?: string
        }) => {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('type', 'location')
            formData.append('locationId', locationId)
            if (imageIndex !== undefined) formData.append('imageIndex', imageIndex.toString())
            if (labelText) formData.append('labelText', labelText)

            const res = await fetch(`/api/novel-promotion/${projectId}/upload-image`, {
                method: 'POST',
                body: formData
            })
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Failed to upload image')
            }
            return res.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(projectId) })
        }
    })
}

/**
 * 选择项目场景图片
 */
export function useSelectProjectLocationImage(projectId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({
            locationId, imageIndex, confirm
        }: {
            locationId: string
            imageIndex: number | null
            confirm?: boolean
        }) => {
            const res = await fetch(`/api/novel-promotion/${projectId}/select-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'location',
                    locationId,
                    imageIndex,
                    confirm
                })
            })
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Failed to select image')
            }
            return res.json()
        },
        onSuccess: (_, variables) => {
            if (variables.confirm) {
                queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(projectId) })
            }
        }
    })
}

/**
 * 撤回项目场景图片
 */
export function useUndoProjectLocationImage(projectId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (locationId: string) => {
            const res = await fetch(`/api/novel-promotion/${projectId}/undo-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'location',
                    locationId
                })
            })
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Failed to undo image')
            }
            return res.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(projectId) })
        }
    })
}

/**
 * 删除项目场景
 */
export function useDeleteProjectLocation(projectId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (locationId: string) => {
            const res = await fetch(`/api/novel-promotion/${projectId}/locations/${locationId}`, {
                method: 'DELETE'
            })
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Failed to delete location')
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(projectId) })
        }
    })
}

/**
 * 更新项目场景名字
 */
export function useUpdateProjectLocationName(projectId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ locationId, name }: { locationId: string; name: string }) => {
            const res = await fetch(`/api/novel-promotion/${projectId}/locations/${locationId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            })
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Failed to update location name')
            }

            // 后台更新图片标签
            fetch(`/api/novel-promotion/${projectId}/update-asset-label`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'location',
                    id: locationId,
                    newName: name
                })
            }).catch(e => console.error('更新图片标签失败:', e))

            return res.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(projectId) })
        }
    })
}

// ==================== 批量操作 ====================

/**
 * 批量生成角色图片
 */
export function useBatchGenerateCharacterImages(projectId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (items: Array<{ characterId: string; appearanceId: string }>) => {
            const results = await Promise.allSettled(
                items.map(item =>
                    fetch(`/api/novel-promotion/${projectId}/generate-image`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            type: 'character',
                            characterId: item.characterId,
                            appearanceId: item.appearanceId
                        })
                    })
                )
            )
            return results
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(projectId) })
        }
    })
}

/**
 * 批量生成场景图片
 */
export function useBatchGenerateLocationImages(projectId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (locationIds: string[]) => {
            const results = await Promise.allSettled(
                locationIds.map(locationId =>
                    fetch(`/api/novel-promotion/${projectId}/generate-image`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            type: 'location',
                            locationId
                        })
                    })
                )
            )
            return results
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(projectId) })
        }
    })
}
