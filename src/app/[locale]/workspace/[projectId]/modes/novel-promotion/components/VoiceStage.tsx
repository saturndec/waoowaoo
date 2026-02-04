'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { shouldShowError } from '@/lib/error-utils'
import { useProjectAssets } from '@/lib/query/hooks/useProjectAssets'
import VoiceDesignDialog from './voice/VoiceDesignDialog'
import VoiceToolbar from './voice/VoiceToolbar'
import EmbeddedVoiceToolbar from './voice/EmbeddedVoiceToolbar'
import SpeakerVoiceStatus from './voice/SpeakerVoiceStatus'
import VoiceLineCard from './voice/VoiceLineCard'
import EmptyVoiceState from './voice/EmptyVoiceState'

interface VoiceLine {
  id: string
  lineIndex: number
  speaker: string
  content: string
  emotionPrompt: string | null
  emotionStrength: number | null
  audioUrl: string | null
  generating: boolean
}

interface Character {
  id: string
  name: string
  customVoiceUrl?: string | null
}

// 🔥 V6.5 重构：删除 characters prop，内部直接订阅
interface VoiceStageProps {
  projectId: string
  episodeId: string
  // 🔥 V6.5 删除：characters prop - 现在内部直接订阅
  onBack?: () => void
  embedded?: boolean
  onVoiceLineClick?: (storyboardId: string, panelIndex: number) => void
}

export default function VoiceStage({
  projectId,
  episodeId,
  // 🔥 V6.5 删除：characters prop
  onBack,
  embedded = false,
  onVoiceLineClick
}: VoiceStageProps) {
  const t = useTranslations('voice')

  // 🔥 V6.5 重构：直接订阅缓存，消除 props drilling
  const { data: assets } = useProjectAssets(projectId)
  // 🔧 使用 useMemo 稳定引用，防止 useCallback 依赖问题
  const characters: Character[] = useMemo(() => assets?.characters ?? [], [assets?.characters])

  // 状态
  const [voiceLines, setVoiceLines] = useState<VoiceLine[]>([])
  const [speakerStats, setSpeakerStats] = useState<Record<string, number>>({})
  const [speakerCharacterMap, setSpeakerCharacterMap] = useState<Record<string, Character>>({})
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [generatingAll, setGeneratingAll] = useState(false)
  const [generatingLines, setGeneratingLines] = useState<Set<string>>(new Set())
  const [isDownloading, setIsDownloading] = useState(false)

  // 编辑状态
  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState<string>('')
  const [editingSpeaker, setEditingSpeaker] = useState<string>('')

  // 音频和文件
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // 发言人音色相关状态
  const [generatingAzureVoice, setGeneratingAzureVoice] = useState<string | null>(null)
  const [uploadingVoice, setUploadingVoice] = useState<string | null>(null)
  const [pendingUploadSpeaker, setPendingUploadSpeaker] = useState<string | null>(null)
  const [showVoiceDropdown, setShowVoiceDropdown] = useState<string | null>(null)
  const [voiceDesignSpeaker, setVoiceDesignSpeaker] = useState<string | null>(null)
  const [savingVoiceDesign, setSavingVoiceDesign] = useState(false)
  const [speakerVoices, setSpeakerVoices] = useState<Record<string, { voiceType: string; voiceId?: string; audioUrl: string }>>({})

  // 获取发言人的音色URL
  const getSpeakerVoiceUrl = useCallback((speaker: string): string | null => {
    const char = speakerCharacterMap[speaker]
    if (char?.customVoiceUrl) return char.customVoiceUrl
    const speakerVoice = speakerVoices[speaker]
    if (speakerVoice?.audioUrl) return speakerVoice.audioUrl
    return null
  }, [speakerCharacterMap, speakerVoices])

  // 根据发言人名字匹配角色
  const matchCharacterBySpeaker = useCallback((speaker: string): Character | undefined => {
    const exactMatch = characters.find(c => c.name === speaker)
    if (exactMatch) return exactMatch
    return characters.find(c => c.name.includes(speaker) || speaker.includes(c.name))
  }, [characters])

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [linesRes, voicesRes] = await Promise.all([
        fetch(`/api/novel-promotion/${projectId}/voice-lines?episodeId=${episodeId}`),
        fetch(`/api/novel-promotion/${projectId}/speaker-voice?episodeId=${episodeId}`)
      ])

      if (linesRes.ok) {
        const data = await linesRes.json()
        setVoiceLines(data.voiceLines || [])
        setSpeakerStats(data.speakerStats || {})

        const charMap: Record<string, Character> = {}
        const speakerSet = new Set<string>((data.voiceLines || []).map((l: VoiceLine) => l.speaker))
        speakerSet.forEach(speaker => {
          const char = matchCharacterBySpeaker(speaker)
          if (char) charMap[speaker] = char
        })
        setSpeakerCharacterMap(charMap)
      }

      if (voicesRes.ok) {
        const voicesData = await voicesRes.json()
        setSpeakerVoices(voicesData.speakerVoices || {})
      }
    } catch (error) {
      console.error('Load data error:', error)
    } finally {
      setLoading(false)
    }
  }, [projectId, episodeId, matchCharacterBySpeaker])

  useEffect(() => {
    loadData()
    return () => {
      if (audioRef.current) audioRef.current.pause()
    }
  }, [loadData])

  // 分析台词
  const handleAnalyze = async () => {
    setAnalyzing(true)
    try {
      const res = await fetch(`/api/novel-promotion/${projectId}/voice-analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episodeId })
      })

      if (!res.ok) {
        const error = await res.json()
        if (res.status === 402) {
          alert(`${t("alerts.insufficientBalance")}\n\n${error.error || t("alerts.insufficientBalanceMsg")}`)
          throw new Error('INSUFFICIENT_BALANCE')
        }
        throw new Error(error.details || error.error || t("errors.analyzeFailed"))
      }

      await loadData()
    } catch (error: any) {
      if (shouldShowError(error)) {
        alert(`${t("errors.analyzeFailed")}: ${error.message}`)
      }
    } finally {
      setAnalyzing(false)
    }
  }

  // 生成单条配音
  const handleGenerateLine = async (lineId: string) => {
    setGeneratingLines(prev => new Set(prev).add(lineId))

    try {
      const res = await fetch(`/api/novel-promotion/${projectId}/voice-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episodeId, lineId })
      })

      if (!res.ok) {
        const error = await res.json()
        if (res.status === 402) {
          alert(`${t("alerts.insufficientBalance")}\n\n${error.error || t("alerts.insufficientBalanceMsg")}`)
          throw new Error('INSUFFICIENT_BALANCE')
        }
        throw new Error(error.error || error.details || t("errors.generateFailed"))
      }

      const data = await res.json()

      if (data.results?.[0]?.success) {
        setVoiceLines(prev => prev.map(line =>
          line.id === lineId
            ? { ...line, audioUrl: data.results[0].audioUrl, generating: false }
            : line
        ))
      } else if (data.results?.[0]?.error) {
        throw new Error(data.results[0].error)
      }
    } catch (error: any) {
      if (shouldShowError(error)) {
        alert(`${t("errors.generateFailed")}: ${error.message}`)
      }
    } finally {
      setGeneratingLines(prev => {
        const next = new Set(prev)
        next.delete(lineId)
        return next
      })
    }
  }

  // 批量生成所有配音
  const handleGenerateAll = async () => {
    const linesToGenerate = voiceLines.filter(line => {
      if (line.audioUrl) return false
      const char = speakerCharacterMap[line.speaker]
      return char?.customVoiceUrl || speakerVoices[line.speaker]?.audioUrl
    })

    if (linesToGenerate.length === 0) {
      alert(t("alerts.noLinesToGenerate"))
      return
    }

    setGeneratingAll(true)
    const lineIds = new Set(linesToGenerate.map(l => l.id))
    setGeneratingLines(lineIds)

    try {
      const BATCH_SIZE = 5
      let successCount = 0
      let failCount = 0

      for (let i = 0; i < linesToGenerate.length; i += BATCH_SIZE) {
        const batch = linesToGenerate.slice(i, i + BATCH_SIZE)

        const results = await Promise.allSettled(
          batch.map(async (line) => {
            const res = await fetch(`/api/novel-promotion/${projectId}/voice-generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ episodeId, lineId: line.id })
            })

            if (!res.ok) {
              const error = await res.json()
              if (res.status === 402) {
                alert(`${t("alerts.insufficientBalance")}\n\n${error.error || t("alerts.insufficientBalanceMsg")}`)
                throw new Error('INSUFFICIENT_BALANCE')
              }
              throw new Error(t("errors.generateFailed"))
            }

            const data = await res.json()
            return { lineId: line.id, data }
          })
        )

        for (const result of results) {
          if (result.status === 'fulfilled' && result.value.data.results?.[0]?.success) {
            successCount++
            const { lineId, data } = result.value
            setVoiceLines(prev => prev.map(line =>
              line.id === lineId
                ? { ...line, audioUrl: data.results[0].audioUrl, generating: false }
                : line
            ))
            setGeneratingLines(prev => {
              const next = new Set(prev)
              next.delete(lineId)
              return next
            })
          } else {
            failCount++
            if (result.status === 'fulfilled') {
              setGeneratingLines(prev => {
                const next = new Set(prev)
                next.delete(result.value.lineId)
                return next
              })
            }
          }
        }
      }

      const msg = t("alerts.generateComplete", { success: successCount, total: linesToGenerate.length })
      alert(failCount > 0 ? `${msg}${t("alerts.generateFailed", { count: failCount })}` : msg)
    } catch (error: any) {
      if (shouldShowError(error)) {
        alert(`${t("errors.batchFailed")}: ${error.message}`)
      }
    } finally {
      setGeneratingAll(false)
      setGeneratingLines(new Set())
    }
  }

  // 批量下载所有配音
  const handleDownloadAll = async () => {
    if (linesWithAudio === 0) return

    setIsDownloading(true)
    try {
      const response = await fetch(`/api/novel-promotion/${projectId}/download-voices?episodeId=${episodeId}`)
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || t("errors.downloadFailed"))
      }
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `配音_${new Date().toISOString().slice(0, 10)}.zip`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error: any) {
      if (shouldShowError(error)) {
        alert(`${t("errors.downloadFailed")}: ${error.message}`)
      }
    } finally {
      setIsDownloading(false)
    }
  }

  // 播放音频
  const handlePlayAudio = (audioUrl: string) => {
    if (audioRef.current) audioRef.current.pause()
    const audio = new Audio(audioUrl)
    audioRef.current = audio
    audio.play()
  }

  // 下载单个配音
  const handleDownloadSingle = (audioUrl: string) => {
    window.open(audioUrl, '_blank')
  }

  // 开始编辑台词
  const handleStartEdit = (line: VoiceLine) => {
    setEditingLineId(line.id)
    setEditingContent(line.content)
    setEditingSpeaker(line.speaker)
  }

  // 取消编辑
  const handleCancelEdit = () => {
    setEditingLineId(null)
    setEditingContent('')
    setEditingSpeaker('')
  }

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!editingLineId) return

    const originalLine = voiceLines.find(l => l.id === editingLineId)
    if (!originalLine) return

    if (editingContent.trim() === originalLine.content && editingSpeaker.trim() === originalLine.speaker) {
      handleCancelEdit()
      return
    }

    try {
      const res = await fetch(`/api/novel-promotion/${projectId}/voice-lines`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lineId: editingLineId,
          content: editingContent.trim(),
          speaker: editingSpeaker.trim()
        })
      })

      if (!res.ok) throw new Error(t("errors.saveFailed"))

      setVoiceLines(prev => prev.map(line =>
        line.id === editingLineId
          ? { ...line, content: editingContent.trim(), speaker: editingSpeaker.trim() }
          : line
      ))

      if (editingSpeaker.trim() !== originalLine.speaker) {
        setSpeakerStats(prev => {
          const newStats = { ...prev }
          if (newStats[originalLine.speaker] > 1) {
            newStats[originalLine.speaker]--
          } else {
            delete newStats[originalLine.speaker]
          }
          newStats[editingSpeaker.trim()] = (newStats[editingSpeaker.trim()] || 0) + 1
          return newStats
        })
      }

      handleCancelEdit()
    } catch (error: any) {
      if (shouldShowError(error)) {
        alert(`${t("errors.saveFailed")}: ${error.message}`)
      }
    }
  }

  // 删除台词
  const handleDeleteLine = async (lineId: string) => {
    const line = voiceLines.find(l => l.id === lineId)
    if (!line) return

    const content = line.content.slice(0, 50) + (line.content.length > 50 ? '...' : '')
    const confirmed = window.confirm(t("confirm.deleteLine", { content }))
    if (!confirmed) return

    try {
      const res = await fetch(`/api/novel-promotion/${projectId}/voice-lines?lineId=${lineId}`, {
        method: 'DELETE'
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || t("errors.deleteFailed"))
      }

      setVoiceLines(prev => {
        const filtered = prev.filter(l => l.id !== lineId)
        return filtered.map((l, index) => ({ ...l, lineIndex: index + 1 }))
      })

      setSpeakerStats(prev => {
        const newStats = { ...prev }
        if (newStats[line.speaker] > 1) {
          newStats[line.speaker]--
        } else {
          delete newStats[line.speaker]
        }
        return newStats
      })
    } catch (error: any) {
      if (shouldShowError(error)) {
        alert(`${t("errors.deleteFailed")}: ${error.message}`)
      }
    }
  }

  // 删除配音
  const handleDeleteAudio = async (lineId: string) => {
    const line = voiceLines.find(l => l.id === lineId)
    if (!line || !line.audioUrl) return

    const content = line.content.slice(0, 50) + (line.content.length > 50 ? '...' : '')
    const confirmed = window.confirm(t("confirm.deleteAudio", { content }))
    if (!confirmed) return

    try {
      const res = await fetch(`/api/novel-promotion/${projectId}/voice-lines`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineId, audioUrl: null })
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || t("errors.deleteAudioFailed"))
      }

      setVoiceLines(prev => prev.map(l => l.id === lineId ? { ...l, audioUrl: null } : l))
    } catch (error: any) {
      if (shouldShowError(error)) {
        alert(`${t("errors.deleteAudioFailed")}: ${error.message}`)
      }
    }
  }

  // 保存情绪设置
  const handleSaveEmotionSettings = async (lineId: string, emotionPrompt: string | null, emotionStrength: number) => {
    try {
      const res = await fetch(`/api/novel-promotion/${projectId}/voice-lines`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineId, emotionPrompt, emotionStrength })
      })

      if (!res.ok) throw new Error(t("errors.emotionSaveFailed"))

      setVoiceLines(prev => prev.map(line =>
        line.id === lineId ? { ...line, emotionPrompt, emotionStrength } : line
      ))
    } catch (error: any) {
      if (shouldShowError(error)) {
        alert(`${t("errors.emotionSaveFailed")}: ${error.message}`)
      }
    }
  }

  // 选择微软语音
  const handleSelectAzureVoice = async (speaker: string, voiceId: string) => {
    setGeneratingAzureVoice(speaker)
    try {
      const res = await fetch(`/api/novel-promotion/${projectId}/speaker-voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episodeId, speaker, voiceId })
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || error.details || t("errors.voiceGenerateFailed"))
      }

      const data = await res.json()
      setSpeakerVoices(prev => ({ ...prev, [speaker]: data.speakerVoices[speaker] }))
      alert(t("alerts.speakerVoiceSet", { speaker }))
    } catch (error: any) {
      if (shouldShowError(error)) {
        alert(`${t("errors.voiceGenerateFailed")}: ${error.message}`)
      }
    } finally {
      setGeneratingAzureVoice(null)
    }
  }

  // 上传自定义音频
  const handleUploadVoice = async (speaker: string, file: File) => {
    setUploadingVoice(speaker)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('episodeId', episodeId)
      formData.append('speaker', speaker)

      const res = await fetch(`/api/novel-promotion/${projectId}/speaker-voice`, {
        method: 'PUT',
        body: formData
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || error.details || t("errors.uploadFailed"))
      }

      const data = await res.json()
      setSpeakerVoices(prev => ({ ...prev, [speaker]: data.speakerVoices[speaker] }))
      alert(t("alerts.speakerVoiceUploaded", { speaker }))
    } catch (error: any) {
      if (shouldShowError(error)) {
        alert(`${t("errors.uploadFailed")}: ${error.message}`)
      }
    } finally {
      setUploadingVoice(null)
    }
  }

  // 文件选择处理
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && pendingUploadSpeaker) {
      handleUploadVoice(pendingUploadSpeaker, file)
    }
    setPendingUploadSpeaker(null)
    if (e.target) e.target.value = ''
  }

  // 触发文件上传
  const triggerFileUpload = (speaker: string) => {
    setPendingUploadSpeaker(speaker)
    fileInputRef.current?.click()
  }

  // 处理 AI 声音设计保存
  const handleVoiceDesignSave = async (voiceId: string, audioBase64: string) => {
    if (!voiceDesignSpeaker) return

    setSavingVoiceDesign(true)
    try {
      const response = await fetch(`/api/novel-promotion/${projectId}/speaker-voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          episodeId,
          speaker: voiceDesignSpeaker,
          voiceDesign: { voiceId, audioBase64 }
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || t("errors.voiceDesignFailed"))
      }

      const data = await response.json()
      setSpeakerVoices(prev => ({ ...prev, [voiceDesignSpeaker]: data.speakerVoices[voiceDesignSpeaker] }))
      alert(t("alerts.voiceDesignSet", { speaker: voiceDesignSpeaker }))
    } catch (error: any) {
      if (shouldShowError(error)) {
        alert(`${t("errors.voiceDesignFailed")}: ${error.message}`)
      }
    } finally {
      setSavingVoiceDesign(false)
      setVoiceDesignSpeaker(null)
    }
  }

  // 统计
  const totalLines = voiceLines.length
  const linesWithVoice = voiceLines.filter(l => getSpeakerVoiceUrl(l.speaker)).length
  const linesWithAudio = voiceLines.filter(l => l.audioUrl).length
  const speakers = Object.keys(speakerStats)
  const allSpeakersHaveVoice = speakers.every(speaker => getSpeakerVoiceUrl(speaker))

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-500">{t("common.loading")}</div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-20">
      {/* 隐藏的文件输入框 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* 工具栏 */}
      {!embedded ? (
        <VoiceToolbar
          onBack={onBack}
          onAnalyze={handleAnalyze}
          onGenerateAll={handleGenerateAll}
          onDownloadAll={handleDownloadAll}
          analyzing={analyzing}
          generatingAll={generatingAll}
          generatingCount={generatingLines.size}
          isDownloading={isDownloading}
          allSpeakersHaveVoice={allSpeakersHaveVoice}
          totalLines={totalLines}
          linesWithVoice={linesWithVoice}
          linesWithAudio={linesWithAudio}
        />
      ) : speakers.length > 0 && (
        <EmbeddedVoiceToolbar
          totalLines={totalLines}
          linesWithAudio={linesWithAudio}
          analyzing={analyzing}
          isDownloading={isDownloading}
          generatingAll={generatingAll}
          generatingCount={generatingLines.size}
          allSpeakersHaveVoice={allSpeakersHaveVoice}
          onAnalyze={handleAnalyze}
          onDownloadAll={handleDownloadAll}
          onGenerateAll={handleGenerateAll}
        />
      )}

      {/* 发言人音色状态 */}
      {speakers.length > 0 && (
        <SpeakerVoiceStatus
          speakers={speakers}
          speakerStats={speakerStats}
          getSpeakerVoiceUrl={getSpeakerVoiceUrl}
          onPlayVoice={handlePlayAudio}
          onDesignVoice={setVoiceDesignSpeaker}
          onUploadVoice={triggerFileUpload}
          onSelectAzureVoice={handleSelectAzureVoice}
          uploadingVoice={uploadingVoice}
          generatingAzureVoice={generatingAzureVoice}
          showVoiceDropdown={showVoiceDropdown}
          setShowVoiceDropdown={setShowVoiceDropdown}
          embedded={embedded}
        />
      )}

      {/* 台词卡片列表 */}
      {voiceLines.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 px-2 pt-4">
          {voiceLines.map(line => (
            <VoiceLineCard
              key={line.id}
              projectId={projectId}
              episodeId={episodeId}
              line={line}
              isGenerating={generatingLines.has(line.id) || line.generating}
              hasVoice={!!getSpeakerVoiceUrl(line.speaker)}
              onPlay={handlePlayAudio}
              onDownload={handleDownloadSingle}
              onGenerate={handleGenerateLine}
              onEdit={handleStartEdit}
              onDelete={handleDeleteLine}
              onDeleteAudio={handleDeleteAudio}
              onSaveEmotionSettings={handleSaveEmotionSettings}
            />
          ))}
        </div>
      ) : (
        <EmptyVoiceState
          onAnalyze={handleAnalyze}
          analyzing={analyzing}
        />
      )}

      {/* AI 声音设计对话框 */}
      <VoiceDesignDialog
        isOpen={!!voiceDesignSpeaker}
        speaker={voiceDesignSpeaker || ''}
        hasExistingVoice={voiceDesignSpeaker ? !!getSpeakerVoiceUrl(voiceDesignSpeaker) : false}
        onClose={() => setVoiceDesignSpeaker(null)}
        onSave={handleVoiceDesignSave}
        projectId={projectId}
      />
    </div>
  )
}
