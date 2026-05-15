export type BgmScoreCommandResult = {
  readonly stdout: string
  readonly stderr: string
}

export type BgmScoreCommandRunner = (
  command: string,
  args: readonly string[],
) => Promise<BgmScoreCommandResult>

const BGM_SCORE_MIX_LOUDNORM = 'loudnorm=I=-16.000:TP=-1.500:LRA=11.000'

export interface BgmScoreStemMixInput {
  readonly inputPath: string
  readonly startSec: number
  readonly durationSec: number
  readonly gainDb: number
  readonly fadeInSec: number
  readonly fadeOutSec: number
}

function formatFilterNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error('BGM_SCORE_AUDIO_FILTER_NUMBER_INVALID')
  return value.toFixed(3)
}

function stemFilter(input: BgmScoreStemMixInput, index: number): string {
  const delayMs = Math.max(0, Math.round(input.startSec * 1000))
  const fadeOutStart = Math.max(0, input.durationSec - input.fadeOutSec)
  const filters = [
    `[${index}:a]aresample=48000`,
    'aformat=sample_fmts=fltp:channel_layouts=stereo',
    `atrim=0:${formatFilterNumber(input.durationSec)}`,
    'asetpts=PTS-STARTPTS',
  ]
  if (input.fadeInSec > 0) {
    filters.push(`afade=t=in:st=0:d=${formatFilterNumber(input.fadeInSec)}`)
  }
  if (input.fadeOutSec > 0) {
    filters.push(`afade=t=out:st=${formatFilterNumber(fadeOutStart)}:d=${formatFilterNumber(input.fadeOutSec)}`)
  }
  filters.push(`volume=${formatFilterNumber(input.gainDb)}dB`)
  if (delayMs > 0) filters.push(`adelay=${delayMs}:all=1`)
  return `${filters.join(',')}[s${index}]`
}

export function buildBgmScoreMixFilter(input: {
  readonly stems: readonly BgmScoreStemMixInput[]
  readonly durationSeconds: number
}): string {
  if (input.stems.length === 0) throw new Error('BGM_SCORE_MIX_STEMS_REQUIRED')
  const stemFilters = input.stems.map((stem, index) => stemFilter(stem, index))
  const stemLabels = input.stems.map((_, index) => `[s${index}]`).join('')
  const mixFilter = input.stems.length === 1
    ? `${stemLabels}apad,atrim=0:${formatFilterNumber(input.durationSeconds)},asetpts=PTS-STARTPTS,${BGM_SCORE_MIX_LOUDNORM},alimiter=limit=0.95[aout]`
    : `${stemLabels}amix=inputs=${input.stems.length}:duration=longest:normalize=0,apad,atrim=0:${formatFilterNumber(input.durationSeconds)},asetpts=PTS-STARTPTS,${BGM_SCORE_MIX_LOUDNORM},alimiter=limit=0.95[aout]`
  return [...stemFilters, mixFilter].join(';')
}

export async function renderBgmScoreMix(input: {
  readonly runCommand: BgmScoreCommandRunner
  readonly stems: readonly BgmScoreStemMixInput[]
  readonly outputPath: string
  readonly durationSeconds: number
}): Promise<void> {
  if (input.stems.length === 0) throw new Error('BGM_SCORE_MIX_STEMS_REQUIRED')
  const args = [
    '-y',
    ...input.stems.flatMap((stem) => ['-i', stem.inputPath]),
    '-filter_complex',
    buildBgmScoreMixFilter({
      stems: input.stems,
      durationSeconds: input.durationSeconds,
    }),
    '-map',
    '[aout]',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    input.outputPath,
  ]
  await input.runCommand('ffmpeg', args)
}
