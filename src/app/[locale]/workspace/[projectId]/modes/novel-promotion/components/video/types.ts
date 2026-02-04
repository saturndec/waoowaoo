// 视频阶段共享类型定义

// 用户视频模型选项
export interface VideoModelOption {
  value: string
  label: string
}

export interface TextPanel {
  panel_number: number
  shot_type: string
  camera_move?: string
  description: string
  characters?: string[]
  location?: string
  text_segment?: string
  duration?: number
  video_prompt?: string
  imagePrompt?: string
  videoModel?: string
}

export interface Panel {
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
  videoUrl?: string | null
  videoModel?: string | null
  linkedToNextPanel?: boolean | null
  generatingVideo?: boolean | null
  videoErrorMessage?: string | null  // 视频生成错误消息
  generatingImage?: boolean | null
  // 口型同步相关
  lipSyncVideoUrl?: string | null
  generatingLipSync?: boolean | null
  lipSyncErrorMessage?: string | null  // 口型同步错误消息
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
  panelId?: string  // 用于取消生成
  storyboardId: string
  panelIndex: number
  textPanel?: TextPanel
  imageUrl?: string
  videoUrl?: string
  generatingVideo?: boolean
  videoErrorMessage?: string  // 视频生成错误消息
  videoModel?: string
  linkedToNextPanel?: boolean
  // 口型同步相关
  lipSyncVideoUrl?: string
  generatingLipSync?: boolean
  lipSyncTaskId?: string
  lipSyncErrorMessage?: string  // 口型同步错误消息
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
  generateAudio?: boolean  // 仅 Seedance 1.5 Pro 支持音频生成
}
