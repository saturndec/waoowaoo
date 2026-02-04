/**
 * Asset Hub Mutations
 * 封装所有数据修改操作，自动处理缓存刷新
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../keys'

// ============================================
// 角色相关 Mutations
// ============================================

/**
 * 生成角色图片
 */
export function useGenerateCharacterImage() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ characterId, appearanceIndex }: { characterId: string; appearanceIndex: number }) => {
            const res = await fetch('/api/asset-hub/generate-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'character',
                    id: characterId,
                    appearanceIndex
                })
            })
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Failed to generate image')
            }
            return res.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.characters() })
        }
    })
}

/**
 * 选择角色图片
 */
export function useSelectCharacterImage() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({
            characterId,
            appearanceIndex,
            imageIndex,
            confirm = false
        }: {
            characterId: string
            appearanceIndex: number
            imageIndex: number | null
            confirm?: boolean
        }) => {
            const res = await fetch('/api/asset-hub/select-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'character',
                    id: characterId,
                    appearanceIndex,
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
            // 仅在确认时刷新，避免选择时闪烁
            if (variables.confirm) {
                queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.characters() })
            }
        }
    })
}

/**
 * 撤回角色图片
 */
export function useUndoCharacterImage() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ characterId, appearanceIndex }: { characterId: string; appearanceIndex: number }) => {
            const res = await fetch('/api/asset-hub/undo-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'character',
                    id: characterId,
                    appearanceIndex
                })
            })
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Failed to undo image')
            }
            return res.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.characters() })
        }
    })
}

/**
 * 上传角色图片
 */
export function useUploadCharacterImage() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({
            file,
            characterId,
            appearanceIndex,
            labelText,
            imageIndex
        }: {
            file: File
            characterId: string
            appearanceIndex: number
            labelText: string
            imageIndex?: number
        }) => {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('type', 'character')
            formData.append('id', characterId)
            formData.append('appearanceIndex', appearanceIndex.toString())
            formData.append('labelText', labelText)
            if (imageIndex !== undefined) {
                formData.append('imageIndex', imageIndex.toString())
            }

            const res = await fetch('/api/asset-hub/upload-image', {
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
            queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.characters() })
        }
    })
}

/**
 * 删除角色
 */
export function useDeleteCharacter() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (characterId: string) => {
            const res = await fetch(`/api/asset-hub/characters/${characterId}`, { method: 'DELETE' })
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Failed to delete character')
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.characters() })
        }
    })
}

/**
 * 删除角色子形象
 */
export function useDeleteCharacterAppearance() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ characterId, appearanceIndex }: { characterId: string; appearanceIndex: number }) => {
            const res = await fetch(
                `/api/asset-hub/appearances?characterId=${characterId}&appearanceIndex=${appearanceIndex}`,
                { method: 'DELETE' }
            )
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Failed to delete appearance')
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.characters() })
        }
    })
}

/**
 * 上传角色音色
 */
export function useUploadCharacterVoice() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ file, characterId }: { file: File; characterId: string }) => {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('characterId', characterId)

            const res = await fetch('/api/asset-hub/character-voice', {
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
            queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.characters() })
        }
    })
}

// ============================================
// 场景相关 Mutations
// ============================================

/**
 * 生成场景图片
 */
export function useGenerateLocationImage() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (locationId: string) => {
            const res = await fetch('/api/asset-hub/generate-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'location', id: locationId })
            })
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Failed to generate image')
            }
            return res.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.locations() })
        }
    })
}

/**
 * 选择场景图片
 */
export function useSelectLocationImage() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({
            locationId,
            imageIndex,
            confirm = false
        }: {
            locationId: string
            imageIndex: number | null
            confirm?: boolean
        }) => {
            const res = await fetch('/api/asset-hub/select-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'location',
                    id: locationId,
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
                queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.locations() })
            }
        }
    })
}

/**
 * 撤回场景图片
 */
export function useUndoLocationImage() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (locationId: string) => {
            const res = await fetch('/api/asset-hub/undo-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'location', id: locationId })
            })
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Failed to undo image')
            }
            return res.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.locations() })
        }
    })
}

/**
 * 上传场景图片
 */
export function useUploadLocationImage() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({
            file,
            locationId,
            labelText,
            imageIndex
        }: {
            file: File
            locationId: string
            labelText: string
            imageIndex?: number
        }) => {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('type', 'location')
            formData.append('id', locationId)
            formData.append('labelText', labelText)
            if (imageIndex !== undefined) {
                formData.append('imageIndex', imageIndex.toString())
            }

            const res = await fetch('/api/asset-hub/upload-image', {
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
            queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.locations() })
        }
    })
}

/**
 * 删除场景
 */
export function useDeleteLocation() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (locationId: string) => {
            const res = await fetch(`/api/asset-hub/locations/${locationId}`, { method: 'DELETE' })
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Failed to delete location')
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.locations() })
        }
    })
}

// ============================================
// 音色相关 Mutations
// ============================================

/**
 * 删除音色
 */
export function useDeleteVoice() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (voiceId: string) => {
            const res = await fetch(`/api/asset-hub/voices/${voiceId}`, { method: 'DELETE' })
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Failed to delete voice')
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.voices() })
        }
    })
}

// ============================================
// 编辑相关 Mutations
// ============================================

/**
 * 更新角色名字
 */
export function useUpdateCharacterName() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ characterId, name }: { characterId: string; name: string }) => {
            const res = await fetch(`/api/asset-hub/characters/${characterId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            })
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Failed to update character name')
            }

            // 后台更新图片标签（不阻塞）
            fetch('/api/asset-hub/update-asset-label', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'character', id: characterId, newName: name })
            }).catch(console.error)

            return res.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.characters() })
        }
    })
}

/**
 * 更新场景名字
 */
export function useUpdateLocationName() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ locationId, name }: { locationId: string; name: string }) => {
            const res = await fetch(`/api/asset-hub/locations/${locationId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            })
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Failed to update location name')
            }

            // 后台更新图片标签（不阻塞）
            fetch('/api/asset-hub/update-asset-label', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'location', id: locationId, newName: name })
            }).catch(console.error)

            return res.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.locations() })
        }
    })
}
