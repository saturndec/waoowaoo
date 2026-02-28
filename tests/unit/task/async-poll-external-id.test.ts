import { describe, expect, it } from 'vitest'
import { formatExternalId, parseExternalId } from '@/lib/async-poll'

describe('async poll externalId contract', () => {
  it('parses standard FAL externalId with endpoint', () => {
    const parsed = parseExternalId('FAL:VIDEO:fal-ai/wan/v2.6/image-to-video:req_123')
    expect(parsed.provider).toBe('FAL')
    expect(parsed.type).toBe('VIDEO')
    expect(parsed.endpoint).toBe('fal-ai/wan/v2.6/image-to-video')
    expect(parsed.requestId).toBe('req_123')
  })

  it('rejects legacy non-standard externalId formats', () => {
    expect(() => parseExternalId('FAL:fal-ai/wan/v2.6/image-to-video:req_123')).toThrow(/无效 FAL externalId/)
    expect(() => parseExternalId('batches/legacy')).toThrow(/无法识别的 externalId 格式/)
  })

  it('requires endpoint when formatting FAL externalId', () => {
    expect(() => formatExternalId('FAL', 'VIDEO', 'req_123')).toThrow(/requires endpoint/)
  })

  it('parses OPENAI video externalId with provider token', () => {
    const parsed = parseExternalId('OPENAI:VIDEO:b3BlbmFpLWNvbXBhdGlibGU6b2EtMQ:vid_123')
    expect(parsed.provider).toBe('OPENAI')
    expect(parsed.type).toBe('VIDEO')
    expect(parsed.providerToken).toBe('b3BlbmFpLWNvbXBhdGlibGU6b2EtMQ')
    expect(parsed.requestId).toBe('vid_123')
  })

  it('requires provider token when formatting OPENAI externalId', () => {
    expect(() => formatExternalId('OPENAI', 'VIDEO', 'vid_123')).toThrow(/providerToken/)
  })
})
