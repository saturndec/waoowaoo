import { AI_PROMPT_IDS, buildAiPrompt, type AiPromptLocale } from '@/lib/ai-prompts'
import type { VideoGridMode, VideoGroupPromptInput, VideoGroupShot } from './types'

const GRID_CELLS = {
  '2x2': 4,
  '3x3': 9,
} as const satisfies Record<VideoGridMode, number>

const GRID_LABELS_ZH = {
  '2x2': ['左上', '右上', '左下', '右下'],
  '3x3': ['左上', '上中', '右上', '左中', '中心', '右中', '左下', '下中', '右下'],
} as const satisfies Record<VideoGridMode, readonly string[]>

const GRID_LABELS_EN = {
  '2x2': ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
  '3x3': ['top-left', 'top-center', 'top-right', 'middle-left', 'center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'],
} as const satisfies Record<VideoGridMode, readonly string[]>

function formatTimestamp(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.round(totalSeconds))
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

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
  const expectedCount = videoGridCellCount(params.gridMode)
  if (normalized.length !== expectedCount) {
    throw new Error(`VIDEO_GROUP_SHOT_COUNT_MISMATCH:${normalized.length}:${expectedCount}`)
  }
  return normalized
}

export function chunkVideoGroupShots(params: {
  readonly gridMode: VideoGridMode
  readonly shotNumbers: readonly number[]
}): number[][] {
  const normalized = normalizeShotNumbers(params.shotNumbers)
  const cellCount = videoGridCellCount(params.gridMode)
  const chunks: number[][] = []
  for (let index = 0; index + cellCount <= normalized.length; index += cellCount) {
    chunks.push(normalized.slice(index, index + cellCount))
  }
  return chunks
}

export function buildVideoGroupPromptInstruction(input: VideoGroupPromptInput, locale: AiPromptLocale): string {
  const labels = locale === 'zh' ? GRID_LABELS_ZH[input.gridMode] : GRID_LABELS_EN[input.gridMode]
  let cursorSeconds = 0
  const gridMap = input.shots.map((shot, index) =>
    `${labels[index] ?? `Cell ${index + 1}`} = Shot ${shot.shotNumber}`).join('\n')
  const timelineMap = input.shots.map((shot) => {
    const start = cursorSeconds
    cursorSeconds += shot.durationSec
    const end = cursorSeconds
    return [
      `[${formatTimestamp(start)}-${formatTimestamp(end)}] Shot ${shot.shotNumber}`,
      `Visual action: ${shot.visualAction}`,
      `Characters and scene: ${shot.charactersAndScene || 'not specified'}`,
      `Camera: ${shot.camera}`,
      `Source video prompt: ${shot.videoPrompt}`,
      `Sound/rhythm: ${shot.sound}`,
    ].join('\n')
  }).join('\n\n')

  return buildAiPrompt({
    promptId: AI_PROMPT_IDS.VIDEO_GROUP_GRID_PROMPT,
    locale,
    variables: {
      title: input.title,
      story_context: input.logline || 'No additional story concept provided.',
      aspect_ratio: input.aspectRatio || 'not specified',
      grid_mode: input.gridMode,
      duration_seconds: String(cursorSeconds),
      grid_map: gridMap,
      timeline_map: timelineMap,
      style_context: input.styleContext || 'No additional style context provided.',
    },
  })
}

export function totalVideoGroupDuration(shots: readonly Pick<VideoGroupShot, 'durationSec'>[]): number {
  return shots.reduce((total, shot) => total + shot.durationSec, 0)
}
