'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../keys'

// ============ 类型定义 ============
// 🔥 V6.5: 扩展类型以兼容 @/types/project 的完整定义
export interface CharacterAppearance {
    id: string
    characterId?: string  // 可选，兼容 @/types/project
    appearanceIndex: number
    changeReason: string
    description: string | null
    descriptions: string[] | null
    imageUrl: string | null
    imageUrls: string[]
    selectedIndex: number | null
    previousImageUrl: string | null
    previousImageUrls: string[] | null
    previousDescription: string | null
    previousDescriptions: string[] | null
    generating: boolean
}

export interface Character {
    id: string
    name: string
    introduction: string | null
    customVoiceUrl: string | null
    appearances: CharacterAppearance[]
    // 🔥 V6.5: 添加可选字段以兼容 @/types/project
    aliases?: string[]
    voiceType?: 'azure' | 'custom' | null
    voiceId?: string | null
    profileData?: string | null
    profileConfirmed?: boolean
}

export interface LocationImage {
    id: string
    locationId?: string  // 可选，兼容 @/types/project
    imageIndex: number
    description: string | null
    imageUrl: string | null
    previousImageUrl: string | null
    previousDescription: string | null
    isSelected: boolean
    generating: boolean
}

export interface Location {
    id: string
    name: string
    summary: string | null
    images: LocationImage[]
}

export interface ProjectAssetsData {
    characters: Character[]
    locations: Location[]
}

// ============ 查询 Hooks ============

/**
 * 获取项目资产（角色 + 场景）
 * 🔥 V6.6: 添加条件轮询 - 当有 generating: true 的资产时，自动每3秒刷新
 */
export function useProjectAssets(projectId: string | null) {
    const query = useQuery({
        queryKey: queryKeys.projectAssets.all(projectId || ''),
        queryFn: async () => {
            if (!projectId) throw new Error('Project ID is required')
            const res = await fetch(`/api/novel-promotion/${projectId}/assets`)
            if (!res.ok) throw new Error('Failed to fetch project assets')
            const data = await res.json()
            return data as ProjectAssetsData
        },
        enabled: !!projectId,
        // 🔥 条件轮询：当有资产正在生成时，每3秒刷新一次
        refetchInterval: (query) => {
            const data = query.state.data
            if (!data) return false

            // 检查是否有角色形象正在生成
            const hasGeneratingCharacter = data.characters?.some(char =>
                char.appearances?.some(app => app.generating)
            )

            // 检查是否有场景图片正在生成
            const hasGeneratingLocation = data.locations?.some(loc =>
                loc.images?.some(img => img.generating)
            )

            // 如果有正在生成的资产，每3秒刷新一次
            if (hasGeneratingCharacter || hasGeneratingLocation) {
                return 3000
            }

            return false
        },
    })

    return query
}

/**
 * 获取项目角色
 */
export function useProjectCharacters(projectId: string | null) {
    return useQuery({
        queryKey: queryKeys.projectAssets.characters(projectId || ''),
        queryFn: async () => {
            if (!projectId) throw new Error('Project ID is required')
            const res = await fetch(`/api/novel-promotion/${projectId}/characters`)
            if (!res.ok) throw new Error('Failed to fetch characters')
            const data = await res.json()
            return data.characters as Character[]
        },
        enabled: !!projectId,
    })
}

/**
 * 获取项目场景
 */
export function useProjectLocations(projectId: string | null) {
    return useQuery({
        queryKey: queryKeys.projectAssets.locations(projectId || ''),
        queryFn: async () => {
            if (!projectId) throw new Error('Project ID is required')
            const res = await fetch(`/api/novel-promotion/${projectId}/locations`)
            if (!res.ok) throw new Error('Failed to fetch locations')
            const data = await res.json()
            return data.locations as Location[]
        },
        enabled: !!projectId,
    })
}

// ============ Mutation Hooks ============

/**
 * 生成角色图片
 */
export function useGenerateProjectCharacterImage(projectId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ characterId, appearanceId }: { characterId: string; appearanceId: string }) => {
            if (!projectId) throw new Error('Project ID is required')
            const res = await fetch(`/api/novel-promotion/${projectId}/generate-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'character', id: characterId, appearanceId }),
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || error.error || 'Failed to generate image')
            }
            return res.json()
        },
        onMutate: async ({ characterId, appearanceId }) => {
            if (!projectId) return
            await queryClient.cancelQueries({ queryKey: queryKeys.projectAssets.all(projectId) })

            // 乐观更新
            queryClient.setQueryData<ProjectAssetsData>(
                queryKeys.projectAssets.all(projectId),
                (old) => {
                    if (!old) return old
                    return {
                        ...old,
                        characters: old.characters.map(char => {
                            if (char.id !== characterId) return char
                            return {
                                ...char,
                                appearances: char.appearances.map(app =>
                                    app.id === appearanceId ? { ...app, generating: true } : app
                                )
                            }
                        })
                    }
                }
            )
        },
        onSettled: () => {
            if (projectId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(projectId) })
            }
        },
    })
}

/**
 * 生成场景图片
 */
export function useGenerateProjectLocationImage(projectId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ locationId, imageIndex }: { locationId: string; imageIndex: number }) => {
            if (!projectId) throw new Error('Project ID is required')
            const res = await fetch(`/api/novel-promotion/${projectId}/generate-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'location', id: locationId, imageIndex }),
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || error.error || 'Failed to generate image')
            }
            return res.json()
        },
        onMutate: async ({ locationId, imageIndex }) => {
            if (!projectId) return
            await queryClient.cancelQueries({ queryKey: queryKeys.projectAssets.all(projectId) })

            queryClient.setQueryData<ProjectAssetsData>(
                queryKeys.projectAssets.all(projectId),
                (old) => {
                    if (!old) return old
                    return {
                        ...old,
                        locations: old.locations.map(loc => {
                            if (loc.id !== locationId) return loc
                            return {
                                ...loc,
                                images: loc.images.map(img =>
                                    img.imageIndex === imageIndex ? { ...img, generating: true } : img
                                )
                            }
                        })
                    }
                }
            )
        },
        onSettled: () => {
            if (projectId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(projectId) })
            }
        },
    })
}

/**
 * 修改角色图片
 */
export function useModifyProjectCharacterImage(projectId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (params: {
            characterId: string
            appearanceId: string
            imageIndex: number
            modifyPrompt: string
            extraImageUrls?: string[]
        }) => {
            if (!projectId) throw new Error('Project ID is required')
            const res = await fetch(`/api/novel-promotion/${projectId}/modify-asset-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'character',
                    ...params,
                }),
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || error.error || 'Failed to modify image')
            }
            return res.json()
        },
        onMutate: async ({ characterId, appearanceId }) => {
            if (!projectId) return
            await queryClient.cancelQueries({ queryKey: queryKeys.projectAssets.all(projectId) })

            queryClient.setQueryData<ProjectAssetsData>(
                queryKeys.projectAssets.all(projectId),
                (old) => {
                    if (!old) return old
                    return {
                        ...old,
                        characters: old.characters.map(char => {
                            if (char.id !== characterId) return char
                            return {
                                ...char,
                                appearances: char.appearances.map(app =>
                                    app.id === appearanceId ? { ...app, generating: true } : app
                                )
                            }
                        })
                    }
                }
            )
        },
        onSettled: () => {
            if (projectId) {
                // 🔥 同时无效化两个缓存：projectAssets 和 projectData（后者用于 NovelPromotionWorkspace 刷新）
                queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(projectId) })
                queryClient.invalidateQueries({ queryKey: queryKeys.projectData(projectId) })
            }
        },
    })
}

/**
 * 修改场景图片
 */
export function useModifyProjectLocationImage(projectId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (params: {
            locationId: string
            imageIndex: number
            modifyPrompt: string
            extraImageUrls?: string[]
        }) => {
            if (!projectId) throw new Error('Project ID is required')
            const res = await fetch(`/api/novel-promotion/${projectId}/modify-asset-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'location',
                    ...params,
                }),
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || error.error || 'Failed to modify image')
            }
            return res.json()
        },
        onMutate: async ({ locationId, imageIndex }) => {
            if (!projectId) return
            await queryClient.cancelQueries({ queryKey: queryKeys.projectAssets.all(projectId) })

            queryClient.setQueryData<ProjectAssetsData>(
                queryKeys.projectAssets.all(projectId),
                (old) => {
                    if (!old) return old
                    return {
                        ...old,
                        locations: old.locations.map(loc => {
                            if (loc.id !== locationId) return loc
                            return {
                                ...loc,
                                images: loc.images.map(img =>
                                    img.imageIndex === imageIndex ? { ...img, generating: true } : img
                                )
                            }
                        })
                    }
                }
            )
        },
        onSettled: () => {
            if (projectId) {
                // 🔥 同时无效化两个缓存：projectAssets 和 projectData（后者用于 NovelPromotionWorkspace 刷新）
                queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(projectId) })
                queryClient.invalidateQueries({ queryKey: queryKeys.projectData(projectId) })
            }
        },
    })
}

/**
 * 重新生成角色组图片
 */
export function useRegenerateCharacterGroup(projectId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ characterId, appearanceId }: { characterId: string; appearanceId: string }) => {
            if (!projectId) throw new Error('Project ID is required')
            const res = await fetch(`/api/novel-promotion/${projectId}/regenerate-group`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'character', id: characterId, appearanceId }),
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || error.error || 'Failed to regenerate')
            }
            return res.json()
        },
        onMutate: async ({ characterId, appearanceId }) => {
            if (!projectId) return
            await queryClient.cancelQueries({ queryKey: queryKeys.projectAssets.all(projectId) })

            queryClient.setQueryData<ProjectAssetsData>(
                queryKeys.projectAssets.all(projectId),
                (old) => {
                    if (!old) return old
                    return {
                        ...old,
                        characters: old.characters.map(char => {
                            if (char.id !== characterId) return char
                            return {
                                ...char,
                                appearances: char.appearances.map(app =>
                                    app.id === appearanceId ? { ...app, generating: true } : app
                                )
                            }
                        })
                    }
                }
            )
        },
        onSettled: () => {
            if (projectId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(projectId) })
            }
        },
    })
}

/**
 * 重新生成单张角色图片
 */
export function useRegenerateSingleCharacterImage(projectId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ characterId, appearanceId, imageIndex }: { characterId: string; appearanceId: string; imageIndex: number }) => {
            if (!projectId) throw new Error('Project ID is required')
            const res = await fetch(`/api/novel-promotion/${projectId}/regenerate-single-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'character', id: characterId, appearanceId, imageIndex }),
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || error.error || 'Failed to regenerate single image')
            }
            return res.json()
        },
        onMutate: async ({ characterId, appearanceId }) => {
            if (!projectId) return
            await queryClient.cancelQueries({ queryKey: queryKeys.projectAssets.all(projectId) })

            queryClient.setQueryData<ProjectAssetsData>(
                queryKeys.projectAssets.all(projectId),
                (old) => {
                    if (!old) return old
                    return {
                        ...old,
                        characters: old.characters.map(char => {
                            if (char.id !== characterId) return char
                            return {
                                ...char,
                                appearances: char.appearances.map(app =>
                                    app.id === appearanceId ? { ...app, generating: true } : app
                                )
                            }
                        })
                    }
                }
            )
        },
        onSettled: () => {
            if (projectId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(projectId) })
            }
        },
    })
}

/**
 * 重新生成场景组图片
 */
export function useRegenerateLocationGroup(projectId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ locationId }: { locationId: string }) => {
            if (!projectId) throw new Error('Project ID is required')
            const res = await fetch(`/api/novel-promotion/${projectId}/regenerate-group`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'location', id: locationId }),
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || error.error || 'Failed to regenerate location group')
            }
            return res.json()
        },
        onMutate: async ({ locationId }) => {
            if (!projectId) return
            await queryClient.cancelQueries({ queryKey: queryKeys.projectAssets.all(projectId) })

            queryClient.setQueryData<ProjectAssetsData>(
                queryKeys.projectAssets.all(projectId),
                (old) => {
                    if (!old) return old
                    return {
                        ...old,
                        locations: old.locations.map(loc => {
                            if (loc.id !== locationId) return loc
                            return {
                                ...loc,
                                images: loc.images.map(img => ({ ...img, generating: true }))
                            }
                        })
                    }
                }
            )
        },
        onSettled: () => {
            if (projectId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(projectId) })
            }
        },
    })
}

/**
 * 重新生成单张场景图片
 */
export function useRegenerateSingleLocationImage(projectId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ locationId, imageIndex }: { locationId: string; imageIndex: number }) => {
            if (!projectId) throw new Error('Project ID is required')
            const res = await fetch(`/api/novel-promotion/${projectId}/regenerate-single-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'location', id: locationId, imageIndex }),
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || error.error || 'Failed to regenerate single location image')
            }
            return res.json()
        },
        onMutate: async ({ locationId, imageIndex }) => {
            if (!projectId) return
            await queryClient.cancelQueries({ queryKey: queryKeys.projectAssets.all(projectId) })

            queryClient.setQueryData<ProjectAssetsData>(
                queryKeys.projectAssets.all(projectId),
                (old) => {
                    if (!old) return old
                    return {
                        ...old,
                        locations: old.locations.map(loc => {
                            if (loc.id !== locationId) return loc
                            return {
                                ...loc,
                                images: loc.images.map(img =>
                                    img.imageIndex === imageIndex ? { ...img, generating: true } : img
                                )
                            }
                        })
                    }
                }
            )
        },
        onSettled: () => {
            if (projectId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(projectId) })
            }
        },
    })
}


/**
 * 撤回到上一版本
 */
export function useUndoAssetImage(projectId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (params: {
            type: 'character' | 'location'
            characterId?: string
            appearanceId?: string
            locationId?: string
            imageIndex?: number
        }) => {
            if (!projectId) throw new Error('Project ID is required')
            const res = await fetch(`/api/novel-promotion/${projectId}/undo-asset-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params),
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || error.error || 'Failed to undo')
            }
            return res.json()
        },
        onSettled: () => {
            if (projectId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(projectId) })
            }
        },
    })
}

/**
 * 选择图片
 */
export function useSelectImage(projectId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (params: {
            type: 'character' | 'location'
            characterId?: string
            appearanceId?: string
            locationId?: string
            imageIndex: number | null
        }) => {
            if (!projectId) throw new Error('Project ID is required')
            const res = await fetch(`/api/novel-promotion/${projectId}/select-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params),
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || error.error || 'Failed to select image')
            }
            return res.json()
        },
        // 乐观更新选中状态
        onMutate: async (params) => {
            if (!projectId) return

            queryClient.setQueryData<ProjectAssetsData>(
                queryKeys.projectAssets.all(projectId),
                (old) => {
                    if (!old) return old
                    if (params.type === 'character' && params.characterId && params.appearanceId) {
                        return {
                            ...old,
                            characters: old.characters.map(char => {
                                if (char.id !== params.characterId) return char
                                return {
                                    ...char,
                                    appearances: char.appearances.map(app =>
                                        app.id === params.appearanceId
                                            ? { ...app, selectedIndex: params.imageIndex }
                                            : app
                                    )
                                }
                            })
                        }
                    } else if (params.type === 'location' && params.locationId) {
                        return {
                            ...old,
                            locations: old.locations.map(loc => {
                                if (loc.id !== params.locationId) return loc
                                return {
                                    ...loc,
                                    images: loc.images.map(img => ({
                                        ...img,
                                        isSelected: img.imageIndex === params.imageIndex
                                    }))
                                }
                            })
                        }
                    }
                    return old
                }
            )
        },
        onSettled: () => {
            if (projectId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(projectId) })
            }
        },
    })
}

/**
 * 删除角色
 */
export function useDeleteCharacter(projectId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ characterId }: { characterId: string }) => {
            if (!projectId) throw new Error('Project ID is required')
            const res = await fetch(`/api/novel-promotion/${projectId}/delete-character`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ characterId }),
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || error.error || 'Failed to delete character')
            }
            return res.json()
        },
        // 乐观更新：立即从列表中移除
        onMutate: async ({ characterId }) => {
            if (!projectId) return

            queryClient.setQueryData<ProjectAssetsData>(
                queryKeys.projectAssets.all(projectId),
                (old) => {
                    if (!old) return old
                    return {
                        ...old,
                        characters: old.characters.filter(c => c.id !== characterId)
                    }
                }
            )
        },
        onSettled: () => {
            if (projectId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(projectId) })
            }
        },
    })
}

/**
 * 删除场景
 */
export function useDeleteLocation(projectId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ locationId }: { locationId: string }) => {
            if (!projectId) throw new Error('Project ID is required')
            const res = await fetch(`/api/novel-promotion/${projectId}/delete-location`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ locationId }),
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || error.error || 'Failed to delete location')
            }
            return res.json()
        },
        onMutate: async ({ locationId }) => {
            if (!projectId) return

            queryClient.setQueryData<ProjectAssetsData>(
                queryKeys.projectAssets.all(projectId),
                (old) => {
                    if (!old) return old
                    return {
                        ...old,
                        locations: old.locations.filter(l => l.id !== locationId)
                    }
                }
            )
        },
        onSettled: () => {
            if (projectId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(projectId) })
            }
        },
    })
}

/**
 * 刷新项目资产
 * 🔥 同时刷新 projectAssets 和 projectData 两个缓存
 *    - projectAssets: 用于直接订阅 useProjectAssets 的组件
 *    - projectData: 用于 NovelPromotionWorkspace（通过 useProjectData 获取 characters/locations）
 */
export function useRefreshProjectAssets(projectId: string | null) {
    const queryClient = useQueryClient()

    return () => {
        if (projectId) {
            console.log('[刷新资产] 同时刷新 projectAssets 和 projectData 缓存')
            queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(projectId) })
            queryClient.invalidateQueries({ queryKey: queryKeys.projectData(projectId) })
        }
    }
}
