'use client'

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../keys'

interface TaskPollingOptions {
    projectId: string | null
    episodeId?: string | null
    /**
     * 轮询间隔（毫秒），默认 5000
     */
    interval?: number
    /**
     * 是否启用，默认 true
     */
    enabled?: boolean
    /**
     * 任务完成回调（用于额外处理，如显示通知）
     */
    onTaskCompleted?: (taskId: string, type: string) => void
    /**
     * 任务状态更新时的回调（用于兼容现有 onRefresh 机制）
     */
    onTasksUpdated?: () => void | Promise<void>
}

interface PollResponse {
    tasks: Array<{
        id: string
        type: string
        targetType: string
        targetId: string
        status: 'pending' | 'completed' | 'failed'
    }>
    panelCandidates: Array<{
        panelId: string
        pendingCount: number
    }>
    videoTasks: Array<{
        panelId: string
        status: 'pending' | 'completed' | 'failed'
    }>
    lipSyncTasks: Array<{
        panelId: string
        status: 'pending' | 'completed' | 'failed'
    }>
    // 🔥 V6.5: 新增资产 generating 状态
    generatingAssets?: {
        characterAppearances: string[]
        locationImages: string[]
    }
    // 🔥 V6.5: 新增 Panel generating 状态计数
    generatingPanels?: {
        videos: number
        images: number
        lipSyncs: number
    }
    _meta?: {
        mode: string
        responseTimeMs: number
    }
}

/**
 * 统一任务轮询 Hook
 * 
 * 自动检测任务完成并刷新相关数据缓存
 * 替代分散在各组件中的轮询逻辑
 */
export function useTaskPolling({
    projectId,
    episodeId,
    interval = 5000,
    enabled = true,
    onTaskCompleted,
    onTasksUpdated,
}: TaskPollingOptions) {
    const queryClient = useQueryClient()
    const previousTasksRef = useRef<Map<string, string>>(new Map())
    const previousCandidatesRef = useRef<Map<string, number>>(new Map())
    const previousVideosRef = useRef<Map<string, string>>(new Map())
    // 🔥 V6.5: 跟踪资产 generating 数量
    const previousGeneratingCountRef = useRef<{ appearances: number, locationImages: number }>({ appearances: 0, locationImages: 0 })
    // 🔥 V6.5: 跟踪 Panel generating 数量
    const previousPanelCountRef = useRef<{ videos: number, images: number, lipSyncs: number }>({ videos: 0, images: 0, lipSyncs: 0 })
    const isPollingRef = useRef(false)
    const onTasksUpdatedRef = useRef(onTasksUpdated)
    onTasksUpdatedRef.current = onTasksUpdated

    useEffect(() => {
        if (!projectId || !enabled) {
            return
        }

        const poll = async () => {
            if (isPollingRef.current) return
            isPollingRef.current = true

            try {
                const params = new URLSearchParams()
                if (episodeId) params.set('episodeId', episodeId)

                const res = await fetch(`/api/novel-promotion/${projectId}/poll-tasks?${params}`)
                if (!res.ok) {
                    console.error('[useTaskPolling] Poll failed:', res.status)
                    return
                }

                const data: PollResponse = await res.json()
                const { tasks, panelCandidates, videoTasks, generatingAssets, generatingPanels } = data

                let shouldRefreshAssets = false
                let shouldRefreshStoryboards = false
                let shouldRefreshVoices = false

                // 检测任务完成
                for (const task of tasks) {
                    const prevStatus = previousTasksRef.current.get(task.id)
                    if (prevStatus === 'pending' && (task.status === 'completed' || task.status === 'failed')) {
                        console.log(`[useTaskPolling] 🎉 任务完成: ${task.id} (${task.type}) -> ${task.status}`)

                        // 根据任务类型决定刷新哪些数据
                        if (task.targetType === 'CharacterAppearance' || task.targetType === 'LocationImage') {
                            shouldRefreshAssets = true
                        } else if (task.targetType === 'StoryboardPanel') {
                            shouldRefreshStoryboards = true
                        } else if (task.targetType === 'VoiceLine') {
                            shouldRefreshVoices = true
                        }

                        onTaskCompleted?.(task.id, task.type)
                    }
                    previousTasksRef.current.set(task.id, task.status)
                }

                // 检测候选图完成
                for (const pc of panelCandidates) {
                    const prevCount = previousCandidatesRef.current.get(pc.panelId) ?? 999
                    if (prevCount > 0 && pc.pendingCount < prevCount) {
                        console.log(`[useTaskPolling] 🎨 Panel ${pc.panelId} 候选图完成: ${prevCount} -> ${pc.pendingCount}`)
                        shouldRefreshStoryboards = true
                    }
                    previousCandidatesRef.current.set(pc.panelId, pc.pendingCount)
                }

                // 检测视频生成完成
                for (const vt of videoTasks) {
                    const prevStatus = previousVideosRef.current.get(vt.panelId)
                    if (prevStatus === 'pending' && (vt.status === 'completed' || vt.status === 'failed')) {
                        console.log(`[useTaskPolling] 🎬 视频完成: Panel ${vt.panelId} -> ${vt.status}`)
                        shouldRefreshStoryboards = true
                    }
                    previousVideosRef.current.set(vt.panelId, vt.status)
                }

                // 🔥 V6.5: 检测资产 generating 状态变化
                if (generatingAssets) {
                    const currentAppearances = generatingAssets.characterAppearances.length
                    const currentLocationImages = generatingAssets.locationImages.length
                    const prevAppearances = previousGeneratingCountRef.current.appearances
                    const prevLocationImages = previousGeneratingCountRef.current.locationImages

                    // 如果 generating 数量减少，说明有任务完成
                    if ((prevAppearances > 0 && currentAppearances < prevAppearances) ||
                        (prevLocationImages > 0 && currentLocationImages < prevLocationImages)) {
                        console.log(`[useTaskPolling] 🎨 资产任务完成: 形象 ${prevAppearances}->${currentAppearances}, 场景 ${prevLocationImages}->${currentLocationImages}`)
                        shouldRefreshAssets = true
                    }

                    previousGeneratingCountRef.current = {
                        appearances: currentAppearances,
                        locationImages: currentLocationImages
                    }
                }

                // 🔥 V6.5: 检测 Panel generating 状态变化
                if (generatingPanels) {
                    const prevVideos = previousPanelCountRef.current.videos
                    const prevImages = previousPanelCountRef.current.images
                    const prevLipSyncs = previousPanelCountRef.current.lipSyncs

                    // 如果 generating 数量减少，说明有任务完成
                    if ((prevVideos > 0 && generatingPanels.videos < prevVideos) ||
                        (prevImages > 0 && generatingPanels.images < prevImages) ||
                        (prevLipSyncs > 0 && generatingPanels.lipSyncs < prevLipSyncs)) {
                        console.log(`[useTaskPolling] 🎬 Panel任务完成: 视频 ${prevVideos}->${generatingPanels.videos}, 图片 ${prevImages}->${generatingPanels.images}, 口型 ${prevLipSyncs}->${generatingPanels.lipSyncs}`)
                        shouldRefreshStoryboards = true
                    }

                    previousPanelCountRef.current = {
                        videos: generatingPanels.videos,
                        images: generatingPanels.images,
                        lipSyncs: generatingPanels.lipSyncs
                    }
                }

                // 静默刷新相关缓存
                const anyUpdate = shouldRefreshAssets || shouldRefreshStoryboards || shouldRefreshVoices
                if (shouldRefreshAssets) {
                    queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(projectId) })
                    queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.all() })
                }
                if (shouldRefreshStoryboards && episodeId) {
                    queryClient.invalidateQueries({ queryKey: queryKeys.storyboards.all(episodeId) })
                }
                if (shouldRefreshVoices && episodeId) {
                    queryClient.invalidateQueries({ queryKey: queryKeys.voiceLines.all(episodeId) })
                }

                // 兼容性回调：通知现有组件刷新
                if (anyUpdate && onTasksUpdatedRef.current) {
                    try {
                        await onTasksUpdatedRef.current()
                    } catch (e) {
                        console.error('[useTaskPolling] onTasksUpdated error:', e)
                    }
                }

            } catch (error) {
                console.error('[useTaskPolling] Error:', error)
            } finally {
                isPollingRef.current = false
            }
        }

        // 立即执行一次
        poll()

        // 设置定时轮询
        const intervalId = setInterval(poll, interval)

        return () => {
            clearInterval(intervalId)
            console.log('[useTaskPolling] 停止轮询')
        }
    }, [projectId, episodeId, interval, enabled, queryClient, onTaskCompleted])
}

/**
 * 手动触发一次轮询
 * 用于在执行操作后立即检查状态
 */
export function useTriggerPoll(projectId: string | null, episodeId?: string | null) {
    const queryClient = useQueryClient()

    return async () => {
        if (!projectId) return

        try {
            const params = new URLSearchParams()
            if (episodeId) params.set('episodeId', episodeId)

            await fetch(`/api/novel-promotion/${projectId}/poll-tasks?${params}`)

            // 刷新所有相关数据
            queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(projectId) })
            if (episodeId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.storyboards.all(episodeId) })
                queryClient.invalidateQueries({ queryKey: queryKeys.voiceLines.all(episodeId) })
            }
        } catch (error) {
            console.error('[useTriggerPoll] Error:', error)
        }
    }
}
