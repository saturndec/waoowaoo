import { describe, expect, it } from 'vitest'
import { isCompatibleProvider, resolveModelGatewayRoute } from '@/lib/model-gateway'

describe('model-gateway router', () => {
  it('routes openai-compatible providers to openai-compat', () => {
    expect(isCompatibleProvider('openai-compatible')).toBe(true)
    expect(isCompatibleProvider('openai-compatible:oa-1')).toBe(true)
    expect(resolveModelGatewayRoute('openai-compatible:oa-1')).toBe('openai-compat')
  })

  it('routes grok-compatible providers to openai-compat', () => {
    expect(isCompatibleProvider('grok-compatible')).toBe(true)
    expect(isCompatibleProvider('grok-compatible:gk-1')).toBe(true)
    expect(resolveModelGatewayRoute('grok-compatible:gk-1')).toBe('openai-compat')
  })

  it('keeps gemini-compatible providers on official route', () => {
    expect(isCompatibleProvider('gemini-compatible')).toBe(false)
    expect(isCompatibleProvider('gemini-compatible:gm-1')).toBe(false)
    expect(resolveModelGatewayRoute('gemini-compatible:gm-1')).toBe('official')
  })

  it('keeps official providers on official route', () => {
    expect(isCompatibleProvider('google')).toBe(false)
    expect(isCompatibleProvider('ark')).toBe(false)
    expect(isCompatibleProvider('bailian')).toBe(false)
    expect(isCompatibleProvider('siliconflow')).toBe(false)
    expect(resolveModelGatewayRoute('google')).toBe('official')
    expect(resolveModelGatewayRoute('ark')).toBe('official')
    expect(resolveModelGatewayRoute('bailian')).toBe('official')
    expect(resolveModelGatewayRoute('siliconflow')).toBe('official')
  })
})
