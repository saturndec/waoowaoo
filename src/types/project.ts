// ============================================
// 项目模式类型
// ============================================
export type ProjectMode = 'novel-promotion'

// ============================================
// 基础项目类型
// ============================================
export interface BaseProject {
  id: string
  name: string
  description: string | null
  mode: ProjectMode
  userId: string
  createdAt: Date
  updatedAt: Date
}

// ============================================
// 通用资产类型
// ============================================

// 角色形象（独立表）
// 🔥 V6.5: characterId 改为可选以兼容 useProjectAssets 返回的数据
export interface CharacterAppearance {
  id: string
  characterId?: string            // 可选，API 响应可能不包含
  appearanceIndex: number           // 形象序号：1, 2, 3...
  changeReason: string              // "初始形象"、"落水湿身"
  description: string | null
  descriptions: string[] | null     // 3个描述变体
  imageUrl: string | null           // 选中的图片
  imageUrls: string[]               // 候选图片数组
  previousImageUrl: string | null   // 上一次的图片URL（用于撤回）
  previousImageUrls: string[] | null  // 上一次的图片数组（用于撤回）
  previousDescription: string | null  // 上一次的描述（用于撤回）
  previousDescriptions: string[] | null  // 上一次的描述数组（用于撤回）
  selectedIndex: number | null      // 用户选中的图片索引
  generating: boolean
  imageErrorMessage: string | null  // 图片生成错误消息
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
  voiceType?: 'azure' | 'custom' | null  // 音色类型
  voiceId?: string | null                 // Azure音色ID 或标识
  customVoiceUrl?: string | null          // 自定义上传的参考音频URL
  // 角色档案（两阶段生成）
  profileData?: string | null             // JSON格式的角色档案
  profileConfirmed?: boolean             // 档案是否已确认
}

// 场景图片（独立表）
// 🔥 V6.5: locationId 改为可选以兼容 useProjectAssets
export interface LocationImage {
  id: string
  locationId?: string               // 可选，API 响应可能不包含
  imageIndex: number              // 图片索引：0, 1, 2
  description: string | null
  imageUrl: string | null
  previousImageUrl: string | null // 上一次的图片URL（用于撤回）
  previousDescription: string | null  // 上一次的描述（用于撤回）
  isSelected: boolean
  generating: boolean
  imageErrorMessage: string | null  // 图片生成错误消息
}

// 场景
export interface Location {
  id: string
  name: string
  summary: string | null            // 场景简要描述（用途/人物关联）
  images: LocationImage[]           // 独立表关联
}

export interface AssetLibraryCharacter {
  id: string
  name: string
  description: string
  imageUrl: string | null
}

export interface AssetLibraryLocation {
  id: string
  name: string
  description: string
  imageUrl: string | null
}

// ============================================
// 小说推文模式类型
// ============================================

// 工作流模式
export type WorkflowMode = 'srt' | 'agent'

// Clip类型（兼容SRT和Agent两种模式）
export interface NovelPromotionClip {
  id: string

  // SRT模式字段
  start?: number
  end?: number
  duration?: number

  // Agent模式字段
  startText?: string
  endText?: string
  shotCount?: number

  // 共用字段
  summary: string
  location: string | null
  characters: string | null
  content: string
  screenplay?: string | null  // 剧本JSON（Phase 0输出）
}

export interface NovelPromotionPanel {
  id: string
  storyboardId: string
  panelIndex: number
  panelNumber: number | null
  shotType: string | null
  cameraMove: string | null
  description: string | null
  location: string | null
  characters: string | null
  srtSegment: string | null
  srtStart: number | null
  srtEnd: number | null
  duration: number | null
  imagePrompt: string | null
  imageUrl: string | null
  imageHistory: string | null
  videoPrompt: string | null
  videoUrl: string | null
  photographyRules: string | null  // 单镜头摄影规则JSON
  actingNotes: string | null        // 演技指导数据JSON
  generatingVideo: boolean
  imageErrorMessage: string | null  // 图片生成错误消息
}

export interface NovelPromotionStoryboard {
  id: string
  episodeId: string
  clipId: string
  storyboardTextJson: string | null
  panelCount: number
  storyboardImageUrl: string | null
  generating?: boolean
  candidateImages?: string | null
  lastError?: string | null  // 最后一次生成失败的错误信息
  photographyPlan?: string | null  // 摄影方案JSON
  panels?: NovelPromotionPanel[]
}

export interface NovelPromotionShot {
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
  generatingImage: boolean
}

export interface NovelPromotionProject {
  id: string
  projectId: string
  stage: string
  globalAssetText: string | null
  novelText: string | null
  analysisModel: string
  imageModel: string
  characterModel: string
  locationModel: string
  storyboardModel: string
  editModel: string
  videoModel: string
  videoRatio: string
  videoResolution: string
  imageResolution: string
  ttsRate: string
  ttsVoice: string
  workflowMode: WorkflowMode  // 新增：工作流模式
  artStyle: string
  artStylePrompt: string | null
  audioUrl: string | null
  srtContent: string | null
  characters?: Character[]
  locations?: Location[]
  clips?: NovelPromotionClip[]
  storyboards?: NovelPromotionStoryboard[]
  shots?: NovelPromotionShot[]
}

// ============================================
// 完整项目类型 (包含基础信息和模式数据)
// ============================================
export interface Project extends BaseProject {
  novelPromotionData?: NovelPromotionProject
}
