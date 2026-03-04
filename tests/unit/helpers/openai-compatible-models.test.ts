import { describe, expect, it } from 'vitest'
import {
  extractOpenAICompatibleModelIds,
  normalizeOpenAICompatibleBaseUrl,
} from '@/lib/user-api/openai-compatible-models'

describe('openai-compatible 模型发现工具', () => {
  it('自动补齐缺失的 /v1 路径', () => {
    const normalized = normalizeOpenAICompatibleBaseUrl('https://octopus.ivibecoding.cn/')
    expect(normalized).toBe('https://octopus.ivibecoding.cn/v1')
  })

  it('保留已有 /v1 路径', () => {
    const normalized = normalizeOpenAICompatibleBaseUrl('https://octopus.ivibecoding.cn/custom/v1')
    expect(normalized).toBe('https://octopus.ivibecoding.cn/custom/v1')
  })

  it('无效 URL 抛出显式错误', () => {
    expect(() => normalizeOpenAICompatibleBaseUrl('not-a-url')).toThrow('OPENAI_COMPATIBLE_BASE_URL_INVALID')
  })

  it('提取并去重模型 id', () => {
    const ids = extractOpenAICompatibleModelIds({
      object: 'list',
      data: [
        { id: 'gpt-4.1' },
        { id: 'gpt-4o-mini' },
        { id: 'gpt-4.1' },
        { id: '' },
        { name: 'invalid-item' },
      ],
    })

    expect(ids).toEqual(['gpt-4.1', 'gpt-4o-mini'])
  })
})
