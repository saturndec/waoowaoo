'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'
import { Project, Character, Location } from '@/types/project'
import { handleApiError } from '@/lib/error-handler'
import NovelInputStage from './components/NovelInputStage'
import AssetsStage from './components/AssetsStage'
import ScriptView from './components/ScriptView'
import StoryboardStage from './components/storyboard'
import VideoStage from './components/VideoStage'
import VoiceStage from './components/VoiceStage'
import AssetLibrary from './components/AssetLibrary'
import ProgressToast from '@/components/ProgressToast'
import { StageNavigation } from './StageNavigation'
import { useTaskPolling } from '@/lib/query/hooks/useTaskPolling'
import { useGenerateVideo, useBatchGenerateVideos } from '@/lib/query/hooks/useStoryboards'
import { queryKeys } from '@/lib/query/keys'
import { VideoEditorStage, createProjectFromPanels } from '@/features/video-editor'

// New V3 UI Components
import { AnimatedBackground, GlassPanel } from '@/components/ui/SharedComponents'
import { CapsuleNav, EpisodeSelector } from '@/components/ui/CapsuleNav'
import { SettingsModal, WorldContextModal } from '@/components/ui/ConfigModals'
import '@/styles/animations.css'


interface Episode {
  id: string
  episodeNumber: number
  name: string
  description?: string | null
  novelText?: string | null
  audioUrl?: string | null
  srtContent?: string | null
  clips?: any[]
  storyboards?: any[]
  shots?: any[]
  voiceLines?: any[]
  createdAt: string
}

interface NovelPromotionWorkspaceProps {
  project: Project
  projectId: string
  episodeId?: string  // 当前剧集ID
  episode?: Episode | null  // 当前剧集数据
  viewMode?: 'global-assets' | 'episode'  // 视图模式
  urlStage?: string | null  // URL中的stage参数
  onStageChange?: (stage: string) => void  // 更新URL中的stage
  // Episode 选择器相关
  episodes?: Episode[]
  onEpisodeSelect?: (episodeId: string) => void
  onEpisodeCreate?: () => void
  onEpisodeRename?: (episodeId: string, newName: string) => void
}


// 检查是否是请求中断错误（页面刷新/离开导致）
function isAbortError(err: any): boolean {
  return err?.name === 'AbortError' || err?.message === 'Failed to fetch'
}

export default function NovelPromotionWorkspace({
  project,
  projectId,
  episodeId,
  episode,
  viewMode = 'episode',
  urlStage,
  onStageChange,
  episodes = [],
  onEpisodeSelect,
  onEpisodeCreate,
  onEpisodeRename
}: NovelPromotionWorkspaceProps) {
  // Hook for translations
  const t = useTranslations('novelPromotion')
  const te = useTranslations('errors')
  const tp = useTranslations('progress')
  const tc = useTranslations('common')
  const ta = useTranslations('assets')

  // URL 参数和路由
  const searchParams = useSearchParams()
  const router = useRouter()
  const queryClient = useQueryClient()

  // 🔥 内部刷新函数（替代原来的 onRefresh prop）
  const refreshData = useCallback(async (scope?: 'all' | 'assets' | 'project') => {
    const promises: Promise<any>[] = []

    // 刷新项目数据
    if (!scope || scope === 'all' || scope === 'project') {
      promises.push(queryClient.refetchQueries({ queryKey: queryKeys.projectData(projectId) }))
    }
    // 刷新资产数据
    if (!scope || scope === 'all' || scope === 'assets') {
      promises.push(queryClient.refetchQueries({ queryKey: queryKeys.projectAssets.all(projectId) }))
    }
    // 刷新剧集数据
    if (episodeId) {
      promises.push(queryClient.refetchQueries({ queryKey: queryKeys.episodeData(projectId, episodeId) }))
      promises.push(queryClient.refetchQueries({ queryKey: queryKeys.storyboards.all(episodeId) }))
      promises.push(queryClient.refetchQueries({ queryKey: queryKeys.voiceLines.all(episodeId) }))
    }

    // 等待所有查询完成
    await Promise.all(promises)
  }, [queryClient, projectId, episodeId])

  // 兼容层：模拟旧的 onRefresh 接口
  const onRefresh = useCallback(async (options?: { scope?: string; mode?: string }) => {
    await refreshData(options?.scope as any)
  }, [refreshData])

  // assetsLoading 状态（从 React Query 获取，暂时设为 false）
  const assetsLoading = false

  // 用于防止重复触发全局分析
  const hasTriggeredGlobalAnalyze = useRef(false)

  // 本地状态管理
  const [localProject, setLocalProject] = useState<Project>(project)
  // 本地 episode 状态 - 用于原子化更新，避免全局刷新
  const [localEpisode, setLocalEpisode] = useState<Episode | null>(episode || null)

  // 当父组件的project更新时，同步到localProject
  useEffect(() => {
    console.log('[NovelPromotionWorkspace] project prop 更新, characters:', project?.novelPromotionData?.characters?.length)
    setLocalProject(project)
  }, [project])

  // 当父组件的 episode 更新时，同步到 localEpisode
  useEffect(() => {
    if (episode) {
      setLocalEpisode(episode)
    }
  }, [episode])

  // 当 episode 变化时，更新剧集相关状态
  useEffect(() => {
    if (episode) {
      setNovelText(episode.novelText || '')
      setSrtContent(episode.srtContent || '')
    }
  }, [episode])

  // 🔥 当 projectData 更新时，同步配置字段到本地 state
  // 这是必要的，因为 useState 初始化只执行一次
  useEffect(() => {
    const pd = localProject.novelPromotionData
    if (pd) {
      // 只同步非 undefined 的值（避免覆盖用户手动修改）
      if (pd.analysisModel !== undefined) setAnalysisModel(pd.analysisModel)
      if (pd.characterModel !== undefined) setCharacterModel(pd.characterModel)
      if (pd.locationModel !== undefined) setLocationModel(pd.locationModel)
      if (pd.storyboardModel !== undefined) setStoryboardModel(pd.storyboardModel)
      if (pd.editModel !== undefined) setEditModel(pd.editModel)
      if (pd.videoModel !== undefined) setVideoModel(pd.videoModel)
      if (pd.videoRatio !== undefined) setVideoRatio(pd.videoRatio)
      if (pd.videoResolution !== undefined) setVideoResolution(pd.videoResolution)
      if (pd.ttsRate !== undefined) setTtsRate(pd.ttsRate)
      if (pd.ttsVoice !== undefined) setTtsVoice(pd.ttsVoice)
      if (pd.artStyle !== undefined) setArtStyle(pd.artStyle)
    }
  }, [localProject.novelPromotionData])

  // 🔥 视频生成轮询已移至 useTaskPolling hook 统一处理
  // 视频状态变化通过 onRefresh 回调从页面级获取


  // 乐观更新本地状态
  const updateLocalState = (updates: any) => {
    setLocalProject(prev => ({
      ...prev,
      novelPromotionData: prev.novelPromotionData
        ? { ...prev.novelPromotionData, ...updates }
        : undefined
    }))
  }

  // 更新单个角色形象的状态（避免竞态条件）
  // appearanceId: 形象 UUID
  const updateCharacterAppearance = (
    characterId: string,
    appearanceId: string,
    updates: Record<string, any>
  ) => {
    setLocalProject(prev => {
      if (!prev.novelPromotionData?.characters) return prev
      const updatedCharacters = prev.novelPromotionData.characters.map((char: any) => {
        if (char.id !== characterId) return char
        const appearances = char.appearances || []
        const updatedAppearances = appearances.map((app: any) =>
          app.id === appearanceId ? { ...app, ...updates } : app
        )
        return { ...char, appearances: updatedAppearances }
      })
      return {
        ...prev,
        novelPromotionData: { ...prev.novelPromotionData, characters: updatedCharacters }
      }
    })
  }

  // 更新单个场景的状态（避免竞态条件）
  // 如果 updates 包含 generating，会同时更新所有 images 的 generating 状态
  const updateLocationState = (locationId: string, updates: Record<string, any>) => {
    setLocalProject(prev => {
      if (!prev.novelPromotionData?.locations) return prev
      const updatedLocations = prev.novelPromotionData.locations.map((loc: any) => {
        if (loc.id !== locationId) return loc

        // 如果更新包含 generating，同时更新 images 数组中每个图片的 generating 状态
        let updatedImages = loc.images || []
        if ('generating' in updates) {
          updatedImages = updatedImages.map((img: any) => ({
            ...img,
            generating: updates.generating
          }))
        }

        return { ...loc, ...updates, images: updatedImages }
      })
      return {
        ...prev,
        novelPromotionData: { ...prev.novelPromotionData, locations: updatedLocations }
      }
    })
  }

  // 🔥 V6.6 重构：删除 updateAssetCacheOptimistically - 图片生成现在使用 mutation hooks 内部处理

  // 获取项目级数据（配置 + 全局资产）
  const projectData = localProject.novelPromotionData
  if (!projectData) {
    console.log('projectData不存在，localProject:', localProject)
    return <div className="text-center text-gray-600">{tc('loading')}</div>
  }

  // 剧集级数据：clips、storyboards、shots 从 localEpisode 读取（支持原子化更新）
  const episodeClips = localEpisode?.clips || []
  const episodeStoryboards = localEpisode?.storyboards || []
  const episodeShots = localEpisode?.shots || []

  // 当前阶段完全由 URL 控制（urlStage 已在父组件设置默认值 'config'）
  // 🚧 剪辑阶段 (editor) 暂时禁用，自动重定向到成片阶段 (videos)
  const currentStage = urlStage === 'editor' ? 'videos' : (urlStage || 'config')


  // 🔥 配置状态 - 不使用虚假默认值，数据库是唯一真实来源
  // 如果数据库中没有值，UI 应该显示为空或提示用户设置
  const [globalAssetText, setGlobalAssetText] = useState(projectData.globalAssetText || '')
  const [novelText, setNovelText] = useState(episode?.novelText || '')
  const [srtContent, setSrtContent] = useState(episode?.srtContent || '')
  const [analysisModel, setAnalysisModel] = useState(projectData.analysisModel)
  const [characterModel, setCharacterModel] = useState(projectData.characterModel)  // 🔥 移除虚假默认值
  const [locationModel, setLocationModel] = useState(projectData.locationModel)      // 🔥 移除虚假默认值
  const [storyboardModel, setStoryboardModel] = useState(projectData.storyboardModel) // 🔥 移除虚假默认值
  const [editModel, setEditModel] = useState(projectData.editModel)                  // 🔥 移除虚假默认值
  const [videoModel, setVideoModel] = useState(projectData.videoModel)
  const [videoRatio, setVideoRatio] = useState(projectData.videoRatio)
  const [videoResolution, setVideoResolution] = useState(projectData.videoResolution)

  const [ttsRate, setTtsRate] = useState(projectData.ttsRate)
  const [ttsVoice, setTtsVoice] = useState(projectData.ttsVoice)
  const [artStyle, setArtStyle] = useState(projectData.artStyle)
  // 资产文件上传功能现已移至资产库

  // V3 UI: Modal visibility states
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [isWorldContextModalOpen, setIsWorldContextModalOpen] = useState(false)
  const [isAssetLibraryOpen, setIsAssetLibraryOpen] = useState(false)
  // 🔥 标记是否需要在资产库打开时自动触发全局分析（避免 URL 参数竞态条件）
  const [triggerGlobalAnalyzeOnOpen, setTriggerGlobalAnalyzeOnOpen] = useState(false)

  // 🆕 监听 URL 参数自动打开资产库并触发全局分析
  useEffect(() => {
    const shouldTrigger = searchParams.get('globalAnalyze') === '1'

    if (shouldTrigger && !hasTriggeredGlobalAnalyze.current) {
      hasTriggeredGlobalAnalyze.current = true
      console.log('[NovelPromotionWorkspace] 检测到 globalAnalyze=1 参数，打开资产库弹窗并触发全局分析')

      // 🔥 先清除 URL 参数，避免 AssetsStage 重复处理
      const newParams = new URLSearchParams(searchParams.toString())
      newParams.delete('globalAnalyze')
      router.replace(`?${newParams.toString()}`, { scroll: false })

      // 打开资产库弹窗，并标记需要触发全局分析
      setIsAssetLibraryOpen(true)
      setTriggerGlobalAnalyzeOnOpen(true)  // 🔥 通过 props 传递给 AssetsStage

      // 加载资产数据
      onRefresh({ scope: 'assets' })
    }
  }, [searchParams, onRefresh, router])

  // ESC 键关闭弹窗
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isAssetLibraryOpen) setIsAssetLibraryOpen(false)
        if (isSettingsModalOpen) setIsSettingsModalOpen(false)
        if (isWorldContextModalOpen) setIsWorldContextModalOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isAssetLibraryOpen, isSettingsModalOpen, isWorldContextModalOpen])

  // ⚡ 自动加载资产：当进入需要资产的页面时（剧本/分镜/成片），主动加载资产数据
  // 修复问题：刷新页面后资产不显示，需要点击"资产库"才能显示
  useEffect(() => {
    const needsAssets = currentStage === 'script' || currentStage === 'assets' ||
      currentStage === 'storyboard' || currentStage === 'videos'
    // 如果在需要资产的页面，主动加载 detailed assets
    if (needsAssets) {
      onRefresh({ scope: 'assets' })
    }
  }, [currentStage, onRefresh])

  // 🔥 视频生成 Mutation Hooks（标准架构）
  const generateVideoMutation = useGenerateVideo(projectId, episodeId || null)
  const batchGenerateVideosMutation = useBatchGenerateVideos(projectId, episodeId || null)

  // 视频生成状态（只保留失败状态，加载状态通过乐观更新处理）

  const [isGeneratingAllVideos, setIsGeneratingAllVideos] = useState(false)

  // 用户配置的视频模型列表
  const [userVideoModels, setUserVideoModels] = useState<Array<{ value: string; label: string }>>([])

  // 加载用户视频模型列表
  useEffect(() => {
    async function fetchUserModels() {
      try {
        const res = await fetch('/api/user/models')
        if (res.ok) {
          const data = await res.json()
          if (data.video && data.video.length > 0) {
            setUserVideoModels(data.video)
          }
        }
      } catch (error) {
        console.error('Failed to fetch user models:', error)
      }
    }
    fetchUserModels()
  }, [])

  // TTS生成状态
  const [isGeneratingTTS, setIsGeneratingTTS] = useState(false)

  // 资产分析状态
  const [isAnalyzingAssets, setIsAnalyzingAssets] = useState(false)
  const [isConfirmingAssets, setIsConfirmingAssets] = useState(false)

  // 阶段跳转状态
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [transitionProgress, setTransitionProgress] = useState({ message: '', step: '' })

  const isAnyOperationRunning = isGeneratingTTS || isAnalyzingAssets || isConfirmingAssets || isTransitioning

  // 🔥 页面级统一轮询 - 检查是否有任何正在进行的异步任务
  const hasPendingTasks = useMemo(() => {
    // 检查资产是否在生成
    const hasGeneratingAssets = (projectData.characters || []).some((char: any) =>
      (char.appearances || []).some((app: any) => app.generating)
    ) || (projectData.locations || []).some((loc: any) =>
      (loc.images || []).some((img: any) => img.generating)
    )

    // 检查面板是否在生成图片或视频
    const hasGeneratingPanels = episodeStoryboards.some((sb: any) =>
      (sb.panels || []).some((p: any) => p.generatingImage || p.generatingVideo || p.generatingLipSync)
    )

    // 🔥 不再需要前端生成状态，乐观更新已设置 panel.generatingVideo
    return hasGeneratingAssets || hasGeneratingPanels || generateVideoMutation.isPending || batchGenerateVideosMutation.isPending
  }, [projectData.characters, projectData.locations, episodeStoryboards, generateVideoMutation.isPending, batchGenerateVideosMutation.isPending])

  // 🔥 使用页面级统一轮询 Hook - React Query 版本
  // 🔥 传入 episodeId，只查询当前剧集的任务
  useTaskPolling({
    projectId,
    episodeId,
    enabled: hasPendingTasks,
    interval: 5000,
    onTasksUpdated: () => onRefresh()
  })

  // V3 UI: Build CapsuleNav items from current stage statuses
  const getStageStatus = (stageId: string): 'empty' | 'active' | 'processing' | 'ready' => {
    if (isAnyOperationRunning) return 'processing'
    switch (stageId) {
      case 'config':
        return episode?.novelText ? 'ready' : 'active'
      case 'assets':
        return ((projectData.characters?.length || 0) > 0) ? 'ready' : 'empty'
      case 'storyboard':
        return episodeStoryboards.some((sb: any) => sb.panels?.length > 0) ? 'ready' : 'empty'
      case 'videos':
        return episodeStoryboards.some((sb: any) => sb.panels?.some((p: any) => p.videoUrl)) ? 'ready' : 'empty'
      case 'editor':
        // 剪辑阶段：有视频就可以进入
        return episodeStoryboards.some((sb: any) => sb.panels?.some((p: any) => p.videoUrl)) ? 'ready' : 'empty'
      case 'voice':
        return (episode?.voiceLines?.length || 0) > 0 ? 'ready' : 'empty'
      default:
        return 'empty'
    }
  }

  const capsuleNavItems = [
    { id: 'config', icon: '🖊️', label: t('stages.story'), status: getStageStatus('config') },
    { id: 'script', icon: '💠', label: t('stages.script'), status: getStageStatus('assets') },  // 原 assets 重命名为 script
    { id: 'storyboard', icon: '🎨', label: t('stages.storyboard'), status: getStageStatus('storyboard') },
    { id: 'videos', icon: '🎬', label: t('stages.video'), status: getStageStatus('videos') },
    // 🚧 剪辑阶段：显示为禁用状态，提示开发中
    { id: 'editor', icon: '✂️', label: t('stages.editor'), status: 'empty' as const, disabled: true, disabledLabel: t('stages.editorComingSoon') }
  ]

  // 阶段切换 - 只更新 URL，不写数据库
  // URL 是阶段状态的唯一真实来源 (Single Source of Truth)
  const handleStageChange = (stage: string) => {
    onStageChange?.(stage)
  }

  // 更新项目全局配置（不包括剧集内容）
  const handleUpdateConfig = async (key: string, value: any) => {
    try {
      const res = await fetch(`/api/novel-promotion/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value })
      })
      if (!res.ok) throw new Error('Failed to update config')
      updateLocalState({ [key]: value })
    } catch (err: any) {
      console.error('Update config error:', err)
    }
  }

  // 更新剧集内容（novelText, srtContent, audioUrl）
  const handleUpdateEpisode = async (key: string, value: any) => {
    if (!episodeId) {
      console.error('No episode selected')
      return
    }
    try {
      const res = await fetch(`/api/novel-promotion/${projectId}/episodes/${episodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value })
      })
      if (!res.ok) throw new Error('Failed to update episode')
    } catch (err: any) {
      console.error('Update episode error:', err)
    }
  }

  // TTS生成函数
  const handleGenerateTTS = async () => {
    if (!episodeId) {
      alert(te('selectEpisode'))
      return
    }
    try {
      setIsGeneratingTTS(true)

      const res = await fetch(`/api/novel-promotion/${projectId}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episodeId })
      })

      if (!res.ok) throw new Error(te('ttsFailed'))

      // TTS 完成后刷新数据
      await onRefresh()
    } catch (err: any) {
      if (isAbortError(err)) {
        console.log(te('requestAborted'))
        return
      }
      alert(te('ttsFailed') + ': ' + err.message)
    } finally {
      setIsGeneratingTTS(false)
    }
  }

  // 资产分析函数
  const handleAnalyzeAssets = async () => {
    // 防抖：防止并发请求导致重复创建资产
    if (isAnalyzingAssets) {
      console.log('[防抖] 资产分析正在进行中，忽略重复点击')
      return
    }

    try {
      setIsAnalyzingAssets(true)
      const res = await fetch(`/api/novel-promotion/${projectId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episodeId })
      })
      if (!res.ok) {
        await handleApiError(res)
      }

      // ⚡ 资产分析完成后，刷新资产数据
      await onRefresh({ scope: 'assets' })
    } catch (err: any) {
      if (isAbortError(err)) {
        console.log(te('requestAborted'))
        return
      }
      alert(te('analysisFailed') + ': ' + err.message)
    } finally {
      setIsAnalyzingAssets(false)
    }
  }

  // 🔥 单个视频生成（使用 Mutation Hook）
  const handleGenerateVideo = async (
    storyboardId: string,
    panelIndex: number,
    videoModel?: string,
    firstLastFrame?: {
      lastFrameStoryboardId: string
      lastFramePanelIndex: number
      flModel: string
      customPrompt?: string
      generateAudio?: boolean
    },
    generateAudio?: boolean  // 普通视频的音频开关
  ) => {
    // 🔥 错误已由后端写入数据库,前端无需维护临时状态

    try {
      await generateVideoMutation.mutateAsync({
        storyboardId,
        panelIndex,
        videoModel,
        firstLastFrame,
        generateAudio
      })
    } catch (err: any) {
      if (isAbortError(err)) {
        console.log(te('requestAborted'))
        return
      }

      // 🔥 错误已写入数据库,前端轮询会自动显示
    }
  }

  // 🔥 批量视频生成（使用 Mutation Hook）
  const handleGenerateAllVideos = async () => {
    if (!episodeId) {
      alert(te('selectEpisode'))
      return
    }

    try {
      setIsGeneratingAllVideos(true)

      // 🔥 获取批量生成结果
      const response = await batchGenerateVideosMutation.mutateAsync()

      // 🔥 批量生成结果已由后端写入数据库，前端无需处理

    } catch (err: any) {
      if (isAbortError(err)) {
        console.log(te('requestAborted'))
        return
      }
      alert(te('batchVideoFailed') + ': ' + err.message)
    } finally {
      setIsGeneratingAllVideos(false)
    }
  }

  // 更新视频提示词（原子化更新，不触发全局刷新）
  const handleUpdateVideoPrompt = async (storyboardId: string, panelIndex: number, value: string) => {
    try {
      const res = await fetch(`/api/novel-promotion/${projectId}/panel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyboardId, panelIndex, videoPrompt: value })
      })
      if (!res.ok) throw new Error(te('updateFailed'))
      // 不再调用 onSilentRefresh() - 本地状态已经是最新的，无需刷新整个页面
    } catch (err: any) {
      throw err
    }
  }

  // 更新单个 Panel 的视频模型（仅前端状态，不持久化）
  const handleUpdatePanelVideoModel = async (storyboardId: string, panelIndex: number, model: string) => {
    // 视频模型选择只在生成时使用，不需要持久化到数据库
    // VideoStage 组件会在调用 onGenerateVideo 时传入选中的模型
  }

  // 处理更新 Clip
  const handleUpdateClip = async (clipId: string, data: any) => {
    // 乐观更新
    setLocalEpisode(prev => {
      if (!prev) return prev
      const updatedClips = (prev.clips || []).map((c: any) => c.id === clipId ? { ...c, ...data } : c)
      return { ...prev, clips: updatedClips }
    })

    try {
      const res = await fetch(`/api/novel-promotion/${projectId}/clips/${clipId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })

      if (!res.ok) {
        throw new Error(te('updateFailed'))
      }

      const json = await res.json()
      if (json.clip) {
        // 再次更新确保一致
        setLocalEpisode(prev => {
          if (!prev) return prev
          const updatedClips = (prev.clips || []).map((c: any) => c.id === clipId ? { ...c, ...json.clip } : c)
          return { ...prev, clips: updatedClips }
        })
      }

    } catch (err: any) {
      console.error(te('updateFailed') + ':', err)
      alert(te('saveFailed') + ': ' + err.message)
    }
  }

  return (
    <>
      {/* V3 UI: Animated Background */}
      <AnimatedBackground />

      {/* V3 UI: Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        artStyle={artStyle}
        analysisModel={analysisModel}
        characterModel={characterModel}
        locationModel={locationModel}
        imageModel={storyboardModel}
        editModel={editModel}

        videoModel={videoModel}
        videoResolution={videoResolution}
        videoRatio={videoRatio}
        ttsVoice={ttsVoice}
        ttsRate={ttsRate}
        onArtStyleChange={(value) => { setArtStyle(value); handleUpdateConfig('artStyle', value) }}
        onAnalysisModelChange={(value) => { setAnalysisModel(value); handleUpdateConfig('analysisModel', value) }}
        onCharacterModelChange={(value) => { setCharacterModel(value); handleUpdateConfig('characterModel', value) }}
        onLocationModelChange={(value) => { setLocationModel(value); handleUpdateConfig('locationModel', value) }}
        onImageModelChange={(value) => { setStoryboardModel(value); handleUpdateConfig('storyboardModel', value) }}
        onEditModelChange={(value) => { setEditModel(value); handleUpdateConfig('editModel', value) }}

        onVideoModelChange={(value) => { setVideoModel(value); handleUpdateConfig('videoModel', value) }}
        onVideoResolutionChange={(value) => { setVideoResolution(value); handleUpdateConfig('videoResolution', value) }}
        onVideoRatioChange={(value) => { setVideoRatio(value); handleUpdateConfig('videoRatio', value) }}
        onTTSVoiceChange={(value) => { setTtsVoice(value); handleUpdateConfig('ttsVoice', value) }}
        onTTSRateChange={(value) => { setTtsRate(value); handleUpdateConfig('ttsRate', value) }}
      />

      {/* V3 UI: World Context Modal */}
      <WorldContextModal
        isOpen={isWorldContextModalOpen}
        onClose={() => setIsWorldContextModalOpen(false)}
        text={globalAssetText}
        onChange={(value) => { setGlobalAssetText(value); handleUpdateConfig('globalAssetText', value) }}
      />

      {/* V3 UI: Episode Selector (左上角) */}
      {episodes.length > 0 && episodeId && (
        <EpisodeSelector
          projectName={project.name}
          episodes={episodes.map(ep => ({
            id: ep.id,
            title: ep.name,
            summary: ep.description || undefined,
            status: {
              script: (ep as any).clips?.length > 0 ? 'ready' as const : 'empty' as const,
              visual: (ep as any).storyboards?.some((sb: any) => sb.panels?.some((p: any) => p.videoUrl)) ? 'ready' as const : 'empty' as const
            }
          }))}
          currentId={episodeId}
          onSelect={(id) => onEpisodeSelect?.(id)}
          onAdd={onEpisodeCreate}
          onRename={(id, newName) => onEpisodeRename?.(id, newName)}
        />
      )}

      {/* V3 UI: Capsule Navigation */}
      <CapsuleNav
        items={capsuleNavItems}
        activeId={currentStage}
        onItemClick={handleStageChange}
        projectId={projectId}
        episodeId={episodeId}
      />

      {/* V3 UI: Top Right Action Buttons */}
      <div className="fixed top-20 right-6 z-50 flex gap-3">
        <button
          onClick={() => {
            setIsAssetLibraryOpen(true)
            onRefresh({ scope: 'assets' })  // ⚡ 加载资产数据
          }}
          className="flex items-center gap-2 px-4 py-3 bg-white/70 backdrop-blur-xl border border-white/50 rounded-2xl shadow-sm hover:shadow-md hover:bg-white/90 transition-all text-slate-700 hover:text-blue-600"
        >
          <span className="text-xl">📦</span>
          <span className="font-bold text-sm hidden md:inline">{t('buttons.assetLibrary')}</span>
        </button>
        <button
          onClick={() => setIsSettingsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-3 bg-white/70 backdrop-blur-xl border border-white/50 rounded-2xl shadow-sm hover:shadow-md hover:bg-white/90 transition-all text-slate-600 hover:text-slate-800"
        >
          <span className="text-xl">⚙️</span>
          <span className="font-bold text-sm hidden md:inline">{t('buttons.settings')}</span>
        </button>
        <button
          onClick={() => onRefresh({ mode: 'full' })}
          className="flex items-center gap-2 px-4 py-3 bg-white/70 backdrop-blur-xl border border-white/50 rounded-2xl shadow-sm hover:shadow-md hover:bg-white/90 transition-all text-slate-600 hover:text-blue-600"
          title={t('buttons.refreshData')}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Main Content Area with top padding for fixed nav */}
      <div className="pt-24">
        {/* 页面切换动画容器 */}
        <div key={currentStage} className="animate-page-enter">

          {currentStage === 'config' && (
            <NovelInputStage
              novelText={novelText}
              episodeName={episode?.name}
              onNovelTextChange={(value: string) => {
                setNovelText(value)
                handleUpdateEpisode('novelText', value)
              }}
              isGenerating={isGeneratingTTS}
              isTransitioning={isTransitioning}
              videoRatio={videoRatio}
              artStyle={artStyle}
              onVideoRatioChange={(value) => { setVideoRatio(value); handleUpdateConfig('videoRatio', value) }}
              onArtStyleChange={(value) => { setArtStyle(value); handleUpdateConfig('artStyle', value) }}
              onNext={async () => {
                try {
                  setIsTransitioning(true)

                  // 1. 设置Agent模式
                  await handleUpdateConfig('workflowMode', 'agent')

                  // 2. 资产分析
                  setTransitionProgress({ message: tp('analyzing'), step: tp('step', { current: 1, total: 3 }) })
                  await handleAnalyzeAssets()

                  // 3. 切分Clips
                  setTransitionProgress({ message: tp('splittingClips'), step: tp('step', { current: 2, total: 3 }) })
                  const clipsRes = await fetch(`/api/novel-promotion/${projectId}/clips`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ episodeId })
                  })
                  if (!clipsRes.ok) {
                    await handleApiError(clipsRes)
                  }

                  // 4. 剧本转换
                  setTransitionProgress({ message: tp('convertingScreenplay'), step: tp('step', { current: 3, total: 3 }) })
                  const screenplayRes = await fetch(`/api/novel-promotion/${projectId}/screenplay-conversion`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ episodeId })
                  })
                  if (!screenplayRes.ok) {
                    await handleApiError(screenplayRes)
                  }

                  // 5. 刷新数据并跳转到剧本页
                  await onRefresh()  // 🔥 统一刷新会同时加载资产
                  await handleStageChange('script')

                  // 6. 自动弹出资产库，让用户确认角色卡片
                  setIsAssetLibraryOpen(true)
                } catch (err: any) {
                  if (isAbortError(err)) {
                    console.log(te('requestAborted'))
                    return
                  }
                  alert(te('prepareFailed') + ': ' + err.message)
                } finally {
                  setIsTransitioning(false)
                  setTransitionProgress({ message: '', step: '' })
                }
              }}
            />
          )}

          {/* 剧本视图 - 'script' 或 'assets'（向后兼容） */}
          {(currentStage === 'script' || currentStage === 'assets') && (
            <ScriptView
              projectId={projectId}
              episodeId={episodeId}
              clips={episodeClips}
              storyboards={episodeStoryboards}
              assetsLoading={assetsLoading}
              onClipUpdate={handleUpdateClip} // 传递更新回调
              onOpenAssetLibrary={() => {
                setIsAssetLibraryOpen(true)
                onRefresh({ scope: 'assets' })  // ⚡ 加载资产数据
              }}
              onGenerateStoryboard={async () => {
                // 生成分镜（clips和剧本已在"开始创作"时生成）
                if (!episodeId) {
                  alert(te('selectEpisode'))
                  return
                }
                try {
                  setIsConfirmingAssets(true)
                  setTransitionProgress({ message: tp('submittingStoryboard'), step: tp('step', { current: 1, total: 3 }) })

                  // 异步生成文字分镜（Phase 1-3）
                  const storyboardTextRes = await fetch(`/api/novel-promotion/${projectId}/storyboard-text`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ episodeId, async: true })
                  })
                  if (!storyboardTextRes.ok) {
                    const errorData = await storyboardTextRes.json()
                    throw new Error(errorData.error || '提交分镜任务失败')
                  }

                  const taskData = await storyboardTextRes.json()
                  if (!taskData.async || !taskData.taskId) {
                    throw new Error('未能获取异步任务ID')
                  }

                  // 轮询等待分镜生成完成（无时间限制）
                  while (true) {
                    await new Promise(resolve => setTimeout(resolve, 2000)) // 每2秒轮询

                    const pollRes = await fetch(`/api/novel-promotion/${projectId}/poll-task?taskId=${taskData.taskId}`)
                    if (!pollRes.ok) continue

                    const pollData = await pollRes.json()

                    if (pollData.status === 'completed') {
                      console.log('[分镜生成] 任务完成')
                      break
                    } else if (pollData.status === 'failed') {
                      throw new Error(pollData.error || '分镜生成失败')
                    }

                    // 更新进度显示（显示阶段信息）
                    const phase = pollData.phase || 1
                    const phaseLabel = pollData.phaseLabel || '分析中'
                    const clipInfo = pollData.clipIndex && pollData.totalClips
                      ? ` (${pollData.clipIndex}/${pollData.totalClips})`
                      : ''
                    const progress = pollData.progress || 0

                    setTransitionProgress({
                      message: `阶段${phase}/2: 正在${phaseLabel}${clipInfo}...`,
                      step: `${progress}%`
                    })
                  }

                  // 自动分析台词
                  setTransitionProgress({ message: '正在分析台词...', step: '分析中' })
                  const voiceAnalyzeRes = await fetch(`/api/novel-promotion/${projectId}/voice-analyze`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ episodeId })
                  })
                  if (!voiceAnalyzeRes.ok) {
                    const errorData = await voiceAnalyzeRes.json()
                    // 分析失败不阻塞流程，只提示
                    console.error('台词分析失败:', errorData.error)
                  }

                  // 刷新数据后跳转到分镜面板
                  await onRefresh()
                  await handleStageChange('storyboard')
                } catch (err: any) {
                  if (isAbortError(err)) {
                    console.log('请求被中断（可能是页面刷新），后端仍在执行')
                    return
                  }
                  alert('生成失败: ' + err.message)
                } finally {
                  setIsConfirmingAssets(false)
                  setTransitionProgress({ message: '', step: '' })
                }
              }}
              isGenerating={isConfirmingAssets}
            />
          )}

          {currentStage === 'storyboard' && episodeId && (
            <StoryboardStage
              projectId={projectId}
              episodeId={episodeId}
              storyboards={episodeStoryboards}
              clips={episodeClips}
              videoRatio={videoRatio}
              onBack={() => handleStageChange('script')}
              onNext={async () => {
                // 直接进入视频生成页面
                await handleStageChange('videos')
              }}
              isTransitioning={isTransitioning}
            />
          )}

          {currentStage === 'videos' && (
            <VideoStage
              projectId={projectId}
              episodeId={episode?.id || ''}
              storyboards={episodeStoryboards}
              clips={episodeClips}
              defaultVideoModel={videoModel || 'doubao-seedance-1-0-pro-250528'}
              videoRatio={videoRatio}
              userVideoModels={userVideoModels}

              onGenerateVideo={handleGenerateVideo}
              onGenerateAllVideos={handleGenerateAllVideos}
              isGeneratingAll={isGeneratingAllVideos}
              onBack={() => handleStageChange('storyboard')}
              onUpdateVideoPrompt={handleUpdateVideoPrompt}
              onUpdatePanelVideoModel={handleUpdatePanelVideoModel}
            // 🚧 剪辑阶段暂时隐藏，后续开放
            // onEnterEditor={() => handleStageChange('editor')}
            />
          )}

          {/* 🚧 剪辑阶段 - 视频编辑器（暂时禁用，后续开放）
          {currentStage === 'editor' && (
            <div className="p-8 bg-white rounded-lg shadow m-4">
              <h1 className="text-2xl font-bold mb-4">✂️ 视频剪辑器</h1>
              <p className="text-slate-600 mb-2">episodeId: {episodeId || '无'}</p>
              <p className="text-slate-600 mb-4">视频片段数: {episodeStoryboards.flatMap((sb: any) => (sb.panels || []).filter((p: any) => p.videoUrl)).length}</p>
              {episodeId && (
                <VideoEditorStage
                  projectId={projectId}
                  episodeId={episodeId}
                  initialProject={(() => {
                    const allPanels = episodeStoryboards.flatMap((sb: any) =>
                      (sb.panels || []).filter((p: any) => p.videoUrl).map((p: any) => ({
                        ...p,
                        storyboardId: sb.id
                      }))
                    )
                    if (allPanels.length === 0) return undefined
                    return createProjectFromPanels(episodeId, allPanels, episode?.voiceLines)
                  })()}
                  onBack={() => handleStageChange('videos')}
                />
              )}
            </div>
          )}
          */}

          {currentStage === 'voice' && episodeId && (
            <VoiceStage
              projectId={projectId}
              episodeId={episodeId}
              onBack={() => handleStageChange('videos')}
            />
          )}

          {/* 资产库弹窗 - 全屏居中 glassmorphism 风格 */}
          {isAssetLibraryOpen && (
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm animate-fadeIn"
              onClick={(e) => {
                // 点击背景关闭
                if (e.target === e.currentTarget) setIsAssetLibraryOpen(false)
              }}
            >
              <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50 w-[95vw] max-w-6xl h-[90vh] flex flex-col">
                {/* 头部 */}
                <div className="flex items-center justify-between px-8 py-5 border-b border-slate-200/50 flex-shrink-0">
                  <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                    <span className="text-3xl">📦</span>
                    资产库
                  </h2>
                  <button
                    onClick={() => setIsAssetLibraryOpen(false)}
                    className="p-3 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* 内容区域 - 直接使用 AssetsStage */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                  {/* 资产加载中指示器 */}
                  {assetsLoading && (projectData.characters || []).length === 0 && (projectData.locations || []).length === 0 && (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400 animate-pulse">
                      <svg className="w-12 h-12 mb-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span className="text-base">资产加载中...</span>
                    </div>
                  )}
                  <AssetsStage
                    projectId={projectId}
                    workflowMode={projectData.workflowMode || 'agent'}
                    globalAssetText={projectData.globalAssetText || null}
                    novelText={episode?.novelText || null}
                    audioUrl={episode?.audioUrl ?? null}
                    srtContent={episode?.srtContent ?? null}
                    ttsVoice={ttsVoice}
                    onTtsVoiceChange={(value) => {
                      setTtsVoice(value)
                      handleUpdateConfig('ttsVoice', value)
                    }}
                    onGenerateTTS={handleGenerateTTS}
                    onAnalyzeAssets={handleAnalyzeAssets}
                    isGeneratingTTS={isGeneratingTTS}
                    isAnalyzingAssets={isAnalyzingAssets}
                    // 🔥 V6.6 重构：删除 onGenerateImage - AssetsStage 现在内部使用 mutation hooks
                    onConfirm={() => setIsAssetLibraryOpen(false)}
                    isConfirming={false}
                    // 🔥 通过 props 触发全局分析，避免 URL 参数竞态条件
                    triggerGlobalAnalyze={triggerGlobalAnalyzeOnOpen}
                    onGlobalAnalyzeComplete={() => setTriggerGlobalAnalyzeOnOpen(false)}
                  />
                </div>
              </div>
            </div>
          )}

          {transitionProgress.message && (
            <ProgressToast show={true} message={transitionProgress.message} step={transitionProgress.step} />
          )}

        </div>{/* 页面切换动画容器结束 */}
      </div>
    </>
  )
}

