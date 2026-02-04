'use client'

import { useState, useCallback } from 'react'
import { useRefreshEpisodeData } from '@/lib/query/hooks'
import { NovelPromotionStoryboard } from '@/types/project'

/**
 * usePanelVariant - 镜头变体操作 Hook
 * 
 * 管理镜头变体相关的状态和操作
 * 🔥 使用乐观更新：点击后立即插入占位 panel，不等待 API 响应
 */

interface VariantData {
    title: string
    description: string
    shot_type: string
    camera_move: string
    video_prompt: string
}

interface VariantOptions {
    includeCharacterAssets: boolean
    includeLocationAsset: boolean
}

interface VariantModalState {
    panelId: string
    panelNumber: number | null
    description: string | null
    imageUrl: string | null
    storyboardId: string
}

interface UsePanelVariantProps {
    projectId: string
    episodeId: string
    // 🔥 需要 setLocalStoryboards 来实现乐观更新
    setLocalStoryboards: React.Dispatch<React.SetStateAction<NovelPromotionStoryboard[]>>
}

export function usePanelVariant({ projectId, episodeId, setLocalStoryboards }: UsePanelVariantProps) {
    // 🔥 使用 React Query 刷新 - 刷新 episodeData（包含 storyboards 和 panels）
    const onRefresh = useRefreshEpisodeData(projectId, episodeId)
    // 变体模态框状态
    const [variantModalState, setVariantModalState] = useState<VariantModalState | null>(null)

    // 正在生成变体的 Panel ID
    const [generatingVariantPanelId, setGeneratingVariantPanelId] = useState<string | null>(null)

    // 打开变体模态框
    const openVariantModal = useCallback((panel: VariantModalState) => {
        setVariantModalState(panel)
    }, [])

    // 关闭变体模态框
    const closeVariantModal = useCallback(() => {
        setVariantModalState(null)
    }, [])

    // 执行变体生成
    const generatePanelVariant = useCallback(async (
        sourcePanelId: string,
        storyboardId: string,
        insertAfterPanelId: string,
        variant: VariantData,
        options: VariantOptions
    ) => {
        setGeneratingVariantPanelId(sourcePanelId)

        // 🔥 乐观更新：立即在本地状态中插入临时占位 panel
        const tempPanelId = `temp-variant-${Date.now()}`
        setLocalStoryboards(prev => prev.map(sb => {
            if (sb.id !== storyboardId) return sb

            // 找到插入位置
            const panels = (sb as any).panels || []
            const insertIndex = panels.findIndex((p: any) => p.id === insertAfterPanelId)
            if (insertIndex === -1) return sb

            // 创建临时占位 panel
            const tempPanel = {
                id: tempPanelId,
                storyboardId,
                panelIndex: insertIndex + 1,
                panelNumber: (panels[insertIndex]?.panelNumber || 0) + 0.5, // 临时编号
                title: variant.title || '加载中...',
                description: variant.description || '正在生成镜头变体...',
                shotType: variant.shot_type,
                cameraMove: variant.camera_move,
                videoPrompt: variant.video_prompt,
                imageUrl: null,
                generatingImage: true, // 🔥 显示加载状态
                characters: null,
                location: null,
                candidateImages: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }

            // 插入临时 panel
            const newPanels = [
                ...panels.slice(0, insertIndex + 1),
                tempPanel,
                ...panels.slice(insertIndex + 1)
            ]

            console.log('[usePanelVariant] 🎯 乐观更新：插入临时占位 panel', tempPanelId)

            return {
                ...sb,
                panels: newPanels
            }
        }))

        // 🔥 立即关闭模态框（不等待 API）
        setVariantModalState(null)

        try {
            const res = await fetch(`/api/novel-promotion/${projectId}/panel-variant`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    storyboardId,
                    insertAfterPanelId,
                    sourcePanelId,
                    variant,
                    includeCharacterAssets: options.includeCharacterAssets,
                    includeLocationAsset: options.includeLocationAsset
                })
            })

            const data = await res.json()

            if (!res.ok) {
                // API 失败：移除临时 panel 并显示错误
                setLocalStoryboards(prev => prev.map(sb => {
                    if (sb.id !== storyboardId) return sb
                    const panels = ((sb as any).panels || []).filter((p: any) => p.id !== tempPanelId)
                    return { ...sb, panels }
                }))
                throw new Error(data.error || data.details || '生成变体失败')
            }

            // 🔥 API 成功：刷新数据替换临时 panel 为真实数据
            console.log('[usePanelVariant] ✅ API 成功，刷新数据', data)
            if (onRefresh) {
                await onRefresh()
            }

            return data
        } catch (error) {
            console.error('[usePanelVariant] 生成变体失败:', error)
            throw error
        } finally {
            setGeneratingVariantPanelId(null)
        }
    }, [projectId, onRefresh, setLocalStoryboards])


    // 处理模态框中的变体选择
    const handleVariantSelect = useCallback(async (
        variant: VariantData,
        options: VariantOptions
    ) => {
        if (!variantModalState) return

        // 在原 panel 之后插入变体
        await generatePanelVariant(
            variantModalState.panelId,
            variantModalState.storyboardId,
            variantModalState.panelId, // 在当前 panel 之后插入
            variant,
            options
        )
    }, [variantModalState, generatePanelVariant])

    return {
        // 状态
        variantModalState,
        generatingVariantPanelId,
        isVariantModalOpen: !!variantModalState,
        isGeneratingVariant: !!generatingVariantPanelId,

        // 操作
        openVariantModal,
        closeVariantModal,
        generatePanelVariant,
        handleVariantSelect
    }
}

