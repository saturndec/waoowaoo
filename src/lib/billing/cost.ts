/**
 * Billing cost center.
 *
 * Pricing is resolved from unified pricing catalog first.
 * When catalog pricing is unavailable, use explicit default fallback pricing.
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
import { resolveDefaultPricingFallback } from '@/lib/model-pricing/defaults'

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

  // Fallback to user custom pricing
  if (typeof input.customPricingFallback === 'number') {
    return input.customPricingFallback
  }

  if (result.status === 'missing_capability_match' || result.status === 'not_configured') {
    return resolveDefaultPricingFallback({
      apiType: input.apiType,
      selections: input.selections,
    })
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
  customPricing?: { input?: number; output?: number } | null,
): number {
  const normalizedInput = Math.max(0, Number(inputTokens) || 0)
  const normalizedOutput = Math.max(0, Number(outputTokens) || 0)

  const inputFallback = typeof customPricing?.input === 'number' ? customPricing.input : null
  const outputFallback = typeof customPricing?.output === 'number' ? customPricing.output : null
  const inputUnitPrice = resolveTextUnitPrice(model, 'input', inputFallback)
  const outputUnitPrice = resolveTextUnitPrice(model, 'output', outputFallback)
  const rawCost = ((normalizedInput / 1_000_000) * inputUnitPrice) + ((normalizedOutput / 1_000_000) * outputUnitPrice)
  return rawCost * getMarkup('text')
}

export function calcImage(
  model: string,
  count = 1,
  metadata?: Record<string, unknown>,
): number {
  const selections = normalizeCapabilitySelections(metadata)
  const unitPrice = resolveModelPriceStrict({
    apiType: 'image',
    model,
    selections,
  })
  const quantity = Math.max(0, Number(count) || 0)
  return unitPrice * quantity * getMarkup('image')
}

export function calcVideo(
  model: string,
  resolution = '720p',
  count = 1,
  metadata?: Record<string, unknown>,
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
  if (resolutionResult.status === 'not_configured') {
    return resolveDefaultPricingFallback({
      apiType: 'video',
      selections,
    }) * Math.max(0, Number(count) || 0) * getMarkup('video')
  }
  if (resolutionResult.status === 'missing_capability_match') {
    return resolveDefaultPricingFallback({
      apiType: 'video',
      selections,
    }) * Math.max(0, Number(count) || 0) * getMarkup('video')
  }

  const resolvedEntry = 'entry' in resolutionResult
    ? resolutionResult.entry
    : null
  const hasDurationTier = !!resolvedEntry
    && resolvedEntry.pricing.mode === 'capability'
    && (resolvedEntry.pricing.tiers || []).some((tier) => typeof tier.when.duration === 'number')
  const unitPrice = applyVideoDurationScaling({
    amount: resolutionResult.amount,
    model,
    selections,
    hasDurationTier,
  })

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
