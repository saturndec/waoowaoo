'use client'
import { useTranslations } from 'next-intl'

import { FIRST_LAST_FRAME_MODELS, AUDIO_SUPPORTED_MODELS } from '@/lib/constants'
import { VideoPanel } from './types'

interface FirstLastFramePanelProps {
  panel: VideoPanel
  nextPanel: VideoPanel
  panelIndex: number
  panelKey: string
  flModel: string
  flGenerateAudio: boolean
  customPrompt: string
  defaultPrompt: string
  videoRatio?: string  // 视频比例，如 "16:9", "3:2" 等
  onFlModelChange: (model: string) => void
  onFlGenerateAudioChange: (value: boolean) => void
  onCustomPromptChange: (panelKey: string, value: string) => void
  onResetPrompt: (panelKey: string) => void
  onToggleLink: (panelKey: string, storyboardId: string, panelIndex: number) => void
  onGenerate: (firstStoryboardId: string, firstPanelIndex: number, lastStoryboardId: string, lastPanelIndex: number, panelKey: string) => void
}

export default function FirstLastFramePanel({
  panel,
  nextPanel,
  panelIndex,
  panelKey,
  flModel,
  flGenerateAudio,
  customPrompt,
  defaultPrompt,
  videoRatio = '16:9',
  onFlModelChange,
  onFlGenerateAudioChange,
  onCustomPromptChange,
  onResetPrompt,
  onToggleLink,
  onGenerate
}: FirstLastFramePanelProps) {
  const t = useTranslations('video')
  const currentPrompt = customPrompt || defaultPrompt
  const hasCustomPrompt = customPrompt !== ''
  
  // 检查当前选中的模型是否支持音频生成
  const supportsAudio = AUDIO_SUPPORTED_MODELS.includes(flModel)
  
  // 根据视频比例设置 aspect ratio（支持任意比例）
  const cssAspectRatio = videoRatio.replace(':', '/')

  return (
    <div className="mb-2 space-y-2">
      <div className="p-2 bg-purple-50 border border-purple-200 rounded-lg">
        <div className="flex items-center gap-2 text-xs text-purple-700 mb-2">
          <span>🔗 首尾帧模式</span>
          <span className="text-purple-500">镜头 {panelIndex + 1} → 镜头 {panelIndex + 2}</span>
          <button
            onClick={() => onToggleLink(panelKey, panel.storyboardId, panel.panelIndex)}
            className="ml-auto text-purple-600 hover:text-purple-800 underline"
          >
            取消链接
          </button>
        </div>
        <div className="flex gap-2 items-center">
          <div className="flex-1 bg-gray-100 rounded overflow-hidden relative" style={{ aspectRatio: cssAspectRatio }}>
            {panel.imageUrl && <img src={panel.imageUrl} alt={t("firstLastFrame.firstFrame")} className="w-full h-full object-cover" />}
            <span className="absolute bottom-1 left-1 bg-purple-500 text-white text-[10px] px-1 rounded">{t("firstLastFrame.firstFrame")}</span>
          </div>
          <span className="text-purple-400">→</span>
          <div className="flex-1 bg-gray-100 rounded overflow-hidden relative" style={{ aspectRatio: cssAspectRatio }}>
            {nextPanel.imageUrl && <img src={nextPanel.imageUrl} alt={t("firstLastFrame.lastFrame")} className="w-full h-full object-cover" />}
            <span className="absolute bottom-1 left-1 bg-amber-500 text-white text-[10px] px-1 rounded">{t("firstLastFrame.lastFrame")}</span>
          </div>
        </div>
        {/* 首尾帧提示词编辑 */}
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-purple-600 font-medium">首尾帧提示词</span>
            {hasCustomPrompt && (
              <button
                onClick={() => onResetPrompt(panelKey)}
                className="text-xs text-purple-500 hover:text-purple-700 underline"
              >
                重置为默认
              </button>
            )}
          </div>
          <textarea
            value={currentPrompt}
            onChange={(e) => onCustomPromptChange(panelKey, e.target.value)}
            className="w-full text-xs p-2 border border-purple-200 rounded bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
            rows={3}
            placeholder="输入首尾帧视频提示词..."
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onGenerate(panel.storyboardId, panel.panelIndex, nextPanel.storyboardId, nextPanel.panelIndex, panelKey)}
          disabled={panel.generatingVideo || !panel.imageUrl || !nextPanel.imageUrl}
          className="btn-base flex-1 py-2 text-sm font-medium disabled:opacity-50"
          style={{
            background: panel.videoUrl ? '#10b981' : panel.generatingVideo ? '#6b7280' : '#7c3aed',
            color: 'white'
          }}
        >
          {panel.videoUrl ? '✓ 首尾帧视频已生成' : panel.generatingVideo ? '首尾帧生成中...' : '🔗 生成首尾帧视频'}
        </button>
        <select
          value={flModel}
          onChange={(e) => onFlModelChange(e.target.value)}
          className="text-xs px-2 py-2 border border-purple-300 rounded-lg bg-white text-purple-700 focus:outline-none focus:ring-1 focus:ring-purple-500"
          title="首尾帧模型"
        >
          {FIRST_LAST_FRAME_MODELS.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        {/* 音频开关 - 仅 Seedance 1.5 Pro 支持 */}
        {supportsAudio && (
          <button
            onClick={() => onFlGenerateAudioChange(!flGenerateAudio)}
            className={`p-2 rounded-lg border transition-colors ${
              flGenerateAudio 
                ? 'bg-purple-100 border-purple-300 text-purple-700' 
                : 'bg-gray-100 border-gray-300 text-gray-400'
            }`}
            title={flGenerateAudio ? t("panelCard.audioEnabled") : t("panelCard.audioDisabled")}
          >
            {flGenerateAudio ? '🔊' : '🔇'}
          </button>
        )}
      </div>
    </div>
  )
}

