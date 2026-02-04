/**
 * 角色档案管理 Hook
 * 处理未确认档案的显示和确认逻辑
 * 
 * 🔥 V6.5 重构：直接订阅 useProjectAssets，消除 props drilling
 */

'use client'

import { useState, useCallback, useMemo } from 'react'
import { CharacterProfileData, parseProfileData } from '@/types/character-profile'
import { useProjectAssets, useRefreshProjectAssets } from '@/lib/query/hooks'

interface UseProfileManagementProps {
    projectId: string
    showToast?: (message: string, type: 'success' | 'warning' | 'error') => void
}

export function useProfileManagement({
    projectId,
    showToast
}: UseProfileManagementProps) {
    // 🔥 直接订阅缓存 - 消除 props drilling
    const { data: assets } = useProjectAssets(projectId)
    const characters = assets?.characters ?? []

    // 🔥 使用刷新函数
    const refreshAssets = useRefreshProjectAssets(projectId)

    // 🔥 修复：使用 Set 支持同时确认多个角色
    const [confirmingCharacterIds, setConfirmingCharacterIds] = useState<Set<string>>(new Set())
    const [deletingCharacterId, setDeletingCharacterId] = useState<string | null>(null)
    const [batchConfirming, setBatchConfirming] = useState(false)
    const [editingProfile, setEditingProfile] = useState<{
        characterId: string
        characterName: string
        profileData: CharacterProfileData
    } | null>(null)

    // 获取未确认的角色
    const unconfirmedCharacters = useMemo(() =>
        characters.filter(char => char.profileData && !char.profileConfirmed),
        [characters]
    )

    // 打开编辑对话框
    const handleEditProfile = useCallback((characterId: string, characterName: string) => {
        const character = characters.find(c => c.id === characterId)
        if (!character?.profileData) return

        const profileData = parseProfileData(character.profileData)
        if (!profileData) {
            showToast?.('档案数据解析失败', 'error')
            return
        }

        setEditingProfile({ characterId, characterName, profileData })
    }, [characters, showToast])

    // 确认单个角色
    const handleConfirmProfile = useCallback(async (
        characterId: string,
        updatedProfileData?: CharacterProfileData
    ) => {
        // 🔥 添加到确认中集合
        setConfirmingCharacterIds(prev => new Set(prev).add(characterId))
        try {
            const res = await fetch(`/api/novel-promotion/${projectId}/character-profile/confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    characterId,
                    profileData: updatedProfileData,
                    generateImage: true
                })
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || '确认失败')
            }

            showToast?.('✓ 档案确认成功，正在生成视觉描述', 'success')
            refreshAssets()
        } catch (error: any) {
            showToast?.(`确认失败: ${error.message}`, 'error')
        } finally {
            // 🔥 从确认中集合移除
            setConfirmingCharacterIds(prev => {
                const newSet = new Set(prev)
                newSet.delete(characterId)
                return newSet
            })
            setEditingProfile(null)
        }
    }, [projectId, refreshAssets, showToast])

    // 批量确认所有角色
    const handleBatchConfirm = useCallback(async () => {
        if (unconfirmedCharacters.length === 0) {
            showToast?.('没有待确认的角色', 'warning')
            return
        }

        if (!confirm(`确认为 ${unconfirmedCharacters.length} 个角色生成视觉描述吗？`)) {
            return
        }

        setBatchConfirming(true)
        try {
            const res = await fetch(`/api/novel-promotion/${projectId}/character-profile/batch-confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || '批量确认失败')
            }

            const result = await res.json()
            showToast?.(`✓ 已为 ${result.count} 个角色生成视觉描述`, 'success')
            refreshAssets()
        } catch (error: any) {
            showToast?.(`批量确认失败: ${error.message}`, 'error')
        } finally {
            setBatchConfirming(false)
        }
    }, [projectId, unconfirmedCharacters.length, refreshAssets, showToast])

    // 删除角色档案（同时删除角色）
    const handleDeleteProfile = useCallback(async (characterId: string) => {
        if (!confirm('确定要删除此角色吗？此操作不可撤销。')) {
            return
        }

        setDeletingCharacterId(characterId)
        try {
            const res = await fetch(`/api/novel-promotion/${projectId}/character?id=${characterId}`, {
                method: 'DELETE'
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || '删除失败')
            }

            showToast?.('✓ 角色已删除', 'success')
            refreshAssets()
        } catch (error: any) {
            showToast?.(`删除失败: ${error.message}`, 'error')
        } finally {
            setDeletingCharacterId(null)
        }
    }, [projectId, refreshAssets, showToast])

    return {
        // 🔥 暴露 characters 供组件使用
        characters,
        unconfirmedCharacters,
        confirmingCharacterIds,
        isConfirmingCharacter: (id: string) => confirmingCharacterIds.has(id),
        deletingCharacterId,
        batchConfirming,
        editingProfile,
        handleEditProfile,
        handleConfirmProfile,
        handleBatchConfirm,
        handleDeleteProfile,
        setEditingProfile
    }
}
