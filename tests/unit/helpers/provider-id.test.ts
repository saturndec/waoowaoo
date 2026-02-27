import { afterEach, describe, expect, it, vi } from 'vitest'
import { createProviderIdSuffix } from '@/lib/provider-id'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('provider id suffix', () => {
  it('builds suffix from timestamp and random part', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000)
    vi.spyOn(Math, 'random').mockReturnValue(0.5)

    expect(createProviderIdSuffix()).toBe('loyw3v28i0000000')
  })

  it('pads random tail to fixed length when random text is short', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000)
    vi.spyOn(Math, 'random').mockReturnValue(0.5)

    const suffix = createProviderIdSuffix()
    const timestampPart = Date.now().toString(36)
    const randomTail = suffix.slice(timestampPart.length)

    expect(randomTail).toBe('i0000000')
    expect(randomTail).toHaveLength(8)
  })
})
