import { describe, expect, it } from 'vitest'
import { getCompatibilityLayerBadgeLabel } from '@/app/[locale]/profile/components/api-config/provider-card/ProviderCardShell'

describe('provider card shell compatibility layer badge', () => {
  const t = (key: string): string => {
    if (key === 'compatibilityLayerOpenAI') return 'OpenAI 兼容层'
    if (key === 'compatibilityLayerGemini') return 'Gemini 兼容层'
    return key
  }

  it('shows OpenAI compatible layer label for openai-compatible providers', () => {
    expect(getCompatibilityLayerBadgeLabel('openai-compatible:oa-1', t)).toBe('OpenAI 兼容层')
  })

  it('shows Gemini compatible layer label for gemini-compatible providers', () => {
    expect(getCompatibilityLayerBadgeLabel('gemini-compatible:gm-1', t)).toBe('Gemini 兼容层')
  })

  it('does not show compatibility label for preset providers', () => {
    expect(getCompatibilityLayerBadgeLabel('google', t)).toBeNull()
    expect(getCompatibilityLayerBadgeLabel('ark', t)).toBeNull()
  })
})
