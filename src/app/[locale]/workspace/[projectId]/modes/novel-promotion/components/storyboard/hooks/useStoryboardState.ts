'use client'

import { useState, useEffect, useRef } from 'react'
import { NovelPromotionStoryboard, NovelPromotionClip, NovelPromotionPanel } from '@/types/project'
import { PanelEditData } from '../../PanelEditForm'

// 内部使用的 StoryboardPanel 类型
export interface StoryboardPanel {
  id: string
  panelIndex: number
  panel_number: number
  shot_type: string
  camera_move: string | null
  description: string
  characters: { name: string; appearance: string }[]
  location?: string
  srt_range?: string
  duration?: number
  video_prompt?: string
  source_text?: string
  candidateImages?: string
  imageUrl?: string | null
  photographyRules?: string | null  // 单镜头摄影规则JSON
  actingNotes?: string | null       // 演技指导数据JSON
  generatingImage?: boolean  // 数据库持久化的生成状态
}

interface UseStoryboardStateProps {
  initialStoryboards: NovelPromotionStoryboard[]
  clips: NovelPromotionClip[]
}

export function useStoryboardState({ initialStoryboards, clips }: UseStoryboardStateProps) {
  // 本地状态管理 storyboards - 按 clips 顺序排序
  const [localStoryboards, setLocalStoryboards] = useState<NovelPromotionStoryboard[]>(() => {
    const clipIndexMap = new Map(clips.map((clip, index) => [clip.id, index]))
    return [...initialStoryboards].sort((a, b) => {
      const indexA = clipIndexMap.get(a.clipId) ?? Number.MAX_VALUE
      const indexB = clipIndexMap.get(b.clipId) ?? Number.MAX_VALUE
      return indexA - indexB
    })
  })

  // 原文展开状态
  const [expandedClips, setExpandedClips] = useState<Set<string>>(new Set())

  // Panel 编辑相关状态
  const [panelEdits, setPanelEdits] = useState<Record<string, PanelEditData>>({})
  const panelEditsRef = useRef<Record<string, PanelEditData>>({})
  panelEditsRef.current = panelEdits

  // 同步 initialStoryboards 变化并按 clips 顺序排序
  useEffect(() => {
    const clipIndexMap = new Map(clips.map((clip, index) => [clip.id, index]))
    const sortedStoryboards = [...initialStoryboards].sort((a, b) => {
      const indexA = clipIndexMap.get(a.clipId) ?? Number.MAX_VALUE
      const indexB = clipIndexMap.get(b.clipId) ?? Number.MAX_VALUE
      return indexA - indexB
    })
    setLocalStoryboards(sortedStoryboards)
  }, [initialStoryboards, clips])

  // 获取Clip信息
  const getClipInfo = (clipId: string) => clips.find(c => c.id === clipId)

  // 获取Panel图片URLs
  const getPanelImages = (storyboard: NovelPromotionStoryboard): string[] => {
    const panels = (storyboard as any).panels || []
    if (panels.length > 0) {
      return panels.map((p: any) => p.imageUrl || null)
    }
    return []
  }

  // 获取文字分镜数据（从 panels 表读取，唯一数据源）
  const getTextPanels = (storyboard: NovelPromotionStoryboard): StoryboardPanel[] => {
    const panels = (storyboard as any).panels || []
    const sortedPanels = [...panels].sort((a: NovelPromotionPanel, b: NovelPromotionPanel) =>
      (a.panelIndex || 0) - (b.panelIndex || 0)
    )
    return sortedPanels.map((p: any) => {
      const parsedChars = p.characters ? JSON.parse(p.characters) : []
      return {
        id: p.id,
        panelIndex: p.panelIndex,
        panel_number: p.panelNumber,
        shot_type: p.shotType,
        camera_move: p.cameraMove,
        description: p.description,
        location: p.location,
        characters: Array.isArray(parsedChars) ? parsedChars : [],
        srt_range: p.srtStart && p.srtEnd ? `${p.srtStart}-${p.srtEnd}` : undefined,
        duration: p.duration,
        video_prompt: p.videoPrompt,
        source_text: p.srtSegment,
        candidateImages: p.candidateImages,
        imageUrl: p.imageUrl,
        photographyRules: p.photographyRules,
        actingNotes: p.actingNotes,
        generatingImage: p.generatingImage || false
      }
    })
  }

  // 获取panel的当前数据（优先使用本地编辑，否则用原始数据）
  const getPanelEditData = (panel: StoryboardPanel): PanelEditData => {
    if (panelEdits[panel.id]) {
      return panelEdits[panel.id]
    }
    return {
      id: panel.id,
      panelIndex: panel.panelIndex,
      panelNumber: panel.panel_number,
      shotType: panel.shot_type,
      cameraMove: panel.camera_move,
      description: panel.description,
      location: panel.location || null,
      characters: panel.characters || [],
      srtStart: null,
      srtEnd: null,
      duration: panel.duration || null,
      videoPrompt: panel.video_prompt || null,
      sourceText: panel.source_text
    }
  }

  // 更新panel的本地编辑数据
  const updatePanelEdit = (panelId: string, panel: StoryboardPanel, updates: Partial<PanelEditData>) => {
    setPanelEdits(prev => {
      const currentData = prev[panelId] || getPanelEditData(panel)
      return {
        ...prev,
        [panelId]: { ...currentData, ...updates }
      }
    })
  }

  // 切换原文展开状态
  const toggleExpandedClip = (storyboardId: string) => {
    setExpandedClips(prev => {
      const next = new Set(prev)
      if (next.has(storyboardId)) {
        next.delete(storyboardId)
      } else {
        next.add(storyboardId)
      }
      return next
    })
  }

  // 格式化Clip标题（兼容SRT和Agent模式）
  const formatClipTitle = (clip: any) => {
    if (!clip) return '未知片段'
    if (clip.start !== undefined && clip.start !== null) {
      return `${clip.start}-${clip.end}`
    }
    if (clip.startText && clip.endText) {
      const startPreview = clip.startText.substring(0, 10)
      const endPreview = clip.endText.substring(0, 10)
      return `${startPreview}...~...${endPreview}`
    }
    return '片段'
  }

  // 按 clip 顺序排序 storyboards
  const sortedStoryboards = [...localStoryboards].sort((a, b) => {
    const clipIndexA = clips.findIndex(c => c.id === a.clipId)
    const clipIndexB = clips.findIndex(c => c.id === b.clipId)
    return clipIndexA - clipIndexB
  })

  // 计算总镜头数
  const totalPanels = localStoryboards.reduce((sum, s) => sum + ((s as any).panels?.length || s.panelCount || 0), 0)

  // 计算每个storyboard的起始全局编号
  const storyboardStartIndex: Record<string, number> = {}
  let globalIndex = 0
  for (const sb of sortedStoryboards) {
    storyboardStartIndex[sb.id] = globalIndex
    globalIndex += (sb as any).panels?.length || sb.panelCount || 0
  }

  return {
    localStoryboards,
    setLocalStoryboards,
    sortedStoryboards,
    expandedClips,
    toggleExpandedClip,
    panelEdits,
    setPanelEdits,
    panelEditsRef,
    getClipInfo,
    getPanelImages,
    getTextPanels,
    getPanelEditData,
    updatePanelEdit,
    formatClipTitle,
    totalPanels,
    storyboardStartIndex
  }
}





