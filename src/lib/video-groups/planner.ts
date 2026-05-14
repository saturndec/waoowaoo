import { inferVideoGridModeForShotCount, validateVideoGroupShotNumbers } from './core'
import type {
  VideoBlockPlan,
  VideoBlockPlanItem,
  VideoBlockPlanItemKind,
  VideoGroupShot,
  VideoGridMode,
} from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readPlanItems(value: Record<string, unknown>): readonly unknown[] {
  const items = value.items
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('VIDEO_BLOCK_PLAN_ITEMS_REQUIRED')
  }
  return items
}

function readShotNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) throw new Error('VIDEO_BLOCK_PLAN_SHOT_NUMBERS_REQUIRED')
  const numbers = value.map((item) => Number(item))
  if (numbers.some((item) => !Number.isInteger(item) || item <= 0)) {
    throw new Error('VIDEO_BLOCK_PLAN_SHOT_NUMBERS_INVALID')
  }
  return numbers
}

function readKind(value: Record<string, unknown>): VideoBlockPlanItemKind {
  const raw = readString(value.type) || readString(value.kind)
  if (raw === 'single' || raw === 'group') return raw
  throw new Error('VIDEO_BLOCK_PLAN_ITEM_TYPE_INVALID')
}

function normalizePlanGridMode(value: unknown): VideoGridMode | null {
  if (value === '2x2' || value === '3x3') return value
  if (value === undefined || value === null || value === '') return null
  throw new Error('VIDEO_BLOCK_PLAN_GRID_MODE_INVALID')
}

function assertPlanCoverage(items: readonly VideoBlockPlanItem[], allShotNumbers: readonly number[]) {
  const flattened = items.flatMap((item) => item.shotNumbers)
  if (flattened.length !== allShotNumbers.length) {
    throw new Error(`VIDEO_BLOCK_PLAN_SHOT_COVERAGE_INVALID:${flattened.length}:${allShotNumbers.length}`)
  }
  flattened.forEach((shotNumber, index) => {
    if (shotNumber !== allShotNumbers[index]) {
      throw new Error(`VIDEO_BLOCK_PLAN_SHOT_COVERAGE_INVALID:${shotNumber}:${allShotNumbers[index]}`)
    }
  })
}

export function normalizeVideoBlockPlanResponse(params: {
  readonly response: unknown
  readonly allShotNumbers: readonly number[]
  readonly shots?: readonly Pick<VideoGroupShot, 'shotNumber' | 'durationSec'>[]
}): VideoBlockPlan {
  const durationByShot = new Map((params.shots ?? []).map((shot) => [shot.shotNumber, shot.durationSec]))
  const root = isRecord(params.response) ? params.response : null
  if (!root) throw new Error('VIDEO_BLOCK_PLAN_RESPONSE_INVALID')
  const items = readPlanItems(root).map((raw): VideoBlockPlanItem => {
    if (!isRecord(raw)) throw new Error('VIDEO_BLOCK_PLAN_ITEM_INVALID')
    const kind = readKind(raw)
    const shotNumbers = readShotNumbers(raw.shotNumbers)
    const reason = readString(raw.reason)
    if (!reason) throw new Error('VIDEO_BLOCK_PLAN_REASON_REQUIRED')
    const prompt = readString(raw.prompt)
    if (!prompt) throw new Error('VIDEO_BLOCK_PLAN_PROMPT_REQUIRED')

    if (kind === 'single') {
      if (shotNumbers.length !== 1) throw new Error('VIDEO_BLOCK_PLAN_SINGLE_SHOT_COUNT_INVALID')
      return { kind, shotNumbers, reason, prompt }
    }

    const inferredGridMode = inferVideoGridModeForShotCount(shotNumbers.length)
    const requestedGridMode = normalizePlanGridMode(raw.gridMode)
    if (requestedGridMode && requestedGridMode !== inferredGridMode) {
      throw new Error(`VIDEO_BLOCK_PLAN_GRID_MODE_MISMATCH:${requestedGridMode}:${inferredGridMode}`)
    }
    const normalizedShotNumbers = validateVideoGroupShotNumbers({
      gridMode: inferredGridMode,
      shotNumbers,
    })
    if (durationByShot.size > 0) {
      const durationSec = normalizedShotNumbers.reduce((total, shotNumber) => {
        const duration = durationByShot.get(shotNumber)
        if (!duration) throw new Error(`VIDEO_BLOCK_PLAN_SHOT_DURATION_MISSING:${shotNumber}`)
        return total + duration
      }, 0)
      if (durationSec < 2 || durationSec > 15) {
        throw new Error(`VIDEO_BLOCK_PLAN_GROUP_DURATION_UNSUPPORTED:${durationSec}`)
      }
    }
    return {
      kind,
      shotNumbers: normalizedShotNumbers,
      gridMode: inferredGridMode,
      reason,
      prompt,
    }
  })

  assertPlanCoverage(items, params.allShotNumbers)
  return { items }
}
