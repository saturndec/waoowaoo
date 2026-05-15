import { z } from 'zod'

export const BGM_STEM_ROLES = [
  'atmosphere',
  'low_end',
  'harmony',
  'motif',
  'music_transition',
] as const

export type BgmStemRole = (typeof BGM_STEM_ROLES)[number]

export const BGM_SCORE_STATUS = {
  PENDING: 'pending',
  GENERATING: 'generating',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const

export type BgmScoreStatus = (typeof BGM_SCORE_STATUS)[keyof typeof BGM_SCORE_STATUS]

export const bgmStemRoleSchema = z.enum(BGM_STEM_ROLES)

const timedSectionSchema = z.object({
  startSec: z.number().min(0),
  endSec: z.number().positive(),
})

function refineBlueprintTimedSection<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return schema.refine(
    (section) => section.endSec > section.startSec,
    { message: 'BGM_SCORE_BLUEPRINT_SECTION_INVALID' },
  )
}

export const bgmScoreBlueprintSchema = z.object({
  tempoMap: z.array(refineBlueprintTimedSection(timedSectionSchema.extend({
    bpm: z.number().int().min(20).max(300),
    timeSignature: z.string().trim().min(1),
    barStart: z.number().int().min(1),
    barEnd: z.number().int().min(1),
    downbeatSec: z.number().min(0).optional().nullable(),
    feel: z.string().trim().min(1).optional().nullable(),
  })).refine((section) => section.barEnd >= section.barStart, {
    message: 'BGM_SCORE_BLUEPRINT_BAR_RANGE_INVALID',
  })).min(1).max(24),
  keyMap: z.array(refineBlueprintTimedSection(timedSectionSchema.extend({
    key: z.string().trim().min(1),
    mode: z.string().trim().min(1).optional().nullable(),
    function: z.string().trim().min(1).optional().nullable(),
  }))).min(1).max(24),
  chordMap: z.array(refineBlueprintTimedSection(timedSectionSchema.extend({
    bars: z.string().trim().min(1),
    chords: z.array(z.string().trim().min(1)).min(1).max(16),
    harmonicRhythm: z.string().trim().min(1),
  }))).min(1).max(48),
  hitPoints: z.array(z.object({
    timeSec: z.number().min(0),
    label: z.string().trim().min(1),
    musicalAction: z.string().trim().min(1),
  })).min(1).max(48),
  motif: z.object({
    description: z.string().trim().min(1),
    scaleDegrees: z.string().trim().min(1),
    rhythm: z.string().trim().min(1),
    usage: z.string().trim().min(1),
  }).optional().nullable(),
  orchestrationMap: z.array(refineBlueprintTimedSection(timedSectionSchema.extend({
    registerPlan: z.string().trim().min(1),
    instrumentation: z.string().trim().min(1),
    frequencyFocus: z.string().trim().min(1),
    density: z.number().min(0).max(100),
  }))).min(1).max(32),
  stemRules: z.array(z.object({
    role: bgmStemRoleSchema,
    allowedMaterial: z.string().trim().min(1),
    forbiddenMaterial: z.string().trim().min(1),
    register: z.string().trim().min(1),
    rhythmicRule: z.string().trim().min(1),
    chordRule: z.string().trim().min(1),
  })).min(1).max(5),
})

export const bgmScorePlanSchema = z.object({
  durationSeconds: z.number().positive().max(600),
  global: z.object({
    mood: z.string().trim().min(1),
    genre: z.string().trim().min(1),
    bpm: z.number().int().min(20).max(300).optional().nullable(),
    key: z.string().trim().min(1).optional().nullable(),
    intensityCurve: z.array(z.object({
      timeSec: z.number().min(0),
      intensity: z.number().min(0).max(100),
    })).min(1).max(24),
  }),
  blueprint: bgmScoreBlueprintSchema,
  stems: z.array(z.object({
    role: bgmStemRoleSchema,
    reason: z.string().trim().min(1),
    startSec: z.number().min(0),
    durationSec: z.number().positive(),
    gainDb: z.number().min(-36).max(6),
    fadeInSec: z.number().min(0).max(30),
    fadeOutSec: z.number().min(0).max(30),
    density: z.number().min(0).max(100),
    tension: z.number().min(0).max(100),
    brightness: z.number().min(0).max(100),
    motion: z.number().min(0).max(100),
    prompt: z.string().trim().min(1),
    negativePrompt: z.string().trim().optional().nullable(),
  })).min(1).max(5),
}).superRefine((plan, ctx) => {
  const seenRoles = new Set<BgmStemRole>()
  const stemRoles = new Set(plan.stems.map((stem) => stem.role))
  plan.stems.forEach((stem, index) => {
    if (seenRoles.has(stem.role)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['stems', index, 'role'],
        message: 'BGM_SCORE_DUPLICATE_STEM_ROLE',
      })
    }
    seenRoles.add(stem.role)

    if (stem.startSec + stem.durationSec > plan.durationSeconds + 0.001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['stems', index, 'durationSec'],
        message: 'BGM_SCORE_STEM_TIMING_OUT_OF_RANGE',
      })
    }

    if (stem.fadeInSec + stem.fadeOutSec > stem.durationSec) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['stems', index, 'fadeOutSec'],
        message: 'BGM_SCORE_STEM_FADE_EXCEEDS_DURATION',
      })
    }
  })
  plan.blueprint.stemRules.forEach((rule, index) => {
    if (!stemRoles.has(rule.role)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['blueprint', 'stemRules', index, 'role'],
        message: 'BGM_SCORE_BLUEPRINT_UNUSED_STEM_RULE',
      })
    }
  })
  const checkTimedSection = (path: Array<string | number>, startSec: number, endSec: number) => {
    if (endSec > plan.durationSeconds + 0.001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message: 'BGM_SCORE_BLUEPRINT_TIMING_OUT_OF_RANGE',
      })
    }
    if (startSec > plan.durationSeconds + 0.001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message: 'BGM_SCORE_BLUEPRINT_TIMING_OUT_OF_RANGE',
      })
    }
  }
  plan.blueprint.tempoMap.forEach((section, index) =>
    checkTimedSection(['blueprint', 'tempoMap', index, 'endSec'], section.startSec, section.endSec))
  plan.blueprint.keyMap.forEach((section, index) =>
    checkTimedSection(['blueprint', 'keyMap', index, 'endSec'], section.startSec, section.endSec))
  plan.blueprint.chordMap.forEach((section, index) =>
    checkTimedSection(['blueprint', 'chordMap', index, 'endSec'], section.startSec, section.endSec))
  plan.blueprint.orchestrationMap.forEach((section, index) =>
    checkTimedSection(['blueprint', 'orchestrationMap', index, 'endSec'], section.startSec, section.endSec))
  plan.blueprint.hitPoints.forEach((hitPoint, index) => {
    if (hitPoint.timeSec > plan.durationSeconds + 0.001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['blueprint', 'hitPoints', index, 'timeSec'],
        message: 'BGM_SCORE_BLUEPRINT_TIMING_OUT_OF_RANGE',
      })
    }
  })
})

export type BgmScorePlan = z.infer<typeof bgmScorePlanSchema>
export type BgmScorePlanStem = BgmScorePlan['stems'][number]

export interface BgmScoreGeneratedStem {
  readonly role: BgmStemRole
  readonly reason: string
  readonly startSec: number
  readonly durationSec: number
  readonly gainDb: number
  readonly fadeInSec: number
  readonly fadeOutSec: number
  readonly prompt: string
  readonly negativePrompt?: string | null
  readonly mediaId: string
  readonly url: string
  readonly storageKey: string
  readonly mimeType: string
  readonly durationMs: number
}

export interface BgmScoreMix {
  readonly mediaId: string
  readonly url: string
  readonly storageKey: string
  readonly mimeType: string
  readonly durationMs: number
}

export interface BgmScoreProjectData {
  readonly schemaVersion: 1
  readonly status: BgmScoreStatus
  readonly taskId: string
  readonly editScriptId: string
  readonly timelineSignature: string
  readonly durationSeconds: number
  readonly musicModel: string
  readonly plan?: BgmScorePlan
  readonly stems?: readonly BgmScoreGeneratedStem[]
  readonly mix?: BgmScoreMix
  readonly errorMessage?: string | null
}
