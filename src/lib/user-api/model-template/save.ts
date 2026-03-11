import { prisma } from '@/lib/prisma'
import { composeModelKey } from '@/lib/model-config-contract'
import { getProviderKey } from '@/lib/api-config'
import type { OpenAICompatMediaTemplate } from '@/lib/openai-compat-media-template'

type StoredModelType = 'llm' | 'image' | 'video' | 'audio' | 'lipsync'

type StoredModelRecord = Record<string, unknown> & {
  modelId: string
  modelKey: string
  name: string
  type: StoredModelType
  provider: string
}

export interface SaveModelTemplateInput {
  userId: string
  providerId: string
  modelId: string
  name: string
  type: 'image' | 'video'
  template: OpenAICompatMediaTemplate
  source: 'ai' | 'manual'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isStoredModelType(value: string): value is StoredModelType {
  return value === 'llm' || value === 'image' || value === 'video' || value === 'audio' || value === 'lipsync'
}

function parseStoredModels(raw: string | null | undefined): StoredModelRecord[] {
  if (!raw) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    throw new Error('MODEL_TEMPLATE_SAVE_CONFLICT: customModels payload is invalid JSON')
  }
  if (!Array.isArray(parsed)) {
    throw new Error('MODEL_TEMPLATE_SAVE_CONFLICT: customModels payload is invalid')
  }

  const result: StoredModelRecord[] = []
  for (let index = 0; index < parsed.length; index += 1) {
    const item = parsed[index]
    if (!isRecord(item)) continue

    const provider = readTrimmedString(item.provider)
    const modelId = readTrimmedString(item.modelId)
    const modelKey = readTrimmedString(item.modelKey) || composeModelKey(provider, modelId)
    const name = readTrimmedString(item.name) || modelId
    const typeRaw = readTrimmedString(item.type)
    if (!provider || !modelId || !modelKey || !name || !isStoredModelType(typeRaw)) continue

    result.push({
      ...item,
      provider,
      modelId,
      modelKey,
      name,
      type: typeRaw,
    })
  }
  return result
}

function hasProvider(rawProviders: string | null | undefined, providerId: string): boolean {
  if (!rawProviders) return false
  let parsed: unknown
  try {
    parsed = JSON.parse(rawProviders) as unknown
  } catch {
    return false
  }
  if (!Array.isArray(parsed)) return false
  return parsed.some((item) => isRecord(item) && readTrimmedString(item.id) === providerId)
}

export async function saveModelTemplateConfiguration(input: SaveModelTemplateInput): Promise<{
  modelKey: string
}> {
  const providerKey = getProviderKey(input.providerId)
  if (providerKey !== 'openai-compatible' && providerKey !== 'grok-compatible') {
    throw new Error('MODEL_TEMPLATE_SAVE_PROVIDER_INVALID')
  }
  if (input.template.mediaType !== input.type) {
    throw new Error('MODEL_TEMPLATE_SAVE_MEDIATYPE_MISMATCH')
  }

  const modelId = input.modelId.trim()
  const modelName = input.name.trim()
  if (!modelId || !modelName) {
    throw new Error('MODEL_TEMPLATE_SAVE_INVALID_MODEL')
  }

  const pref = await prisma.userPreference.findUnique({
    where: { userId: input.userId },
    select: {
      customModels: true,
      customProviders: true,
    },
  })

  if (!hasProvider(pref?.customProviders, input.providerId)) {
    throw new Error('MODEL_TEMPLATE_SAVE_PROVIDER_NOT_FOUND')
  }

  const modelKey = composeModelKey(input.providerId, modelId)
  const models = parseStoredModels(pref?.customModels)
  const checkedAt = new Date().toISOString()
  const existingIndex = models.findIndex((model) => model.modelKey === modelKey)
  if (existingIndex >= 0) {
    const existing = models[existingIndex]
    if (!existing || existing.provider !== input.providerId || existing.type !== input.type) {
      throw new Error('MODEL_TEMPLATE_SAVE_CONFLICT')
    }
  }

  const baseRecord: StoredModelRecord = existingIndex >= 0
    ? models[existingIndex] as StoredModelRecord
    : {
      modelId,
      modelKey,
      name: modelName,
      type: input.type,
      provider: input.providerId,
    }

  const nextRecord: StoredModelRecord = {
    ...baseRecord,
    modelId,
    modelKey,
    name: modelName,
    type: input.type,
    provider: input.providerId,
    compatMediaTemplate: input.template,
    compatMediaTemplateCheckedAt: checkedAt,
    compatMediaTemplateSource: input.source,
    enabled: baseRecord.enabled === false ? false : true,
  }

  const nextModels = existingIndex >= 0
    ? models.map((model, index) => (index === existingIndex ? nextRecord : model))
    : [...models, nextRecord]

  await prisma.userPreference.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      customModels: JSON.stringify(nextModels),
      customProviders: pref?.customProviders || JSON.stringify([]),
    },
    update: {
      customModels: JSON.stringify(nextModels),
    },
  })

  return { modelKey }
}
