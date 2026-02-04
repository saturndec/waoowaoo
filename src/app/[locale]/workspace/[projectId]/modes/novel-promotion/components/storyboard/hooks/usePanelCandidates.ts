'use client'

/**
 * usePanelCandidates - 镜头候选图片管理 Hook
 * 内部使用 useCandidateSystem 进行状态管理
 * 
 * 保持与旧版本 API 兼容，同时复用统一的候选图系统
 */

import { useCallback } from 'react'
import { NovelPromotionPanel } from '@/types/project'
import { useCandidateSystem } from '@/hooks/common/useCandidateSystem'
import { useRefreshProjectAssets, useRefreshEpisodeData, useRefreshStoryboards } from '@/lib/query/hooks'

interface UsePanelCandidatesProps {
    projectId: string
    episodeId?: string
    onConfirmed?: (panelId: string, imageUrl: string | null) => void
}

interface PanelCandidateData {
    candidates: string[]
    selectedIndex: number
}

export function usePanelCandidates({
    projectId,
    episodeId,
    onConfirmed
}: UsePanelCandidatesProps) {
    // 🔥 使用 React Query 刷新
    const onSilentRefresh = useRefreshProjectAssets(projectId)
    const refreshEpisode = useRefreshEpisodeData(projectId, episodeId ?? null)
    const refreshStoryboards = useRefreshStoryboards(episodeId ?? null)

    // 使用统一的候选图系统
    const candidateSystem = useCandidateSystem<string>()

    /**
     * 确保镜头候选图片已初始化到候选系统（应在 useEffect 中调用）
     * 返回是否有有效的候选图片
     */
    const ensurePanelCandidatesInitialized = useCallback((panel: NovelPromotionPanel): boolean => {
        const candidateImagesStr = (panel as any).candidateImages
        if (!candidateImagesStr) {
            // 🔥 候选已清空，清理本地状态，避免残留导致仍需确认
            const existingState = candidateSystem.getCandidateState(panel.id)
            if (existingState) {
                candidateSystem.clearCandidates(panel.id)
            }
            return false
        }

        try {
            const candidates = JSON.parse(candidateImagesStr)
            if (!Array.isArray(candidates) || candidates.length === 0) {
                const existingState = candidateSystem.getCandidateState(panel.id)
                if (existingState) {
                    candidateSystem.clearCandidates(panel.id)
                }
                return false
            }

            const validCandidates = candidates.filter((c: string) => c && !c.startsWith('PENDING:'))
            if (validCandidates.length === 0) {
                const existingState = candidateSystem.getCandidateState(panel.id)
                if (existingState) {
                    candidateSystem.clearCandidates(panel.id)
                }
                return false
            }

            // 检查是否已在候选系统中，如果没有则初始化
            const existingState = candidateSystem.getCandidateState(panel.id)
            if (!existingState) {
                candidateSystem.initCandidates(
                    panel.id,
                    (panel as any).imageUrl || null,
                    validCandidates,
                    (panel as any).previousImageUrl || null
                )
            }


            return true
        } catch {
            return false
        }
    }, [candidateSystem])

    /**
     * 获取镜头的候选图片数据（纯函数，只读取不修改状态）
     * 🔥 优先从本地候选系统读取，确保 clearCandidates 后立即生效
     * 必须先调用 ensurePanelCandidatesInitialized 初始化
     */
    const getPanelCandidates = useCallback((panel: NovelPromotionPanel): PanelCandidateData | null => {
        // 先检查本地候选系统
        const localState = candidateSystem.getCandidateState(panel.id)

        // 如果本地状态存在，使用本地状态（包括用户选择的索引）
        if (localState && localState.candidates.length > 0) {
            return {
                candidates: localState.candidates,
                selectedIndex: localState.selectedIndex
            }
        }

        // 🔥 如果本地没有状态，从数据库读取（仅在初始化时）
        const candidateImagesStr = (panel as any).candidateImages
        if (!candidateImagesStr) return null

        try {
            const candidates = JSON.parse(candidateImagesStr)
            if (!Array.isArray(candidates) || candidates.length === 0) return null

            const validCandidates = candidates.filter((c: string) => c && !c.startsWith('PENDING:'))
            if (validCandidates.length === 0) return null

            // 返回数据库中的候选图片（默认索引 0）
            return {
                candidates: validCandidates,
                selectedIndex: 0
            }
        } catch {
            return null
        }
    }, [candidateSystem])

    /**
     * 选择候选图片索引（本地状态更新）
     */
    const selectPanelCandidateIndex = useCallback((panelId: string, index: number) => {
        candidateSystem.selectCandidate(panelId, index)
    }, [candidateSystem])

    /**
     * 确认候选图片选择 - 调用 select-candidate API
     */
    const confirmPanelCandidate = useCallback(async (panelId: string, imageUrl: string) => {
        try {
            console.log('[confirmPanelCandidate] 🎯 开始确认候选图片')
            console.log('[confirmPanelCandidate] panelId:', panelId)
            console.log('[confirmPanelCandidate] imageUrl:', imageUrl.substring(0, 100))

            const res = await fetch(`/api/novel-promotion/${projectId}/panel/select-candidate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ panelId, selectedImageUrl: imageUrl, action: 'select' })
            })

            const data = await res.json().catch(() => null)

            if (!res.ok) {
                const errorMsg = data?.error?.message || data?.error?.details?.message || '选择失败'
                console.error('[confirmPanelCandidate] 错误详情:', {
                    panelId,
                    selectedUrl: imageUrl,
                    response: data ?? 'NO_JSON'
                })
                throw new Error(errorMsg)
            }

            // 清除本地候选系统状态
            candidateSystem.clearCandidates(panelId)
            console.log('[confirmPanelCandidate] ✅ 已清除本地候选状态')

            // 立即更新本地面板数据，避免等待刷新
            onConfirmed?.(panelId, data?.imageUrl || imageUrl)

            // 刷新数据获取最新状态（包含剧集/分镜数据）
            if (onSilentRefresh) {
                await onSilentRefresh()
            }
            refreshEpisode()
            refreshStoryboards()
            console.log('[confirmPanelCandidate] ✅ 数据刷新完成')
        } catch (err: any) {
            console.error('[confirmPanelCandidate] ❌ 确认失败:', err)
            alert('选择失败: ' + err.message)
        }
    }, [projectId, onSilentRefresh, candidateSystem, refreshEpisode, refreshStoryboards, onConfirmed])

    /**
     * 取消候选图片选择 - 调用 select-candidate API (action='cancel')
     */
    const cancelPanelCandidate = useCallback(async (panelId: string) => {
        try {
            await fetch(`/api/novel-promotion/${projectId}/panel/select-candidate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ panelId, action: 'cancel' })
            })

            // 清除候选状态
            candidateSystem.clearCandidates(panelId)

            // 刷新数据
            if (onSilentRefresh) {
                await onSilentRefresh()
            }
            refreshEpisode()
            refreshStoryboards()
        } catch (err: any) {
            console.error('取消选择失败:', err)
        }
    }, [projectId, onSilentRefresh, candidateSystem, refreshEpisode, refreshStoryboards])

    /**
     * 检查镜头是否有候选图片待选择
     */
    const hasPanelCandidates = useCallback((panel: NovelPromotionPanel): boolean => {
        return getPanelCandidates(panel) !== null
    }, [getPanelCandidates])

    // 兼容旧 API：panelCandidateIndex map
    const panelCandidateIndex = candidateSystem.states

    return {
        panelCandidateIndex,
        setPanelCandidateIndex: candidateSystem.selectCandidate, // 兼容旧调用
        getPanelCandidates,
        ensurePanelCandidatesInitialized, // 新增：在 useEffect 中调用以初始化
        selectPanelCandidateIndex,
        confirmPanelCandidate,
        cancelPanelCandidate,
        hasPanelCandidates,
        // 新增：统一系统能力
        candidateSystem
    }
}
