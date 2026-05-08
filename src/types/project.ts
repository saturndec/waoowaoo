import type { CapabilitySelections } from '@/lib/ai-registry/types'
import type { LocationAvailableSlot } from '@/lib/location-available-slots'
import type { DirectorStyleDoc } from '@/lib/director-style'

export type ProjectVideoGenerationOptionValue = string | number | boolean
export type ProjectVideoGenerationOptions = Record<string, ProjectVideoGenerationOptionValue>

// ============================================
// 基础项目类型
// ============================================
export interface BaseProject {
  id: string
  name: string
  description: string | null
  userId: string
  createdAt: Date
  updatedAt: Date
}

// ============================================
// 通用资产类型
// ============================================

export interface MediaRef {
  id: string
  publicId: string
  url: string
  mimeType: string | null
  sizeBytes: number | null
  width: number | null
  height: number | null
  durationMs: number | null
}

// 角色形象（独立表）
// 🔥 V6.5: characterId 改为可选以兼容 useProjectAssets 返回的数据
export interface CharacterAppearance {
  id: string
  characterId?: string            // 可选，API 响应可能不包含
  appearanceIndex: number           // 形象序号：0, 1, 2...（0 = 主形象）
  changeReason: string              // "初始形象"、"落水湿身"
  description: string | null
  descriptions: string[] | null     // 3个描述变体
  imageUrl: string | null           // 选中的图片
  media?: MediaRef | null
  imageUrls: string[]               // 候选图片数组
  imageMedias?: MediaRef[]
  previousImageUrl: string | null   // 上一次的图片URL（用于撤回）
  previousMedia?: MediaRef | null
  previousImageUrls: string[]         // 上一次的图片数组（用于撤回）
  previousImageMedias?: MediaRef[]
  previousDescription: string | null  // 上一次的描述（用于撤回）
  previousDescriptions: string[] | null  // 上一次的描述数组（用于撤回）
  selectedIndex: number | null      // 用户选中的图片索引
  // 任务态字段（由 tasks + hook 派生，不再依赖数据库持久化）
  imageTaskRunning?: boolean
  imageErrorMessage?: string | null  // 图片生成错误消息
  lastError?: { code: string; message: string } | null  // 结构化错误（来自 task target state）
}

// 角色
// 🔥 V6.5: aliases 改为可选数组以兼容 useProjectAssets
export interface Character {
  id: string
  name: string
  aliases?: string[] | null         // 可选，别名数组
  introduction?: string | null      // 角色介绍（叙述视角、称呼映射等）
  appearances: CharacterAppearance[]  // 独立表关联
  // 配音音色设置
  voiceType?: 'custom' | 'qwen-designed' | 'uploaded' | null  // 音色类型
  voiceId?: string | null                 // 音色 ID 或业务标识
  customVoiceUrl?: string | null          // 自定义上传的参考音频URL
  media?: MediaRef | null
  // 角色档案
  profileData?: string | null             // JSON格式的角色档案
  profileConfirmed?: boolean             // 视觉档案是否已生成
}

// 场景图片（独立表）
// 🔥 V6.5: locationId 改为可选以兼容 useProjectAssets
export interface LocationImage {
  id: string
  locationId?: string               // 可选，API 响应可能不包含
  imageIndex: number              // 图片索引：0, 1, 2
  description: string | null
  availableSlots?: LocationAvailableSlot[] | null
  imageUrl: string | null
  media?: MediaRef | null
  previousImageUrl: string | null // 上一次的图片URL（用于撤回）
  previousMedia?: MediaRef | null
  previousDescription: string | null  // 上一次的描述（用于撤回）
  isSelected: boolean
  // 任务态字段（由 tasks + hook 派生，不再依赖数据库持久化）
  imageTaskRunning?: boolean
  imageErrorMessage?: string | null  // 图片生成错误消息
  lastError?: { code: string; message: string } | null  // 结构化错误（来自 task target state）
}

// 场景
export interface Location {
  id: string
  name: string
  summary: string | null            // 场景简要描述（用途/人物关联）
  selectedImageId?: string | null   // 选中的图片ID（单一真源）
  images: LocationImage[]           // 独立表关联
}

export type PropImage = LocationImage

export interface Prop {
  id: string
  name: string
  summary: string | null
  selectedImageId?: string | null
  images: PropImage[]
}

export interface AssetLibraryCharacter {
  id: string
  name: string
  description: string
  imageUrl: string | null
  media?: MediaRef | null
}

export interface AssetLibraryLocation {
  id: string
  name: string
  description: string
  imageUrl: string | null
  media?: MediaRef | null
}

// ============================================
// 项目工作流类型
// ============================================

// Clip 类型
export interface ProjectClip {
  id: string

  start?: number
  end?: number
  duration?: number

  startText?: string
  endText?: string
  shotCount?: number

  // 共用字段
  summary: string
  location: string | null
  characters: string | null
  props: string | null
  content: string
  screenplay?: string | null  // 剧本JSON（Phase 0输出）
}

export interface ProjectPanel {
  id: string
  storyboardId: string
  panelIndex: number
  panelNumber: number | null
  shotType: string | null
  cameraMove: string | null
  description: string | null
  location: string | null
  characters: string | null
  props: string | null
  srtSegment: string | null
  srtStart: number | null
  srtEnd: number | null
  duration: number | null
  imagePrompt: string | null
  imageUrl: string | null
  candidateImages?: string | null
  media?: MediaRef | null
  imageHistory: string | null
  videoPrompt: string | null
  firstLastFramePrompt?: string | null
  videoUrl: string | null
  videoModel?: string | null
  videoErrorCode?: string | null
  videoErrorMessage?: string | null
  videoGenerationMode?: 'normal' | 'firstlastframe' | null
  lastVideoGenerationOptions?: ProjectVideoGenerationOptions | null
  videoMedia?: MediaRef | null
  lipSyncVideoUrl?: string | null
  lipSyncVideoMedia?: MediaRef | null
  lipSyncErrorCode?: string | null
  lipSyncErrorMessage?: string | null
  linkedToNextPanel?: boolean | null
  sketchImageUrl?: string | null
  sketchImageMedia?: MediaRef | null
  previousImageUrl?: string | null
  previousImageMedia?: MediaRef | null
  photographyRules: string | null  // 单镜头摄影规则JSON
  actingNotes: string | null        // 演技指导数据JSON
  // 任务态字段（由 tasks + hook 派生，不再依赖数据库持久化）
  imageTaskRunning?: boolean
  videoTaskRunning?: boolean
  imageErrorMessage?: string | null  // 图片生成错误消息
}

export interface ProjectStoryboard {
  id: string
  episodeId: string
  clipId: string
  storyboardTextJson: string | null
  panelCount: number
  storyboardImageUrl: string | null
  media?: MediaRef | null
  storyboardTaskRunning?: boolean
  candidateImages?: string | null
  lastError?: string | null  // 最后一次生成失败的错误信息
  photographyPlan?: string | null  // 摄影方案JSON
  panels?: ProjectPanel[]
}

export interface ProjectShot {
  id: string
  shotId: string
  srtStart: number
  srtEnd: number
  srtDuration: number
  sequence: string | null
  locations: string | null
  characters: string | null
  plot: string | null
  pov: string | null
  imagePrompt: string | null
  scale: string | null
  module: string | null
  focus: string | null
  zhSummarize: string | null
  imageUrl: string | null
  media?: MediaRef | null
  videoUrl?: string | null
  videoMedia?: MediaRef | null
  // 任务态字段（由 tasks + hook 派生，不再依赖数据库持久化）
  imageTaskRunning?: boolean
}

export type ProjectEditAssetKind = 'character' | 'location'
export type ProjectEditAssetStatus = 'pending' | 'generating' | 'completed' | 'failed'

export interface ProjectEditScriptShot {
  shotNumber: number
  durationSec: number
  visualAction: string
  charactersAndScene: string
  camera: string
  videoPrompt: string
  sound: string
  transition: string
}

export interface ProjectEditAssetRequirement {
  id: string
  kind: ProjectEditAssetKind
  name: string
  description: string
  shotNumbers: number[]
  status: ProjectEditAssetStatus
  targetId: string | null
  errorMessage: string | null
  previewImageUrl?: string | null
}

export interface ProjectEditScript {
  id: string
  projectId: string
  episodeId: string
  userPrompt: string
  title: string
  logline: string | null
  durationSec: number
  shotCount: number
  status: string
  shots: ProjectEditScriptShot[]
  requirements: ProjectEditAssetRequirement[]
}

export interface ProjectEpisodeSummary {
  id: string
  episodeNumber: number
  name: string
  description: string | null
  novelText: string | null
  audioUrl: string | null
  media?: MediaRef | null
  srtContent: string | null
  createdAt: Date
  updatedAt: Date
  editScript?: ProjectEditScript | null
}

export interface ProjectWorkflowData {
  globalAssetText: string | null
  analysisModel: string | null
  imageModel: string | null
  characterModel: string | null
  locationModel: string | null
  storyboardModel: string | null
  editModel: string | null
  videoModel: string | null
  audioModel: string | null
  musicModel: string | null
  videoRatio: string | null
  capabilityOverrides?: CapabilitySelections | string | null
  artStyle: string | null
  artStylePrompt: string | null
  visualStylePresetSource: string | null
  visualStylePresetId: string | null
  directorStylePresetSource: string | null
  directorStylePresetId: string | null
  directorStyleDoc: DirectorStyleDoc | null
  videoResolution?: string | null
  imageResolution?: string | null
  lastEpisodeId?: string | null
  importStatus?: string | null
  characters?: Character[]
  locations?: Location[]
  props?: Prop[]
  episodes?: ProjectEpisodeSummary[]
  clips?: ProjectClip[]
  storyboards?: ProjectStoryboard[]
  shots?: ProjectShot[]
}

// ============================================
// 完整项目类型
// ============================================
export interface Project extends BaseProject, ProjectWorkflowData {}
