'use client'
import { useTranslations } from 'next-intl'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { VIDEO_MODELS, AUDIO_SUPPORTED_MODELS } from '@/lib/constants'
import { VideoPanel, MatchedVoiceLine, VideoModelOption } from './types'
import FirstLastFramePanel from './FirstLastFramePanel'
import { useCancelGeneration } from '@/lib/query/hooks'

interface VideoPanelCardProps {
  panel: VideoPanel
  panelIndex: number
  defaultVideoModel: string
  videoRatio?: string  // 视频比例：'16:9' 或 '9:16'
  userVideoModels?: VideoModelOption[]  // 用户配置的视频模型列表
  projectId: string
  episodeId?: string
  // 口型同步相关
  matchedVoiceLines?: MatchedVoiceLine[]
  onLipSync?: (storyboardId: string, panelIndex: number, voiceLineId: string) => Promise<void>
  // 视频类型切换（原始 vs 口型同步）
  showLipSyncVideo: boolean
  onToggleLipSyncVideo: (panelKey: string, value: boolean) => void
  // 首尾帧相关
  isLinked: boolean
  isLastFrame: boolean
  nextPanel: VideoPanel | null
  prevPanel: VideoPanel | null
  hasNext: boolean
  flModel: string
  flGenerateAudio: boolean
  flCustomPrompt: string
  defaultFlPrompt: string
  // 本地提示词管理（由父组件维护）
  localPrompt: string
  isSavingPrompt: boolean
  onUpdateLocalPrompt: (value: string) => void
  onSavePrompt: (value: string) => Promise<void>  // 直接传值，避免异步状态问题
  // 回调
  onGenerateVideo: (storyboardId: string, panelIndex: number, videoModel?: string, firstLastFrame?: any, generateAudio?: boolean) => void
  onUpdatePanelVideoModel: (storyboardId: string, panelIndex: number, model: string) => void
  onToggleLink: (panelKey: string, storyboardId: string, panelIndex: number) => void
  onFlModelChange: (model: string) => void
  onFlGenerateAudioChange: (value: boolean) => void
  onFlCustomPromptChange: (panelKey: string, value: string) => void
  onResetFlPrompt: (panelKey: string) => void
  onGenerateFirstLastFrame: (firstStoryboardId: string, firstPanelIndex: number, lastStoryboardId: string, lastPanelIndex: number, panelKey: string) => void
}

export default function VideoPanelCard({
  panel,
  panelIndex,
  defaultVideoModel,
  videoRatio = '16:9',
  userVideoModels,
  projectId,
  episodeId,
  matchedVoiceLines = [],
  onLipSync,
  showLipSyncVideo,
  onToggleLipSyncVideo,
  isLinked,
  isLastFrame,
  nextPanel,
  prevPanel,
  hasNext,
  flModel,
  flGenerateAudio,
  flCustomPrompt,
  defaultFlPrompt,
  // 本地提示词管理
  localPrompt,
  isSavingPrompt,
  onUpdateLocalPrompt,
  onSavePrompt,
  // 其他回调
  onGenerateVideo,
  onUpdatePanelVideoModel,
  onToggleLink,
  onFlModelChange,
  onFlGenerateAudioChange,
  onFlCustomPromptChange,
  onResetFlPrompt,
  onGenerateFirstLastFrame
}: VideoPanelCardProps) {
  const t = useTranslations('video')
  const te = useTranslations('errors')  // 🔥 错误翻译
  const { cancelGeneration, isCancelling } = useCancelGeneration(projectId, episodeId)
  const panelKey = `${panel.storyboardId}-${panel.panelIndex}`
  const idx = panelIndex

  // 本地状态管理选中的视频模型
  const [selectedModel, setSelectedModel] = useState(panel.videoModel || defaultVideoModel)
  // 普通视频生成音频开关
  const [generateAudio, setGenerateAudio] = useState(true)
  // 是否正在播放视频
  const [isPlaying, setIsPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  // 视频版本切换由父组件控制: showLipSyncVideo, onToggleLipSyncVideo

  // 编辑模式状态
  const [isEditing, setIsEditing] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState(localPrompt)

  // 口型同步状态
  const [showLipSyncPanel, setShowLipSyncPanel] = useState(false)
  const [executingLipSync, setExecutingLipSync] = useState(false)
  const [lipSyncError, setLipSyncError] = useState<string | null>(null)

  // 生成音频状态
  const [generatingAudioIds, setGeneratingAudioIds] = useState<Set<string>>(new Set())
  const [audioGenerateError, setAudioGenerateError] = useState<string | null>(null)
  // 本地更新的配音列表（生成音频后立即显示）
  const [localVoiceLines, setLocalVoiceLines] = useState<MatchedVoiceLine[]>(matchedVoiceLines)

  // 同步外部传入的配音列表
  useEffect(() => {
    setLocalVoiceLines(matchedVoiceLines)
  }, [matchedVoiceLines])

  // 配音播放状态
  const [playingVoiceLineId, setPlayingVoiceLineId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // 点击编辑按钮
  const handleStartEdit = useCallback(() => {
    setEditingPrompt(localPrompt)
    setIsEditing(true)
  }, [localPrompt])

  // 点击保存按钮
  const handleSave = useCallback(async () => {
    // 先更新本地状态（立即显示）
    onUpdateLocalPrompt(editingPrompt)
    setIsEditing(false)
    // 直接传递要保存的值到数据库（避免异步状态读取问题）
    await onSavePrompt(editingPrompt)
  }, [editingPrompt, onUpdateLocalPrompt, onSavePrompt])

  // 取消编辑
  const handleCancelEdit = useCallback(() => {
    setEditingPrompt(localPrompt)
    setIsEditing(false)
  }, [localPrompt])

  // 检查当前选中的模型是否支持音频生成
  const supportsAudio = AUDIO_SUPPORTED_MODELS.includes(selectedModel)

  // 使用用户配置的模型列表，如果没有则回退到写死的 VIDEO_MODELS
  const videoModelOptions = userVideoModels && userVideoModels.length > 0 ? userVideoModels : VIDEO_MODELS

  // 根据视频比例设置 aspect ratio（支持任意比例）
  const cssAspectRatio = videoRatio.replace(':', '/')

  // 处理播放点击
  const handlePlayClick = async () => {
    setIsPlaying(true)
    // 等待视频元素渲染后播放
    setTimeout(async () => {
      if (videoRef.current) {
        try {
          await videoRef.current.play()
        } catch (err: any) {
          // 忽略 AbortError - 这是用户快速切换时的正常行为
          if (err.name !== 'AbortError') {
            console.error('Video play error:', err)
          }
        }
      }
    }, 100)
  }

  // 开始口型同步流程
  const handleStartLipSync = () => {
    if (!panel.videoUrl || matchedVoiceLines.length === 0) return

    // 如果只有一个配音，直接执行
    if (matchedVoiceLines.length === 1) {
      executeLipSync(matchedVoiceLines[0])
    } else {
      // 多个配音，显示选择面板
      setShowLipSyncPanel(true)
      setLipSyncError(null)
    }
  }

  // 执行口型同步
  const executeLipSync = async (voiceLine: MatchedVoiceLine) => {
    if (!onLipSync) return

    setLipSyncError(null)
    setExecutingLipSync(true)

    try {
      await onLipSync(
        panel.storyboardId,
        panel.panelIndex,
        voiceLine.id
      )
      // 成功后关闭面板
      setShowLipSyncPanel(false)
    } catch (error: any) {
      setLipSyncError(error.message)
    } finally {
      setExecutingLipSync(false)
    }
  }

  // 播放/停止配音
  const handlePlayVoiceLine = useCallback((voiceLine: MatchedVoiceLine) => {
    if (!voiceLine.audioUrl) return

    // 如果正在播放同一个，停止
    if (playingVoiceLineId === voiceLine.id) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      setPlayingVoiceLineId(null)
      return
    }

    // 停止之前的播放
    if (audioRef.current) {
      audioRef.current.pause()
    }

    // 播放新的
    const audio = new Audio(voiceLine.audioUrl)
    audioRef.current = audio
    setPlayingVoiceLineId(voiceLine.id)

    audio.onended = () => {
      setPlayingVoiceLineId(null)
      audioRef.current = null
    }

    audio.onerror = () => {
      setPlayingVoiceLineId(null)
      audioRef.current = null
    }

    audio.play().catch(() => {
      setPlayingVoiceLineId(null)
      audioRef.current = null
    })
  }, [playingVoiceLineId])

  // 生成单条配音音频
  const handleGenerateAudio = useCallback(async (voiceLine: MatchedVoiceLine) => {
    if (!episodeId) return

    setGeneratingAudioIds(prev => new Set(prev).add(voiceLine.id))
    setAudioGenerateError(null)

    try {
      const response = await fetch(`/api/novel-promotion/${projectId}/voice-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          episodeId,
          lineId: voiceLine.id
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || data.details || t("panelCard.error.audioFailed"))
      }

      // 更新本地配音列表，添加生成的音频URL
      if (data.results?.[0]?.audioUrl) {
        setLocalVoiceLines(prev => prev.map(vl =>
          vl.id === voiceLine.id
            ? { ...vl, audioUrl: data.results[0].audioUrl }
            : vl
        ))
      }
    } catch (error: any) {
      console.error('Generate audio error:', error)
      setAudioGenerateError(error.message)
    } finally {
      setGeneratingAudioIds(prev => {
        const next = new Set(prev)
        next.delete(voiceLine.id)
        return next
      })
    }
  }, [projectId, episodeId])

  // 是否有匹配的配音（不管有没有音频）
  const hasMatchedVoiceLines = localVoiceLines.length > 0
  // 是否有可用的配音（已生成音频）
  const hasMatchedAudio = localVoiceLines.some(vl => vl.audioUrl)
  // 是否可以进行口型同步（需要有视频、有已生成音频的配音、且未在生成中）
  const canLipSync = panel.videoUrl && hasMatchedAudio && !panel.generatingLipSync
  // 是否显示口型同步区域（只要有匹配的配音就显示，不需要视频已生成）
  const showLipSyncSection = hasMatchedVoiceLines

  // 当前应该播放的视频URL（根据切换状态）
  const currentVideoUrl = showLipSyncVideo && panel.lipSyncVideoUrl
    ? panel.lipSyncVideoUrl
    : panel.videoUrl

  return (
    <div className="bg-white/80 backdrop-blur-lg rounded-2xl border border-white/60 shadow-lg shadow-slate-200/40 overflow-hidden">
      {/* 视频/图片预览区 */}
      <div className="bg-slate-100 flex items-center justify-center relative" style={{ aspectRatio: cssAspectRatio }}>
        {panel.videoUrl && isPlaying ? (
          // 播放状态：显示视频播放器
          <video
            ref={videoRef}
            key={`video-${panel.storyboardId}-${panel.panelIndex}-${currentVideoUrl}`}
            src={currentVideoUrl}
            controls
            playsInline
            className="w-full h-full object-contain bg-black"
            onError={(e) => console.error('Video load error:', currentVideoUrl, e)}
            onEnded={() => setIsPlaying(false)}
          />
        ) : panel.videoUrl ? (
          // 有视频但未播放：显示预览图 + 播放按钮
          <div className="relative w-full h-full cursor-pointer group" onClick={handlePlayClick}>
            {/* 使用图片作为预览 */}
            <img
              src={panel.imageUrl || ''}
              alt={t('panelCard.shot', { number: idx + 1 })}
              className="w-full h-full object-contain bg-gray-900"
            />
            {/* 播放按钮遮罩 */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
              <div className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8 text-purple-600 ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </div>
        ) : panel.imageUrl ? (
          <img src={panel.imageUrl} alt={t('panelCard.shot', { number: idx + 1 })} className="w-full h-full object-contain bg-gray-200" />
        ) : (
          <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
        {/* 镜头编号 */}
        <div className="absolute top-2 left-2 bg-black/60 text-white px-2 py-0.5 rounded text-xs font-medium">
          {idx + 1}
        </div>
        {/* 状态标签 / 视频切换滑块 */}
        {panel.lipSyncVideoUrl && panel.videoUrl ? (
          // 有口型同步视频时，显示滑块切换器
          <div
            className="absolute top-2 right-2 flex items-center bg-black/60 rounded-full p-0.5 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation()
              onToggleLipSyncVideo(panelKey, !showLipSyncVideo)
              setIsPlaying(false)  // 切换时停止播放
            }}
          >
            {/* 左侧：原始视频 */}
            <div className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${!showLipSyncVideo
              ? 'bg-green-500 text-white'
              : 'text-gray-300 hover:text-white'
              }`}>
              {t("panelCard.original")}
            </div>
            {/* 右侧：唇形同步 */}
            <div className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${showLipSyncVideo
              ? 'bg-pink-500 text-white'
              : 'text-gray-300 hover:text-white'
              }`}>
              {t("panelCard.synced")}
            </div>
          </div>
        ) : panel.lipSyncVideoUrl ? (
          <div className="absolute top-2 right-2 bg-pink-500 text-white px-2 py-1 rounded text-xs font-medium">
            {t('panelCard.lipSyncLabel')}
          </div>
        ) : panel.videoUrl ? (
          <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded text-xs font-medium">
            {t("panelCard.videoFixed")}
          </div>
        ) : panel.imageUrl ? (
          <div className="absolute top-2 right-2 bg-blue-500 text-white px-2 py-1 rounded text-xs font-medium">
            {t("panelCard.imagePreview")}
          </div>
        ) : null}
        {/* 时长 */}
        {panel.textPanel?.duration && (
          <div className="absolute bottom-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs">
            {panel.textPanel.duration}s
          </div>
        )}
        {/* 重新生成按钮 */}
        {(panel.videoUrl || panel.generatingVideo) && (
          <button
            onClick={() => onGenerateVideo(panel.storyboardId, panel.panelIndex, selectedModel, undefined, supportsAudio ? generateAudio : undefined)}
            className="absolute bottom-2 right-2 bg-black/70 hover:bg-black/90 text-white p-2 rounded-full transition-all z-20"
            title={panel.generatingVideo ? t("panelCard.forceRegenerate") : t("panelCard.regenerateVideo")}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        )}
        {/* 生成中遮罩 */}
        {(panel.generatingVideo || panel.generatingLipSync) && (
          <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center z-10">
            <svg className="animate-spin h-8 w-8 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-white text-xs mt-2">
              {panel.generatingLipSync ? t("panelCard.lipSyncStatus") : t("panelCard.generating")}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (!panel.panelId) return
                if (panel.generatingLipSync) {
                  cancelGeneration({ type: 'panel_lip_sync', targetId: panel.panelId })
                } else {
                  cancelGeneration({ type: 'panel_video', targetId: panel.panelId })
                }
              }}
              disabled={isCancelling || !panel.panelId}
              className="mt-2 px-3 py-1 text-xs bg-red-500/80 hover:bg-red-500 text-white rounded-lg transition-colors"
            >
              {isCancelling ? '取消中...' : '取消'}
            </button>
          </div>
        )}
        {/* 失败状态 - 视频生成或口型同步失败 */}
        {(panel.videoErrorMessage || panel.lipSyncErrorMessage) && !panel.generatingVideo && !panel.generatingLipSync && (
          <div className="absolute inset-0 bg-red-500/80 flex flex-col items-center justify-center z-10 p-4">
            <svg className="w-8 h-8 text-white mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-white text-xs text-center break-all">
              {/* 🔥 翻译错误码 */}
              {te((panel.videoErrorMessage || panel.lipSyncErrorMessage) as any)}
            </span>
          </div>
        )}
      </div>

      {/* 镜头信息区 */}
      <div className="p-4 space-y-2">
        {/* 景别、镜头运动、时长 */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1">
            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded font-medium">
              {panel.textPanel?.shot_type || t('panelCard.unknownShotType')}
            </span>
            {panel.textPanel?.camera_move && (
              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded font-medium">
                🎬{panel.textPanel.camera_move}
              </span>
            )}
          </div>
          {panel.textPanel?.duration && (
            <span className="text-gray-400">{panel.textPanel.duration}{t('promptModal.duration')}</span>
          )}
        </div>

        {/* 场景 */}
        {panel.textPanel?.location && (
          <div className="flex items-center gap-1 text-xs text-gray-600">
            <span className="text-blue-500">📍</span>
            <span>{panel.textPanel.location}</span>
          </div>
        )}

        {/* 出场角色 */}
        {panel.textPanel?.characters && panel.textPanel.characters.length > 0 && (
          <div className="flex items-center gap-1 text-xs">
            <span className="text-gray-500">👤</span>
            <div className="flex flex-wrap gap-1">
              {panel.textPanel.characters.map((char: any, cidx: number) => {
                // 兼容新格式（对象）和旧格式（字符串）
                const charName = typeof char === 'string' ? char : char.name
                const appearance = typeof char === 'object' && char.appearance ? ` (${char.appearance})` : ''
                return (
                  <span key={cidx} className="px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded">
                    {charName}{appearance}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* 对应原文 */}
        {panel.textPanel?.text_segment && (
          <div>
            <label className="block text-[10px] font-medium text-gray-400 mb-0.5">{t('panelCard.correspondingText')}</label>
            <p className="text-[10px] text-gray-600 bg-blue-50 border border-blue-100 px-1.5 py-1 rounded italic line-clamp-2">
              &ldquo;{panel.textPanel.text_segment}&rdquo;
            </p>
          </div>
        )}

        {/* 描述 */}
        <p className="text-sm text-gray-700 line-clamp-2">{panel.textPanel?.description}</p>

        {/* 视频提示词 - 点击编辑模式 */}
        <div className="mt-3 pt-3 border-t border-gray-200">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-500">{t("promptModal.promptLabel")}</span>
            {!isEditing && (
              <button
                onClick={handleStartEdit}
                className="text-gray-400 hover:text-purple-600 transition-colors p-0.5"
                title={t("panelCard.editPrompt")}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            )}
          </div>

          {isEditing ? (
            // 编辑模式
            <div className="relative mb-3">
              <textarea
                value={editingPrompt}
                onChange={(e) => setEditingPrompt(e.target.value)}
                autoFocus
                className="w-full text-xs p-2 pr-16 border border-purple-300 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
                rows={3}
                placeholder={t('promptModal.placeholder')}
              />
              {/* 保存和取消按钮 */}
              <div className="absolute right-1 top-1 flex flex-col gap-1">
                <button
                  onClick={handleSave}
                  disabled={isSavingPrompt}
                  className="px-2 py-1 text-[10px] bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50 transition-colors"
                >
                  {isSavingPrompt ? '...' : t("panelCard.save")}
                </button>
                <button
                  onClick={handleCancelEdit}
                  disabled={isSavingPrompt}
                  className="px-2 py-1 text-[10px] bg-gray-200 text-gray-600 rounded hover:bg-gray-300 disabled:opacity-50 transition-colors"
                >
                  {t("panelCard.cancel")}
                </button>
              </div>
            </div>
          ) : (
            // 显示模式 - 使用 localPrompt（由父组件维护，保存后立即更新）
            <div
              onClick={handleStartEdit}
              className="text-xs p-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-600 cursor-pointer hover:bg-gray-100 hover:border-gray-300 transition-colors min-h-[40px] mb-3"
            >
              {localPrompt || <span className="text-gray-400 italic">{t("panelCard.clickToEditPrompt")}</span>}
            </div>
          )}

          {/* 首尾帧链接UI */}
          {isLastFrame && prevPanel && (
            <div className="mb-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-center gap-2 text-xs text-amber-700">
                <span>🔗</span>
                <span>{t('firstLastFrame.asLastFrameFor', { number: idx })}</span>
                <button
                  onClick={() => onToggleLink(`${prevPanel.storyboardId}-${prevPanel.panelIndex}`, prevPanel.storyboardId, prevPanel.panelIndex)}
                  className="ml-auto text-amber-600 hover:text-amber-800 underline"
                >
                  {t('firstLastFrame.unlinkAction')}
                </button>
              </div>
            </div>
          )}

          {isLinked && nextPanel && (
            <FirstLastFramePanel
              panel={panel}
              nextPanel={nextPanel}
              panelIndex={idx}
              panelKey={panelKey}
              flModel={flModel}
              flGenerateAudio={flGenerateAudio}
              customPrompt={flCustomPrompt}
              defaultPrompt={defaultFlPrompt}
              videoRatio={videoRatio}
              onFlModelChange={onFlModelChange}
              onFlGenerateAudioChange={onFlGenerateAudioChange}
              onCustomPromptChange={onFlCustomPromptChange}
              onResetPrompt={onResetFlPrompt}
              onToggleLink={onToggleLink}
              onGenerate={onGenerateFirstLastFrame}
            />
          )}

          {!isLastFrame && !isLinked && (
            <>
              {hasNext && (
                <div className="mb-2">
                  <button
                    onClick={() => onToggleLink(panelKey, panel.storyboardId, panel.panelIndex)}
                    className="w-full py-1.5 text-xs border border-dashed border-purple-300 text-purple-600 rounded-lg hover:bg-purple-50 transition-colors flex items-center justify-center gap-1"
                  >
                    <span>🔌</span>
                    <span>{t("firstLastFrame.linkToNext")}</span>
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onGenerateVideo(panel.storyboardId, panel.panelIndex, selectedModel, undefined, supportsAudio ? generateAudio : undefined)}
                  disabled={panel.generatingVideo || !panel.imageUrl}
                  className={`flex-shrink-0 min-w-[90px] py-2 px-3 text-sm font-medium rounded-lg shadow-sm transition-all disabled:opacity-50 ${panel.videoUrl
                    ? 'bg-green-500 text-white'
                    : panel.generatingVideo
                      ? 'bg-gray-400 text-white'
                      : 'bg-blue-500 text-white hover:bg-blue-600'
                    }`}
                >
                  {panel.videoUrl ? t("stage.hasSynced") : panel.generatingVideo ? t("panelCard.generating") : t('panelCard.generateVideo')}
                </button>
                <select
                  value={selectedModel}
                  onChange={(e) => {
                    setSelectedModel(e.target.value)
                    onUpdatePanelVideoModel(panel.storyboardId, panel.panelIndex, e.target.value)
                  }}
                  className="flex-1 min-w-0 text-xs px-2 py-2 border border-gray-300 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-purple-500 truncate"
                  title={t('panelCard.selectModel')}
                >
                  {videoModelOptions.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                {/* 音频开关 - 仅 Seedance 1.5 Pro 支持 */}
                {supportsAudio && (
                  <button
                    onClick={() => setGenerateAudio(!generateAudio)}
                    className={`flex-shrink-0 p-2 rounded-lg border transition-colors ${generateAudio
                      ? 'bg-purple-100 border-purple-300 text-purple-700'
                      : 'bg-gray-100 border-gray-300 text-gray-400'
                      }`}
                    title={generateAudio ? t("panelCard.audioEnabled") : t("panelCard.audioDisabled")}
                  >
                    {generateAudio ? '🔊' : '🔇'}
                  </button>
                )}
              </div>

              {/* 口型同步区域 - 有匹配的配音时显示 */}
              {showLipSyncSection && (
                <div className="mt-2">
                  {/* 口型同步按钮 */}
                  <div className="flex gap-2">
                    <button
                      onClick={canLipSync ? handleStartLipSync : undefined}
                      disabled={!canLipSync || panel.generatingLipSync || executingLipSync}
                      className={`flex-1 py-1.5 text-xs rounded-lg transition-all flex items-center justify-center gap-1 ${canLipSync
                        ? 'bg-pink-500 text-white hover:bg-pink-600 active:scale-95 active:bg-pink-700 disabled:opacity-50'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                    >
                      {panel.generatingLipSync || executingLipSync ? (
                        <>
                          <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>{t("panelCard.lipSyncStatus")}</span>
                        </>
                      ) : canLipSync ? (
                        <>
                          <span>👄</span>
                          <span>{t("panelCard.lipSync")}</span>
                          {panel.lipSyncVideoUrl && <span className="text-pink-200">{t('panelCard.isSynced')}</span>}
                        </>
                      ) : !panel.videoUrl ? (
                        <>
                          <span>👄</span>
                          <span>{t("panelCard.lipSync")}</span>
                          <span className="text-gray-400 text-[10px]">{t('panelCard.needVideo')}</span>
                        </>
                      ) : (
                        <>
                          <span>👄</span>
                          <span>{t("panelCard.lipSync")}</span>
                          <span className="text-gray-400 text-[10px]">{t('panelCard.needAudio')}</span>
                        </>
                      )}
                    </button>

                    {/* 重新生成按钮 - 生成中或已有同步视频时显示 */}
                    {(panel.generatingLipSync || panel.lipSyncVideoUrl) && hasMatchedAudio && (
                      <button
                        onClick={handleStartLipSync}
                        disabled={executingLipSync}
                        className="flex-shrink-0 px-3 py-1.5 text-xs rounded-lg bg-orange-500 text-white hover:bg-orange-600 active:scale-95 active:bg-orange-700 disabled:opacity-50 transition-all flex items-center gap-1 shadow-sm"
                        title={panel.generatingLipSync ? t("panelCard.forceRegenerate") : t("panelCard.regenerateLipSync")}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <span>{t('panelCard.redo')}</span>
                      </button>
                    )}
                  </div>

                  {/* 音频生成错误提示 */}
                  {audioGenerateError && (
                    <div className="mt-1 p-1.5 bg-red-50 border border-red-200 rounded text-[10px] text-red-600">
                      {audioGenerateError}
                    </div>
                  )}

                  {/* 匹配的配音信息 */}
                  {localVoiceLines.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {localVoiceLines.map(vl => (
                        <div key={vl.id} className="flex items-start gap-1.5 p-1.5 bg-gray-50 rounded text-[10px]">
                          {/* 播放按钮 或 生成按钮 */}
                          {vl.audioUrl ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handlePlayVoiceLine(vl)
                              }}
                              className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-colors ${playingVoiceLineId === vl.id
                                ? 'bg-pink-500 text-white'
                                : 'bg-gray-200 text-gray-600 hover:bg-pink-100'
                                }`}
                              title={playingVoiceLineId === vl.id ? t("panelCard.stopVoice") : t("panelCard.play")}
                            >
                              {playingVoiceLineId === vl.id ? '⏹' : '▶'}
                            </button>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleGenerateAudio(vl)
                              }}
                              disabled={generatingAudioIds.has(vl.id)}
                              className="flex-shrink-0 px-1.5 py-0.5 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 transition-colors flex items-center gap-0.5"
                              title={t("panelCard.generateAudio")}
                            >
                              {generatingAudioIds.has(vl.id) ? (
                                <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                              ) : (
                                <span>🎤</span>
                              )}
                              <span>{generatingAudioIds.has(vl.id) ? t('panelCard.generatingAudio') : t("common.generate")}</span>
                            </button>
                          )}
                          {/* 配音内容 */}
                          <div className="flex-1 min-w-0">
                            <span className="text-gray-400">{vl.speaker}: </span>
                            <span className="text-gray-600">"{vl.content}"</span>
                            {/* 显示音频时长，如果小于2秒说明将自动填充 */}
                            {vl.audioUrl && vl.audioDuration && (
                              <span className={`ml-1 ${vl.audioDuration < 2000 ? 'text-orange-500' : 'text-gray-400'}`}>
                                ({(vl.audioDuration / 1000).toFixed(1)}s)
                                {vl.audioDuration < 2000 && <span title={t('panelCard.autoPadding')}> {t('panelCard.autoPadding')}</span>}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 口型同步面板 - 选择配音弹窗 */}
      {showLipSyncPanel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => !executingLipSync && setShowLipSyncPanel(false)}>
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">{t('panelCard.lipSyncTitle')}</h3>
              {!executingLipSync && (
                <button
                  onClick={() => setShowLipSyncPanel(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* 错误信息 */}
            {lipSyncError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {lipSyncError}
              </div>
            )}

            {/* 执行中 */}
            {executingLipSync && (
              <div className="flex flex-col items-center py-8">
                <svg className="animate-spin h-10 w-10 text-pink-500 mb-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-gray-600">{t('panelCard.lipSyncInProgress')}</p>
                <p className="text-xs text-gray-400 mt-2">{t('panelCard.lipSyncMayTakeMinutes')}</p>
              </div>
            )}

            {/* 选择配音 */}
            {!executingLipSync && (
              <div>
                <p className="text-sm text-gray-600 mb-3">{t('panelCard.selectVoice')}</p>
                <div className="space-y-2">
                  {matchedVoiceLines
                    .filter(vl => vl.audioUrl)
                    .map(vl => (
                      <button
                        key={vl.id}
                        onClick={() => executeLipSync(vl)}
                        className="w-full text-left p-3 border border-gray-200 rounded-lg hover:border-pink-300 hover:bg-pink-50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">{vl.speaker}</span>
                          {vl.audioDuration && (
                            <span className={`text-xs ${vl.audioDuration < 2000 ? 'text-orange-500' : 'text-gray-400'}`}>
                              {(vl.audioDuration / 1000).toFixed(1)}s
                              {vl.audioDuration < 2000 && ` ${t('panelCard.willAutoPad')}`}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-800">&ldquo;{vl.content}&rdquo;</div>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
