'use client'

import { useMemo } from 'react'
import type { CustomModel, Provider } from '../../api-config'
import { PRESET_PROVIDERS, getProviderKey } from '../../api-config'

interface UseApiConfigFiltersParams {
  providers: Provider[]
  models: CustomModel[]
}

interface EnabledModelOption extends CustomModel {
  providerName: string
}

type EnabledModelType = 'llm' | 'image' | 'video' | 'audio' | 'lipsync'

interface ApiConfigFilterState {
  modelProviders: Provider[]
  audioProviders: Provider[]
  enabledModelsByType: Record<EnabledModelType, EnabledModelOption[]>
}

const DYNAMIC_PROVIDER_PREFIXES = ['gemini-compatible', 'openai-compatible']
const ALWAYS_SHOW_PROVIDERS: string[] = []
const MODEL_TYPES: EnabledModelType[] = ['llm', 'image', 'video', 'audio', 'lipsync']
const MODEL_PROVIDER_KEYS = [
  'ark',
  'google',
  'openrouter',
  'minimax',
  'vidu',
  'fal',
  'qwen',
  'gemini-compatible',
  'openai-compatible',
]
const AUDIO_PROVIDER_KEYS = ['qwen']

function isModelProviderType(type: CustomModel['type']): type is EnabledModelType {
  return MODEL_TYPES.includes(type as EnabledModelType)
}

function hasProviderApiKey(provider: Provider | undefined): boolean {
  if (!provider) return false
  if (provider.hasApiKey === true) return true
  const apiKey = typeof provider.apiKey === 'string' ? provider.apiKey.trim() : ''
  return apiKey.length > 0
}

function isPresetProvider(providerId: string) {
  return PRESET_PROVIDERS.some(
    (provider) => provider.id === getProviderKey(providerId),
  )
}

function createEmptyEnabledModelsByType(): Record<EnabledModelType, EnabledModelOption[]> {
  return {
    llm: [],
    image: [],
    video: [],
    audio: [],
    lipsync: [],
  }
}

export function buildApiConfigFilterState({
  providers,
  models,
}: UseApiConfigFiltersParams): ApiConfigFilterState {
  const modelProviderKeys = new Set<string>(MODEL_PROVIDER_KEYS)
  models.forEach((model) => {
    if (!isModelProviderType(model.type)) return
    modelProviderKeys.add(getProviderKey(model.provider))
  })

  const audioProviderKeys = new Set<string>(AUDIO_PROVIDER_KEYS)
  models.forEach((model) => {
    if (model.type !== 'audio') return
    audioProviderKeys.add(getProviderKey(model.provider))
  })

  const modelProviders = providers.filter((provider) => {
    const providerKey = getProviderKey(provider.id)
    const isCustomProvider = !isPresetProvider(provider.id)
    const isDynamicProvider =
      DYNAMIC_PROVIDER_PREFIXES.includes(providerKey) && provider.id.includes(':')

    return (
      (isCustomProvider && modelProviderKeys.has(providerKey)) ||
      modelProviderKeys.has(providerKey) ||
      ALWAYS_SHOW_PROVIDERS.includes(providerKey) ||
      isDynamicProvider
    )
  })
  const modelProviderIds = new Set(modelProviders.map((provider) => provider.id))

  const audioProviders = providers.filter((provider) => {
    const providerKey = getProviderKey(provider.id)
    if (providerKey === 'fal') return false
    if (!audioProviderKeys.has(providerKey)) return false
    // 避免与主提供商卡片重复展示（例如 qwen）
    return !modelProviderIds.has(provider.id)
  })

  const enabledModelsByType = createEmptyEnabledModelsByType()
  const providersById = new Map(providers.map((provider) => [provider.id, provider] as const))

  for (const model of models) {
    if (!model.enabled) continue
    if (!isModelProviderType(model.type)) continue
    const provider = providersById.get(model.provider)
    if (!hasProviderApiKey(provider)) continue

    enabledModelsByType[model.type].push({
      ...model,
      providerName: provider?.name || model.provider,
    })
  }

  return {
    modelProviders,
    audioProviders,
    enabledModelsByType,
  }
}

export function useApiConfigFilters({
  providers,
  models,
}: UseApiConfigFiltersParams) {
  const filterState = useMemo(
    () => buildApiConfigFilterState({ providers, models }),
    [models, providers],
  )

  return {
    modelProviders: filterState.modelProviders,
    audioProviders: filterState.audioProviders,
    getModelsForProvider: (providerId: string) =>
      models.filter((model) => model.provider === providerId),
    getEnabledModelsByType: (type: EnabledModelType) => filterState.enabledModelsByType[type],
  }
}
