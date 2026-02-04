'use client'

/**
 * useLocationActions - 场景资产操作 Hook
 * 从 AssetsStage 提取，负责场景的 CRUD 和图片生成操作
 * 
 * 🔥 V6.5 重构：直接订阅 useProjectAssets，消除 props drilling
 */

import { useCallback } from 'react'
import { isAbortError } from '@/lib/error-utils'
import {
    useProjectAssets,
    useRefreshProjectAssets,
    useRegenerateSingleLocationImage,
    useRegenerateLocationGroup,
    type Location
} from '@/lib/query/hooks'

interface UseLocationActionsProps {
    projectId: string
    showToast?: (message: string, type: 'success' | 'warning' | 'error') => void
}

export function useLocationActions({
    projectId,
    showToast
}: UseLocationActionsProps) {
    // 🔥 直接订阅缓存 - 消除 props drilling
    const { data: assets } = useProjectAssets(projectId)
    const locations = assets?.locations ?? []

    // 🔥 使用刷新函数 - mutations 完成后刷新缓存
    const refreshAssets = useRefreshProjectAssets(projectId)

    // 🔥 V6.7: 使用重新生成mutation hooks
    const regenerateSingleImage = useRegenerateSingleLocationImage(projectId)
    const regenerateGroup = useRegenerateLocationGroup(projectId)

    // 删除场景
    const handleDeleteLocation = useCallback(async (locationId: string) => {
        if (!confirm('确定要删除这个场景吗？')) return
        try {
            const res = await fetch(`/api/novel-promotion/${projectId}/location?id=${locationId}`, {
                method: 'DELETE'
            })
            if (!res.ok) throw new Error('删除失败')
            // 🔥 刷新缓存
            refreshAssets()
        } catch (error: any) {
            if (!isAbortError(error)) {
                alert('删除失败: ' + error.message)
            }
        }
    }, [projectId, refreshAssets])

    // 处理场景图片选择
    const handleSelectLocationImage = useCallback(async (locationId: string, imageIndex: number | null) => {
        try {
            const res = await fetch(`/api/novel-promotion/${projectId}/select-location-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ locationId, selectedIndex: imageIndex })
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
    const handleConfirmLocationSelection = useCallback(async (locationId: string) => {
        try {
            const res = await fetch(`/api/novel-promotion/${projectId}/location/confirm-selection`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ locationId })
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

    // 单张重新生成场景图片 - 🔥 V6.7: 使用mutation hook
    const handleRegenerateSingleLocation = useCallback((locationId: string, imageIndex: number) => {
        regenerateSingleImage.mutate(
            { locationId, imageIndex },
            {
                onError: (error) => {
                    if (!isAbortError(error)) {
                        alert('重新生成失败: ' + error.message)
                    }
                }
            }
        )
    }, [regenerateSingleImage])

    // 整组重新生成场景图片 - 🔥 V6.7: 使用mutation hook
    const handleRegenerateLocationGroup = useCallback((locationId: string) => {
        regenerateGroup.mutate(
            { locationId },
            {
                onError: (error) => {
                    if (!isAbortError(error)) {
                        alert('重新生成失败: ' + error.message)
                    }
                }
            }
        )
    }, [regenerateGroup])

    // 更新场景描述 - 🔥 保存到服务器
    const handleUpdateLocationDescription = useCallback(async (
        locationId: string,
        newDescription: string
    ) => {
        try {
            const res = await fetch(`/api/novel-promotion/${projectId}/location`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    locationId,
                    description: newDescription
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
    }, [projectId, refreshAssets])



    return {
        // 🔥 暴露 locations 供组件使用
        locations,
        handleDeleteLocation,
        handleSelectLocationImage,
        handleConfirmLocationSelection,
        handleRegenerateSingleLocation,
        handleRegenerateLocationGroup,
        handleUpdateLocationDescription
    }
}
