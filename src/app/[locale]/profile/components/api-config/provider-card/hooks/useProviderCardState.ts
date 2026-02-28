'use client'

import { useState } from 'react'
import {
  encodeModelKey,
  PRESET_MODELS,
  PRESET_PROVIDERS,
  getProviderKey,
  getProviderTutorial,
  matchesModelKey,
} from '../../types'
import type {
  ModelFormState,
  ProviderCardGroupedModels,
  ProviderCardModelType,
  ProviderCardProps,
  ProviderCardTranslator,
} from '../types'
import type { CustomModel } from '../../types'

interface UseProviderCardStateParams {
  provider: ProviderCardProps['provider']
  models: ProviderCardProps['models']
  allModels?: ProviderCardProps['allModels']
  defaultModels: ProviderCardProps['defaultModels']
  onUpdateApiKey: ProviderCardProps['onUpdateApiKey']
  onUpdateBaseUrl: ProviderCardProps['onUpdateBaseUrl']
  onUpdateModel: ProviderCardProps['onUpdateModel']
  onAddModel: ProviderCardProps['onAddModel']
  t: ProviderCardTranslator
}

const EMPTY_MODEL_FORM: ModelFormState = {
  name: '',
  modelId: '',
  enableCustomPricing: false,
  priceInput: '',
  priceOutput: '',
  basePrice: '',
  optionPricesJson: '',
}

/**
 * Provider keys that require user-defined pricing when adding custom models
 * (they are not in the built-in pricing catalog).
 */
const CUSTOM_PRICING_PROVIDER_KEYS = new Set(['openrouter', 'openai-compatible'])

type AddModelCustomPricing = {
  llm?: { inputPerMillion?: number; outputPerMillion?: number }
  image?: { basePrice?: number; optionPrices?: Record<string, Record<string, number>> }
  video?: { basePrice?: number; optionPrices?: Record<string, Record<string, number>> }
}

type BuildCustomPricingResult =
  | { ok: true; customPricing?: AddModelCustomPricing }
  | { ok: false; reason: 'invalid' }

export function buildCustomPricingFromModelForm(
  modelType: ProviderCardModelType,
  form: ModelFormState,
  options: { needsCustomPricing: boolean },
): BuildCustomPricingResult {
  if (!options.needsCustomPricing || form.enableCustomPricing !== true) {
    return { ok: true }
  }

  if (modelType === 'llm') {
    const inputVal = parseFloat(form.priceInput || '')
    const outputVal = parseFloat(form.priceOutput || '')
    if (!Number.isFinite(inputVal) || inputVal < 0 || !Number.isFinite(outputVal) || outputVal < 0) {
      return { ok: false, reason: 'invalid' }
    }
    return {
      ok: true,
      customPricing: {
        llm: {
          inputPerMillion: inputVal,
          outputPerMillion: outputVal,
        },
      },
    }
  }

  if (modelType === 'image' || modelType === 'video') {
    const basePriceRaw = parseFloat(form.basePrice || '')
    const hasBasePrice = Number.isFinite(basePriceRaw) && basePriceRaw >= 0
    if (form.basePrice && !hasBasePrice) {
      return { ok: false, reason: 'invalid' }
    }

    let optionPrices: Record<string, Record<string, number>> | undefined
    if (form.optionPricesJson && form.optionPricesJson.trim().length > 0) {
      try {
        const parsed = JSON.parse(form.optionPricesJson) as unknown
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('invalid option prices object')
        }
        optionPrices = {}
        for (const [field, rawOptionMap] of Object.entries(parsed as Record<string, unknown>)) {
          if (!rawOptionMap || typeof rawOptionMap !== 'object' || Array.isArray(rawOptionMap)) continue
          const normalizedOptions: Record<string, number> = {}
          for (const [optionKey, rawAmount] of Object.entries(rawOptionMap as Record<string, unknown>)) {
            if (typeof rawAmount !== 'number' || !Number.isFinite(rawAmount) || rawAmount < 0) {
              throw new Error('invalid option price amount')
            }
            normalizedOptions[optionKey] = rawAmount
          }
          if (Object.keys(normalizedOptions).length > 0) {
            optionPrices[field] = normalizedOptions
          }
        }
        if (Object.keys(optionPrices).length === 0) {
          optionPrices = undefined
        }
      } catch {
        return { ok: false, reason: 'invalid' }
      }
    }

    if (!hasBasePrice && !optionPrices) {
      return { ok: false, reason: 'invalid' }
    }

    return {
      ok: true,
      customPricing: modelType === 'image'
        ? {
          image: {
            ...(hasBasePrice ? { basePrice: basePriceRaw } : {}),
            ...(optionPrices ? { optionPrices } : {}),
          },
        }
        : {
          video: {
            ...(hasBasePrice ? { basePrice: basePriceRaw } : {}),
            ...(optionPrices ? { optionPrices } : {}),
          },
        },
    }
  }

  return { ok: true }
}

function toProviderCardModelType(type: CustomModel['type']): ProviderCardModelType | null {
  if (type === 'llm' || type === 'image' || type === 'video' || type === 'audio') return type
  if (type === 'lipsync') return 'audio'
  return null
}

export interface UseProviderCardStateResult {
  providerKey: string
  isPresetProvider: boolean
  showBaseUrlEdit: boolean
  tutorial: ReturnType<typeof getProviderTutorial>
  groupedModels: ProviderCardGroupedModels
  hasModels: boolean
  isEditing: boolean
  isEditingUrl: boolean
  showKey: boolean
  tempKey: string
  tempUrl: string
  showTutorial: boolean
  showAddForm: ProviderCardModelType | null
  newModel: ModelFormState
  batchMode: boolean
  editingModelId: string | null
  editModel: ModelFormState
  maskedKey: string
  isPresetModel: (modelKey: string) => boolean
  isDefaultModel: (model: CustomModel) => boolean
  setShowKey: (value: boolean) => void
  setShowTutorial: (value: boolean) => void
  setShowAddForm: (value: ProviderCardModelType | null) => void
  setBatchMode: (value: boolean) => void
  setNewModel: (value: ModelFormState) => void
  setEditModel: (value: ModelFormState) => void
  setTempKey: (value: string) => void
  setTempUrl: (value: string) => void
  startEditKey: () => void
  startEditUrl: () => void
  handleSaveKey: () => void
  handleCancelEdit: () => void
  handleSaveUrl: () => void
  handleCancelUrlEdit: () => void
  handleEditModel: (model: CustomModel) => void
  handleCancelEditModel: () => void
  handleSaveModel: (originalModelKey: string) => void
  handleAddModel: (type: ProviderCardModelType) => void
  handleCancelAdd: () => void
  needsCustomPricing: boolean
}

export function useProviderCardState({
  provider,
  models,
  allModels,
  defaultModels,
  onUpdateApiKey,
  onUpdateBaseUrl,
  onUpdateModel,
  onAddModel,
  t,
}: UseProviderCardStateParams): UseProviderCardStateResult {
  const [isEditing, setIsEditing] = useState(false)
  const [isEditingUrl, setIsEditingUrl] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [tempKey, setTempKey] = useState(provider.apiKey || '')
  const [tempUrl, setTempUrl] = useState(provider.baseUrl || '')
  const [showTutorial, setShowTutorial] = useState(false)
  const [showAddForm, setShowAddForm] = useState<ProviderCardModelType | null>(null)
  const [newModel, setNewModel] = useState<ModelFormState>(EMPTY_MODEL_FORM)
  const [batchMode, setBatchMode] = useState(false)
  const [editingModelId, setEditingModelId] = useState<string | null>(null)
  const [editModel, setEditModel] = useState<ModelFormState>(EMPTY_MODEL_FORM)

  const providerKey = getProviderKey(provider.id)
  const isPresetProvider = PRESET_PROVIDERS.some(
    (presetProvider) => presetProvider.id === provider.id,
  )
  const showBaseUrlEdit =
    ['gemini-compatible', 'openai-compatible'].includes(providerKey) &&
    Boolean(onUpdateBaseUrl)
  const tutorial = getProviderTutorial(provider.id)

  const groupedModels: ProviderCardGroupedModels = {}
  for (const model of models) {
    const groupedType = toProviderCardModelType(model.type)
    if (!groupedType) continue
    if (!groupedModels[groupedType]) {
      groupedModels[groupedType] = []
    }
    groupedModels[groupedType]!.push(model)
  }

  const hasModels = Object.keys(groupedModels).length > 0
  const isPresetModel = (modelKey: string) =>
    PRESET_MODELS.some((model) => encodeModelKey(model.provider, model.modelId) === modelKey)

  const isDefaultModel = (model: CustomModel) => {
    if (model.type === 'llm' && matchesModelKey(defaultModels.analysisModel, model.provider, model.modelId)) {
      return true
    }

    if (model.type === 'image') {
      if (matchesModelKey(defaultModels.characterModel, model.provider, model.modelId)) return true
      if (matchesModelKey(defaultModels.locationModel, model.provider, model.modelId)) return true
      if (matchesModelKey(defaultModels.storyboardModel, model.provider, model.modelId)) return true
      if (matchesModelKey(defaultModels.editModel, model.provider, model.modelId)) return true
    }

    if (model.type === 'video' && matchesModelKey(defaultModels.videoModel, model.provider, model.modelId)) {
      return true
    }

    if (model.type === 'lipsync' && matchesModelKey(defaultModels.lipSyncModel, model.provider, model.modelId)) {
      return true
    }

    return false
  }

  const startEditKey = () => {
    setTempKey(provider.apiKey || '')
    setIsEditing(true)
  }

  const startEditUrl = () => {
    setTempUrl(provider.baseUrl || '')
    setIsEditingUrl(true)
  }

  const handleSaveKey = () => {
    onUpdateApiKey(provider.id, tempKey)
    setIsEditing(false)
  }

  const handleCancelEdit = () => {
    setTempKey(provider.apiKey || '')
    setIsEditing(false)
  }

  const handleSaveUrl = () => {
    onUpdateBaseUrl?.(provider.id, tempUrl)
    setIsEditingUrl(false)
  }

  const handleCancelUrlEdit = () => {
    setTempUrl(provider.baseUrl || '')
    setIsEditingUrl(false)
  }

  const handleEditModel = (model: CustomModel) => {
    setEditingModelId(model.modelKey)
    setEditModel({
      name: model.name,
      modelId: model.modelId,
    })
  }

  const handleCancelEditModel = () => {
    setEditingModelId(null)
    setEditModel(EMPTY_MODEL_FORM)
  }

  const handleSaveModel = (originalModelKey: string) => {
    if (!editModel.name || !editModel.modelId) {
      alert(t('fillComplete'))
      return
    }

    const nextModelKey = encodeModelKey(provider.id, editModel.modelId)
    const all = allModels || models
    const duplicate = all.some(
      (model) =>
        model.modelKey === nextModelKey &&
        model.modelKey !== originalModelKey,
    )

    if (duplicate) {
      alert(t('modelIdExists'))
      return
    }

    onUpdateModel?.(originalModelKey, {
      name: editModel.name,
      modelId: editModel.modelId,
    })

    handleCancelEditModel()
  }

  const handleAddModel = (type: ProviderCardModelType) => {
    if (!newModel.name || !newModel.modelId) {
      alert(t('fillComplete'))
      return
    }

    const finalModelId =
      type === 'video' && batchMode && provider.id === 'ark'
        ? `${newModel.modelId}-batch`
        : newModel.modelId
    const finalModelKey = encodeModelKey(provider.id, finalModelId)

    const all = allModels || models
    if (all.some((model) => model.modelKey === finalModelKey)) {
      alert(t('modelIdExists'))
      return
    }

    const finalName =
      type === 'video' && batchMode && provider.id === 'ark'
        ? `${newModel.name} (Batch)`
        : newModel.name

    // Build optional customPricing payload for providers that support custom pricing
    const pricingBuildResult = buildCustomPricingFromModelForm(type, newModel, {
      needsCustomPricing: CUSTOM_PRICING_PROVIDER_KEYS.has(getProviderKey(provider.id)),
    })
    if (!pricingBuildResult.ok) {
      alert(t('fillPricing'))
      return
    }
    const customPricing = pricingBuildResult.customPricing

    onAddModel({
      modelId: finalModelId,
      modelKey: finalModelKey,
      name: finalName,
      type,
      provider: provider.id,
      price: 0,
      ...(customPricing ? { customPricing } : {}),
    })

    setNewModel(EMPTY_MODEL_FORM)
    setBatchMode(false)
    setShowAddForm(null)
  }

  const handleCancelAdd = () => {
    setShowAddForm(null)
    setNewModel(EMPTY_MODEL_FORM)
    setBatchMode(false)
  }

  const maskedKey = provider.apiKey ? '•'.repeat(20) : ''

  return {
    providerKey,
    isPresetProvider,
    showBaseUrlEdit,
    tutorial,
    groupedModels,
    hasModels,
    isEditing,
    isEditingUrl,
    showKey,
    tempKey,
    tempUrl,
    showTutorial,
    showAddForm,
    newModel,
    batchMode,
    editingModelId,
    editModel,
    maskedKey,
    isPresetModel,
    isDefaultModel,
    setShowKey,
    setShowTutorial,
    setShowAddForm,
    setBatchMode,
    setNewModel,
    setEditModel,
    setTempKey,
    setTempUrl,
    startEditKey,
    startEditUrl,
    handleSaveKey,
    handleCancelEdit,
    handleSaveUrl,
    handleCancelUrlEdit,
    handleEditModel,
    handleCancelEditModel,
    handleSaveModel,
    handleAddModel,
    handleCancelAdd,
    needsCustomPricing: CUSTOM_PRICING_PROVIDER_KEYS.has(providerKey),
  }
}
