/**
 * Billing cost center.
 *
 * Pricing is resolved from unified pricing catalog only.
 * No implicit fallback to hardcoded model tables is allowed.
 */

import { BillingOperationError } from './errors'
import {
  parseModelKeyStrict,
  type CapabilityValue,
  type ModelCapabilities,
} from '@/lib/model-config-contract'
import {
  findBuiltinCapabilities,
  listBuiltinCapabilityCatalog,
} from '@/lib/model-capabilities/catalog'
import { validateCapabilitySelectionForModel } from '@/lib/model-capabilities/lookup'
import { resolveBuiltinPricing } from '@/lib/model-pricing/lookup'
import type { PricingApiType } from '@/lib/model-pricing/catalog'

export const USD_TO_CNY = 7.2

export const MARKUP = {
  global: 1.0,
  text: 1.0,
  image: 1.0,
  video: 1.0,
  voice: 1.0,
  voiceDesign: 1.0,
  lipSync: 1.0,
} as const

export type MarkupCategory = keyof typeof MARKUP

export type ApiType = 'text' | 'image' | 'video' | 'voice' | 'voice-design' | 'lip-sync'
export type UsageUnit = 'token' | 'image' | 'video' | 'second' | 'call'

export interface LlmCustomPricing {
  inputPerMillion?: number
  outputPerMillion?: number
}

export interface MediaCustomPricing {
  basePrice?: number
  optionPrices?: Record<string, Record<string, number>>
}

export interface ModelCustomPricing {
  llm?: LlmCustomPricing
  image?: MediaCustomPricing
  video?: MediaCustomPricing
}

const DEFAULT_VOICE_MODEL_ID = 'index-tts2'
const DEFAULT_VOICE_DESIGN_MODEL_ID = 'qwen-voice-design'
const DEFAULT_LIP_SYNC_MODEL_ID = 'kling'

function getMarkup(category: MarkupCategory): number {
  return MARKUP[category] ?? MARKUP.global
}

function parseModelId(model: string): string {
  const parsed = parseModelKeyStrict(model)
  return parsed?.modelId || model
}

function normalizeCapabilitySelections(
  metadata: Record<string, unknown> | undefined,
): Record<string, CapabilityValue> {
  if (!metadata) return {}

  const selections: Record<string, CapabilityValue> = {}
  for (const [field, value] of Object.entries(metadata)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      selections[field] = value
    }
  }
  return selections
}

function resolveModelPriceStrict(input: {
  apiType: PricingApiType
  model: string
  selections?: Record<string, CapabilityValue>
  customPricingFallback?: number | null
}): number {
  const result = resolveBuiltinPricing({
    apiType: input.apiType,
    model: input.model,
    selections: input.selections,
  })

  if (result.status === 'resolved') return result.amount

  if (result.status === 'ambiguous_model') {
    throw new BillingOperationError(
      'BILLING_PRICING_MODEL_AMBIGUOUS',
      `Ambiguous ${input.apiType} pricing modelId: ${result.modelId}`,
      {
        apiType: input.apiType,
        model: input.model,
        modelId: result.modelId,
        candidates: result.candidates.map((candidate) => `${candidate.provider}::${candidate.modelId}`),
      },
    )
  }

  if (result.status === 'missing_capability_match') {
    throw new BillingOperationError(
      'BILLING_CAPABILITY_PRICE_NOT_FOUND',
      `No capability pricing tier matched for ${input.model}`,
      {
        apiType: input.apiType,
        model: input.model,
        selections: input.selections || {},
      },
    )
  }

  // Fallback to user custom pricing
  if (typeof input.customPricingFallback === 'number') {
    return input.customPricingFallback
  }

  const modelId = parseModelId(input.model)
  throw new BillingOperationError(
    'BILLING_UNKNOWN_MODEL',
    `Unknown ${input.apiType} model pricing: ${input.model}`,
    {
      apiType: input.apiType,
      model: input.model,
      modelId,
    },
  )
}

function resolveTextUnitPrice(model: string, tokenType: 'input' | 'output', customPricingFallback?: number | null): number {
  return resolveModelPriceStrict({
    apiType: 'text',
    model,
    selections: { tokenType },
    customPricingFallback,
  })
}

function resolveVideoCapabilities(model: string): ModelCapabilities | undefined {
  const parsed = parseModelKeyStrict(model)
  if (parsed) {
    return findBuiltinCapabilities('video', parsed.provider, parsed.modelId)
  }

  const candidates = listBuiltinCapabilityCatalog().filter(
    (entry) => entry.modelType === 'video' && entry.modelId === model,
  )
  if (candidates.length !== 1) return undefined
  return candidates[0].capabilities
}

function videoCapabilitySupportsField(
  model: string,
  field: 'resolution' | 'generationMode' | 'generateAudio' | 'duration',
): boolean {
  const capabilities = resolveVideoCapabilities(model)
  const namespace = capabilities?.video
  if (!namespace) return false

  const options = (() => {
    if (field === 'resolution') return namespace.resolutionOptions
    if (field === 'generationMode') return namespace.generationModeOptions
    if (field === 'generateAudio') return namespace.generateAudioOptions
    return namespace.durationOptions
  })()
  return Array.isArray(options) && options.length > 0
}

function resolveVideoDurationRangeFromCapabilities(
  model: string,
): { min: number; max: number } | null {
  const capabilities = resolveVideoCapabilities(model)

  const options = capabilities?.video?.durationOptions
  if (!Array.isArray(options) || options.length === 0) return null

  const durations = options.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (durations.length === 0) return null
  return {
    min: Math.min(...durations),
    max: Math.max(...durations),
  }
}

function resolveVideoDefaultGenerateAudioFromCapabilities(model: string): boolean | undefined {
  const capabilities = resolveVideoCapabilities(model)
  const options = capabilities?.video?.generateAudioOptions
  if (!Array.isArray(options) || options.length === 0) return undefined
  const normalized = options.filter((value): value is boolean => typeof value === 'boolean')
  if (normalized.length === 0) return undefined
  return normalized[0]
}

function validateVideoSelectionsAgainstCapabilitiesOrThrow(
  model: string,
  selections: Record<string, CapabilityValue>,
) {
  const capabilities = resolveVideoCapabilities(model)
  if (!capabilities) return

  const parsed = parseModelKeyStrict(model)
  const modelKey = parsed ? `${parsed.provider}::${parsed.modelId}` : model
  const issues = validateCapabilitySelectionForModel({
    modelKey,
    modelType: 'video',
    capabilities,
    selection: selections,
    requireAllFields: false,
  })
  if (issues.length === 0) return

  const selectedResolution = typeof selections.resolution === 'string' ? selections.resolution : undefined
  const hasResolutionIssue = issues.some(
    (issue) => issue.field.endsWith('.resolution') && issue.code === 'CAPABILITY_VALUE_NOT_ALLOWED',
  )
  if (hasResolutionIssue && selectedResolution) {
    throw new BillingOperationError(
      'BILLING_UNKNOWN_VIDEO_RESOLUTION',
      `Unsupported video resolution pricing: ${selectedResolution}`,
      {
        apiType: 'video',
        model,
        resolution: selectedResolution,
      },
    )
  }

  const firstIssue = issues[0]
  throw new BillingOperationError(
    'BILLING_UNKNOWN_VIDEO_CAPABILITY_COMBINATION',
    `Unsupported video capability pricing: ${firstIssue.field} ${firstIssue.message}`,
    {
      apiType: 'video',
      model,
      selections,
      issue: {
        code: firstIssue.code,
        field: firstIssue.field,
        message: firstIssue.message,
      },
    },
  )
}

function applyVideoDurationScaling(input: {
  amount: number
  model: string
  selections: Record<string, CapabilityValue>
  hasDurationTier: boolean
}): number {
  if (input.hasDurationTier) return input.amount
  const selectedDuration = input.selections.duration
  if (typeof selectedDuration !== 'number' || !Number.isFinite(selectedDuration) || selectedDuration <= 0) {
    return input.amount
  }

  const durationRange = resolveVideoDurationRangeFromCapabilities(input.model)
  if (!durationRange) return input.amount

  const baseDuration = durationRange.min <= 5 && durationRange.max >= 5
    ? 5
    : durationRange.min
  if (baseDuration <= 0) return input.amount

  return input.amount * (selectedDuration / baseDuration)
}

export function calcText(
  model: string,
  inputTokens: number,
  outputTokens: number,
  customPricing?: ModelCustomPricing | null,
): number {
  const normalizedInput = Math.max(0, Number(inputTokens) || 0)
  const normalizedOutput = Math.max(0, Number(outputTokens) || 0)

  const inputFallback = typeof customPricing?.llm?.inputPerMillion === 'number' ? customPricing.llm.inputPerMillion : null
  const outputFallback = typeof customPricing?.llm?.outputPerMillion === 'number' ? customPricing.llm.outputPerMillion : null
  const inputUnitPrice = resolveTextUnitPrice(model, 'input', inputFallback)
  const outputUnitPrice = resolveTextUnitPrice(model, 'output', outputFallback)
  const rawCost = ((normalizedInput / 1_000_000) * inputUnitPrice) + ((normalizedOutput / 1_000_000) * outputUnitPrice)
  return rawCost * getMarkup('text')
}

function resolveCustomMediaPrice(input: {
  apiType: 'image' | 'video'
  model: string
  selections: Record<string, CapabilityValue>
  pricing?: MediaCustomPricing
}): { status: 'none' } | { status: 'resolved'; amount: number } | { status: 'invalid'; field: string } {
  if (!input.pricing) return { status: 'none' }

  let hasAnyPricing = false
  let amount = 0
  if (typeof input.pricing.basePrice === 'number') {
    hasAnyPricing = true
    amount += input.pricing.basePrice
  }

  const optionPrices = input.pricing.optionPrices
  if (optionPrices) {
    for (const [field, rawOptionMap] of Object.entries(optionPrices)) {
      const optionMap = rawOptionMap || {}
      if (Object.keys(optionMap).length === 0) continue
      hasAnyPricing = true

      const selectionValue = input.selections[field]
      if (selectionValue === undefined) continue
      const selectionKey = String(selectionValue)
      const delta = optionMap[selectionKey]
      if (typeof delta !== 'number' || !Number.isFinite(delta) || delta < 0) {
        return { status: 'invalid', field }
      }
      amount += delta
    }
  }

  if (!hasAnyPricing) return { status: 'none' }
  return { status: 'resolved', amount }
}

export function calcImage(
  model: string,
  count = 1,
  metadata?: Record<string, unknown>,
  customPricing?: ModelCustomPricing | null,
): number {
  const selections = normalizeCapabilitySelections(metadata)
  const resolved = resolveBuiltinPricing({
    apiType: 'image',
    model,
    selections,
  })
  let unitPrice: number | null = null
  if (resolved.status === 'resolved') {
    unitPrice = resolved.amount
  } else if (resolved.status === 'ambiguous_model') {
    throw new BillingOperationError(
      'BILLING_PRICING_MODEL_AMBIGUOUS',
      `Ambiguous image pricing modelId: ${resolved.modelId}`,
      {
        apiType: 'image',
        model,
        modelId: resolved.modelId,
        candidates: resolved.candidates.map((candidate) => `${candidate.provider}::${candidate.modelId}`),
      },
    )
  }

  if (unitPrice === null) {
    const customResolved = resolveCustomMediaPrice({
      apiType: 'image',
      model,
      selections,
      pricing: customPricing?.image,
    })
    if (customResolved.status === 'resolved') {
      unitPrice = customResolved.amount
    } else if (customResolved.status === 'invalid') {
      throw new BillingOperationError(
        'BILLING_CAPABILITY_PRICE_NOT_FOUND',
        `No custom image price matched for field ${customResolved.field}`,
        { apiType: 'image', model, field: customResolved.field, selections },
      )
    }
  }

  if (unitPrice === null) {
    if (resolved.status === 'missing_capability_match') {
      throw new BillingOperationError(
        'BILLING_CAPABILITY_PRICE_NOT_FOUND',
        `No capability pricing tier matched for ${model}`,
        {
          apiType: 'image',
          model,
          selections,
        },
      )
    }
    const modelId = parseModelId(model)
    throw new BillingOperationError(
      'BILLING_UNKNOWN_MODEL',
      `Unknown image model pricing: ${model}`,
      {
        apiType: 'image',
        model,
        modelId,
      },
    )
  }

  const quantity = Math.max(0, Number(count) || 0)
  return unitPrice * quantity * getMarkup('image')
}

export function calcVideo(
  model: string,
  resolution = '720p',
  count = 1,
  metadata?: Record<string, unknown>,
  customPricing?: ModelCustomPricing | null,
): number {
  const selections = normalizeCapabilitySelections(metadata)
  if (
    typeof selections.resolution !== 'string'
    && videoCapabilitySupportsField(model, 'resolution')
  ) {
    selections.resolution = resolution
  }
  if (
    typeof selections.generationMode !== 'string'
    && videoCapabilitySupportsField(model, 'generationMode')
  ) {
    selections.generationMode = 'normal'
  }
  if (typeof selections.generateAudio !== 'boolean') {
    const defaultGenerateAudio = resolveVideoDefaultGenerateAudioFromCapabilities(model)
    if (typeof defaultGenerateAudio === 'boolean') {
      selections.generateAudio = defaultGenerateAudio
    }
  }
  validateVideoSelectionsAgainstCapabilitiesOrThrow(model, selections)

  const resolutionResult = resolveBuiltinPricing({
    apiType: 'video',
    model,
    selections,
  })
  if (resolutionResult.status === 'ambiguous_model') {
    throw new BillingOperationError(
      'BILLING_PRICING_MODEL_AMBIGUOUS',
      `Ambiguous video pricing modelId: ${resolutionResult.modelId}`,
      {
        apiType: 'video',
        model,
        modelId: resolutionResult.modelId,
        candidates: resolutionResult.candidates.map((candidate) => `${candidate.provider}::${candidate.modelId}`),
      },
    )
  }
  let unitPrice: number | null = null
  if (resolutionResult.status === 'resolved') {
    const resolvedEntry = resolutionResult.entry
    const pricing = resolvedEntry && typeof resolvedEntry === 'object'
      ? (resolvedEntry as { pricing?: { mode?: string; tiers?: Array<{ when?: { duration?: unknown } }> } }).pricing
      : undefined
    const hasDurationTier = pricing?.mode === 'capability'
      && (pricing.tiers || []).some((tier) => typeof tier.when?.duration === 'number')
    unitPrice = applyVideoDurationScaling({
      amount: resolutionResult.amount,
      model,
      selections,
      hasDurationTier,
    })
  }

  if (unitPrice === null) {
    const customResolved = resolveCustomMediaPrice({
      apiType: 'video',
      model,
      selections,
      pricing: customPricing?.video,
    })
    if (customResolved.status === 'resolved') {
      unitPrice = customResolved.amount
    } else if (customResolved.status === 'invalid') {
      throw new BillingOperationError(
        'BILLING_CAPABILITY_PRICE_NOT_FOUND',
        `No custom video price matched for field ${customResolved.field}`,
        { apiType: 'video', model, field: customResolved.field, selections },
      )
    }
  }

  if (unitPrice === null) {
    if (resolutionResult.status === 'missing_capability_match') {
      const pickedDuration = typeof selections.duration === 'number'
        ? selections.duration
        : null
      const pickedResolution = selections.resolution as string
      if (pickedDuration !== null) {
        throw new BillingOperationError(
          'BILLING_UNKNOWN_VIDEO_CAPABILITY_COMBINATION',
          `Unsupported video capability pricing: resolution=${pickedResolution}, duration=${pickedDuration}`,
          {
            apiType: 'video',
            model,
            resolution: pickedResolution,
            duration: pickedDuration,
          },
        )
      }
      throw new BillingOperationError(
        'BILLING_UNKNOWN_VIDEO_RESOLUTION',
        `Unsupported video resolution pricing: ${pickedResolution}`,
        {
          apiType: 'video',
          model,
          resolution: pickedResolution,
        },
      )
    }
    const modelId = parseModelId(model)
    throw new BillingOperationError(
      'BILLING_UNKNOWN_MODEL',
      `Unknown video model pricing: ${model}`,
      {
        apiType: 'video',
        model,
        modelId,
      },
    )
  }

  const quantity = Math.max(0, Number(count) || 0)
  return unitPrice * quantity * getMarkup('video')
}

export function calcVoice(durationSeconds: number): number {
  const seconds = Math.max(0, Number(durationSeconds) || 0)
  const unitPrice = resolveModelPriceStrict({
    apiType: 'voice',
    model: DEFAULT_VOICE_MODEL_ID,
  })
  return unitPrice * seconds * getMarkup('voice')
}

export function calcVoiceDesign(): number {
  const unitPrice = resolveModelPriceStrict({
    apiType: 'voice-design',
    model: DEFAULT_VOICE_DESIGN_MODEL_ID,
  })
  return unitPrice * getMarkup('voiceDesign')
}

export function calcLipSync(model = DEFAULT_LIP_SYNC_MODEL_ID): number {
  const unitPrice = resolveModelPriceStrict({
    apiType: 'lip-sync',
    model,
  })
  return unitPrice * getMarkup('lipSync')
}
