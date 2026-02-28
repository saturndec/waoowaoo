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

type ApiModeType = 'gemini-sdk' | 'openai-official'
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

interface StoredModelLlmCustomPricing {
  inputPerMillion?: number
  outputPerMillion?: number
}

interface StoredModelMediaCustomPricing {
  basePrice?: number
  optionPrices?: Record<string, Record<string, number>>
}

interface StoredModelCustomPricing {
  llm?: StoredModelLlmCustomPricing
  image?: StoredModelMediaCustomPricing
  video?: StoredModelMediaCustomPricing
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
const OPTIONAL_PRICING_PROVIDER_KEYS = new Set(['openai-compatible', 'gemini-compatible'])

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
      const llmPricing = model.customPricing.llm
      if (typeof llmPricing?.inputPerMillion === 'number' && typeof llmPricing.outputPerMillion === 'number') {
        const minPrice = Math.min(llmPricing.inputPerMillion, llmPricing.outputPerMillion)
        const maxPrice = Math.max(llmPricing.inputPerMillion, llmPricing.outputPerMillion)
        return {
          ...model,
          price: minPrice,
          priceMin: minPrice,
          priceMax: maxPrice,
          priceLabel: `${formatPriceAmount(minPrice)}~${formatPriceAmount(maxPrice)}`,
          priceInput: llmPricing.inputPerMillion,
          priceOutput: llmPricing.outputPerMillion,
        }
      }

      const mediaPricing = model.type === 'image'
        ? model.customPricing.image
        : model.type === 'video'
          ? model.customPricing.video
          : undefined
      if (mediaPricing) {
        const basePrice = typeof mediaPricing.basePrice === 'number' ? mediaPricing.basePrice : 0
        let minExtra = 0
        let maxExtra = 0
        if (mediaPricing.optionPrices) {
          for (const optionMap of Object.values(mediaPricing.optionPrices)) {
            const values = Object.values(optionMap).filter((value) => Number.isFinite(value))
            if (values.length === 0) continue
            minExtra += Math.min(...values)
            maxExtra += Math.max(...values)
          }
        }
        const minPrice = basePrice + minExtra
        const maxPrice = basePrice + maxExtra
        return {
          ...model,
          price: minPrice,
          priceMin: minPrice,
          priceMax: maxPrice,
          priceLabel: minPrice === maxPrice
            ? formatPriceAmount(minPrice)
            : `${formatPriceAmount(minPrice)}~${formatPriceAmount(maxPrice)}`,
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
  return value === 'gemini-sdk' || value === 'openai-official'
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

function readNonNegativeNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined
  }
  return value
}

function parseNonNegativeNumberStrict(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined
  const parsed = readNonNegativeNumber(value)
  if (parsed !== undefined) return parsed
  throw new ApiError('INVALID_PARAMS', {
    code: 'MODEL_CUSTOM_PRICING_INVALID',
    field,
  })
}

function validateAllowedObjectKeys(
  raw: Record<string, unknown>,
  allowed: readonly string[],
  field: string,
) {
  const allowedSet = new Set(allowed)
  for (const key of Object.keys(raw)) {
    if (allowedSet.has(key)) continue
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_CUSTOM_PRICING_INVALID',
      field: `${field}.${key}`,
    })
  }
}

function normalizeOptionPrices(
  raw: unknown,
  options?: { strict?: boolean; field?: string },
): Record<string, Record<string, number>> | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!isRecord(raw)) {
    if (options?.strict) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'MODEL_CUSTOM_PRICING_INVALID',
        field: options.field || 'models.customPricing.optionPrices',
      })
    }
    return undefined
  }

  const normalized: Record<string, Record<string, number>> = {}
  for (const [field, rawFieldPricing] of Object.entries(raw)) {
    if (!isRecord(rawFieldPricing)) {
      if (options?.strict) {
        throw new ApiError('INVALID_PARAMS', {
          code: 'MODEL_CUSTOM_PRICING_INVALID',
          field: options.field ? `${options.field}.${field}` : `models.customPricing.optionPrices.${field}`,
        })
      }
      continue
    }
    const fieldPricing: Record<string, number> = {}
    for (const [optionValue, rawAmount] of Object.entries(rawFieldPricing)) {
      const amount = options?.strict
        ? parseNonNegativeNumberStrict(
          rawAmount,
          options.field
            ? `${options.field}.${field}.${optionValue}`
            : `models.customPricing.optionPrices.${field}.${optionValue}`,
        )
        : readNonNegativeNumber(rawAmount)
      if (amount === undefined) continue
      fieldPricing[optionValue] = amount
    }
    if (Object.keys(fieldPricing).length > 0) {
      normalized[field] = fieldPricing
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined
}

function normalizeMediaCustomPricing(
  raw: unknown,
  options?: { strict?: boolean; field?: string },
): StoredModelMediaCustomPricing | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!isRecord(raw)) {
    if (options?.strict) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'MODEL_CUSTOM_PRICING_INVALID',
        field: options.field || 'models.customPricing',
      })
    }
    return undefined
  }
  if (options?.strict) {
    validateAllowedObjectKeys(raw, ['basePrice', 'optionPrices'], options.field || 'models.customPricing')
  }
  const basePrice = options?.strict
    ? parseNonNegativeNumberStrict(raw.basePrice, options.field ? `${options.field}.basePrice` : 'models.customPricing.basePrice')
    : readNonNegativeNumber(raw.basePrice)
  const optionPrices = normalizeOptionPrices(raw.optionPrices, {
    strict: options?.strict,
    field: options?.field ? `${options.field}.optionPrices` : 'models.customPricing.optionPrices',
  })
  if (basePrice === undefined && optionPrices === undefined) return undefined

  return {
    ...(basePrice !== undefined ? { basePrice } : {}),
    ...(optionPrices ? { optionPrices } : {}),
  }
}

function normalizeCustomPricing(
  raw: unknown,
  options?: { strict?: boolean; field?: string },
): StoredModelCustomPricing | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!isRecord(raw)) {
    if (options?.strict) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'MODEL_CUSTOM_PRICING_INVALID',
        field: options.field || 'models.customPricing',
      })
    }
    return undefined
  }
  if (options?.strict) {
    validateAllowedObjectKeys(raw, ['llm', 'image', 'video', 'input', 'output'], options.field || 'models.customPricing')
  }

  const llmRaw = isRecord(raw.llm) ? raw.llm : raw
  if (options?.strict && raw.llm !== undefined && !isRecord(raw.llm)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_CUSTOM_PRICING_INVALID',
      field: options.field ? `${options.field}.llm` : 'models.customPricing.llm',
    })
  }
  if (options?.strict && isRecord(raw.llm)) {
    validateAllowedObjectKeys(raw.llm, ['inputPerMillion', 'outputPerMillion'], options.field ? `${options.field}.llm` : 'models.customPricing.llm')
  }
  const inputPerMillion = options?.strict
    ? parseNonNegativeNumberStrict(llmRaw.inputPerMillion, options.field ? `${options.field}.llm.inputPerMillion` : 'models.customPricing.llm.inputPerMillion')
    : readNonNegativeNumber(llmRaw.inputPerMillion)
  const outputPerMillion = options?.strict
    ? parseNonNegativeNumberStrict(llmRaw.outputPerMillion, options.field ? `${options.field}.llm.outputPerMillion` : 'models.customPricing.llm.outputPerMillion')
    : readNonNegativeNumber(llmRaw.outputPerMillion)
  // Legacy bridge: migrate old shape { input, output } into llm.*
  const legacyInput = options?.strict
    ? parseNonNegativeNumberStrict((raw as Record<string, unknown>).input, options.field ? `${options.field}.input` : 'models.customPricing.input')
    : readNonNegativeNumber((raw as Record<string, unknown>).input)
  const legacyOutput = options?.strict
    ? parseNonNegativeNumberStrict((raw as Record<string, unknown>).output, options.field ? `${options.field}.output` : 'models.customPricing.output')
    : readNonNegativeNumber((raw as Record<string, unknown>).output)
  const llm = (inputPerMillion !== undefined || outputPerMillion !== undefined || legacyInput !== undefined || legacyOutput !== undefined)
    ? {
      ...(inputPerMillion !== undefined ? { inputPerMillion } : {}),
      ...(outputPerMillion !== undefined ? { outputPerMillion } : {}),
      ...(inputPerMillion === undefined && legacyInput !== undefined ? { inputPerMillion: legacyInput } : {}),
      ...(outputPerMillion === undefined && legacyOutput !== undefined ? { outputPerMillion: legacyOutput } : {}),
    }
    : undefined
  if (
    options?.strict
    && llm
    && (
      typeof llm.inputPerMillion !== 'number'
      || typeof llm.outputPerMillion !== 'number'
    )
  ) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_CUSTOM_PRICING_INVALID',
      field: options.field ? `${options.field}.llm` : 'models.customPricing.llm',
    })
  }

  const image = normalizeMediaCustomPricing(raw.image, {
    strict: options?.strict,
    field: options?.field ? `${options.field}.image` : 'models.customPricing.image',
  })
  const video = normalizeMediaCustomPricing(raw.video, {
    strict: options?.strict,
    field: options?.field ? `${options.field}.video` : 'models.customPricing.video',
  })

  if (!llm && !image && !video) return undefined
  return {
    ...(llm ? { llm } : {}),
    ...(image ? { image } : {}),
    ...(video ? { video } : {}),
  }
}

function normalizeStoredModel(raw: unknown, index: number, options?: { strictCustomPricing?: boolean }): StoredModel {
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

  const customPricing = normalizeCustomPricing(raw.customPricing, {
    strict: options?.strictCustomPricing,
    field: `models[${index}].customPricing`,
  })

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

  return rawModels.map((item, index) => normalizeStoredModel(item, index, { strictCustomPricing: true }))
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
    if (model.type === 'lipsync' && providerKey !== 'fal' && providerKey !== 'vidu') {
      throw new ApiError('INVALID_PARAMS', {
        code: 'MODEL_PROVIDER_TYPE_UNSUPPORTED',
        field: `models[${index}].provider`,
      })
    }
  }
}

function validateCustomPricingCapabilityMappings(models: StoredModel[]) {
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index]
    if (model.type !== 'image' && model.type !== 'video') continue

    const mediaPricing = model.type === 'image'
      ? model.customPricing?.image
      : model.customPricing?.video
    const optionPrices = mediaPricing?.optionPrices
    if (!optionPrices || Object.keys(optionPrices).length === 0) continue

    const context = resolveBuiltinModelContext(model.type, model.modelKey)
    if (!context) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'CAPABILITY_MODEL_UNSUPPORTED',
        field: `models[${index}].customPricing.${model.type}.optionPrices`,
      })
    }

    const optionFields = getCapabilityOptionFields(model.type, context.capabilities)
    for (const [field, optionMap] of Object.entries(optionPrices)) {
      const allowedValues = optionFields[field]
      if (!allowedValues) {
        throw new ApiError('INVALID_PARAMS', {
          code: 'CAPABILITY_FIELD_INVALID',
          field: `models[${index}].customPricing.${model.type}.optionPrices.${field}`,
        })
      }
      for (const optionValue of Object.keys(optionMap)) {
        if (allowedValues.includes(optionValue)) continue
        throw new ApiError('INVALID_PARAMS', {
          code: 'CAPABILITY_VALUE_NOT_ALLOWED',
          field: `models[${index}].customPricing.${model.type}.optionPrices.${field}.${optionValue}`,
          allowedValues,
        })
      }
    }
  }
}



function hasBuiltinPricingForModel(apiType: PricingApiType, provider: string, modelId: string): boolean {
  // findBuiltinPricingCatalogEntry handles providerKey stripping and alias fallback internally
  return !!findBuiltinPricingCatalogEntry(apiType, provider, modelId)
}

function hasCustomPricingForType(model: StoredModel): boolean {
  if (!model.customPricing) return false
  if (model.type === 'llm') {
    return (
      typeof model.customPricing.llm?.inputPerMillion === 'number'
      && typeof model.customPricing.llm?.outputPerMillion === 'number'
    )
  }
  if (model.type === 'image') {
    const imagePricing = model.customPricing.image
    return (
      typeof imagePricing?.basePrice === 'number'
      || (isRecord(imagePricing?.optionPrices) && Object.keys(imagePricing.optionPrices).length > 0)
    )
  }
  if (model.type === 'video') {
    const videoPricing = model.customPricing.video
    return (
      typeof videoPricing?.basePrice === 'number'
      || (isRecord(videoPricing?.optionPrices) && Object.keys(videoPricing.optionPrices).length > 0)
    )
  }
  return false
}

function validateBillableModelPricing(models: StoredModel[]) {
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index]
    const apiType = BILLABLE_MODEL_TYPE_TO_PRICING_API_TYPE[model.type]
    if (!apiType) continue

    // Skip validation if user provided custom pricing
    if (hasCustomPricingForType(model)) continue
    if (OPTIONAL_PRICING_PROVIDER_KEYS.has(getProviderKey(model.provider))) continue

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
    [...models, ...disabledPresets],
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
    validateCustomPricingCapabilityMappings(normalizedModels)
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
