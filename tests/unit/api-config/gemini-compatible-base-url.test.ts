import { describe, expect, it } from 'vitest'
import { validateGeminiCompatibleBaseUrl } from '@/lib/provider-base-url'

describe('gemini-compatible baseUrl validation', () => {
  it('accepts service root url', () => {
    const result = validateGeminiCompatibleBaseUrl('https://api.example.com')
    expect(result.valid).toBe(true)
    expect(result.message).toBeUndefined()
  })

  it('rejects images generations endpoint url', () => {
    const result = validateGeminiCompatibleBaseUrl('https://api.example.com/v1/images/generations')
    expect(result.valid).toBe(false)
    expect(result.message).toContain('/images/generations')
  })

  it('rejects v1beta models endpoint url', () => {
    const result = validateGeminiCompatibleBaseUrl('https://api.example.com/v1beta/models')
    expect(result.valid).toBe(false)
    expect(result.message).toContain('/v1beta/models')
  })
})

