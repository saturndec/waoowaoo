import { type CapabilityValue } from '@/lib/model-config-contract'
import type { PricingApiType } from '@/lib/model-pricing/catalog'

const DEFAULT_TEXT_INPUT_PRICE = 0.2
const DEFAULT_TEXT_OUTPUT_PRICE = 0.6

const DEFAULT_NON_TEXT_PRICING: Readonly<Record<Exclude<PricingApiType, 'text'>, number>> = {
  image: 0.144,
  video: 0.2,
  voice: 0.0144,
  'voice-design': 0.2,
  'lip-sync': 0.5,
}

function readTokenType(
  selections: Record<string, CapabilityValue> | undefined,
): 'input' | 'output' | null {
  const tokenType = selections?.tokenType
  if (tokenType === 'input' || tokenType === 'output') return tokenType
  return null
}

export function hasDefaultPricingFallback(apiType: PricingApiType): boolean {
  if (apiType === 'text') return true
  return Object.prototype.hasOwnProperty.call(DEFAULT_NON_TEXT_PRICING, apiType)
}

export function resolveDefaultPricingFallback(input: {
  apiType: PricingApiType
  selections?: Record<string, CapabilityValue>
}): number {
  if (input.apiType === 'text') {
    const tokenType = readTokenType(input.selections)
    if (tokenType === 'output') return DEFAULT_TEXT_OUTPUT_PRICE
    return DEFAULT_TEXT_INPUT_PRICE
  }

  return DEFAULT_NON_TEXT_PRICING[input.apiType]
}
