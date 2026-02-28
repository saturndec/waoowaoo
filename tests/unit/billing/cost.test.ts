import { describe, expect, it } from 'vitest'
import {
  USD_TO_CNY,
  calcImage,
  calcLipSync,
  calcText,
  calcVideo,
  calcVoice,
  calcVoiceDesign,
} from '@/lib/billing/cost'

describe('billing/cost', () => {
  it('calculates text cost by known model price table', () => {
    const cost = calcText('anthropic/claude-sonnet-4', 1_000_000, 1_000_000)
    expect(cost).toBeCloseTo((3 + 15) * USD_TO_CNY, 8)
  })

  it('throws when text model pricing is unknown', () => {
    expect(() => calcText('unknown-model', 500_000, 250_000)).toThrow('Unknown text model pricing')
  })

  it('throws when image model pricing is unknown', () => {
    expect(() => calcImage('missing-image-model', 3)).toThrow('Unknown image model pricing')
  })

  it('supports resolution-aware video pricing', () => {
    const cost720 = calcVideo('doubao-seedance-1-0-pro-fast-251015', '720p', 2)
    const cost1080 = calcVideo('doubao-seedance-1-0-pro-fast-251015', '1080p', 2)
    expect(cost720).toBeCloseTo(0.86, 8)
    expect(cost1080).toBeCloseTo(2.06, 8)
    expect(() => calcVideo('doubao-seedance-1-0-pro-fast-251015', '2k', 1)).toThrow('Unsupported video resolution pricing')
    expect(() => calcVideo('unknown-video-model', '720p', 1)).toThrow('Unknown video model pricing')
  })

  it('scales ark video pricing by selected duration when tiers omit duration', () => {
    const shortDuration = calcVideo('doubao-seedance-1-0-pro-250528', '480p', 1, {
      generationMode: 'normal',
      resolution: '480p',
      duration: 2,
    })
    const longDuration = calcVideo('doubao-seedance-1-0-pro-250528', '1080p', 1, {
      generationMode: 'normal',
      resolution: '1080p',
      duration: 12,
    })

    expect(shortDuration).toBeCloseTo(0.292, 8)
    expect(longDuration).toBeCloseTo(8.808, 8)
  })

  it('uses Ark 1.5 official default generateAudio=true when audio is omitted', () => {
    const defaultAudio = calcVideo('doubao-seedance-1-5-pro-251215', '720p', 1, {
      generationMode: 'normal',
      resolution: '720p',
    })
    const muteAudio = calcVideo('doubao-seedance-1-5-pro-251215', '720p', 1, {
      generationMode: 'normal',
      resolution: '720p',
      generateAudio: false,
    })

    expect(defaultAudio).toBeCloseTo(1.73, 8)
    expect(muteAudio).toBeCloseTo(0.86, 8)
  })

  it('supports Ark Seedance 1.0 Lite i2v pricing and duration scaling', () => {
    const shortDuration = calcVideo('doubao-seedance-1-0-lite-i2v-250428', '480p', 1, {
      generationMode: 'normal',
      resolution: '480p',
      duration: 2,
    })
    const longDuration = calcVideo('doubao-seedance-1-0-lite-i2v-250428', '1080p', 1, {
      generationMode: 'firstlastframe',
      resolution: '1080p',
      duration: 12,
    })

    expect(shortDuration).toBeCloseTo(0.196, 8)
    expect(longDuration).toBeCloseTo(5.88, 8)
  })

  it('rejects unsupported Ark capability values before pricing', () => {
    expect(() => calcVideo('doubao-seedance-1-0-lite-i2v-250428', '720p', 1, {
      generationMode: 'normal',
      resolution: '720p',
      duration: 1,
    })).toThrow('Unsupported video capability pricing')
  })

  it('supports minimax capability-aware video pricing', () => {
    const hailuoNormal = calcVideo('minimax-hailuo-2.3', '768p', 1, {
      generationMode: 'normal',
      resolution: '768p',
      duration: 6,
    })
    const hailuoFirstLast = calcVideo('minimax-hailuo-02', '768p', 1, {
      generationMode: 'firstlastframe',
      resolution: '768p',
      duration: 10,
    })
    const t2v = calcVideo('t2v-01', '720p', 1, {
      generationMode: 'normal',
      resolution: '720p',
      duration: 6,
    })

    expect(hailuoNormal).toBeCloseTo(2.0, 8)
    expect(hailuoFirstLast).toBeCloseTo(4.0, 8)
    expect(t2v).toBeCloseTo(3.0, 8)
    expect(() => calcVideo('minimax-hailuo-02', '512p', 1, {
      generationMode: 'firstlastframe',
      resolution: '512p',
      duration: 6,
    })).toThrow('Unsupported video capability pricing')
  })

  it('prefers builtin image pricing over custom pricing when builtin exists', () => {
    const builtin = calcImage('banana', 1)
    const withCustom = calcImage('banana', 1, undefined, {
      image: {
        basePrice: 99,
      },
    })
    expect(withCustom).toBeCloseTo(builtin, 8)
  })

  it('uses custom image option pricing for unknown models', () => {
    const cost = calcImage(
      'openai-compatible:oa-1::gpt-image-1',
      2,
      {
        resolution: '1024x1024',
        quality: 'high',
      },
      {
        image: {
          basePrice: 0.2,
          optionPrices: {
            resolution: {
              '1024x1024': 0.05,
            },
            quality: {
              high: 0.1,
            },
          },
        },
      },
    )
    expect(cost).toBeCloseTo((0.2 + 0.05 + 0.1) * 2, 8)
  })

  it('uses custom video option pricing for unknown models', () => {
    const cost = calcVideo(
      'openai-compatible:oa-1::sora-2',
      '720p',
      1,
      {
        resolution: '720x1280',
        duration: 8,
      },
      {
        video: {
          basePrice: 0.8,
          optionPrices: {
            resolution: {
              '720x1280': 0.2,
            },
            duration: {
              '8': 0.4,
            },
          },
        },
      },
    )
    expect(cost).toBeCloseTo(1.4, 8)
  })

  it('fails explicitly when selected custom option price is missing', () => {
    expect(() => calcVideo(
      'openai-compatible:oa-1::sora-2',
      '720p',
      1,
      {
        resolution: '1792x1024',
      },
      {
        video: {
          optionPrices: {
            resolution: {
              '720x1280': 0.2,
            },
          },
        },
      },
    )).toThrow('No custom video price matched')
  })

  it('returns deterministic fixed costs for call-based APIs', () => {
    expect(calcVoiceDesign()).toBeGreaterThan(0)
    expect(calcLipSync()).toBeGreaterThan(0)
    expect(calcLipSync('vidu::vidu-lipsync')).toBeGreaterThan(0)
  })

  it('calculates voice costs from quantities', () => {
    expect(calcVoice(30)).toBeGreaterThan(0)
  })
})
