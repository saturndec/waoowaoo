import type { CustomModel, Provider } from '../types'

export interface ProviderCardDefaultModels {
  analysisModel?: string
  characterModel?: string
  locationModel?: string
  storyboardModel?: string
  editModel?: string
  videoModel?: string
  lipSyncModel?: string
}

export interface ProviderCardProps {
  provider: Provider
  models: CustomModel[]
  allModels?: CustomModel[]
  defaultModels: ProviderCardDefaultModels
  onToggleModel: (modelKey: string) => void
  onUpdateApiKey: (providerId: string, apiKey: string) => void
  onUpdateBaseUrl?: (providerId: string, baseUrl: string) => void
  onDeleteModel: (modelKey: string) => void
  onUpdateModel?: (modelKey: string, updates: Partial<CustomModel>) => void
  onDeleteProvider?: (providerId: string) => void
  onAddModel: (model: Omit<CustomModel, 'enabled'>) => void
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
