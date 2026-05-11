// 视频阶段共享类型定义
import type { ModelCapabilities } from '@/lib/ai-registry/types'
import { VideoPricingTier } from '@/lib/ai-registry/video-capabilities'

// 用户视频模型选项
export interface VideoModelOption {
  value: string
  label: string
  provider?: string
  providerName?: string
  disabled?: boolean
  capabilities?: ModelCapabilities
  videoPricingTiers?: VideoPricingTier[]
}

export type VideoGenerationMode = 'normal' | 'firstlastframe'

export interface TextPanel {
  panel_number: number
  shot_type: string
  camera_move?: string
  description: string
  characters?: Array<string | { name?: string; appearance?: string }>
  location?: string
  text_segment?: string
  duration?: number
  video_prompt?: string
  imagePrompt?: string
  videoModel?: string
}

export interface Panel {
  id?: string
  panelIndex: number
  panelNumber?: number | null
  shotType?: string | null
  cameraMove?: string | null
  description?: string | null
  characters?: string | null
  location?: string | null
  textSegment?: string | null
  srtSegment?: string | null  // SRT 原文片段
  duration?: number | null
  imagePrompt?: string | null
  imageUrl?: string | null  // 图片URL
  videoPrompt?: string | null
  firstLastFramePrompt?: string | null
  videoUrl?: string | null
  videoGenerationMode?: VideoGenerationMode | null
  lastVideoGenerationOptions?: VideoGenerationOptions | null
  videoModel?: string | null
  linkedToNextPanel?: boolean | null
  videoTaskRunning?: boolean | null
  videoErrorMessage?: string | null  // 视频生成错误消息
  videoErrorCode?: string | null
  imageTaskRunning?: boolean | null
  // 口型同步相关
  lipSyncVideoUrl?: string | null
  lipSyncTaskRunning?: boolean | null
  lipSyncErrorMessage?: string | null  // 口型同步错误消息
  lipSyncErrorCode?: string | null
}

export interface Storyboard {
  id: string
  clipId?: string | null
  panels?: Panel[]
  clip?: {
    start: number
    end: number
    summary: string
  }
}

export interface Clip {
  id: string
  start: number
  end: number
  summary: string
}

export interface VideoPanel {
  panelId?: string  // 任务目标ID
  storyboardId: string
  panelIndex: number
  textPanel?: TextPanel
  firstLastFramePrompt?: string
  imageUrl?: string
  videoUrl?: string
  videoGenerationMode?: VideoGenerationMode
  lastVideoGenerationOptions?: VideoGenerationOptions | null
  videoTaskRunning?: boolean
  videoErrorMessage?: string  // 视频生成错误消息
  videoErrorCode?: string
  videoModel?: string
  linkedToNextPanel?: boolean
  // 口型同步相关
  lipSyncVideoUrl?: string
  lipSyncTaskRunning?: boolean
  lipSyncTaskId?: string
  lipSyncErrorMessage?: string  // 口型同步错误消息
  lipSyncErrorCode?: string
}

// 匹配的配音信息
export interface MatchedVoiceLine {
  id: string
  lineIndex: number
  speaker: string
  content: string
  audioUrl?: string
  audioDuration?: number
  emotionStrength?: number
}

export interface FirstLastFrameParams {
  lastFrameStoryboardId: string
  lastFramePanelIndex: number
  flModel: string
  customPrompt?: string
}

export type VideoGenerationOptionValue = string | number | boolean
export type VideoGenerationOptions = Record<string, VideoGenerationOptionValue>

export interface BatchVideoGenerationParams {
  videoModel: string
  generationOptions?: VideoGenerationOptions
  mode?: 'single' | 'grid'
  gridMode?: '2x2' | '3x3'
}
