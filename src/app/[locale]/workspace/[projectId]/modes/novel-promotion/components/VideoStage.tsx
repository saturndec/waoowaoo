'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { FIRST_LAST_FRAME_MODELS, getAspectRatioConfig } from '@/lib/constants'
import {
  VideoToolbar,
  VideoPanelCard,
  VideoPanel,
  Storyboard,
  Clip,
  FirstLastFrameParams,
  MatchedVoiceLine
} from './video'
import VoiceStage from './VoiceStage'
import { useRefreshProjectAssets, useProjectAssets } from '@/lib/query/hooks'
import { useLipSync } from '@/lib/query/hooks/useStoryboards'

// 台词数据类型
interface VoiceLine {
  id: string
  lineIndex: number
  speaker: string
  content: string
  audioUrl: string | null
  matchedStoryboardId: string | null
  matchedPanelIndex: number | null
}

// 用户视频模型选项
interface VideoModelOption {
  value: string
  label: string
}

interface VideoStageProps {
  projectId: string
  episodeId: string  // 当前剧集ID
  storyboards: Storyboard[]
  clips: Clip[]
  defaultVideoModel: string
  videoRatio?: string  // 视频比例：'16:9' 或 '9:16'
  userVideoModels?: VideoModelOption[]  // 用户配置的视频模型列表

  onGenerateVideo: (storyboardId: string, panelIndex: number, videoModel?: string, firstLastFrame?: FirstLastFrameParams, generateAudio?: boolean) => Promise<void>
  onGenerateAllVideos: () => Promise<void>
  isGeneratingAll: boolean
  onBack: () => void
  onUpdateVideoPrompt: (storyboardId: string, panelIndex: number, value: string) => Promise<void>
  onUpdatePanelVideoModel: (storyboardId: string, panelIndex: number, model: string) => Promise<void>
  // 🔥 V6.5 删除：characters prop - 现在内部直接订阅
  onEnterEditor?: () => void  // 进入剪辑器
}

export default function VideoStage({
  projectId,
  episodeId,
  storyboards,
  clips,
  defaultVideoModel,
  videoRatio = '16:9',
  userVideoModels,

  onGenerateVideo,
  onGenerateAllVideos,
  isGeneratingAll,
  onBack,
  onUpdateVideoPrompt,
  onUpdatePanelVideoModel,
  // 🔥 V6.5 删除：characters prop
  onEnterEditor
}: VideoStageProps) {
  // 🔥 使用 React Query 刷新
  const onRefresh = useRefreshProjectAssets(projectId)
  const t = useTranslations('video')

  // 🔥 V6.5 重构：直接订阅缓存，消除 props drilling
  const { data: assets } = useProjectAssets(projectId)
  // 🔧 使用 useMemo 稳定引用，防止 useCallback/useEffect 依赖问题
  const characters = useMemo(() => assets?.characters ?? [], [assets?.characters])
  const tVoice = useTranslations('voice')

  const [isDownloading, setIsDownloading] = useState(false)
  // 每个 panel 的视频切换状态：key = panelKey, value = true（口型同步）/ false（原始）
  // 默认 true（优先显示口型同步视频）
  const [panelVideoPreference, setPanelVideoPreference] = useState<Map<string, boolean>>(new Map())

  // 本地状态管理视频提示词（key: panelKey, value: prompt）
  // 这样保存后不需要等外部数据刷新就能显示
  const [panelPrompts, setPanelPrompts] = useState<Map<string, string>>(new Map())
  const [savingPrompts, setSavingPrompts] = useState<Set<string>>(new Set())

  // 口型同步：每个panel对应的匹配配音
  // key: `${storyboardId}-${panelIndex}`, value: MatchedVoiceLine[]
  const [panelVoiceLines, setPanelVoiceLines] = useState<Map<string, MatchedVoiceLine[]>>(new Map())

  // 🔥 口型同步 Mutation Hook（标准架构）
  const lipSyncMutation = useLipSync(projectId, episodeId)

  // 台词面板状态
  const [voiceLinesExpanded, setVoiceLinesExpanded] = useState(false)
  const [allVoiceLines, setAllVoiceLines] = useState<VoiceLine[]>([])
  const [highlightedPanelKey, setHighlightedPanelKey] = useState<string | null>(null)
  const panelRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // 按 clip 顺序排序 storyboards（使用 clips 数组索引，兼容 SRT 和 Agent 模式）
  const sortedStoryboards = [...storyboards].sort((a, b) => {
    const clipIndexA = clips.findIndex(c => c.id === a.clipId)
    const clipIndexB = clips.findIndex(c => c.id === b.clipId)
    // 使用 clips 数组的索引排序（clips 已经在 API 中按正确顺序返回）
    return clipIndexA - clipIndexB
  })

  // 构建所有镜头的平铺列表（使用独立的 Panel 记录）
  const allPanels: VideoPanel[] = []
  sortedStoryboards.forEach(storyboard => {
    const panels = storyboard.panels || []

    panels.forEach((panel, index) => {
      // 使用 panel.imageUrl 作为唯一图片来源
      const imageUrl = panel.imageUrl
      const panelKey = `${storyboard.id}-${index}`
      // 解析 characters JSON 字符串
      let charactersArray: string[] = []
      if (panel.characters) {
        try {
          const parsed = typeof panel.characters === 'string' ? JSON.parse(panel.characters) : panel.characters
          charactersArray = Array.isArray(parsed) ? parsed : []
        } catch {
          charactersArray = []
        }
      }

      allPanels.push({
        panelId: (panel as any).id,  // 🔥 添加panelId用于取消按钮
        storyboardId: storyboard.id,
        panelIndex: index,
        textPanel: {
          panel_number: panel.panelNumber || index + 1,
          shot_type: panel.shotType || '',
          camera_move: panel.cameraMove || '',
          description: panel.description || '',
          characters: charactersArray,
          location: panel.location || '',
          text_segment: panel.srtSegment || '',  // 使用正确的字段名 srtSegment
          duration: panel.duration || undefined,
          imagePrompt: panel.imagePrompt || undefined,
          video_prompt: panel.videoPrompt || undefined,
          videoModel: panel.videoModel || undefined
        },
        imageUrl: imageUrl || undefined,
        videoUrl: panel.videoUrl || undefined,
        // 🔥 只使用服务器状态（乐观更新已设置）
        generatingVideo: panel.generatingVideo || false,
        // 🔥 直接读取数据库的错误消息(所有失败都已持久化)
        videoErrorMessage: panel.videoErrorMessage || undefined,
        videoModel: panel.videoModel || undefined,
        linkedToNextPanel: panel.linkedToNextPanel || false,
        // 口型同步相关
        lipSyncVideoUrl: panel.lipSyncVideoUrl || undefined,
        // 🔥 只使用服务器状态（乐观更新已设置）
        generatingLipSync: panel.generatingLipSync || false,
        lipSyncErrorMessage: panel.lipSyncErrorMessage || undefined
      })
    })
  })

  // 首尾帧链接状态（本地状态，用于UI交互）
  const [linkedPanels, setLinkedPanels] = useState<Map<string, boolean>>(new Map())

  // 从数据库同步链接状态（当 storyboards 数据变化时）
  useEffect(() => {
    const map = new Map<string, boolean>()
    allPanels.forEach(p => {
      if (p.linkedToNextPanel) {
        map.set(`${p.storyboardId}-${p.panelIndex}`, true)
      }
    })
    setLinkedPanels(map)
  }, [storyboards]) // 依赖 storyboards 而不是 allPanels，因为 allPanels 每次渲染都会重新创建

  // 初始化本地提示词状态（只在外部数据中有新的 panel 时才同步）
  useEffect(() => {
    setPanelPrompts(prev => {
      const newMap = new Map(prev)
      allPanels.forEach(p => {
        const key = `${p.storyboardId}-${p.panelIndex}`
        // 只有本地没有的才从外部同步
        if (!newMap.has(key)) {
          newMap.set(key, p.textPanel?.video_prompt || '')
        }
      })
      return newMap
    })
  }, [storyboards]) // 依赖 storyboards

  // 获取本地提示词（优先本地，其次外部数据）
  const getLocalPrompt = useCallback((panelKey: string, externalPrompt?: string): string => {
    if (panelPrompts.has(panelKey)) {
      return panelPrompts.get(panelKey) || ''
    }
    return externalPrompt || ''
  }, [panelPrompts])

  // 更新本地提示词
  const updateLocalPrompt = useCallback((panelKey: string, value: string) => {
    setPanelPrompts(prev => {
      const newMap = new Map(prev)
      newMap.set(panelKey, value)
      return newMap
    })
  }, [])

  // 保存提示词到数据库（直接接收要保存的值，避免异步状态更新问题）
  const savePrompt = useCallback(async (storyboardId: string, panelIndex: number, panelKey: string, value: string) => {
    setSavingPrompts(prev => new Set(prev).add(panelKey))
    try {
      await onUpdateVideoPrompt(storyboardId, panelIndex, value)
    } catch (err) {
      console.error('保存视频提示词失败:', err)
    } finally {
      setSavingPrompts(prev => {
        const next = new Set(prev)
        next.delete(panelKey)
        return next
      })
    }
  }, [onUpdateVideoPrompt])

  // 加载每个panel对应的匹配配音
  useEffect(() => {
    const loadVoiceLines = async () => {
      if (!episodeId) return

      try {
        // 获取剧集的所有配音
        const response = await fetch(`/api/novel-promotion/${projectId}/voice-lines?episodeId=${episodeId}`)
        if (!response.ok) return

        const data = await response.json()
        const voiceLines = data.voiceLines || []

        // 按panel分组
        const panelMap = new Map<string, MatchedVoiceLine[]>()

        for (const vl of voiceLines) {
          if (vl.matchedStoryboardId && vl.matchedPanelIndex !== null) {
            const panelKey = `${vl.matchedStoryboardId}-${vl.matchedPanelIndex}`
            const existing = panelMap.get(panelKey) || []
            existing.push({
              id: vl.id,
              lineIndex: vl.lineIndex,
              speaker: vl.speaker,
              content: vl.content,
              audioUrl: vl.audioUrl || undefined,
              audioDuration: vl.audioDuration || undefined
            })
            panelMap.set(panelKey, existing)
          }
        }

        setPanelVoiceLines(panelMap)
        // 同时设置所有台词列表（用于折叠面板）
        setAllVoiceLines(voiceLines)
      } catch (error) {
        console.error('Failed to load voice lines:', error)
      }
    }

    loadVoiceLines()
  }, [projectId, episodeId])

  // 🔥 口型同步轮询已移至页面级 useTaskPolling hook，此处不再独立轮询
  // LipSync 状态更新通过 onRefresh 回调从页面级获取

  // 滚动到指定镜头并高亮
  const scrollToPanel = useCallback((storyboardId: string, panelIndex: number) => {
    const panelKey = `${storyboardId}-${panelIndex}`
    const panelEl = panelRefs.current.get(panelKey)

    if (panelEl) {
      panelEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightedPanelKey(panelKey)
      // 3秒后取消高亮
      setTimeout(() => setHighlightedPanelKey(null), 3000)
    }
  }, [])

  // 🔥 口型同步回调（使用 Mutation Hook）
  const handleLipSync = useCallback(async (
    storyboardId: string,
    panelIndex: number,
    voiceLineId: string
  ) => {
    try {
      await lipSyncMutation.mutateAsync({
        storyboardId,
        panelIndex,
        voiceLineId
      })
    } catch (error: any) {
      console.error('Lip sync error:', error)
      throw error
    }
  }, [lipSyncMutation])

  // 首尾帧模型选择
  const [flModel, setFlModel] = useState(FIRST_LAST_FRAME_MODELS[0].value)

  // 首尾帧生成音频开关（仅 Seedance 1.5 Pro 支持）
  const [flGenerateAudio, setFlGenerateAudio] = useState(true)

  // 首尾帧自定义提示词（key: panelKey, value: customPrompt）
  const [flCustomPrompts, setFlCustomPrompts] = useState<Map<string, string>>(new Map())

  const videosWithUrl = allPanels.filter(p => p.videoUrl).length
  // 🔥 使用服务器状态统计正在生成的数量
  const generatingCount = allPanels.filter(p => p.generatingVideo).length
  // 🔥 直接从数据库状态统计失败数量
  const failedCount = allPanels.filter(p => p.videoErrorMessage).length
  const isAnyGenerating = generatingCount > 0 || isGeneratingAll

  // 下载进度状态
  const [downloadProgress, setDownloadProgress] = useState<{ current: number; total: number } | null>(null)

  const handleDownloadAllVideos = useCallback(async () => {
    if (videosWithUrl === 0) return
    setIsDownloading(true)
    setDownloadProgress(null)

    try {
      // 动态导入 JSZip（避免SSR问题）
      const JSZip = (await import('jszip')).default

      // 收集每个 panel 的视频偏好（默认 true = 口型同步视频优先）
      const panelPreferences: Record<string, boolean> = {}
      allPanels.forEach(p => {
        const panelKey = `${p.storyboardId}-${p.panelIndex}`
        panelPreferences[panelKey] = panelVideoPreference.get(panelKey) ?? true
      })

      console.log('[下载视频] 获取视频URL列表...')
      const response = await fetch(`/api/novel-promotion/${projectId}/video-urls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          episodeId,
          panelPreferences
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || t('stage.error.fetchVideosFailed'))
      }

      const data = await response.json()
      const videos = data.videos as Array<{ index: number; fileName: string; videoUrl: string }>
      const projectName = data.projectName || 'videos'

      if (videos.length === 0) {
        throw new Error(t('stage.noVideos'))
      }

      console.log(`[下载视频] 共 ${videos.length} 个视频，开始下载...`)
      setDownloadProgress({ current: 0, total: videos.length })

      // 创建 ZIP 对象
      const zip = new JSZip()

      // 逐个下载视频并添加到 ZIP
      for (let i = 0; i < videos.length; i++) {
        const video = videos[i]
        console.log(`[下载视频] 下载 ${i + 1}/${videos.length}: ${video.fileName}`)
        setDownloadProgress({ current: i + 1, total: videos.length })

        try {
          const videoResponse = await fetch(video.videoUrl)
          if (!videoResponse.ok) {
            console.error(`[下载视频] 下载失败: ${video.fileName}`)
            continue
          }
          const blob = await videoResponse.blob()
          zip.file(video.fileName, blob)
        } catch (err) {
          console.error(`[下载视频] 下载失败: ${video.fileName}`, err)
          // 继续下载其他视频
        }
      }

      console.log('[下载视频] 生成 ZIP 文件...')
      const zipBlob = await zip.generateAsync({ type: 'blob' })

      // 下载 ZIP 文件
      const url = window.URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${projectName}_videos.zip`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      console.log('[下载视频] 完成!')
    } catch (error: any) {
      console.error('[下载视频] 错误:', error)
      alert(t('stage.downloadFailed') + ': ' + (error.message || t('errors.unknownError')))
    } finally {
      setIsDownloading(false)
      setDownloadProgress(null)
    }
  }, [projectId, episodeId, videosWithUrl, allPanels, panelVideoPreference])

  // 切换首尾帧链接状态
  const handleToggleLink = useCallback(async (panelKey: string, storyboardId: string, panelIndex: number) => {
    const currentLinked = linkedPanels.get(panelKey) || false
    const newLinked = !currentLinked

    // 更新本地状态
    setLinkedPanels(prev => {
      const newMap = new Map(prev)
      if (newLinked) {
        newMap.set(panelKey, true)
      } else {
        newMap.delete(panelKey)
      }
      return newMap
    })

    // 保存到数据库
    try {
      await fetch(`/api/novel-promotion/${projectId}/panel-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyboardId, panelIndex, linked: newLinked })
      })
    } catch (error) {
      console.error('Failed to save link state:', error)
    }
  }, [projectId, linkedPanels])

  // 生成首尾帧视频
  const handleGenerateFirstLastFrame = useCallback(async (
    firstStoryboardId: string,
    firstPanelIndex: number,
    lastStoryboardId: string,
    lastPanelIndex: number,
    panelKey: string
  ) => {
    const customPrompt = flCustomPrompts.get(panelKey)
    await onGenerateVideo(firstStoryboardId, firstPanelIndex, undefined, {
      lastFrameStoryboardId: lastStoryboardId,
      lastFramePanelIndex: lastPanelIndex,
      flModel,
      customPrompt,
      generateAudio: flModel === 'doubao-seedance-1-5-pro-251215' ? flGenerateAudio : undefined
    })
  }, [onGenerateVideo, flModel, flCustomPrompts, flGenerateAudio])

  // 生成默认的首尾帧拼接提示词
  const getDefaultFlPrompt = (firstPrompt?: string, lastPrompt?: string): string => {
    const first = firstPrompt || ''
    const last = lastPrompt || ''
    if (last) {
      return `${first} ${t('firstLastFrame.thenTransitionTo')}: ${last}`
    }
    return first
  }

  // 获取下一个镜头信息
  const getNextPanel = (currentIndex: number): VideoPanel | null => {
    if (currentIndex >= allPanels.length - 1) return null
    return allPanels[currentIndex + 1]
  }

  // 检查当前镜头是否被上一个镜头链接（作为尾帧）
  const isLinkedAsLastFrame = (currentIndex: number): boolean => {
    if (currentIndex === 0) return false
    const prevPanel = allPanels[currentIndex - 1]
    const prevKey = `${prevPanel.storyboardId}-${prevPanel.panelIndex}`
    return linkedPanels.get(prevKey) || false
  }

  return (
    <div className="space-y-6 pb-20">
      <VideoToolbar
        totalPanels={allPanels.length}
        generatingCount={generatingCount}
        videosWithUrl={videosWithUrl}
        failedCount={failedCount}
        isAnyGenerating={isAnyGenerating}
        isDownloading={isDownloading}
        onGenerateAll={onGenerateAllVideos}
        onDownloadAll={handleDownloadAllVideos}
        onBack={onBack}
        onEnterEditor={onEnterEditor}
        videosReady={videosWithUrl > 0}
      />

      {/* 折叠式台词配音面板 - 嵌入完整的 VoiceStage */}
      <div className="bg-white/70 backdrop-blur-xl border border-white/60 rounded-3xl shadow-xl shadow-slate-200/40 overflow-hidden">
        {/* 折叠头部 */}
        <button
          onClick={() => setVoiceLinesExpanded(!voiceLinesExpanded)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <span className="text-lg">🎙️</span>
            </div>
            <div className="text-left">
              <h3 className="font-bold text-slate-800">{tVoice('title')}</h3>
              <p className="text-sm text-slate-500">
                {tVoice('linesCount', { count: allVoiceLines.length })}
                {tVoice('audioGeneratedCount', { count: allVoiceLines.filter(vl => vl.audioUrl).length })}
              </p>
            </div>
          </div>
          <svg
            className={`w-5 h-5 text-slate-400 transition-transform ${voiceLinesExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* 展开内容 - 嵌入完整的 VoiceStage 组件 */}
        {voiceLinesExpanded && (
          <div className="py-4">
            <VoiceStage
              projectId={projectId}
              episodeId={episodeId}
              embedded={true}
              onVoiceLineClick={(storyboardId: string, panelIndex: number) => {
                scrollToPanel(storyboardId, panelIndex)
                setVoiceLinesExpanded(false)
              }}
            />
          </div>
        )}
      </div>

      {/* 卡片视图 */}
      <div className={`grid gap-4 ${getAspectRatioConfig(videoRatio).isVertical
        ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
        : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
        }`}>
        {allPanels.map((panel, idx) => {
          const panelKey = `${panel.storyboardId}-${panel.panelIndex}`
          const isLinked = linkedPanels.get(panelKey) || false
          const isLastFrame = isLinkedAsLastFrame(idx)
          const nextPanel = getNextPanel(idx)
          const prevPanel = idx > 0 ? allPanels[idx - 1] : null
          const hasNext = idx < allPanels.length - 1

          return (
            <div
              key={panelKey}
              ref={el => {
                if (el) panelRefs.current.set(panelKey, el)
                else panelRefs.current.delete(panelKey)
              }}
              className={`transition-all duration-500 ${highlightedPanelKey === panelKey
                ? 'ring-4 ring-blue-400 ring-offset-2 rounded-2xl scale-[1.02]'
                : ''
                }`}
            >
              <VideoPanelCard
                panel={{
                  ...panel,
                  // 🔥 只使用服务器状态（乐观更新已设置）
                  generatingLipSync: panel.generatingLipSync || false
                }}
                panelIndex={idx}
                defaultVideoModel={defaultVideoModel}
                videoRatio={videoRatio}
                userVideoModels={userVideoModels}
                projectId={projectId}
                episodeId={episodeId}
                matchedVoiceLines={panelVoiceLines.get(panelKey) || []}
                onLipSync={handleLipSync}
                showLipSyncVideo={panelVideoPreference.get(panelKey) ?? true}
                onToggleLipSyncVideo={(key, value) => setPanelVideoPreference(prev => new Map(prev).set(key, value))}
                isLinked={isLinked}
                isLastFrame={isLastFrame}
                nextPanel={nextPanel}
                prevPanel={prevPanel}
                hasNext={hasNext}
                flModel={flModel}
                flGenerateAudio={flGenerateAudio}
                flCustomPrompt={flCustomPrompts.get(panelKey) || ''}
                defaultFlPrompt={getDefaultFlPrompt(panel.textPanel?.video_prompt, nextPanel?.textPanel?.video_prompt)}
                // 本地提示词管理
                localPrompt={getLocalPrompt(panelKey, panel.textPanel?.video_prompt)}
                isSavingPrompt={savingPrompts.has(panelKey)}
                onUpdateLocalPrompt={(value) => updateLocalPrompt(panelKey, value)}
                onSavePrompt={(value) => savePrompt(panel.storyboardId, panel.panelIndex, panelKey, value)}
                // 其他回调
                onGenerateVideo={onGenerateVideo}
                onUpdatePanelVideoModel={onUpdatePanelVideoModel}
                onToggleLink={handleToggleLink}
                onFlModelChange={setFlModel}
                onFlGenerateAudioChange={setFlGenerateAudio}
                onFlCustomPromptChange={(key, value) => setFlCustomPrompts(prev => new Map(prev).set(key, value))}
                onResetFlPrompt={(key) => setFlCustomPrompts(prev => { const next = new Map(prev); next.delete(key); return next })}
                onGenerateFirstLastFrame={handleGenerateFirstLastFrame}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
