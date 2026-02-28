/**
 * API 配置读取器（配置中心严格模式）
 *
 * 规则：
 * 1) 模型唯一键必须是 provider::modelId
 * 2) 禁止 provider 猜测、静态映射、默认降级
 * 3) 运行时只从配置中心读取 provider 与密钥
 */

import { prisma } from './prisma'
import { decryptApiKey } from './crypto-utils'
import {
  composeModelKey,
  parseModelKeyStrict,
  type UnifiedModelType,
} from './model-config-contract'

export interface CustomModel {
  modelId: string
  modelKey: string
  name: string
  type: UnifiedModelType
  provider: string
  // Non-authoritative display field; billing uses unified server pricing catalog.
  price: number
}

export type ModelMediaType = 'llm' | 'image' | 'video' | 'audio' | 'lipsync'

export interface ModelSelection {
  provider: string
  modelId: string
  modelKey: string
  mediaType: ModelMediaType
}

interface CustomProvider {
  id: string
  name: string
  baseUrl?: string
  apiKey?: string
  apiMode?: 'gemini-sdk' | 'openai-official'
}

function normalizeProviderBaseUrl(providerId: string, rawBaseUrl?: string): string | undefined {
  const baseUrl = readTrimmedString(rawBaseUrl)
  if (!baseUrl) return undefined
  if (getProviderKey(providerId) !== 'openai-compatible') return baseUrl

  try {
    const parsed = new URL(baseUrl)
    const pathSegments = parsed.pathname.split('/').filter(Boolean)
    const hasV1 = pathSegments.includes('v1')
    if (hasV1) return baseUrl

    const trimmedPath = parsed.pathname.replace(/\/+$/, '')
    parsed.pathname = `${trimmedPath === '' || trimmedPath === '/' ? '' : trimmedPath}/v1`
    return parsed.toString()
  } catch {
    // Keep original value to avoid hiding invalid-config errors.
    return baseUrl
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
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

function assertModelKey(value: string, field: string): { provider: string; modelId: string; modelKey: string } {
  const parsed = parseModelKeyStrict(value)
  if (!parsed) {
    throw new Error(`MODEL_KEY_INVALID: ${field} must be provider::modelId`)
  }
  return parsed
}

function parseCustomProviders(rawProviders: string | null | undefined): CustomProvider[] {
  if (!rawProviders) return []

  let parsedUnknown: unknown
  try {
    parsedUnknown = JSON.parse(rawProviders)
  } catch {
    throw new Error('PROVIDER_PAYLOAD_INVALID: customProviders is not valid JSON')
  }

  if (!Array.isArray(parsedUnknown)) {
    throw new Error('PROVIDER_PAYLOAD_INVALID: customProviders must be an array')
  }

  const providers: CustomProvider[] = []
  for (let index = 0; index < parsedUnknown.length; index += 1) {
    const raw = parsedUnknown[index]
    if (!isRecord(raw)) {
      throw new Error(`PROVIDER_PAYLOAD_INVALID: providers[${index}] must be an object`)
    }

    const id = readTrimmedString(raw.id)
    const name = readTrimmedString(raw.name)
    if (!id || !name) {
      throw new Error(`PROVIDER_PAYLOAD_INVALID: providers[${index}] missing id or name`)
    }
    const normalizedId = id.toLowerCase()
    if (providers.some((provider) => provider.id.toLowerCase() === normalizedId)) {
      throw new Error(`PROVIDER_DUPLICATE: providers[${index}].id duplicates id ${id}`)
    }

    const apiModeRaw = raw.apiMode
    const apiMode = apiModeRaw === 'gemini-sdk' || apiModeRaw === 'openai-official'
      ? apiModeRaw
      : undefined

    providers.push({
      id,
      name,
      baseUrl: readTrimmedString(raw.baseUrl) || undefined,
      apiKey: readTrimmedString(raw.apiKey) || undefined,
      apiMode,
    })
  }

  return providers
}

function normalizeStoredModel(raw: unknown, index: number): CustomModel {
  if (!isRecord(raw)) {
    throw new Error(`MODEL_PAYLOAD_INVALID: models[${index}] must be an object`)
  }

  if (!isUnifiedModelType(raw.type)) {
    throw new Error(`MODEL_TYPE_INVALID: models[${index}].type is invalid`)
  }

  const providerFromField = readTrimmedString(raw.provider)
  const modelIdFromField = readTrimmedString(raw.modelId)
  const modelKeyFromField = readTrimmedString(raw.modelKey)

  const parsedFromKey = modelKeyFromField ? parseModelKeyStrict(modelKeyFromField) : null
  const provider = providerFromField || parsedFromKey?.provider || ''
  const modelId = modelIdFromField || parsedFromKey?.modelId || ''
  const modelKey = composeModelKey(provider, modelId)

  if (!modelKey) {
    throw new Error(`MODEL_KEY_INVALID: models[${index}] must include provider and modelId`)
  }

  if (parsedFromKey && parsedFromKey.modelKey !== modelKey) {
    throw new Error(`MODEL_KEY_MISMATCH: models[${index}].modelKey conflicts with provider/modelId`)
  }

  return {
    modelId,
    modelKey,
    provider,
    type: raw.type,
    name: readTrimmedString(raw.name) || modelId,
    price: 0,
  }
}

function parseCustomModels(rawModels: string | null | undefined): CustomModel[] {
  if (!rawModels) return []

  let parsedUnknown: unknown
  try {
    parsedUnknown = JSON.parse(rawModels)
  } catch {
    throw new Error('MODEL_PAYLOAD_INVALID: customModels is not valid JSON')
  }

  if (!Array.isArray(parsedUnknown)) {
    throw new Error('MODEL_PAYLOAD_INVALID: customModels must be an array')
  }

  const models: CustomModel[] = []
  for (let index = 0; index < parsedUnknown.length; index += 1) {
    models.push(normalizeStoredModel(parsedUnknown[index], index))
  }

  return models
}

function pickProviderStrict(
  providers: CustomProvider[],
  providerId: string,
): CustomProvider {
  const matched = providers.find((provider) => provider.id === providerId)
  if (matched) return matched

  throw new Error(`PROVIDER_NOT_FOUND: ${providerId} is not configured`)
}

async function readUserConfig(userId: string): Promise<{ models: CustomModel[]; providers: CustomProvider[] }> {
  const pref = await prisma.userPreference.findUnique({
    where: { userId },
    select: {
      customModels: true,
      customProviders: true,
    },
  })

  return {
    models: parseCustomModels(pref?.customModels),
    providers: parseCustomProviders(pref?.customProviders),
  }
}

function findModelByKey(models: CustomModel[], modelKey: string): CustomModel | null {
  const parsed = assertModelKey(modelKey, 'model')
  return models.find((model) => model.modelId === parsed.modelId && model.provider === parsed.provider) || null
}

/**
 * 提取提供商主键（用于多实例场景，如 gemini-compatible:uuid）
 */
export function getProviderKey(providerId?: string): string {
  if (!providerId) return ''
  const colonIndex = providerId.indexOf(':')
  return colonIndex === -1 ? providerId : providerId.slice(0, colonIndex)
}

/**
 * 统一模型选择解析（严格模式）
 */
export async function resolveModelSelection(
  userId: string,
  model: string,
  mediaType: ModelMediaType,
): Promise<ModelSelection> {
  const parsed = assertModelKey(model, `${mediaType} model`)
  const models = await getModelsByType(userId, mediaType)

  const exact = findModelByKey(models, parsed.modelKey)
  if (!exact) {
    throw new Error(`MODEL_NOT_FOUND: ${parsed.modelKey} is not enabled for ${mediaType}`)
  }

  return {
    provider: exact.provider,
    modelId: exact.modelId,
    modelKey: composeModelKey(exact.provider, exact.modelId),
    mediaType,
  }
}

async function resolveSingleModelSelection(
  userId: string,
  mediaType: ModelMediaType,
): Promise<ModelSelection> {
  const models = await getModelsByType(userId, mediaType)
  if (models.length === 0) {
    throw new Error(`MODEL_NOT_CONFIGURED: no ${mediaType} model is enabled`)
  }
  if (models.length > 1) {
    throw new Error(`MODEL_SELECTION_REQUIRED: multiple ${mediaType} models are enabled, provide model_key explicitly`)
  }

  const model = models[0]
  return {
    provider: model.provider,
    modelId: model.modelId,
    modelKey: composeModelKey(model.provider, model.modelId),
    mediaType,
  }
}

/**
 * 统一模型选择解析（允许显式 model_key；未传时仅允许单模型）
 */
export async function resolveModelSelectionOrSingle(
  userId: string,
  model: string | null | undefined,
  mediaType: ModelMediaType,
): Promise<ModelSelection> {
  const modelKey = readTrimmedString(model)
  if (!modelKey) {
    return await resolveSingleModelSelection(userId, mediaType)
  }
  return await resolveModelSelection(userId, modelKey, mediaType)
}

/**
 * Provider 配置
 *
 * 返回 provider 的完整连接信息（apiKey 已解密）。
 * baseUrl 和 apiMode 为可选——不同 provider 需求不同，由调用方自行校验。
 *
 * ⚠️ 调用方必须先通过 resolveModelSelection 校验模型归属，
 * 再使用 selection.provider 调用本函数，禁止直接传入未校验的 providerId。
 */
export interface ProviderConfig {
  id: string
  name: string
  apiKey: string
  baseUrl?: string
  apiMode?: 'gemini-sdk' | 'openai-official'
}

export async function getProviderConfig(userId: string, providerId: string): Promise<ProviderConfig> {
  const { providers } = await readUserConfig(userId)
  const provider = pickProviderStrict(providers, providerId)

  if (!provider.apiKey) {
    throw new Error(`PROVIDER_API_KEY_MISSING: ${provider.id}`)
  }

  return {
    id: provider.id,
    name: provider.name,
    apiKey: decryptApiKey(provider.apiKey),
    baseUrl: normalizeProviderBaseUrl(provider.id, provider.baseUrl),
    apiMode: provider.apiMode,
  }
}

/**
 * 获取用户自定义模型列表
 */
export async function getUserModels(userId: string): Promise<CustomModel[]> {
  const { models } = await readUserConfig(userId)
  return models
}

/**
 * 获取模型关联 provider
 */
export async function getModelProvider(userId: string, model: string): Promise<string | null> {
  const { models } = await readUserConfig(userId)
  const matched = findModelByKey(models, model)
  return matched?.provider || null
}

/**
 * 获取指定类型模型列表
 */
export async function getModelsByType(userId: string, type: ModelMediaType): Promise<CustomModel[]> {
  const models = await getUserModels(userId)
  return models.filter((model) => model.type === type)
}

/**
 * 解析模型 ID（严格从 model_key 提取）
 */
export async function resolveModelId(userId: string, model: string): Promise<string> {
  const selection = await resolveModelSelection(userId, model, 'llm')
  return selection.modelId
}

/**
 * 获取模型价格
 */
export async function getModelPrice(userId: string, model: string): Promise<number> {
  const { models } = await readUserConfig(userId)
  const matched = findModelByKey(models, model)
  if (!matched) {
    throw new Error(`MODEL_NOT_FOUND: ${model}`)
  }
  return matched.price
}

/**
 * 根据音频模型键获取音频 API Key（未传模型时要求仅存在单一音频模型）
 */
export async function getAudioApiKey(userId: string, model?: string | null): Promise<string> {
  const selection = await resolveModelSelectionOrSingle(userId, model, 'audio')
  return (await getProviderConfig(userId, selection.provider)).apiKey
}

/**
 * 根据口型同步模型键获取 API Key（未传模型时要求仅存在单一 lipsync 模型）
 */
export async function getLipSyncApiKey(userId: string, model?: string | null): Promise<string> {
  const selection = await resolveModelSelectionOrSingle(userId, model, 'lipsync')
  return (await getProviderConfig(userId, selection.provider)).apiKey
}

/**
 * 检查用户是否有任意 API 配置
 */
export async function hasApiConfig(userId: string): Promise<boolean> {
  const pref = await prisma.userPreference.findUnique({
    where: { userId },
    select: { customProviders: true },
  })

  const providers = parseCustomProviders(pref?.customProviders)
  return providers.some((provider) => !!provider.apiKey)
}
