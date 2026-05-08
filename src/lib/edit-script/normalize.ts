import type { EditAssetRequirement, EditScriptPayload, EditScriptShot } from './types'
import {
  editAssetExtractionSchema,
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

function normalizeTransition(value: string): string {
  const text = value.trim()
  return text.length > 0 ? text : 'hard cut'
}

export function normalizeEditScriptCore(raw: unknown, expectedShotCount: number): Omit<EditScriptPayload, 'requirements'> {
  const parsed = editScriptCoreSchema.parse(raw)
  if (parsed.shots.length !== expectedShotCount) {
    throw new Error(`EDIT_SCRIPT_SHOT_COUNT_MISMATCH:${parsed.shots.length}:${expectedShotCount}`)
  }

  const shots: EditScriptShot[] = parsed.shots
    .map((shot) => ({
      shotNumber: shot.shotNumber,
      durationSec: shot.durationSec,
      visualAction: shot.visualAction.trim(),
      charactersAndScene: shot.charactersAndScene.trim(),
      camera: shot.camera.trim(),
      videoPrompt: shot.videoPrompt.trim(),
      sound: shot.sound.trim(),
      transition: normalizeTransition(shot.transition),
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

export function resolveEditScriptDefaults(userPrompt: string): { durationSeconds: number; shotCount: number } {
  const text = userPrompt.trim()
  const minuteMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:分钟|minute|minutes|min)/i)
  if (minuteMatch) {
    const minutes = Number(minuteMatch[1])
    if (Number.isFinite(minutes) && minutes > 0) {
      const durationSeconds = Math.max(10, Math.round(minutes * 60))
      return { durationSeconds, shotCount: Math.max(4, Math.min(20, Math.round(durationSeconds / 7.5))) }
    }
  }

  const secondMatch = text.match(/(\d+)\s*(?:秒|second|seconds|sec|s)/i)
  if (secondMatch) {
    const durationSeconds = Number(secondMatch[1])
    if (Number.isInteger(durationSeconds) && durationSeconds > 0) {
      return { durationSeconds, shotCount: Math.max(4, Math.min(20, Math.round(durationSeconds / 7.5))) }
    }
  }

  return { durationSeconds: 60, shotCount: 8 }
}
