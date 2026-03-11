import type { ReactNode } from 'react'
import type { CustomModel, Provider } from '../types'

export interface ProviderCardDefaultModels {
  analysisModel?: string
  characterModel?: string
  locationModel?: string
  storyboardModel?: string
  editModel?: string
  videoModel?: string
  audioModel?: string
  lipSyncModel?: string
  voiceDesignModel?: string
}

export interface ProviderCardProps {
  provider: Provider
  dragHandle?: ReactNode
  models: CustomModel[]
  allModels?: CustomModel[]
  defaultModels: ProviderCardDefaultModels
  onToggleModel: (modelKey: string) => void
  onUpdateApiKey: (providerId: string, apiKey: string) => void
  onUpdateBaseUrl?: (providerId: string, baseUrl: string) => void
  onDeleteModel: (modelKey: string) => void
  onUpdateModel?: (modelKey: string, updates: Partial<CustomModel>) => void
  onDeleteProvider?: (providerId: string) => void
  onToggleProviderHidden?: (providerId: string, hidden: boolean) => void
  onAddModel: (model: Omit<CustomModel, 'enabled'>) => void
  onFlushConfig?: () => Promise<void>
  hideProviderLabel?: string
  showProviderLabel?: string
}

export interface ModelFormState {
  name: string
  modelId: string
  enableCustomPricing?: boolean
  priceInput?: string
  priceOutput?: string
  basePrice?: string
  optionPricesJson?: string
}

export type ProviderCardModelType = 'llm' | 'image' | 'video' | 'audio'

export type ProviderCardGroupedModels = Partial<Record<ProviderCardModelType, CustomModel[]>>

export type ProviderCardTranslator = (
  key: string,
  values?: Record<string, string | number>,
) => string

/**
 * 支持在线连通性测试的 provider key 集合（单一源）
 * UI 层（是否显示"测试连接"按钮）和 逻辑层（保存时是否自动测试）共享此列表
 */
export const VERIFIABLE_PROVIDER_KEYS = new Set([
  'ark', 'google', 'openrouter', 'minimax', 'fal', 'vidu',
  'bailian', 'siliconflow',
  'openai-compatible', 'grok-compatible', 'gemini-compatible',
])
