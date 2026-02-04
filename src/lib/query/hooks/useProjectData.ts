'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../keys'
import { Project } from '@/types/project'

// ============ 项目数据 Hook ============

interface ProjectDataResponse {
    project: Project
}

/**
 * 获取项目基础数据
 * 替代原有的 useProject hook
 */
export function useProjectData(projectId: string | null) {
    return useQuery({
        queryKey: queryKeys.projectData(projectId || ''),
        queryFn: async () => {
            if (!projectId) throw new Error('Project ID is required')
            const res = await fetch(`/api/projects/${projectId}/data`)
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || error.error || 'Failed to load project')
            }
            const data: ProjectDataResponse = await res.json()
            return data.project
        },
        enabled: !!projectId,
        staleTime: 5000,
    })
}

/**
 * 刷新项目数据
 */
export function useRefreshProjectData(projectId: string | null) {
    const queryClient = useQueryClient()

    return () => {
        if (projectId) {
            queryClient.invalidateQueries({ queryKey: queryKeys.projectData(projectId) })
        }
    }
}

// ============ 剧集数据 Hook ============

export interface Episode {
    id: string
    episodeNumber: number
    name: string
    description?: string | null
    novelText?: string | null
    audioUrl?: string | null
    srtContent?: string | null
    createdAt: string
    // 剧集详情数据
    voiceLines?: VoiceLine[]
    storyboardData?: StoryboardData
}

interface VoiceLine {
    id: string
    text: string
    speakerId: string
    audioUrl?: string | null
    generating?: boolean
}

interface StoryboardData {
    panels: any[]
}

/**
 * 获取剧集详情
 */
export function useEpisodeData(projectId: string | null, episodeId: string | null) {
    return useQuery({
        queryKey: queryKeys.episodeData(projectId || '', episodeId || ''),
        queryFn: async () => {
            if (!projectId || !episodeId) throw new Error('Project ID and Episode ID are required')
            const res = await fetch(`/api/novel-promotion/${projectId}/episodes/${episodeId}`)
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || error.error || 'Failed to load episode')
            }
            const data = await res.json()
            return data.episode as Episode
        },
        enabled: !!projectId && !!episodeId,
        staleTime: 5000,
    })
}

/**
 * 获取项目的剧集列表（从项目数据中提取）
 */
export function useEpisodes(projectId: string | null) {
    const { data: project } = useProjectData(projectId)

    const episodes = (project?.novelPromotionData as any)?.episodes || []
    return { episodes, isLoading: !project }
}

/**
 * 刷新剧集数据
 */
export function useRefreshEpisodeData(projectId: string | null, episodeId: string | null) {
    const queryClient = useQueryClient()

    return () => {
        if (projectId && episodeId) {
            queryClient.invalidateQueries({
                queryKey: queryKeys.episodeData(projectId, episodeId)
            })
        }
    }
}

/**
 * 刷新所有相关数据（项目 + 当前剧集）
 */
export function useRefreshAll(projectId: string | null, episodeId: string | null) {
    const queryClient = useQueryClient()

    return () => {
        if (projectId) {
            queryClient.invalidateQueries({ queryKey: queryKeys.projectData(projectId) })
            queryClient.invalidateQueries({ queryKey: queryKeys.projectAssets.all(projectId) })
        }
        if (projectId && episodeId) {
            queryClient.invalidateQueries({
                queryKey: queryKeys.episodeData(projectId, episodeId)
            })
            queryClient.invalidateQueries({
                queryKey: queryKeys.storyboards.all(episodeId)
            })
        }
    }
}
