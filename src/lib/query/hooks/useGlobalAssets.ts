'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../keys'

// ============ 类型定义 ============
export interface GlobalCharacterAppearance {
    id: string
    appearanceIndex: number
    changeReason: string
    description: string | null
    descriptionSource: string | null
    imageUrl: string | null
    imageUrls: string[]
    selectedIndex: number | null
    previousImageUrl: string | null
    previousImageUrls: string[] | null
    generating: boolean
}

export interface GlobalCharacter {
    id: string
    name: string
    folderId: string | null
    customVoiceUrl: string | null
    appearances: GlobalCharacterAppearance[]
}

export interface GlobalLocationImage {
    id: string
    imageIndex: number
    description: string | null
    imageUrl: string | null
    previousImageUrl: string | null
    isSelected: boolean
    generating: boolean
}

export interface GlobalLocation {
    id: string
    name: string
    summary: string | null
    folderId: string | null
    images: GlobalLocationImage[]
}

export interface GlobalVoice {
    id: string
    name: string
    description: string | null
    voiceId: string | null
    voiceType: string
    customVoiceUrl: string | null
    voicePrompt: string | null
    gender: string | null
    language: string
    folderId: string | null
}

export interface GlobalFolder {
    id: string
    name: string
}

// ============ 查询 Hooks ============

/**
 * 获取中心资产库角色列表
 */
export function useGlobalCharacters(folderId?: string | null) {
    return useQuery({
        queryKey: queryKeys.globalAssets.characters(folderId),
        queryFn: async () => {
            const params = new URLSearchParams()
            if (folderId) params.set('folderId', folderId)
            const res = await fetch(`/api/asset-hub/characters?${params}`)
            if (!res.ok) throw new Error('Failed to fetch characters')
            const data = await res.json()
            return data.characters as GlobalCharacter[]
        },
    })
}

/**
 * 获取中心资产库场景列表
 */
export function useGlobalLocations(folderId?: string | null) {
    return useQuery({
        queryKey: queryKeys.globalAssets.locations(folderId),
        queryFn: async () => {
            const params = new URLSearchParams()
            if (folderId) params.set('folderId', folderId)
            const res = await fetch(`/api/asset-hub/locations?${params}`)
            if (!res.ok) throw new Error('Failed to fetch locations')
            const data = await res.json()
            return data.locations as GlobalLocation[]
        },
    })
}

/**
 * 获取中心资产库音色列表
 */
export function useGlobalVoices(folderId?: string | null) {
    return useQuery({
        queryKey: queryKeys.globalAssets.voices(folderId),
        queryFn: async () => {
            const params = new URLSearchParams()
            if (folderId) params.set('folderId', folderId)
            const res = await fetch(`/api/asset-hub/voices?${params}`)
            if (!res.ok) throw new Error('Failed to fetch voices')
            const data = await res.json()
            return data.voices as GlobalVoice[]
        },
    })
}

/**
 * 获取中心资产库文件夹列表
 */
export function useGlobalFolders() {
    return useQuery({
        queryKey: queryKeys.globalAssets.folders(),
        queryFn: async () => {
            const res = await fetch('/api/asset-hub/folders')
            if (!res.ok) throw new Error('Failed to fetch folders')
            const data = await res.json()
            return data.folders as GlobalFolder[]
        },
    })
}

// ============ Mutation Hooks ============

/**
 * 生成角色图片
 */
export function useGenerateCharacterImage() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ characterId, appearanceId }: { characterId: string; appearanceId: string }) => {
            const res = await fetch('/api/asset-hub/generate-character-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ characterId, appearanceId }),
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || error.error || 'Failed to generate image')
            }
            return res.json()
        },
        // 乐观更新：立即设置 generating = true
        onMutate: async ({ characterId, appearanceId }) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.globalAssets.characters() })

            // 更新所有相关的 characters 缓存
            queryClient.setQueriesData<GlobalCharacter[]>(
                { queryKey: ['global-assets', 'characters'] },
                (old) => {
                    if (!old) return old
                    return old.map(char => {
                        if (char.id !== characterId) return char
                        return {
                            ...char,
                            appearances: char.appearances.map(app =>
                                app.id === appearanceId ? { ...app, generating: true } : app
                            )
                        }
                    })
                }
            )
        },
        onSettled: () => {
            // 刷新数据以获取最新状态
            queryClient.invalidateQueries({ queryKey: ['global-assets', 'characters'] })
        },
    })
}

/**
 * 生成场景图片
 */
export function useGenerateLocationImage() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ locationId, imageIndex }: { locationId: string; imageIndex: number }) => {
            const res = await fetch('/api/asset-hub/generate-location-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ locationId, imageIndex }),
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || error.error || 'Failed to generate image')
            }
            return res.json()
        },
        onMutate: async ({ locationId, imageIndex }) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.globalAssets.locations() })

            queryClient.setQueriesData<GlobalLocation[]>(
                { queryKey: ['global-assets', 'locations'] },
                (old) => {
                    if (!old) return old
                    return old.map(loc => {
                        if (loc.id !== locationId) return loc
                        return {
                            ...loc,
                            images: loc.images.map(img =>
                                img.imageIndex === imageIndex ? { ...img, generating: true } : img
                            )
                        }
                    })
                }
            )
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['global-assets', 'locations'] })
        },
    })
}

/**
 * 修改角色图片
 */
export function useModifyCharacterImage() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (params: {
            characterId: string
            appearanceId: string
            imageIndex: number
            modifyPrompt: string
            extraImageUrls?: string[]
        }) => {
            const res = await fetch('/api/asset-hub/modify-character-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params),
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || error.error || 'Failed to modify image')
            }
            return res.json()
        },
        onMutate: async ({ characterId, appearanceId }) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.globalAssets.characters() })

            queryClient.setQueriesData<GlobalCharacter[]>(
                { queryKey: ['global-assets', 'characters'] },
                (old) => {
                    if (!old) return old
                    return old.map(char => {
                        if (char.id !== characterId) return char
                        return {
                            ...char,
                            appearances: char.appearances.map(app =>
                                app.id === appearanceId ? { ...app, generating: true } : app
                            )
                        }
                    })
                }
            )
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['global-assets', 'characters'] })
        },
    })
}

/**
 * 修改场景图片
 */
export function useModifyLocationImage() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (params: {
            locationId: string
            imageIndex: number
            modifyPrompt: string
            extraImageUrls?: string[]
        }) => {
            const res = await fetch('/api/asset-hub/modify-location-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params),
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || error.error || 'Failed to modify image')
            }
            return res.json()
        },
        onMutate: async ({ locationId, imageIndex }) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.globalAssets.locations() })

            queryClient.setQueriesData<GlobalLocation[]>(
                { queryKey: ['global-assets', 'locations'] },
                (old) => {
                    if (!old) return old
                    return old.map(loc => {
                        if (loc.id !== locationId) return loc
                        return {
                            ...loc,
                            images: loc.images.map(img =>
                                img.imageIndex === imageIndex ? { ...img, generating: true } : img
                            )
                        }
                    })
                }
            )
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['global-assets', 'locations'] })
        },
    })
}

/**
 * 创建文件夹
 */
export function useCreateFolder() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ name }: { name: string }) => {
            const res = await fetch('/api/asset-hub/folders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || error.error || 'Failed to create folder')
            }
            return res.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.folders() })
        },
    })
}

/**
 * 更新文件夹
 */
export function useUpdateFolder() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ folderId, name }: { folderId: string; name: string }) => {
            const res = await fetch('/api/asset-hub/folders', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folderId, name }),
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || error.error || 'Failed to update folder')
            }
            return res.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.folders() })
        },
    })
}

/**
 * 删除文件夹
 */
export function useDeleteFolder() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ folderId }: { folderId: string }) => {
            const res = await fetch(`/api/asset-hub/folders?folderId=${folderId}`, {
                method: 'DELETE',
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || error.error || 'Failed to delete folder')
            }
            return res.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.folders() })
            // 也刷新资产，因为删除文件夹可能影响资产的 folderId
            queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.all() })
        },
    })
}

/**
 * 刷新所有中心资产库数据
 */
export function useRefreshGlobalAssets() {
    const queryClient = useQueryClient()

    return () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.all() })
    }
}
