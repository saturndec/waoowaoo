import { describe, expect, it } from 'vitest'
import { mapGeminiCompatibleErrorToMessage } from '@/lib/generators/image/gemini-compatible'

describe('gemini-compatible error classification', () => {
  it('maps invalid url with generateContent path to baseUrl config error', () => {
    const mapped = mapGeminiCompatibleErrorToMessage({
      message: '{"error":{"message":"Invalid URL (POST /v1/images/generations/v1beta/models/gemini-3.1-flash-image-preview:generateContent)"}}',
      statusCode: 404,
      modelId: 'gemini-3.1-flash-image-preview',
    })
    expect(mapped).toBe('Gemini 兼容服务 Base URL 配置错误，请填写服务根地址（不要包含 /images/generations 或 /v1beta/models）')
  })

  it('does not misclassify generateContent token as rate-limit', () => {
    const mapped = mapGeminiCompatibleErrorToMessage({
      message: 'Invalid URL (POST /v1/images/generations/v1beta/models/gemini-3.1-flash-image-preview:generateContent)',
      statusCode: 404,
      modelId: 'gemini-3.1-flash-image-preview',
    })
    expect(mapped).not.toBe('API 请求频率超限，请稍后重试')
  })

  it('maps explicit rate-limit response to rate-limit message', () => {
    const mapped = mapGeminiCompatibleErrorToMessage({
      message: 'Too many requests, please retry later',
      statusCode: 429,
      modelId: 'gemini-3.1-flash-image-preview',
    })
    expect(mapped).toBe('API 请求频率超限，请稍后重试')
  })

  it('maps fetch failed sending request to network error message', () => {
    const mapped = mapGeminiCompatibleErrorToMessage({
      message: 'TypeError: fetch failed sending request',
      statusCode: undefined,
      modelId: 'gemini-3.1-flash-image-preview',
    })
    expect(mapped).toBe('网络请求失败，请检查网络连接或稍后重试')
  })

  it('maps gemini-compatible request timeout to timeout message', () => {
    const mapped = mapGeminiCompatibleErrorToMessage({
      message: 'GEMINI_COMPATIBLE_REQUEST_TIMEOUT: 120000ms',
      statusCode: undefined,
      modelId: 'gemini-3.1-flash-image-preview',
    })
    expect(mapped).toBe('Gemini 兼容服务请求超时，请检查网络连通性或服务可用性后重试')
  })
})
