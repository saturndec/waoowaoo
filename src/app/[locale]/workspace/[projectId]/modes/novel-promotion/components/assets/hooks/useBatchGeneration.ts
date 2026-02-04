'use client'

/**
 * useBatchGeneration - 批量生成资产图片
 * 从 AssetsStage.tsx 提取
 * 
 * 🔥 V6.5 重构：直接订阅 useProjectAssets，消除 props drilling
 * 🔥 V6.6 重构：内部使用 mutation hooks，移除 onGenerateImage prop
 */

import { useState, useCallback } from 'react'
import { CharacterAppearance } from '@/types/project'
import { useProjectAssets, useRefreshProjectAssets, useGenerateProjectCharacterImage, useGenerateProjectLocationImage, type Character, type Location } from '@/lib/query/hooks'

interface UseBatchGenerationProps {
    projectId: string
    // 🔥 V6.6：移除 onGenerateImage，内部使用 mutation hooks
    handleGenerateImage?: (type: 'character' | 'location', id: string, appearanceId?: string) => Promise<void> | void
}

export function useBatchGeneration({
    projectId,
    handleGenerateImage: externalHandleGenerateImage
}: UseBatchGenerationProps) {
    // 🔥 直接订阅缓存 - 消除 props drilling
    const { data: assets } = useProjectAssets(projectId)
    const characters = assets?.characters ?? []
    const locations = assets?.locations ?? []

    // 🔥 使用刷新函数
    const refreshAssets = useRefreshProjectAssets(projectId)

    // 🔥 V6.6：内部 mutation hooks
    const generateCharacterImage = useGenerateProjectCharacterImage(projectId)
    const generateLocationImage = useGenerateProjectLocationImage(projectId)

    // 🔥 内部图片生成函数
    const internalHandleGenerateImage = useCallback(async (type: 'character' | 'location', id: string, appearanceId?: string) => {
        if (type === 'character' && appearanceId) {
            await generateCharacterImage.mutateAsync({ characterId: id, appearanceId })
        } else if (type === 'location') {
            await generateLocationImage.mutateAsync({ locationId: id, imageIndex: 0 })
        }
    }, [generateCharacterImage, generateLocationImage])

    // 使用外部传入的函数或内部实现
    const handleGenerateImage = externalHandleGenerateImage || internalHandleGenerateImage

    const [isGeneratingAll, setIsGeneratingAll] = useState(false)
    const [generatingProgress, setGeneratingProgress] = useState({ current: 0, total: 0 })
    const [regeneratingItems, setRegeneratingItems] = useState<Set<string>>(new Set())

    // 获取形象列表（内置实现，不再依赖外部传入）
    const getAppearances = useCallback((character: Character): CharacterAppearance[] => {
        return character.appearances || []
    }, [])

    // 生成全部资产图片（仅缺失图片的）
    const handleGenerateAllImages = async () => {
        const tasks: Array<{
            type: 'character' | 'location'
            id: string
            appearanceId?: string
            key: string
        }> = []

        // 收集角色资产
        characters.forEach(char => {
            const appearances = getAppearances(char)
            appearances.forEach(app => {
                if (!app.imageUrl && !app.imageUrls?.length) {
                    tasks.push({
                        type: 'character',
                        id: char.id,
                        appearanceId: app.id,
                        key: `character-${char.id}-${app.id}-group`
                    })
                }
            })
        })

        // 收集场景资产
        locations.forEach(loc => {
            const hasImage = loc.images?.some(img => img.imageUrl)
            if (!hasImage) {
                tasks.push({
                    type: 'location',
                    id: loc.id,
                    key: `location-${loc.id}-group`
                })
            }
        })

        if (tasks.length === 0) {
            alert('所有资产都已有图片，无需生成')
            return
        }

        setIsGeneratingAll(true)
        setGeneratingProgress({ current: 0, total: tasks.length })

        const allKeys = new Set(tasks.map(t => t.key))
        setRegeneratingItems(prev => new Set([...prev, ...allKeys]))

        try {
            await Promise.all(
                tasks.map(async (task) => {
                    try {
                        await handleGenerateImage(task.type, task.id, task.appearanceId)
                        setGeneratingProgress(prev => ({ ...prev, current: prev.current + 1 }))
                    } catch (error) {
                        console.error(`Failed to generate ${task.type} ${task.id}:`, error)
                        setGeneratingProgress(prev => ({ ...prev, current: prev.current + 1 }))
                    } finally {
                        setRegeneratingItems(prev => {
                            const next = new Set(prev)
                            next.delete(task.key)
                            return next
                        })
                    }
                })
            )
        } finally {
            setIsGeneratingAll(false)
            setGeneratingProgress({ current: 0, total: 0 })
            refreshAssets()
        }
    }

    // 重新生成全部资产图片（包含已有图片的）
    const handleRegenerateAllImages = async () => {
        if (!confirm('确定要重新生成所有资产的图片吗？这将覆盖现有图片。')) return

        const tasks: Array<{
            type: 'character' | 'location'
            id: string
            appearanceId?: string
            key: string
        }> = []

        characters.forEach(char => {
            const appearances = getAppearances(char)
            appearances.forEach(app => {
                tasks.push({
                    type: 'character',
                    id: char.id,
                    appearanceId: app.id,
                    key: `character-${char.id}-${app.id}-group`
                })
            })
        })

        locations.forEach(loc => {
            tasks.push({
                type: 'location',
                id: loc.id,
                key: `location-${loc.id}-group`
            })
        })

        if (tasks.length === 0) {
            alert('没有可生成的资产')
            return
        }

        setIsGeneratingAll(true)
        setGeneratingProgress({ current: 0, total: tasks.length })

        const allKeys = new Set(tasks.map(t => t.key))
        setRegeneratingItems(prev => new Set([...prev, ...allKeys]))

        try {
            await Promise.all(
                tasks.map(async (task) => {
                    try {
                        await handleGenerateImage(task.type, task.id, task.appearanceId)
                        setGeneratingProgress(prev => ({ ...prev, current: prev.current + 1 }))
                    } catch (error) {
                        console.error(`Failed to generate ${task.type} ${task.id}:`, error)
                        setGeneratingProgress(prev => ({ ...prev, current: prev.current + 1 }))
                    } finally {
                        setRegeneratingItems(prev => {
                            const next = new Set(prev)
                            next.delete(task.key)
                            return next
                        })
                    }
                })
            )
        } finally {
            setIsGeneratingAll(false)
            setGeneratingProgress({ current: 0, total: 0 })
            refreshAssets()
        }
    }

    // 🆕 清除单个 regeneratingItems 键（用于取消生成）
    const clearRegeneratingItem = useCallback((key: string) => {
        setRegeneratingItems(prev => {
            const next = new Set(prev)
            next.delete(key)
            return next
        })
    }, [])

    return {
        // 🔥 暴露数据供组件使用
        characters,
        locations,
        getAppearances,
        // 状态
        isGeneratingAll,
        generatingProgress,
        regeneratingItems,
        setRegeneratingItems,
        clearRegeneratingItem,  // 🆕 用于取消生成时清除状态
        // 操作
        handleGenerateAllImages,
        handleRegenerateAllImages
    }
}
