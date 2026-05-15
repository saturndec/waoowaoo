import { describe, expect, it } from 'vitest'
import { bgmScorePlanSchema } from '@/lib/bgm-score/types'

const basePlan = {
  durationSeconds: 30,
  global: {
    mood: 'dark suspense',
    genre: 'cinematic minimal score',
    bpm: 72,
    key: 'D minor',
    intensityCurve: [{ timeSec: 0, intensity: 30 }],
  },
  blueprint: {
    tempoMap: [{
      startSec: 0,
      endSec: 30,
      bpm: 72,
      timeSignature: '4/4',
      barStart: 1,
      barEnd: 12,
      downbeatSec: 0,
      feel: 'steady underscore',
    }],
    keyMap: [{
      startSec: 0,
      endSec: 30,
      key: 'D minor',
      mode: 'minor',
      function: 'single tonal center',
    }],
    chordMap: [{
      startSec: 0,
      endSec: 30,
      bars: '1-12',
      chords: ['Dm', 'Bb', 'F', 'C'],
      harmonicRhythm: 'one chord every 2 bars',
    }],
    hitPoints: [{
      timeSec: 12,
      label: 'reveal',
      musicalAction: 'small swell',
    }],
    motif: {
      description: 'short discovery motif',
      scaleDegrees: '1-b3-5-4',
      rhythm: 'half, quarter, quarter, whole',
      usage: 'motif stem only',
    },
    orchestrationMap: [{
      startSec: 0,
      endSec: 30,
      registerPlan: 'separate low and high layers',
      instrumentation: 'low strings and high pad',
      frequencyFocus: 'avoid full range overlap',
      density: 30,
    }],
    stemRules: [{
      role: 'atmosphere',
      allowedMaterial: 'sustained chord tones',
      forbiddenMaterial: 'melody, percussion, independent harmony',
      register: 'mid-high',
      rhythmicRule: 'no pulse',
      chordRule: 'follow chordMap exactly',
    }],
  },
  stems: [
    {
      role: 'atmosphere',
      reason: 'Continuous glue for the full scene.',
      startSec: 0,
      durationSec: 30,
      gainDb: -12,
      fadeInSec: 1,
      fadeOutSec: 2,
      density: 20,
      tension: 40,
      brightness: 25,
      motion: 20,
      prompt: 'Generate an isolated atmosphere stem only.',
      negativePrompt: 'no vocals',
    },
  ],
}

describe('bgm score plan schema', () => {
  it('accepts a valid dynamic multi-stem plan', () => {
    const result = bgmScorePlanSchema.safeParse(basePlan)
    expect(result.success).toBe(true)
  })

  it('rejects duplicate stem roles', () => {
    const result = bgmScorePlanSchema.safeParse({
      ...basePlan,
      stems: [
        basePlan.stems[0],
        { ...basePlan.stems[0], reason: 'Duplicate role should fail.' },
      ],
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues.some((issue) => issue.message === 'BGM_SCORE_DUPLICATE_STEM_ROLE')).toBe(true)
  })

  it('rejects stems that exceed the plan duration', () => {
    const result = bgmScorePlanSchema.safeParse({
      ...basePlan,
      stems: [{ ...basePlan.stems[0], startSec: 20, durationSec: 20 }],
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues.some((issue) => issue.message === 'BGM_SCORE_STEM_TIMING_OUT_OF_RANGE')).toBe(true)
  })

  it('rejects invalid gain ranges', () => {
    const result = bgmScorePlanSchema.safeParse({
      ...basePlan,
      stems: [{ ...basePlan.stems[0], gainDb: 12 }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects removed pulse stem role', () => {
    const result = bgmScorePlanSchema.safeParse({
      ...basePlan,
      blueprint: {
        ...basePlan.blueprint,
        stemRules: [{ ...basePlan.blueprint.stemRules[0], role: 'pulse' }],
      },
      stems: [{ ...basePlan.stems[0], role: 'pulse' }],
    })
    expect(result.success).toBe(false)
  })

  it('requires blueprint stem rules to match selected stems', () => {
    const result = bgmScorePlanSchema.safeParse({
      ...basePlan,
      blueprint: {
        ...basePlan.blueprint,
        stemRules: [{ ...basePlan.blueprint.stemRules[0], role: 'low_end' }],
      },
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues.some((issue) => issue.message === 'BGM_SCORE_BLUEPRINT_UNUSED_STEM_RULE')).toBe(true)
  })
})
