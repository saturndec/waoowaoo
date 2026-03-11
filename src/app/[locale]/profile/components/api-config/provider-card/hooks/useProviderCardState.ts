'use client'

import { useState, useCallback } from 'react'
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
import { VERIFIABLE_PROVIDER_KEYS } from '../types'
import type { CustomModel } from '../../types'
import { apiFetch } from '@/lib/api-fetch'
import {
  useAssistantChat,
  type AssistantDraftModel,
  type AssistantSavedEvent,
  type UseAssistantChatResult,
} from '@/components/assistant/useAssistantChat'

type KeyTestStepStatus = 'pass' | 'fail' | 'skip'
interface KeyTestStep {
  name: string
  status: KeyTestStepStatus
  message: string
  model?: string
  detail?: string
}
type KeyTestStatus = 'idle' | 'testing' | 'passed' | 'failed'



interface UseProviderCardStateParams {
  provider: ProviderCardProps['provider']
  models: ProviderCardProps['models']
  allModels?: ProviderCardProps['allModels']
  defaultModels: ProviderCardProps['defaultModels']
  onUpdateApiKey: ProviderCardProps['onUpdateApiKey']
  onUpdateBaseUrl: ProviderCardProps['onUpdateBaseUrl']
  onUpdateModel: ProviderCardProps['onUpdateModel']
  onAddModel: ProviderCardProps['onAddModel']
  onFlushConfig: ProviderCardProps['onFlushConfig']
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
type AddModelCustomPricing = {
  llm?: { inputPerMillion?: number; outputPerMillion?: number }
  image?: { basePrice?: number; optionPrices?: Record<string, Record<string, number>> }
  video?: { basePrice?: number; optionPrices?: Record<string, Record<string, number>> }
}

type BuildCustomPricingResult =
  | { ok: true; customPricing?: AddModelCustomPricing }
  | { ok: false; reason: 'invalid' }

interface ProviderConnectionPayload {
  apiType: string
  apiKey: string
  baseUrl?: string
  llmModel?: string
}

type LlmProtocolType = 'responses' | 'chat-completions'

type ProbeModelLlmProtocolSuccessResponse = {
  success: true
  protocol: LlmProtocolType
  checkedAt: string
}

type ProbeModelLlmProtocolFailureResponse = {
  success: false
  code?: string
}

function isLlmProtocol(value: unknown): value is LlmProtocolType {
  return value === 'responses' || value === 'chat-completions'
}

function readProbeFailureCode(value: unknown): string {
  return typeof value === 'string' ? value : 'PROBE_INCONCLUSIVE'
}

function isOpenAICompatProviderKey(providerKey: string): boolean {
  return providerKey === 'openai-compatible' || providerKey === 'grok-compatible'
}

export function shouldProbeModelLlmProtocol(params: {
  providerId: string
  modelType: ProviderCardModelType
}): boolean {
  return isOpenAICompatProviderKey(getProviderKey(params.providerId)) && params.modelType === 'llm'
}

export function shouldReprobeModelLlmProtocol(params: {
  providerId: string
  originalModel: CustomModel
  nextModelId: string
}): boolean {
  if (!shouldProbeModelLlmProtocol({ providerId: params.providerId, modelType: 'llm' })) return false
  if (params.originalModel.type !== 'llm') return false
  if (!isOpenAICompatProviderKey(getProviderKey(params.originalModel.provider))) return false
  return params.originalModel.modelId !== params.nextModelId || params.originalModel.provider !== params.providerId
}

export async function probeModelLlmProtocolViaApi(params: {
  providerId: string
  modelId: string
}): Promise<{ llmProtocol: LlmProtocolType; llmProtocolCheckedAt: string }> {
  const response = await apiFetch('/api/user/api-config/probe-model-llm-protocol', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      providerId: params.providerId,
      modelId: params.modelId,
    }),
  })
  if (!response.ok) {
    throw new Error('MODEL_LLM_PROTOCOL_PROBE_REQUEST_FAILED')
  }

  const payload = await response.json() as ProbeModelLlmProtocolSuccessResponse | ProbeModelLlmProtocolFailureResponse
  if (!payload.success) {
    throw new Error(readProbeFailureCode(payload.code))
  }

  if (!isLlmProtocol(payload.protocol)) {
    throw new Error('MODEL_LLM_PROTOCOL_PROBE_INVALID_PROTOCOL')
  }

  const checkedAt = typeof payload.checkedAt === 'string' && payload.checkedAt.trim().length > 0
    ? payload.checkedAt.trim()
    : new Date().toISOString()

  return {
    llmProtocol: payload.protocol,
    llmProtocolCheckedAt: checkedAt,
  }
}

function pickConfiguredLlmModel(params: {
  models: CustomModel[]
  defaultAnalysisModel?: string
}): string | undefined {
  const enabledLlmModels = params.models.filter((model) => model.type === 'llm' && model.enabled)
  if (enabledLlmModels.length === 0) return undefined
  const preferredModel = enabledLlmModels.find((model) => model.modelKey === params.defaultAnalysisModel)
  return (preferredModel ?? enabledLlmModels[0])?.modelId
}

export function buildProviderConnectionPayload(params: {
  providerKey: string
  apiKey: string
  baseUrl?: string
  llmModel?: string
}): ProviderConnectionPayload {
  const apiKey = params.apiKey.trim()
  const compatibleBaseUrl = params.baseUrl?.trim()
  const llmModel = params.llmModel?.trim()
  const isCompatibleProvider =
    params.providerKey === 'openai-compatible'
    || params.providerKey === 'grok-compatible'
    || params.providerKey === 'gemini-compatible'

  if (isCompatibleProvider && compatibleBaseUrl) {
    return {
      apiType: params.providerKey,
      apiKey,
      baseUrl: compatibleBaseUrl,
      ...(llmModel ? { llmModel } : {}),
    }
  }

  return {
    apiType: params.providerKey,
    apiKey,
    ...(llmModel ? { llmModel } : {}),
  }
}

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
  handleSaveModel: (originalModelKey: string) => Promise<void>
  handleAddModel: (type: ProviderCardModelType) => Promise<void>
  handleCancelAdd: () => void
  needsCustomPricing: boolean
  keyTestStatus: KeyTestStatus
  keyTestSteps: KeyTestStep[]
  handleForceSaveKey: () => void
  handleTestOnly: () => void
  handleDismissTest: () => void
  isModelSavePending: boolean
  assistantEnabled: boolean
  isAssistantOpen: boolean
  assistantSavedEvent: AssistantSavedEvent | null
  assistantChat: UseAssistantChatResult
  openAssistant: () => void
  closeAssistant: () => void
  handleAssistantSend: (content?: string) => Promise<void>
}

export function getAssistantSavedModelLabel(event: AssistantSavedEvent): string {
  const draftName = event.draftModel?.name?.trim()
  if (draftName) return draftName
  const tail = event.savedModelKey.split('::').pop()
  const modelId = typeof tail === 'string' ? tail.trim() : ''
  return modelId || event.savedModelKey
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
  onFlushConfig,
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
  const [keyTestStatus, setKeyTestStatus] = useState<KeyTestStatus>('idle')
  const [keyTestSteps, setKeyTestSteps] = useState<KeyTestStep[]>([])
  const [isModelSavePending, setIsModelSavePending] = useState(false)
  const [isAssistantOpen, setIsAssistantOpen] = useState(false)
  const [assistantSavedEvent, setAssistantSavedEvent] = useState<AssistantSavedEvent | null>(null)

  const providerKey = getProviderKey(provider.id)
  const assistantEnabled = providerKey === 'openai-compatible'
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

    if (model.type === 'audio' && matchesModelKey(defaultModels.audioModel, model.provider, model.modelId)) {
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

  const doSaveKey = useCallback(() => {
    onUpdateApiKey(provider.id, tempKey)
    setIsEditing(false)
    setKeyTestStatus('idle')
    setKeyTestSteps([])
  }, [onUpdateApiKey, provider.id, tempKey])

  const handleSaveKey = useCallback(async () => {
    if (!VERIFIABLE_PROVIDER_KEYS.has(providerKey)) {
      doSaveKey()
      return
    }

    setKeyTestStatus('testing')
    setKeyTestSteps([])

    try {
      const fallbackLlmModel = pickConfiguredLlmModel({
        models,
        defaultAnalysisModel: defaultModels.analysisModel,
      })
      const payload = buildProviderConnectionPayload({
        providerKey,
        apiKey: tempKey,
        baseUrl: provider.baseUrl,
        llmModel: fallbackLlmModel,
      })
      const res = await apiFetch('/api/user/api-config/test-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      const steps: KeyTestStep[] = data.steps || []
      setKeyTestSteps(steps)

      if (data.success) {
        setKeyTestStatus('passed')
        // Show success for 1.5s before saving
        setTimeout(() => doSaveKey(), 1500)
      } else {
        setKeyTestStatus('failed')
      }
    } catch {
      setKeyTestSteps([{ name: 'models', status: 'fail', message: 'Network error' }])
      setKeyTestStatus('failed')
    }
  }, [defaultModels.analysisModel, doSaveKey, models, provider.baseUrl, providerKey, tempKey])

  const handleForceSaveKey = useCallback(() => {
    doSaveKey()
  }, [doSaveKey])

  // 纯测试：不保存，结果持久展示直到用户手动关闭
  const handleTestOnly = useCallback(async () => {
    setKeyTestStatus('testing')
    setKeyTestSteps([])
    try {
      const fallbackLlmModel = pickConfiguredLlmModel({
        models,
        defaultAnalysisModel: defaultModels.analysisModel,
      })
      const payload = buildProviderConnectionPayload({
        providerKey,
        apiKey: provider.apiKey || '',
        baseUrl: provider.baseUrl,
        llmModel: fallbackLlmModel,
      })
      const res = await apiFetch('/api/user/api-config/test-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      setKeyTestSteps(data.steps || [])
      setKeyTestStatus(data.success ? 'passed' : 'failed')
    } catch {
      setKeyTestSteps([{ name: 'models', status: 'fail', message: 'Network error' }])
      setKeyTestStatus('failed')
    }
  }, [defaultModels.analysisModel, models, provider.apiKey, provider.baseUrl, providerKey])

  const handleDismissTest = useCallback(() => {
    setKeyTestStatus('idle')
    setKeyTestSteps([])
  }, [])

  const handleCancelEdit = () => {
    setTempKey(provider.apiKey || '')
    setIsEditing(false)
    setKeyTestStatus('idle')
    setKeyTestSteps([])
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

  const resolveProbeFailureMessage = (error: unknown): string => {
    const code = error instanceof Error ? error.message : ''
    if (code === 'PROBE_AUTH_FAILED') return t('probeAuthFailed')
    if (code === 'PROBE_INCONCLUSIVE') return t('probeInconclusive')
    if (code === 'MODEL_LLM_PROTOCOL_PROBE_REQUEST_FAILED') return t('probeRequestFailed')
    return t('probeLlmProtocolFailed')
  }

  const flushConfigBeforeProbe = useCallback(async (): Promise<boolean> => {
    if (!onFlushConfig) return true
    try {
      await onFlushConfig()
      return true
    } catch {
      alert(t('flushConfigFailed'))
      return false
    }
  }, [onFlushConfig, t])

  const handleSaveModel = async (originalModelKey: string): Promise<void> => {
    if (isModelSavePending) return
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

    setIsModelSavePending(true)
    try {
      const originalModel = all.find((model) => model.modelKey === originalModelKey)
      let protocolUpdates: Pick<CustomModel, 'llmProtocol' | 'llmProtocolCheckedAt'> | null = null
      if (originalModel && shouldReprobeModelLlmProtocol({
        providerId: provider.id,
        originalModel,
        nextModelId: editModel.modelId,
      })) {
        const flushed = await flushConfigBeforeProbe()
        if (!flushed) return

        try {
          protocolUpdates = await probeModelLlmProtocolViaApi({
            providerId: provider.id,
            modelId: editModel.modelId,
          })
        } catch (error) {
          alert(resolveProbeFailureMessage(error))
          return
        }
      }

      onUpdateModel?.(originalModelKey, {
        name: editModel.name,
        modelId: editModel.modelId,
        ...(protocolUpdates ? protocolUpdates : {}),
      })

      handleCancelEditModel()
    } finally {
      setIsModelSavePending(false)
    }
  }

  const handleAddModel = async (type: ProviderCardModelType): Promise<void> => {
    if (isModelSavePending) return
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

    setIsModelSavePending(true)
    try {
      let protocolFields: Pick<CustomModel, 'llmProtocol' | 'llmProtocolCheckedAt'> | null = null
      if (shouldProbeModelLlmProtocol({ providerId: provider.id, modelType: type })) {
        const flushed = await flushConfigBeforeProbe()
        if (!flushed) return

        try {
          protocolFields = await probeModelLlmProtocolViaApi({
            providerId: provider.id,
            modelId: finalModelId,
          })
        } catch (error) {
          alert(resolveProbeFailureMessage(error))
          return
        }
      }

      onAddModel({
        modelId: finalModelId,
        modelKey: finalModelKey,
        name: finalName,
        type,
        provider: provider.id,
        price: 0,
        ...(protocolFields ? protocolFields : {}),
      })

      setNewModel(EMPTY_MODEL_FORM)
      setBatchMode(false)
      setShowAddForm(null)
    } finally {
      setIsModelSavePending(false)
    }
  }

  const handleCancelAdd = () => {
    setShowAddForm(null)
    setNewModel(EMPTY_MODEL_FORM)
    setBatchMode(false)
  }

  const upsertModelFromAssistantDraft = useCallback((draft: AssistantDraftModel) => {
    const modelKey = encodeModelKey(draft.provider, draft.modelId)
    const checkedAt = new Date().toISOString()
    const currentModels = allModels || models
    const existed = currentModels.find((item) => item.modelKey === modelKey)
    if (existed) {
      onUpdateModel?.(modelKey, {
        name: draft.name,
        modelId: draft.modelId,
        provider: draft.provider,
        compatMediaTemplate: draft.compatMediaTemplate,
        compatMediaTemplateCheckedAt: checkedAt,
        compatMediaTemplateSource: 'ai',
      })
      return
    }
    onAddModel({
      modelId: draft.modelId,
      modelKey,
      name: draft.name,
      type: draft.type,
      provider: draft.provider,
      price: 0,
      compatMediaTemplate: draft.compatMediaTemplate,
      compatMediaTemplateCheckedAt: checkedAt,
      compatMediaTemplateSource: 'ai',
    })
  }, [allModels, models, onAddModel, onUpdateModel])

  const assistantChat = useAssistantChat({
    assistantId: 'api-config-template',
    context: { providerId: provider.id },
    enabled: assistantEnabled,
    onSaved: (event) => {
      setAssistantSavedEvent(event)
      if (event.draftModel) {
        upsertModelFromAssistantDraft(event.draftModel)
        return
      }
      onUpdateModel?.(event.savedModelKey, {
        compatMediaTemplateSource: 'ai',
      })
    },
  })

  const openAssistant = useCallback(() => {
    if (!assistantEnabled) return
    setAssistantSavedEvent(null)
    setIsAssistantOpen(true)
  }, [assistantEnabled])

  const closeAssistant = useCallback(() => {
    setIsAssistantOpen(false)
    setAssistantSavedEvent(null)
    assistantChat.clear()
  }, [assistantChat])

  const handleAssistantSend = useCallback(async (content?: string): Promise<void> => {
    if (!assistantEnabled || assistantChat.pending || assistantSavedEvent !== null) return
    const flushed = await flushConfigBeforeProbe()
    if (!flushed) return
    await assistantChat.send(content)
  }, [
    assistantEnabled,
    assistantChat,
    assistantSavedEvent,
    flushConfigBeforeProbe,
  ])

  const maskedKey = (() => {
    const key = provider.apiKey || ''
    if (key.length <= 8) return '•'.repeat(key.length)
    return `${key.slice(0, 4)}${'•'.repeat(50)}`
  })()

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
    needsCustomPricing: false,
    keyTestStatus,
    keyTestSteps,
    handleForceSaveKey,
    handleTestOnly,
    handleDismissTest,
    isModelSavePending,
    assistantEnabled,
    isAssistantOpen,
    assistantSavedEvent,
    assistantChat,
    openAssistant,
    closeAssistant,
    handleAssistantSend,
  }
}
