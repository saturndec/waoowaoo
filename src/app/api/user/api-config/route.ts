/**
 * 用户 API 配置管理接口
 *
 * GET  - 读取用户配置(解密)
 * PUT  - 保存/更新配置(加密)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { encryptApiKey, decryptApiKey } from '@/lib/crypto-utils'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import {
  composeModelKey,
  parseModelKeyStrict,
  type CapabilitySelections,
  type ModelCapabilities,
  type UnifiedModelType,
} from '@/lib/model-config-contract'
import {
  getCapabilityOptionFields,
  resolveBuiltinModelContext,
  validateCapabilitySelectionsPayload,
} from '@/lib/model-capabilities/lookup'
import { findBuiltinCapabilities } from '@/lib/model-capabilities/catalog'
import {
  findBuiltinPricingCatalogEntry,
  listBuiltinPricingCatalog,
  type PricingApiType,
} from '@/lib/model-pricing/catalog'
import { getBillingMode } from '@/lib/billing/mode'

type ApiModeType = 'gemini-sdk'
type DefaultModelField =
  | 'analysisModel'
  | 'characterModel'
  | 'locationModel'
  | 'storyboardModel'
  | 'editModel'
  | 'videoModel'
  | 'lipSyncModel'

interface StoredProvider {
  id: string
  name: string
  baseUrl?: string
  apiKey?: string
  apiMode?: ApiModeType
}

interface StoredModelCustomPricing {
  input?: number
  output?: number
}

interface StoredModel {
  modelId: string
  modelKey: string
  name: string
  type: UnifiedModelType
  provider: string
  // Non-authoritative display field; billing always uses server pricing catalog.
  price: number
  priceMin?: number
  priceMax?: number
  priceLabel?: string
  priceInput?: number
  priceOutput?: number
  capabilities?: ModelCapabilities
  customPricing?: StoredModelCustomPricing
}

interface PricingDisplayItem {
  min: number
  max: number
  label: string
  input?: number
  output?: number
}

type PricingDisplayMap = Record<string, PricingDisplayItem>

interface DefaultModelsPayload {
  analysisModel?: string
  characterModel?: string
  locationModel?: string
  storyboardModel?: string
  editModel?: string
  videoModel?: string
  lipSyncModel?: string
}

interface ApiConfigPutBody {
  models?: unknown
  providers?: unknown
  defaultModels?: unknown
  capabilityDefaults?: unknown
}

const DEFAULT_MODEL_FIELDS: DefaultModelField[] = [
  'analysisModel',
  'characterModel',
  'locationModel',
  'storyboardModel',
  'editModel',
  'videoModel',
  'lipSyncModel',
]
const CAPABILITY_MODEL_TYPES: readonly UnifiedModelType[] = [
  'image',
  'video',
  'llm',
  'audio',
  'lipsync',
]
const BILLABLE_MODEL_TYPE_TO_PRICING_API_TYPE: Readonly<Record<UnifiedModelType, PricingApiType | null>> = {
  llm: 'text',
  image: 'image',
  video: 'video',
  audio: 'voice',
  lipsync: 'lip-sync',
}
const DEFAULT_FIELD_TO_PRICING_API_TYPE: Readonly<Record<DefaultModelField, 'text' | 'image' | 'video' | 'lip-sync'>> = {
  analysisModel: 'text',
  characterModel: 'image',
  locationModel: 'image',
  storyboardModel: 'image',
  editModel: 'image',
  videoModel: 'video',
  lipSyncModel: 'lip-sync',
}
const DEFAULT_LIPSYNC_MODEL_KEY = composeModelKey('fal', 'fal-ai/kling-video/lipsync/audio-to-video')

/**
 * Provider keys that share pricing/capability catalogs with a canonical provider.
 * gemini-compatible uses the same models/pricing as google.
 */
const PRICING_PROVIDER_ALIASES: Readonly<Record<string, string>> = {
  'gemini-compatible': 'google',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function formatPriceAmount(amount: number): string {
  const fixed = amount.toFixed(4)
  const normalized = fixed.replace(/\.?0+$/, '')
  return normalized || '0'
}

function pricingApiTypeToModelType(apiType: PricingApiType): UnifiedModelType | null {
  if (apiType === 'text') return 'llm'
  if (apiType === 'image') return 'image'
  if (apiType === 'video') return 'video'
  if (apiType === 'voice') return 'audio'
  if (apiType === 'lip-sync') return 'lipsync'
  return null
}

function composePricingDisplayKey(modelType: UnifiedModelType, provider: string, modelId: string): string {
  return `${modelType}::${provider}::${modelId}`
}

function resolveVideoDurationRangeFromCapabilities(
  provider: string,
  modelId: string,
): { min: number; max: number } | null {
  const capabilities = findBuiltinCapabilities('video', provider, modelId)
  const options = capabilities?.video?.durationOptions
  if (!Array.isArray(options) || options.length === 0) return null

  const durations = options.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (durations.length === 0) return null
  return {
    min: Math.min(...durations),
    max: Math.max(...durations),
  }
}

function applyVideoDurationRangeIfNeeded(input: {
  apiType: PricingApiType
  provider: string
  modelId: string
  min: number
  max: number
  hasDurationTier: boolean
}): { min: number; max: number } {
  if (input.apiType !== 'video') return { min: input.min, max: input.max }
  if (input.hasDurationTier) return { min: input.min, max: input.max }

  const durationRange = resolveVideoDurationRangeFromCapabilities(input.provider, input.modelId)
  if (!durationRange) return { min: input.min, max: input.max }

  // Ark/视频展示口径：未显式按秒建 tier 时，现有金额按 5 秒基准估算，区间扩展为 [最短秒, 最长秒]。
  const BASE_DURATION_SECONDS = durationRange.min <= 5 && durationRange.max >= 5
    ? 5
    : durationRange.min
  if (BASE_DURATION_SECONDS <= 0) return { min: input.min, max: input.max }

  const scaledMin = input.min * (durationRange.min / BASE_DURATION_SECONDS)
  const scaledMax = input.max * (durationRange.max / BASE_DURATION_SECONDS)
  return {
    min: scaledMin,
    max: scaledMax,
  }
}

function buildPricingDisplayMap(): PricingDisplayMap {
  const map: PricingDisplayMap = {}
  const entries = listBuiltinPricingCatalog()

  for (const entry of entries) {
    const modelType = pricingApiTypeToModelType(entry.apiType)
    if (!modelType) continue

    let min = 0
    let max = 0
    let input: number | undefined
    let output: number | undefined
    if (entry.pricing.mode === 'flat') {
      const amount = entry.pricing.flatAmount ?? 0
      min = amount
      max = amount
    } else {
      const tiers = entry.pricing.tiers || []
      const amounts = tiers.map((tier) => tier.amount)
      if (amounts.length === 0) continue
      const hasDurationTier = tiers.some((tier) => typeof tier.when.duration === 'number')

      const durationExpanded = applyVideoDurationRangeIfNeeded({
        apiType: entry.apiType,
        provider: entry.provider,
        modelId: entry.modelId,
        min: Math.min(...amounts),
        max: Math.max(...amounts),
        hasDurationTier,
      })
      min = durationExpanded.min
      max = durationExpanded.max

      if (entry.apiType === 'text') {
        for (const tier of tiers) {
          const tokenType = tier.when.tokenType
          if (tokenType === 'input') input = tier.amount
          if (tokenType === 'output') output = tier.amount
        }
      }
    }

    map[composePricingDisplayKey(modelType, entry.provider, entry.modelId)] = {
      min,
      max,
      label: min === max
        ? formatPriceAmount(min)
        : `${formatPriceAmount(min)}~${formatPriceAmount(max)}`,
      ...(typeof input === 'number' ? { input } : {}),
      ...(typeof output === 'number' ? { output } : {}),
    }
  }

  return map
}

function resolvePricingDisplayItem(
  map: PricingDisplayMap,
  modelType: UnifiedModelType,
  provider: string,
  modelId: string,
): PricingDisplayItem | null {
  const exact = map[composePricingDisplayKey(modelType, provider, modelId)]
  if (exact) return exact

  const providerKey = getProviderKey(provider)
  if (providerKey !== provider) {
    const fallback = map[composePricingDisplayKey(modelType, providerKey, modelId)]
    if (fallback) return fallback
  }

  // Fallback: check canonical provider alias (e.g. gemini-compatible → google)
  const aliasTarget = PRICING_PROVIDER_ALIASES[providerKey]
  if (aliasTarget) {
    const aliasFallback = map[composePricingDisplayKey(modelType, aliasTarget, modelId)]
    if (aliasFallback) return aliasFallback
  }
  return null
}

function withDisplayPricing(model: StoredModel, map: PricingDisplayMap): StoredModel {
  const display = resolvePricingDisplayItem(map, model.type, model.provider, model.modelId)
  if (!display) {
    // Derive display from user custom pricing if available
    if (model.customPricing) {
      if (typeof model.customPricing.input === 'number' && typeof model.customPricing.output === 'number') {
        const minPrice = Math.min(model.customPricing.input, model.customPricing.output)
        const maxPrice = Math.max(model.customPricing.input, model.customPricing.output)
        return {
          ...model,
          price: minPrice,
          priceMin: minPrice,
          priceMax: maxPrice,
          priceLabel: `${formatPriceAmount(minPrice)}~${formatPriceAmount(maxPrice)}`,
          priceInput: model.customPricing.input,
          priceOutput: model.customPricing.output,
        }
      }
    }
    return {
      ...model,
      price: 0,
      priceLabel: '--',
      priceMin: undefined,
      priceMax: undefined,
    }
  }

  return {
    ...model,
    price: display.min,
    priceMin: display.min,
    priceMax: display.max,
    priceLabel: display.label,
    ...(typeof display.input === 'number' ? { priceInput: display.input } : {}),
    ...(typeof display.output === 'number' ? { priceOutput: display.output } : {}),
  }
}

function getProviderKey(providerId: string): string {
  const index = providerId.indexOf(':')
  return index === -1 ? providerId : providerId.slice(0, index)
}

function isUnifiedModelType(value: unknown): value is UnifiedModelType {
  return (
    value === 'llm'
    || value === 'image'
    || value === 'video'
    || value === 'audio'
    || value === 'lipsync'
  )
}

function isApiMode(value: unknown): value is ApiModeType {
  return value === 'gemini-sdk'
}

function resolveProviderByIdOrKey(providers: StoredProvider[], providerId: string): StoredProvider | null {
  const exact = providers.find((provider) => provider.id === providerId)
  if (exact) return exact

  const providerKey = getProviderKey(providerId)
  const candidates = providers.filter((provider) => getProviderKey(provider.id) === providerKey)
  if (candidates.length === 0) return null
  if (candidates.length > 1) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'PROVIDER_AMBIGUOUS',
      field: 'providers',
    })
  }

  return candidates[0]
}

function withBuiltinCapabilities(model: StoredModel): StoredModel {
  const capabilities = findBuiltinCapabilities(model.type, model.provider, model.modelId)
  if (!capabilities) {
    return {
      ...model,
      capabilities: undefined,
    }
  }

  return {
    ...model,
    capabilities,
  }
}

function normalizeStoredModel(raw: unknown, index: number): StoredModel {
  if (!isRecord(raw)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_PAYLOAD_INVALID',
      field: `models[${index}]`,
    })
  }

  const modelType = raw.type
  if (!isUnifiedModelType(modelType)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_TYPE_INVALID',
      field: `models[${index}].type`,
    })
  }

  const providerFromField = readTrimmedString(raw.provider)
  const modelIdFromField = readTrimmedString(raw.modelId)
  const modelKeyFromField = readTrimmedString(raw.modelKey)
  const parsedModelKey = parseModelKeyStrict(modelKeyFromField)

  const provider = providerFromField || parsedModelKey?.provider || ''
  const modelId = modelIdFromField || parsedModelKey?.modelId || ''
  const modelKey = composeModelKey(provider, modelId)

  if (!modelKey) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_KEY_INVALID',
      field: `models[${index}].modelKey`,
    })
  }
  if (modelKeyFromField && (!parsedModelKey || parsedModelKey.modelKey !== modelKey)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_KEY_MISMATCH',
      field: `models[${index}].modelKey`,
    })
  }

  const modelName = readTrimmedString(raw.name) || modelId

  // Parse optional user-defined custom pricing
  let customPricing: StoredModelCustomPricing | undefined
  if (isRecord(raw.customPricing)) {
    const cp = raw.customPricing
    const inputPrice = typeof cp.input === 'number' && Number.isFinite(cp.input) && cp.input >= 0 ? cp.input : undefined
    const outputPrice = typeof cp.output === 'number' && Number.isFinite(cp.output) && cp.output >= 0 ? cp.output : undefined
    if (inputPrice !== undefined || outputPrice !== undefined) {
      customPricing = {
        ...(inputPrice !== undefined ? { input: inputPrice } : {}),
        ...(outputPrice !== undefined ? { output: outputPrice } : {}),
      }
    }
  }

  return {
    modelId,
    modelKey,
    name: modelName,
    type: modelType,
    provider,
    price: 0,
    ...(customPricing ? { customPricing } : {}),
  }
}

function normalizeProvidersInput(rawProviders: unknown): StoredProvider[] {
  if (rawProviders === undefined) return []
  if (!Array.isArray(rawProviders)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'PROVIDER_PAYLOAD_INVALID',
      field: 'providers',
    })
  }

  const normalized: StoredProvider[] = []
  for (let index = 0; index < rawProviders.length; index += 1) {
    const item = rawProviders[index]
    if (!isRecord(item)) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'PROVIDER_PAYLOAD_INVALID',
        field: `providers[${index}]`,
      })
    }
    const id = readTrimmedString(item.id)
    const name = readTrimmedString(item.name)
    if (!id || !name) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'PROVIDER_PAYLOAD_INVALID',
        field: `providers[${index}]`,
      })
    }
    const normalizedId = id.toLowerCase()
    if (normalized.some((provider) => provider.id.toLowerCase() === normalizedId)) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'PROVIDER_DUPLICATE',
        field: `providers[${index}].id`,
      })
    }
    const apiModeRaw = item.apiMode
    if (apiModeRaw !== undefined && !isApiMode(apiModeRaw)) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'PROVIDER_APIMODE_INVALID',
        field: `providers[${index}].apiMode`,
      })
    }

    normalized.push({
      id,
      name,
      baseUrl: readTrimmedString(item.baseUrl) || undefined,
      apiKey: typeof item.apiKey === 'string' ? item.apiKey.trim() : undefined,
      apiMode: apiModeRaw,
    })
  }

  return normalized
}

function normalizeModelList(rawModels: unknown): StoredModel[] {
  if (rawModels === undefined) return []
  if (!Array.isArray(rawModels)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_PAYLOAD_INVALID',
      field: 'models',
    })
  }

  return rawModels.map((item, index) => normalizeStoredModel(item, index))
}

function validateModelProviderConsistency(models: StoredModel[], providers: StoredProvider[]) {
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index]
    const matchedProvider = resolveProviderByIdOrKey(providers, model.provider)
    if (!matchedProvider) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'MODEL_PROVIDER_NOT_FOUND',
        field: `models[${index}].provider`,
      })
    }
  }
}

function validateModelProviderTypeSupport(models: StoredModel[], providers: StoredProvider[]) {
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index]
    const matchedProvider = resolveProviderByIdOrKey(providers, model.provider)
    if (!matchedProvider) continue

    const providerKey = getProviderKey(matchedProvider.id)
    if (providerKey === 'openai-compatible' && model.type !== 'llm') {
      throw new ApiError('INVALID_PARAMS', {
        code: 'MODEL_PROVIDER_TYPE_UNSUPPORTED',
        field: `models[${index}].type`,
      })
    }
    if (model.type === 'lipsync' && providerKey !== 'fal' && providerKey !== 'vidu') {
      throw new ApiError('INVALID_PARAMS', {
        code: 'MODEL_PROVIDER_TYPE_UNSUPPORTED',
        field: `models[${index}].provider`,
      })
    }
  }
}



function hasBuiltinPricingForModel(apiType: PricingApiType, provider: string, modelId: string): boolean {
  // findBuiltinPricingCatalogEntry handles providerKey stripping and alias fallback internally
  return !!findBuiltinPricingCatalogEntry(apiType, provider, modelId)
}

function hasCustomPricingForType(model: StoredModel): boolean {
  if (!model.customPricing) return false
  return typeof model.customPricing.input === 'number' && typeof model.customPricing.output === 'number'
}

function validateBillableModelPricing(models: StoredModel[]) {
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index]
    const apiType = BILLABLE_MODEL_TYPE_TO_PRICING_API_TYPE[model.type]
    if (!apiType) continue

    // Skip validation if user provided custom pricing
    if (hasCustomPricingForType(model)) continue

    if (!hasBuiltinPricingForModel(apiType, model.provider, model.modelId)) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'MODEL_PRICING_NOT_CONFIGURED',
        field: `models[${index}].modelId`,
        modelKey: model.modelKey,
        apiType,
      })
    }
  }
}

function validateDefaultModelKey(field: DefaultModelField, value: unknown): string | null {
  // Contract anchor: default model key must be provider::modelId
  if (value === undefined) return null
  const modelKey = readTrimmedString(value)
  if (!modelKey) return null
  const parsed = parseModelKeyStrict(modelKey)
  if (!parsed) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_KEY_INVALID',
      field: `defaultModels.${field}`,
    })
  }
  return parsed.modelKey
}

function normalizeDefaultModelsInput(rawDefaultModels: unknown): DefaultModelsPayload {
  if (rawDefaultModels === undefined) return {}
  if (!isRecord(rawDefaultModels)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'DEFAULT_MODELS_INVALID',
      field: 'defaultModels',
    })
  }

  const normalized: DefaultModelsPayload = {}
  for (const field of DEFAULT_MODEL_FIELDS) {
    if (rawDefaultModels[field] !== undefined) {
      normalized[field] = validateDefaultModelKey(field, rawDefaultModels[field]) || ''
    }
  }

  return normalized
}

function validateDefaultModelPricing(defaultModels: DefaultModelsPayload) {
  for (const field of DEFAULT_MODEL_FIELDS) {
    const modelKey = defaultModels[field]
    if (!modelKey) continue

    const parsed = parseModelKeyStrict(modelKey)
    if (!parsed) continue
    const apiType = DEFAULT_FIELD_TO_PRICING_API_TYPE[field]

    if (!hasBuiltinPricingForModel(apiType, parsed.provider, parsed.modelId)) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'DEFAULT_MODEL_PRICING_NOT_CONFIGURED',
        field: `defaultModels.${field}`,
        modelKey: parsed.modelKey,
        apiType,
      })
    }
  }
}

function isModelPricedForBilling(model: StoredModel): boolean {
  const apiType = BILLABLE_MODEL_TYPE_TO_PRICING_API_TYPE[model.type]
  if (!apiType) return true
  if (hasCustomPricingForType(model)) return true
  return hasBuiltinPricingForModel(apiType, model.provider, model.modelId)
}

function sanitizeModelsForBilling(models: StoredModel[]): StoredModel[] {
  return models.filter((model) => isModelPricedForBilling(model))
}

function sanitizeDefaultModelsForBilling(defaultModels: DefaultModelsPayload): DefaultModelsPayload {
  const sanitized: DefaultModelsPayload = {}

  for (const field of DEFAULT_MODEL_FIELDS) {
    const rawModelKey = defaultModels[field]
    if (rawModelKey === undefined) continue
    const modelKey = readTrimmedString(rawModelKey)
    if (!modelKey) {
      sanitized[field] = ''
      continue
    }

    const parsed = parseModelKeyStrict(modelKey)
    if (!parsed) {
      sanitized[field] = ''
      continue
    }

    const apiType = DEFAULT_FIELD_TO_PRICING_API_TYPE[field]
    sanitized[field] = hasBuiltinPricingForModel(apiType, parsed.provider, parsed.modelId)
      ? parsed.modelKey
      : ''
  }

  return sanitized
}

function parseStoredProviders(rawProviders: string | null | undefined): StoredProvider[] {
  if (!rawProviders) return []
  let parsedUnknown: unknown
  try {
    parsedUnknown = JSON.parse(rawProviders)
  } catch {
    throw new ApiError('INVALID_PARAMS', {
      code: 'PROVIDER_PAYLOAD_INVALID',
      field: 'customProviders',
    })
  }
  if (!Array.isArray(parsedUnknown)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'PROVIDER_PAYLOAD_INVALID',
      field: 'customProviders',
    })
  }
  return parsedUnknown as StoredProvider[]
}

function parseStoredModels(rawModels: string | null | undefined): StoredModel[] {
  if (!rawModels) return []
  let parsedUnknown: unknown
  try {
    parsedUnknown = JSON.parse(rawModels)
  } catch {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_PAYLOAD_INVALID',
      field: 'customModels',
    })
  }
  if (!Array.isArray(parsedUnknown)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_PAYLOAD_INVALID',
      field: 'customModels',
    })
  }
  const normalized: StoredModel[] = []
  for (let index = 0; index < parsedUnknown.length; index += 1) {
    normalized.push(withBuiltinCapabilities(normalizeStoredModel(parsedUnknown[index], index)))
  }
  return normalized
}

function normalizeCapabilitySelectionsInput(
  raw: unknown,
  options?: { allowLegacyAspectRatio?: boolean },
): CapabilitySelections {
  if (raw === undefined || raw === null) return {}
  if (!isRecord(raw)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'CAPABILITY_SELECTION_INVALID',
      field: 'capabilityDefaults',
    })
  }

  const normalized: CapabilitySelections = {}
  for (const [modelKey, rawSelection] of Object.entries(raw)) {
    if (!isRecord(rawSelection)) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'CAPABILITY_SELECTION_INVALID',
        field: `capabilityDefaults.${modelKey}`,
      })
    }

    const selection: Record<string, string | number | boolean> = {}
    for (const [field, value] of Object.entries(rawSelection)) {
      if (field === 'aspectRatio') {
        if (options?.allowLegacyAspectRatio) continue
        throw new ApiError('INVALID_PARAMS', {
          code: 'CAPABILITY_FIELD_INVALID',
          field: `capabilityDefaults.${modelKey}.${field}`,
        })
      }
      if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
        throw new ApiError('INVALID_PARAMS', {
          code: 'CAPABILITY_SELECTION_INVALID',
          field: `capabilityDefaults.${modelKey}.${field}`,
        })
      }
      selection[field] = value
    }

    if (Object.keys(selection).length > 0) {
      normalized[modelKey] = selection
    }
  }

  return normalized
}

function parseStoredCapabilitySelections(raw: string | null | undefined, field: string): CapabilitySelections {
  if (!raw) return {}

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new ApiError('INVALID_PARAMS', {
      code: 'CAPABILITY_SELECTION_INVALID',
      field,
    })
  }

  return normalizeCapabilitySelectionsInput(parsed, { allowLegacyAspectRatio: true })
}

function serializeCapabilitySelections(selections: CapabilitySelections): string | null {
  if (Object.keys(selections).length === 0) return null
  return JSON.stringify(selections)
}

function buildStoredModelMap(models: StoredModel[]): Map<string, StoredModel> {
  const modelMap = new Map<string, StoredModel>()
  for (const model of models) {
    modelMap.set(model.modelKey, model)
  }
  return modelMap
}

function resolveCapabilityContextForModelKey(
  modelMap: Map<string, StoredModel>,
  modelKey: string,
) {
  const model = modelMap.get(modelKey)
  if (model) {
    return resolveBuiltinModelContext(model.type, model.modelKey) || null
  }

  if (!parseModelKeyStrict(modelKey)) return null
  for (const modelType of CAPABILITY_MODEL_TYPES) {
    const context = resolveBuiltinModelContext(modelType, modelKey)
    if (context) return context
  }
  return null
}

function sanitizeCapabilitySelectionsAgainstModels(
  selections: CapabilitySelections,
  models: StoredModel[],
): CapabilitySelections {
  const modelMap = buildStoredModelMap(models)
  const sanitized: CapabilitySelections = {}

  for (const [modelKey, selection] of Object.entries(selections)) {
    const context = resolveCapabilityContextForModelKey(modelMap, modelKey)
    if (!context) continue

    const optionFields = getCapabilityOptionFields(context.modelType, context.capabilities)
    if (Object.keys(optionFields).length === 0) continue

    const cleanedSelection: Record<string, string | number | boolean> = {}
    for (const [field, value] of Object.entries(selection)) {
      const allowedValues = optionFields[field]
      if (!allowedValues) continue
      if (!allowedValues.includes(value)) continue
      cleanedSelection[field] = value
    }

    if (Object.keys(cleanedSelection).length > 0) {
      sanitized[modelKey] = cleanedSelection
    }
  }

  return sanitized
}

function validateCapabilitySelectionsAgainstModels(
  selections: CapabilitySelections,
  models: StoredModel[],
) {
  const modelMap = buildStoredModelMap(models)
  const issues = validateCapabilitySelectionsPayload(
    selections,
    (modelKey) => resolveCapabilityContextForModelKey(modelMap, modelKey),
  )

  if (issues.length > 0) {
    const firstIssue = issues[0]
    throw new ApiError('INVALID_PARAMS', {
      code: firstIssue.code,
      field: firstIssue.field,
      allowedValues: firstIssue.allowedValues,
    })
  }
}

export const GET = apiHandler(async () => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult
  const userId = session.user.id

  const pref = await prisma.userPreference.findUnique({
    where: { userId },
    select: {
      customModels: true,
      customProviders: true,
      analysisModel: true,
      characterModel: true,
      locationModel: true,
      storyboardModel: true,
      editModel: true,
      videoModel: true,
      lipSyncModel: true,
      capabilityDefaults: true,
    },
  })

  const providers = parseStoredProviders(pref?.customProviders).map((provider) => ({
    ...provider,
    apiKey: provider.apiKey ? decryptApiKey(provider.apiKey) : '',
  }))

  const billingMode = await getBillingMode()
  const parsedModels = parseStoredModels(pref?.customModels)
  const models = billingMode === 'OFF' ? parsedModels : sanitizeModelsForBilling(parsedModels)
  const pricingDisplay = buildPricingDisplayMap()
  const pricedModels = models.map((model) => withDisplayPricing(model, pricingDisplay))

  // 对每个 gemini-compatible provider，注入尚未保存过的 Google preset 模型（disabled，带完整 capabilities）
  // gemini-compatible 本质就是改了 baseURL 和 key，模型和能力与 Google 官方完全一致
  const GEMINI_COMPATIBLE_PRESETS: { type: UnifiedModelType; modelId: string; name: string }[] = [
    { type: 'llm', modelId: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro' },
    { type: 'llm', modelId: 'gemini-3-pro-preview', name: 'Gemini 3 Pro' },
    { type: 'llm', modelId: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' },
    { type: 'image', modelId: 'gemini-3-pro-image-preview', name: 'Banana Pro' },
    { type: 'image', modelId: 'gemini-3.1-flash-image-preview', name: 'Nano Banana 2' },
    { type: 'image', modelId: 'gemini-2.5-flash-image', name: 'Gemini 2.5 Flash Image' },
    { type: 'image', modelId: 'imagen-4.0-generate-001', name: 'Imagen 4' },
    { type: 'image', modelId: 'imagen-4.0-ultra-generate-001', name: 'Imagen 4 Ultra' },
    { type: 'image', modelId: 'imagen-4.0-fast-generate-001', name: 'Imagen 4 Fast' },
    { type: 'video', modelId: 'veo-3.1-generate-preview', name: 'Veo 3.1' },
    { type: 'video', modelId: 'veo-3.1-fast-generate-preview', name: 'Veo 3.1 Fast' },
    { type: 'video', modelId: 'veo-3.0-generate-001', name: 'Veo 3.0' },
    { type: 'video', modelId: 'veo-3.0-fast-generate-001', name: 'Veo 3.0 Fast' },
    { type: 'video', modelId: 'veo-2.0-generate-001', name: 'Veo 2.0' },
  ]
  const savedModelKeys = new Set(pricedModels.map((m) => m.modelKey))
  const disabledPresets: (StoredModel & { enabled: false })[] = []
  for (const p of providers) {
    if (getProviderKey(p.id) !== 'gemini-compatible') continue
    for (const preset of GEMINI_COMPATIBLE_PRESETS) {
      const modelKey = composeModelKey(p.id, preset.modelId)
      if (!modelKey || savedModelKeys.has(modelKey)) continue
      savedModelKeys.add(modelKey)
      const base: StoredModel = {
        modelId: preset.modelId,
        modelKey,
        name: preset.name,
        type: preset.type,
        provider: p.id,
        price: 0,
        // alias 回退自动从 google catalog 获取 capabilities
        capabilities: findBuiltinCapabilities(preset.type, p.id, preset.modelId),
      }
      disabledPresets.push({ ...withDisplayPricing(base, pricingDisplay), enabled: false })
    }
  }

  const rawDefaults: DefaultModelsPayload = {
    analysisModel: pref?.analysisModel || '',
    characterModel: pref?.characterModel || '',
    locationModel: pref?.locationModel || '',
    storyboardModel: pref?.storyboardModel || '',
    editModel: pref?.editModel || '',
    videoModel: pref?.videoModel || '',
    lipSyncModel: pref?.lipSyncModel || DEFAULT_LIPSYNC_MODEL_KEY,
  }
  const defaultModels = billingMode === 'OFF'
    ? rawDefaults
    : sanitizeDefaultModelsForBilling(rawDefaults)
  const capabilityDefaults = sanitizeCapabilitySelectionsAgainstModels(
    parseStoredCapabilitySelections(pref?.capabilityDefaults, 'capabilityDefaults'),
    models,
  )

  return NextResponse.json({
    models: [...pricedModels, ...disabledPresets],
    providers,
    defaultModels,
    capabilityDefaults,
    pricingDisplay,
  })
})

export const PUT = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult
  const userId = session.user.id

  const body = (await request.json()) as ApiConfigPutBody
  const normalizedModels = body.models === undefined ? undefined : normalizeModelList(body.models)
  const normalizedProviders = body.providers === undefined ? undefined : normalizeProvidersInput(body.providers)
  const normalizedDefaults = body.defaultModels === undefined ? undefined : normalizeDefaultModelsInput(body.defaultModels)
  const normalizedCapabilityDefaults = body.capabilityDefaults === undefined
    ? undefined
    : normalizeCapabilitySelectionsInput(body.capabilityDefaults)
  const billingMode = await getBillingMode()

  const updateData: Record<string, unknown> = {}
  const existingPref = await prisma.userPreference.findUnique({
    where: { userId },
    select: {
      customProviders: true,
      customModels: true,
    },
  })
  const existingProviders = parseStoredProviders(existingPref?.customProviders)
  const existingModels = parseStoredModels(existingPref?.customModels)

  const providerSourceForValidation = normalizedProviders ?? existingProviders
  if (normalizedModels !== undefined) {
    validateModelProviderConsistency(normalizedModels, providerSourceForValidation)
    validateModelProviderTypeSupport(normalizedModels, providerSourceForValidation)
    if (billingMode !== 'OFF') {
      validateBillableModelPricing(normalizedModels)
    }
  }

  if (normalizedModels !== undefined) {
    updateData.customModels = JSON.stringify(normalizedModels)
  }

  if (normalizedProviders !== undefined) {
    const providersToSave = normalizedProviders.map((provider) => {
      const existing = existingProviders.find((candidate) => candidate.id === provider.id)
      let finalApiKey: string | undefined
      if (provider.apiKey === undefined) {
        finalApiKey = existing?.apiKey
      } else if (provider.apiKey === '') {
        finalApiKey = undefined
      } else {
        finalApiKey = encryptApiKey(provider.apiKey)
      }

      return {
        id: provider.id,
        name: provider.name,
        baseUrl: provider.baseUrl,
        apiMode: provider.apiMode,
        apiKey: finalApiKey,
      }
    })
    updateData.customProviders = JSON.stringify(providersToSave)
  }

  if (normalizedDefaults !== undefined) {
    if (billingMode !== 'OFF') {
      validateDefaultModelPricing(normalizedDefaults)
    }
    if (normalizedDefaults.analysisModel !== undefined) {
      updateData.analysisModel = normalizedDefaults.analysisModel || null
    }
    if (normalizedDefaults.characterModel !== undefined) {
      updateData.characterModel = normalizedDefaults.characterModel || null
    }
    if (normalizedDefaults.locationModel !== undefined) {
      updateData.locationModel = normalizedDefaults.locationModel || null
    }
    if (normalizedDefaults.storyboardModel !== undefined) {
      updateData.storyboardModel = normalizedDefaults.storyboardModel || null
    }
    if (normalizedDefaults.editModel !== undefined) {
      updateData.editModel = normalizedDefaults.editModel || null
    }
    if (normalizedDefaults.videoModel !== undefined) {
      updateData.videoModel = normalizedDefaults.videoModel || null
    }
    if (normalizedDefaults.lipSyncModel !== undefined) {
      updateData.lipSyncModel = normalizedDefaults.lipSyncModel || null
    }
  }

  if (normalizedCapabilityDefaults !== undefined) {
    const modelSource = normalizedModels ?? existingModels
    const cleanedCapabilityDefaults = sanitizeCapabilitySelectionsAgainstModels(
      normalizedCapabilityDefaults,
      modelSource,
    )
    validateCapabilitySelectionsAgainstModels(cleanedCapabilityDefaults, modelSource)
    updateData.capabilityDefaults = serializeCapabilitySelections(cleanedCapabilityDefaults)
  }

  await prisma.userPreference.upsert({
    where: { userId },
    update: updateData,
    create: { userId, ...updateData },
  })

  return NextResponse.json({ success: true })
})
