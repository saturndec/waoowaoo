'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../keys'
import { NovelPromotionStoryboard, NovelPromotionPanel } from '@prisma/client'
import { checkApiResponse } from '@/lib/error-handler'

// ============ 类型定义 ============
export interface PanelCandidate {
    id: string
    imageUrl: string | null
    isSelected: boolean
    generating: boolean
}

export interface StoryboardPanel {
    id: string
    shotId: string
    stageIndex: number
    shotIndex: number
    imageUrl: string | null
    motionPrompt: string | null
    voiceText: string | null
    voiceUrl: string | null
    videoUrl: string | null
    generatingImage: boolean
    generatingVideo: boolean
    generatingLipSync: boolean
    errorMessage: string | null
    candidates: PanelCandidate[]
    pendingCandidateCount: number
}

export interface StoryboardGroup {
    id: string
    stageIndex: number
    panels: StoryboardPanel[]
}

export interface StoryboardData {
    groups: StoryboardGroup[]
}

// ============ 查询 Hooks ============

/**
 * 获取分镜数据
 */
export function useStoryboards(episodeId: string | null) {
    return useQuery({
        queryKey: queryKeys.storyboards.all(episodeId || ''),
        queryFn: async () => {
            if (!episodeId) throw new Error('Episode ID is required')
            const res = await fetch(`/api/novel-promotion/episodes/${episodeId}/storyboards`)
            if (!res.ok) throw new Error('Failed to fetch storyboards')
            const data = await res.json()
            return data as StoryboardData
        },
        enabled: !!episodeId,
    })
}

// ============ Mutation Hooks ============

/**
 * 重新生成分镜图片
 */
export function useRegeneratePanelImage(projectId: string | null, episodeId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ panelId }: { panelId: string }) => {
            if (!projectId) throw new Error('Project ID is required')
            const res = await fetch(`/api/novel-promotion/${projectId}/regenerate-panel-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ panelId }),
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || error.error || 'Failed to regenerate')
            }
            return res.json()
        },
        onMutate: async ({ panelId }) => {
            if (!episodeId) return

            queryClient.setQueryData<StoryboardData>(
                queryKeys.storyboards.all(episodeId),
                (old) => {
                    if (!old) return old
                    return {
                        ...old,
                        groups: old.groups.map(group => ({
                            ...group,
                            panels: group.panels.map(panel =>
                                panel.id === panelId ? { ...panel, generatingImage: true } : panel
                            )
                        }))
                    }
                }
            )
        },
        onSettled: () => {
            if (episodeId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.storyboards.all(episodeId) })
            }
        },
    })
}

/**
 * 修改分镜图片
 */
export function useModifyPanelImage(projectId: string | null, episodeId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (params: {
            panelId: string
            modifyPrompt: string
            extraImageUrls?: string[]
        }) => {
            if (!projectId) throw new Error('Project ID is required')
            const res = await fetch(`/api/novel-promotion/${projectId}/modify-panel-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params),
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || error.error || 'Failed to modify')
            }
            return res.json()
        },
        onMutate: async ({ panelId }) => {
            if (!episodeId) return

            queryClient.setQueryData<StoryboardData>(
                queryKeys.storyboards.all(episodeId),
                (old) => {
                    if (!old) return old
                    return {
                        ...old,
                        groups: old.groups.map(group => ({
                            ...group,
                            panels: group.panels.map(panel =>
                                panel.id === panelId ? { ...panel, generatingImage: true } : panel
                            )
                        }))
                    }
                }
            )
        },
        onSettled: () => {
            if (episodeId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.storyboards.all(episodeId) })
            }
        },
    })
}

/**
 * 生成视频
 */
export function useGenerateVideo(projectId: string | null, episodeId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (params: {
            storyboardId: string
            panelIndex: number
            videoModel?: string
            firstLastFrame?: {
                lastFrameStoryboardId: string
                lastFramePanelIndex: number
                flModel: string
                customPrompt?: string
                generateAudio?: boolean
            }
            generateAudio?: boolean
        }) => {
            if (!projectId) throw new Error('Project ID is required')

            // 构建请求体
            const requestBody: any = {
                storyboardId: params.storyboardId,
                panelIndex: params.panelIndex
            }

            // 如果是首尾帧模式
            if (params.firstLastFrame) {
                requestBody.firstLastFrame = params.firstLastFrame
            } else {
                if (params.videoModel) {
                    requestBody.videoModel = params.videoModel
                }
                if (params.generateAudio !== undefined) {
                    requestBody.generateAudio = params.generateAudio
                }
            }

            const res = await fetch(`/api/novel-promotion/${projectId}/generate-video`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            })
            // 🔥 使用统一错误处理
            await checkApiResponse(res)
            return res.json()
        },
        onMutate: async ({ storyboardId, panelIndex }) => {
            if (!episodeId) return

            // 🔥 乐观更新：设置 generatingVideo = true
            queryClient.setQueryData(
                queryKeys.episodeData(projectId!, episodeId),
                (old: any) => {
                    if (!old?.storyboards) return old
                    return {
                        ...old,
                        storyboards: old.storyboards.map((sb: any) => ({
                            ...sb,
                            panels: sb.panels?.map((p: any) =>
                                sb.id === storyboardId && p.panelIndex === panelIndex
                                    ? { ...p, generatingVideo: true }
                                    : p
                            )
                        }))
                    }
                }
            )
        },
        onSettled: () => {
            // 🔥 刷新缓存获取最新状态
            if (episodeId && projectId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.episodeData(projectId, episodeId) })
            }
        },
    })
}


/**
 * 批量生成视频
 */
export function useBatchGenerateVideos(projectId: string | null, episodeId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async () => {
            if (!projectId) throw new Error('Project ID is required')
            if (!episodeId) throw new Error('Episode ID is required')

            const res = await fetch(`/api/novel-promotion/${projectId}/generate-video`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ all: true, episodeId }),
            })
            // 🔥 使用统一错误处理
            await checkApiResponse(res)
            return res.json()
        },
        onMutate: async () => {
            if (!episodeId || !projectId) return

            // 🔥 乐观更新：设置所有需要生成视频的 panel 的 generatingVideo = true
            queryClient.setQueryData(
                queryKeys.episodeData(projectId, episodeId),
                (old: any) => {
                    if (!old?.storyboards) return old
                    return {
                        ...old,
                        storyboards: old.storyboards.map((sb: any) => ({
                            ...sb,
                            panels: sb.panels?.map((p: any) => {
                                // 只有有图片且没有视频的才需要生成
                                if (p.imageUrl && !p.videoUrl) {
                                    return { ...p, generatingVideo: true }
                                }
                                return p
                            })
                        }))
                    }
                }
            )
        },
        onSettled: () => {
            // 🔥 刷新缓存获取最新状态
            if (episodeId && projectId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.episodeData(projectId, episodeId) })
            }
        },
    })
}


/**
 * 选择分镜候选图
 */
export function useSelectPanelCandidate(episodeId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ panelId, candidateId }: { panelId: string; candidateId: string }) => {
            const res = await fetch(`/api/novel-promotion/panels/${panelId}/select-candidate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ candidateId }),
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || error.error || 'Failed to select candidate')
            }
            return res.json()
        },
        onSettled: () => {
            if (episodeId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.storyboards.all(episodeId) })
            }
        },
    })
}

/**
 * 刷新分镜数据
 */
export function useRefreshStoryboards(episodeId: string | null) {
    const queryClient = useQueryClient()

    return () => {
        if (episodeId) {
            queryClient.invalidateQueries({ queryKey: queryKeys.storyboards.all(episodeId) })
        }
    }
}

/**
 * 🔥 口型同步生成（乐观更新）
 */
export function useLipSync(projectId: string | null, episodeId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (params: {
            storyboardId: string
            panelIndex: number
            voiceLineId: string
        }) => {
            const res = await fetch(`/api/novel-promotion/${projectId}/lip-sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    storyboardId: params.storyboardId,
                    panelIndex: params.panelIndex,
                    voiceLineId: params.voiceLineId
                })
            })

            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || error.error || error.details || 'Lip sync failed')
            }

            return res.json()
        },
        // 🔥 乐观更新：请求前立即设置 generatingLipSync = true
        onMutate: async ({ storyboardId, panelIndex }) => {
            // 取消正在进行的查询
            await queryClient.cancelQueries({ queryKey: queryKeys.episodeData(projectId!, episodeId!) })

            // 乐观更新缓存
            queryClient.setQueryData(
                queryKeys.episodeData(projectId!, episodeId!),
                (old: any) => {
                    if (!old?.storyboards) return old
                    return {
                        ...old,
                        storyboards: old.storyboards.map((sb: any) => {
                            if (sb.id !== storyboardId) return sb
                            return {
                                ...sb,
                                panels: (sb.panels || []).map((p: any) => {
                                    if (p.panelIndex !== panelIndex) return p
                                    return { ...p, generatingLipSync: true }
                                })
                            }
                        })
                    }
                }
            )
        },
        onSettled: () => {
            // 请求完成后刷新数据
            if (projectId && episodeId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.episodeData(projectId, episodeId) })
            }
        }
    })
}
