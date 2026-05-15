import { parseModelKeyStrict } from '@/lib/ai-registry/selection'
import type { CapabilityValue } from '@/lib/ai-registry/types'
import {
  findBuiltinPricingCatalogEntriesByModelId,
  findBuiltinPricingCatalogEntry,
  type BuiltinPricingCatalogEntry,
  type PricingApiType,
} from './pricing-catalog'

export interface PricingResolutionResolved {
  status: 'resolved'
  entry: BuiltinPricingCatalogEntry
  amount: number
  mode: 'flat' | 'capability'
}

export interface PricingResolutionNotConfigured {
  status: 'not_configured'
}

export interface PricingResolutionAmbiguousModel {
  status: 'ambiguous_model'
  apiType: PricingApiType
  modelId: string
  candidates: BuiltinPricingCatalogEntry[]
}

export interface PricingResolutionMissingCapabilityMatch {
  status: 'missing_capability_match'
  entry: BuiltinPricingCatalogEntry
  selections: Record<string, CapabilityValue>
}

export type PricingResolution =
  | PricingResolutionResolved
  | PricingResolutionNotConfigured
  | PricingResolutionAmbiguousModel
  | PricingResolutionMissingCapabilityMatch

function cloneSelections(raw: Record<string, CapabilityValue> | undefined): Record<string, CapabilityValue> {
  if (!raw) return {}
  const next: Record<string, CapabilityValue> = {}
  for (const [field, value] of Object.entries(raw)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      next[field] = value
    }
  }
  return next
}

function matchTier(entry: BuiltinPricingCatalogEntry, selections: Record<string, CapabilityValue>): number | null {
  const tiers = entry.pricing.tiers || []
  for (const tier of tiers) {
    const matched = Object.entries(tier.when).every(([field, expectedValue]) => selections[field] === expectedValue)
    if (matched) return tier.amount
  }
  return null
}

function resolveEntryByModel(apiType: PricingApiType, model: string): PricingResolution {
  const parsed = parseModelKeyStrict(model)
  if (parsed) {
    const exact = findBuiltinPricingCatalogEntry(apiType, parsed.provider, parsed.modelId)
    if (exact) return { status: 'resolved', entry: exact, amount: 0, mode: exact.pricing.mode }
    return { status: 'not_configured' }
  }

  const candidates = findBuiltinPricingCatalogEntriesByModelId(apiType, model)
  if (candidates.length === 0) return { status: 'not_configured' }
  if (candidates.length > 1) {
    return { status: 'ambiguous_model', apiType, modelId: model, candidates }
  }
  return { status: 'resolved', entry: candidates[0], amount: 0, mode: candidates[0].pricing.mode }
}

export function resolveBuiltinPricing(input: {
  apiType: PricingApiType
  model: string
  selections?: Record<string, CapabilityValue>
}): PricingResolution {
  const entryResolution = resolveEntryByModel(input.apiType, input.model)
  if (entryResolution.status !== 'resolved') return entryResolution

  const { entry } = entryResolution
  if (entry.pricing.mode === 'flat') {
    const amount = entry.pricing.flatAmount
    if (typeof amount !== 'number') {
      return { status: 'missing_capability_match', entry, selections: cloneSelections(input.selections) }
    }
    return { status: 'resolved', entry, amount, mode: 'flat' }
  }

  const selections = cloneSelections(input.selections)
  const amount = matchTier(entry, selections)
  if (amount === null) {
    return { status: 'missing_capability_match', entry, selections }
  }
  return { status: 'resolved', entry, amount, mode: 'capability' }
}

/**
 * Built-in pricing catalog version used for billing traceability.
 * Bump this value whenever standards/pricing catalog changes semantically.
 */
export const BUILTIN_PRICING_VERSION = '2026-05-15'
