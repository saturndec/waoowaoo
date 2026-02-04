'use client'

import { useState, useCallback } from 'react'
import {
    VideoEditorProject,
    VideoClip,
    BgmClip,
    TimelineState,
    createDefaultProject,
    generateClipId
} from '../index'

interface UseEditorStateProps {
    episodeId: string
    initialProject?: VideoEditorProject
}

export function useEditorState({ episodeId, initialProject }: UseEditorStateProps) {
    // 项目数据
    const [project, setProject] = useState<VideoEditorProject>(
        initialProject || createDefaultProject(episodeId)
    )

    // 时间轴 UI 状态
    const [timelineState, setTimelineState] = useState<TimelineState>({
        currentFrame: 0,
        playing: false,
        selectedClipId: null,
        zoom: 1
    })

    // 是否有未保存的更改
    const [isDirty, setIsDirty] = useState(false)

    // ========================================
    // 时间轴片段操作
    // ========================================

    const addClip = useCallback((clip: Omit<VideoClip, 'id'>) => {
        const newClip: VideoClip = {
            ...clip,
            id: generateClipId()
        }
        setProject(prev => ({
            ...prev,
            timeline: [...prev.timeline, newClip]
        }))
        setIsDirty(true)
        return newClip.id
    }, [])

    const removeClip = useCallback((clipId: string) => {
        setProject(prev => ({
            ...prev,
            timeline: prev.timeline.filter(c => c.id !== clipId)
        }))
        setIsDirty(true)
    }, [])

    const updateClip = useCallback((clipId: string, updates: Partial<VideoClip>) => {
        setProject(prev => ({
            ...prev,
            timeline: prev.timeline.map(c =>
                c.id === clipId ? { ...c, ...updates } : c
            )
        }))
        setIsDirty(true)
    }, [])

    const reorderClips = useCallback((fromIndex: number, toIndex: number) => {
        setProject(prev => {
            const newTimeline = [...prev.timeline]
            const [removed] = newTimeline.splice(fromIndex, 1)
            newTimeline.splice(toIndex, 0, removed)
            return { ...prev, timeline: newTimeline }
        })
        setIsDirty(true)
    }, [])

    // ========================================
    // BGM 操作
    // ========================================

    const addBgm = useCallback((bgm: Omit<BgmClip, 'id'>) => {
        const newBgm: BgmClip = {
            ...bgm,
            id: `bgm_${Date.now()}`
        }
        setProject(prev => ({
            ...prev,
            bgmTrack: [...prev.bgmTrack, newBgm]
        }))
        setIsDirty(true)
    }, [])

    const removeBgm = useCallback((bgmId: string) => {
        setProject(prev => ({
            ...prev,
            bgmTrack: prev.bgmTrack.filter(b => b.id !== bgmId)
        }))
        setIsDirty(true)
    }, [])

    // ========================================
    // 播放控制
    // ========================================

    const play = useCallback(() => {
        setTimelineState(prev => ({ ...prev, playing: true }))
    }, [])

    const pause = useCallback(() => {
        setTimelineState(prev => ({ ...prev, playing: false }))
    }, [])

    const seek = useCallback((frame: number) => {
        setTimelineState(prev => ({ ...prev, currentFrame: frame }))
    }, [])

    const selectClip = useCallback((clipId: string | null) => {
        setTimelineState(prev => ({ ...prev, selectedClipId: clipId }))
    }, [])

    const setZoom = useCallback((zoom: number) => {
        setTimelineState(prev => ({ ...prev, zoom: Math.max(0.1, Math.min(5, zoom)) }))
    }, [])

    // ========================================
    // 项目操作
    // ========================================

    const resetProject = useCallback(() => {
        setProject(createDefaultProject(episodeId))
        setIsDirty(false)
    }, [episodeId])

    const loadProject = useCallback((data: VideoEditorProject) => {
        setProject(data)
        setIsDirty(false)
    }, [])

    const markSaved = useCallback(() => {
        setIsDirty(false)
    }, [])

    return {
        // State
        project,
        timelineState,
        isDirty,

        // Clip actions
        addClip,
        removeClip,
        updateClip,
        reorderClips,

        // BGM actions
        addBgm,
        removeBgm,

        // Playback
        play,
        pause,
        seek,
        selectClip,
        setZoom,

        // Project
        resetProject,
        loadProject,
        markSaved,
        setProject
    }
}
