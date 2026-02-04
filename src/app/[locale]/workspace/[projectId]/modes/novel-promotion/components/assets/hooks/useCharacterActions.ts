'use client'

/**
 * useCharacterActions - 角色资产操作 Hook
 * 从 AssetsStage 提取，负责角色的 CRUD 和图片生成操作
 * 
 * 🔥 V6.5 重构：直接订阅 useProjectAssets，消除 props drilling
 */

import { useCallback } from 'react'
import { CharacterAppearance } from '@/types/project'
import { isAbortError } from '@/lib/error-utils'
import {
    useProjectAssets,
    useRefreshProjectAssets,
    useRegenerateSingleCharacterImage,
    useRegenerateCharacterGroup,
    type Character
} from '@/lib/query/hooks'

interface UseCharacterActionsProps {
    projectId: string
    showToast?: (message: string, type: 'success' | 'warning' | 'error') => void
}

export function useCharacterActions({
    projectId,
    showToast
}: UseCharacterActionsProps) {
    // 🔥 直接订阅缓存 - 消除 props drilling
    const { data: assets } = useProjectAssets(projectId)
    const characters = assets?.characters ?? []

    // 🔥 使用刷新函数 - mutations 完成后刷新缓存
    const refreshAssets = useRefreshProjectAssets(projectId)

    // 🔥 V6.7: 使用重新生成mutation hooks
    const regenerateSingleImage = useRegenerateSingleCharacterImage(projectId)
    const regenerateGroup = useRegenerateCharacterGroup(projectId)

    // 获取形象列表
    const getAppearances = useCallback((character: Character): CharacterAppearance[] => {
        return character.appearances || []
    }, [])

    // 删除角色
    const handleDeleteCharacter = useCallback(async (characterId: string) => {
        if (!confirm('确定要删除这个角色吗？')) return
        try {
            const res = await fetch(`/api/novel-promotion/${projectId}/character?id=${characterId}`, {
                method: 'DELETE'
            })
            if (!res.ok) throw new Error('删除失败')
            // 🔥 刷新缓存 - 代替乐观更新
            refreshAssets()
        } catch (error: any) {
            if (!isAbortError(error)) {
                alert('删除失败: ' + error.message)
            }
        }
    }, [projectId, refreshAssets])

    // 删除单个形象
    const handleDeleteAppearance = useCallback(async (characterId: string, appearanceId: string) => {
        if (!confirm('确定要删除这个形象吗？')) return
        try {
            const res = await fetch(
                `/api/novel-promotion/${projectId}/character/appearance?characterId=${characterId}&appearanceId=${appearanceId}`,
                { method: 'DELETE' }
            )
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || '删除失败')
            }
            // 🔥 刷新缓存
            refreshAssets()
        } catch (error: any) {
            if (!isAbortError(error)) {
                alert('删除失败: ' + error.message)
            }
        }
    }, [projectId, refreshAssets])

    // 处理角色图片选择
    const handleSelectCharacterImage = useCallback(async (
        characterId: string,
        appearanceId: string,
        imageIndex: number | null
    ) => {
        try {
            const res = await fetch(`/api/novel-promotion/${projectId}/select-character-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ characterId, appearanceId, selectedIndex: imageIndex })
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || '选择失败')
            }

            // 🔥 刷新缓存
            refreshAssets()
        } catch (error: any) {
            if (isAbortError(error)) {
                console.log('请求被中断（可能是页面刷新），后端仍在执行')
                return
            }
            alert('选择图片失败: ' + error.message)
        }
    }, [projectId, refreshAssets])

    // 确认选择并删除其他候选图片
    const handleConfirmSelection = useCallback(async (characterId: string, appearanceId: string) => {
        try {
            const res = await fetch(`/api/novel-promotion/${projectId}/character/confirm-selection`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ characterId, appearanceId })
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || '确认选择失败')
            }

            const data = await res.json()
            showToast?.(`✓ ${data.message}`, 'success')

            // 🔥 刷新缓存
            refreshAssets()
        } catch (error: any) {
            if (isAbortError(error)) {
                console.log('请求被中断（可能是页面刷新），后端仍在执行')
                return
            }
            showToast?.('确认选择失败: ' + error.message, 'error')
        }
    }, [projectId, refreshAssets, showToast])

    // 单张重新生成角色图片 - 🔥 V6.7: 使用mutation hook
    const handleRegenerateSingleCharacter = useCallback((
        characterId: string,
        appearanceId: string,
        imageIndex: number
    ) => {
        regenerateSingleImage.mutate(
            { characterId, appearanceId, imageIndex },
            {
                onError: (error) => {
                    if (!isAbortError(error)) {
                        alert('重新生成失败: ' + error.message)
                    }
                }
            }
        )
    }, [regenerateSingleImage])

    // 整组重新生成角色图片 - 🔥 V6.7: 使用mutation hook
    const handleRegenerateCharacterGroup = useCallback((characterId: string, appearanceId: string) => {
        regenerateGroup.mutate(
            { characterId, appearanceId },
            {
                onError: (error) => {
                    if (!isAbortError(error)) {
                        alert('重新生成失败: ' + error.message)
                    }
                }
            }
        )
    }, [regenerateGroup])

    // 更新形象描述 - 🔥 仍需保存到服务器
    const handleUpdateAppearanceDescription = useCallback(async (
        characterId: string,
        appearanceId: string,
        newDescription: string,
        descriptionIndex?: number
    ) => {
        try {
            // 找到当前角色和形象
            const character = characters.find(c => c.id === characterId)
            const appearance = character?.appearances?.find(a => a.id === appearanceId)
            if (!appearance) return

            let updatedDescriptions: string[] | undefined
            if (descriptionIndex !== undefined && appearance.descriptions) {
                updatedDescriptions = [...appearance.descriptions]
                updatedDescriptions[descriptionIndex] = newDescription
            }

            // 🔥 保存到服务器
            const res = await fetch(`/api/novel-promotion/${projectId}/character/appearance`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    characterId,
                    appearanceId,
                    description: descriptionIndex !== undefined ? updatedDescriptions?.[0] : newDescription,
                    descriptions: updatedDescriptions
                })
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || '更新描述失败')
            }

            // 刷新缓存
            refreshAssets()
        } catch (error: any) {
            if (!isAbortError(error)) {
                console.error('更新描述失败:', error.message)
            }
        }
    }, [projectId, characters, refreshAssets])

    return {
        // 🔥 暴露 characters 供组件使用（可选，组件也可以自己订阅）
        characters,
        getAppearances,
        handleDeleteCharacter,
        handleDeleteAppearance,
        handleSelectCharacterImage,
        handleConfirmSelection,
        handleRegenerateSingleCharacter,
        handleRegenerateCharacterGroup,
        handleUpdateAppearanceDescription
    }
}
