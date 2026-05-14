import type { VideoGridMode, VideoGroupShot } from './types'

const GRID_CELLS = {
  '2x2': 4,
  '3x3': 9,
} as const satisfies Record<VideoGridMode, number>

function normalizeShotNumbers(shotNumbers: readonly number[]): number[] {
  const normalized = shotNumbers.map((value) => Number(value))
  if (normalized.some((value) => !Number.isInteger(value) || value <= 0)) {
    throw new Error('VIDEO_GROUP_SHOT_NUMBERS_INVALID')
  }
  const unique = new Set(normalized)
  if (unique.size !== normalized.length) throw new Error('VIDEO_GROUP_SHOT_NUMBERS_DUPLICATE')
  const sorted = [...normalized].sort((left, right) => left - right)
  sorted.forEach((shotNumber, index) => {
    if (index === 0) return
    if (shotNumber !== sorted[index - 1] + 1) {
      throw new Error('VIDEO_GROUP_SHOT_NUMBERS_NOT_CONTINUOUS')
    }
  })
  return sorted
}

export function videoGridCellCount(gridMode: VideoGridMode): number {
  return GRID_CELLS[gridMode]
}

export function validateVideoGroupShotNumbers(params: {
  readonly gridMode: VideoGridMode
  readonly shotNumbers: readonly number[]
}): number[] {
  const normalized = normalizeShotNumbers(params.shotNumbers)
  const maxCount = videoGridCellCount(params.gridMode)
  if (normalized.length < 2 || normalized.length > maxCount) {
    throw new Error(`VIDEO_GROUP_SHOT_COUNT_MISMATCH:${normalized.length}:2-${maxCount}`)
  }
  return normalized
}

export function inferVideoGridModeForShotCount(shotCount: number): VideoGridMode {
  if (Number.isInteger(shotCount) && shotCount >= 2 && shotCount <= 4) return '2x2'
  if (Number.isInteger(shotCount) && shotCount >= 5 && shotCount <= 9) return '3x3'
  throw new Error(`VIDEO_GROUP_SHOT_COUNT_UNSUPPORTED:${shotCount}`)
}

export function chunkVideoGroupShots(params: {
  readonly gridMode: VideoGridMode
  readonly shotNumbers: readonly number[]
}): number[][] {
  const normalized = normalizeShotNumbers(params.shotNumbers)
  const cellCount = videoGridCellCount(params.gridMode)
  const chunks: number[][] = []
  for (let index = 0; index < normalized.length; index += cellCount) {
    const chunk = normalized.slice(index, index + cellCount)
    if (chunk.length >= 2) chunks.push(chunk)
  }
  return chunks
}

export function totalVideoGroupDuration(shots: readonly Pick<VideoGroupShot, 'durationSec'>[]): number {
  return shots.reduce((total, shot) => total + shot.durationSec, 0)
}
