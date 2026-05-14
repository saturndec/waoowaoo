import type { Locale } from '@/i18n/routing'
import { ART_STYLES } from '@/lib/constants'
import type {
  EditAssetRequirement,
  EditScriptBriefQuestion,
  EditScriptBriefQuestionsPayload,
  EditScriptPayload,
  EditScriptShot,
} from './types'
import { normalizeVideoBlockPlanResponse } from '@/lib/video-groups/planner'
import {
  editAssetExtractionSchema,
  editScriptBriefQuestionsSchema,
  editScriptCoreSchema,
} from './types'

const BRIEF_QUESTION_IDS = ['visual_style', 'aspect_ratio', 'duration'] as const
type BriefQuestionId = (typeof BRIEF_QUESTION_IDS)[number]

const BRIEF_OPTION_IDS = ['A', 'B', 'C', 'D', 'E', 'F'] as const

function uniquePositiveNumbers(values: readonly number[]): number[] {
  const seen = new Set<number>()
  const output: number[] = []
  values.forEach((value) => {
    if (!Number.isInteger(value) || value <= 0 || seen.has(value)) return
    seen.add(value)
    output.push(value)
  })
  return output.sort((left, right) => left - right)
}

export function normalizeEditScriptCore(raw: unknown): Omit<EditScriptPayload, 'requirements'> {
  const parsed = editScriptCoreSchema.parse(raw)

  const shots: EditScriptShot[] = parsed.shots
    .map((shot) => ({
      shotNumber: shot.shotNumber,
      durationSec: shot.durationSec,
      visualAction: shot.visualAction.trim(),
      charactersAndScene: shot.charactersAndScene.trim(),
      camera: shot.camera.trim(),
      videoPrompt: shot.videoPrompt.trim(),
      sound: shot.sound.trim(),
    }))
    .sort((left, right) => left.shotNumber - right.shotNumber)

  shots.forEach((shot, index) => {
    const expectedNumber = index + 1
    if (shot.shotNumber !== expectedNumber) {
      throw new Error(`EDIT_SCRIPT_SHOT_NUMBER_NOT_CONTINUOUS:${shot.shotNumber}:${expectedNumber}`)
    }
  })

  const durationSec = shots.reduce((total, shot) => total + shot.durationSec, 0)
  const videoBlocks = normalizeVideoBlockPlanResponse({
    response: { items: parsed.videoBlocks },
    allShotNumbers: shots.map((shot) => shot.shotNumber),
    shots,
  }).items
  return {
    title: parsed.title.trim(),
    logline: parsed.logline?.trim() || null,
    durationSec,
    shotCount: shots.length,
    shots,
    videoBlocks,
  }
}

export function normalizeEditAssetRequirements(
  raw: unknown,
  shots: readonly EditScriptShot[],
): EditAssetRequirement[] {
  const parsed = editAssetExtractionSchema.parse(raw)
  const validShotNumbers = new Set(shots.map((shot) => shot.shotNumber))
  const seen = new Set<string>()
  const assets: EditAssetRequirement[] = []

  parsed.assets.forEach((asset) => {
    const name = asset.name.trim()
    const key = `${asset.kind}:${name.toLocaleLowerCase()}`
    if (seen.has(key)) return
    const shotNumbers = uniquePositiveNumbers(asset.shotNumbers)
      .filter((shotNumber) => validShotNumbers.has(shotNumber))
    if (shotNumbers.length === 0) {
      throw new Error(`EDIT_SCRIPT_ASSET_HAS_NO_VALID_SHOTS:${asset.kind}:${name}`)
    }
    seen.add(key)
    assets.push({
      kind: asset.kind,
      name,
      description: asset.description.trim(),
      shotNumbers,
      status: 'pending',
      targetId: null,
      errorMessage: null,
    })
  })

  if (assets.length === 0) {
    throw new Error('EDIT_SCRIPT_ASSET_EXTRACTION_EMPTY')
  }

  return assets
}

export function normalizeEditScriptBriefQuestions(raw: unknown): EditScriptBriefQuestionsPayload {
  const parsed = editScriptBriefQuestionsSchema.parse(raw)
  const seenQuestionIds = new Set<string>()
  return {
    questions: parsed.questions.map((question) => {
      const questionId = question.id.trim()
      if (!isBriefQuestionId(questionId)) {
        throw new Error(`EDIT_SCRIPT_BRIEF_UNSUPPORTED_QUESTION:${questionId}`)
      }
      if (seenQuestionIds.has(questionId)) {
        throw new Error(`EDIT_SCRIPT_BRIEF_DUPLICATE_QUESTION:${questionId}`)
      }
      seenQuestionIds.add(questionId)

      const optionIds = question.options.map((option) => option.id)
      const expectedOptionIds = BRIEF_OPTION_IDS.slice(0, question.options.length)
      expectedOptionIds.forEach((expectedId, index) => {
        if (optionIds[index] !== expectedId) {
          throw new Error(`EDIT_SCRIPT_BRIEF_OPTION_ORDER:${questionId}`)
        }
      })

      return {
        id: questionId,
        label: question.label.trim(),
        options: question.options.map((option) => ({
          id: option.id,
          label: option.label.trim(),
        })),
      }
    }),
  }
}

function isBriefQuestionId(value: string): value is BriefQuestionId {
  return BRIEF_QUESTION_IDS.some((id) => id === value)
}

function buildVisualStyleQuestion(locale: Locale): EditScriptBriefQuestion {
  const options = ART_STYLES.map((style, index) => {
    const optionId = BRIEF_OPTION_IDS[index]
    if (!optionId) {
      throw new Error(`EDIT_SCRIPT_STYLE_OPTION_ID_MISSING:${style.value}`)
    }
    return {
      id: optionId,
      label: style.label,
    }
  })

  return {
    id: 'visual_style',
    label: locale === 'en' ? 'Which visual style should this video use?' : '这条视频需要哪种画风？',
    options,
  }
}

function buildAspectRatioQuestion(locale: Locale): EditScriptBriefQuestion {
  if (locale === 'en') {
    return {
      id: 'aspect_ratio',
      label: 'Which aspect ratio should this video use?',
      options: [
        { id: 'A', label: '9:16 vertical short video' },
        { id: 'B', label: '16:9 horizontal video' },
        { id: 'C', label: '21:9 cinematic ultra-wide' },
      ],
    }
  }

  return {
    id: 'aspect_ratio',
    label: '这条视频需要哪种画幅比例？',
    options: [
      { id: 'A', label: '9:16 竖屏短视频' },
      { id: 'B', label: '16:9 横屏视频' },
      { id: 'C', label: '21:9 电影宽银幕' },
    ],
  }
}

function isAspectRatioQuestion(question: EditScriptBriefQuestion): boolean {
  if (question.id === 'aspect_ratio') return true
  const optionText = question.options.map((option) => option.label).join('\n')
  return optionText.includes('9:16') && optionText.includes('16:9') && optionText.includes('21:9')
}

function briefQuestionMatchesId(question: EditScriptBriefQuestion, id: BriefQuestionId): boolean {
  if (question.id === id) return true
  if (id === 'aspect_ratio') return isAspectRatioQuestion(question)
  return false
}

function promptMentionsVisualStyle(userPrompt: string): boolean {
  const text = userPrompt.trim().toLocaleLowerCase()
  if (!text) return false
  return ART_STYLES.some((style) => {
    const value = style.value.toLocaleLowerCase()
    const label = style.label.toLocaleLowerCase()
    return text.includes(value) || text.includes(label)
  }) || [
    '画风',
    '漫画',
    '动漫',
    '国漫',
    '日系',
    '真人',
    '写实',
    'realistic',
    'anime',
    'comic',
  ].some((keyword) => text.includes(keyword))
}

function promptMentionsAspectRatio(userPrompt: string): boolean {
  return /(?:9\s*:\s*16|16\s*:\s*9|21\s*:\s*9|竖屏|横屏|宽银幕|vertical|horizontal|landscape|portrait|ultra[-\s]?wide)/i.test(userPrompt)
}

function promptMentionsDuration(userPrompt: string): boolean {
  return /(?:\d+(?:\.\d+)?\s*(?:秒|s|sec|secs|second|seconds|分钟|分|min|mins|minute|minutes|小时|hour|hours)|半分钟|一分半|两分半|三十秒|六十秒|一分钟|两分钟|三分钟)/i.test(userPrompt)
}

export function finalizeEditScriptBriefQuestions(
  payload: EditScriptBriefQuestionsPayload,
  locale: Locale,
  userPrompt: string,
): EditScriptBriefQuestionsPayload {
  const coveredIds = new Set<BriefQuestionId>()
  if (promptMentionsVisualStyle(userPrompt)) coveredIds.add('visual_style')
  if (promptMentionsAspectRatio(userPrompt)) coveredIds.add('aspect_ratio')
  if (promptMentionsDuration(userPrompt)) coveredIds.add('duration')

  const questions = BRIEF_QUESTION_IDS.flatMap((id): EditScriptBriefQuestion[] => {
    if (coveredIds.has(id)) return []
    const source = payload.questions.find((question) => briefQuestionMatchesId(question, id))
    if (!source) return []
    if (id === 'visual_style') return [buildVisualStyleQuestion(locale)]
    if (id === 'aspect_ratio') return [buildAspectRatioQuestion(locale)]
    return [source]
  })

  return {
    questions,
  }
}

export function resolveEditScriptDefaults(userPrompt: string): { durationSeconds: number } {
  const text = userPrompt.trim()
  const minuteMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:分钟|minute|minutes|min)/i)
  if (minuteMatch) {
    const minutes = Number(minuteMatch[1])
    if (Number.isFinite(minutes) && minutes > 0) {
      const durationSeconds = Math.max(10, Math.round(minutes * 60))
      return { durationSeconds }
    }
  }

  const secondMatch = text.match(/(\d+)\s*(?:秒|second|seconds|sec|s)/i)
  if (secondMatch) {
    const durationSeconds = Number(secondMatch[1])
    if (Number.isInteger(durationSeconds) && durationSeconds > 0) {
      return { durationSeconds }
    }
  }

  return { durationSeconds: 60 }
}
