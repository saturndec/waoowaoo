import type { Locale } from '@/i18n/routing'
import type {
  EditAssetRequirement,
  EditScriptBriefQuestion,
  EditScriptBriefQuestionsPayload,
  EditScriptPayload,
  EditScriptShot,
} from './types'
import {
  editAssetExtractionSchema,
  editScriptBriefQuestionsSchema,
  editScriptCoreSchema,
} from './types'

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
  return {
    title: parsed.title.trim(),
    logline: parsed.logline?.trim() || null,
    durationSec,
    shotCount: shots.length,
    shots,
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
      if (seenQuestionIds.has(questionId)) {
        throw new Error(`EDIT_SCRIPT_BRIEF_DUPLICATE_QUESTION:${questionId}`)
      }
      seenQuestionIds.add(questionId)

      const optionIds = question.options.map((option) => option.id)
      const expectedOptionIds = ['A', 'B', 'C'] as const
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

export function withRequiredAspectRatioBriefQuestion(
  payload: EditScriptBriefQuestionsPayload,
  locale: Locale,
): EditScriptBriefQuestionsPayload {
  const aspectRatioQuestion = buildAspectRatioQuestion(locale)
  const nonRatioQuestions = payload.questions.filter((question) => !isAspectRatioQuestion(question))
  return {
    questions: [aspectRatioQuestion, ...nonRatioQuestions].slice(0, 4),
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
