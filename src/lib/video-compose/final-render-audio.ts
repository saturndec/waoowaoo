export type FinalRenderAudioCommandResult = {
  readonly stdout: string
  readonly stderr: string
}

export type FinalRenderAudioCommandRunner = (
  command: string,
  args: readonly string[],
) => Promise<FinalRenderAudioCommandResult>

export type AudioLoudnessTarget = {
  readonly integratedLufs: number
  readonly truePeakDb: number
  readonly loudnessRange: number
}

export type AudioLoudnessMeasurement = {
  readonly inputIntegrated: number
  readonly inputTruePeak: number
  readonly inputLra: number
  readonly inputThreshold: number
  readonly targetOffset: number
}

export type FinalRenderAudioMixResult = {
  readonly hasSourceAudio: boolean
  readonly mainAudio?: AudioLoudnessMeasurement
  readonly bgm: AudioLoudnessMeasurement
}

export const MAIN_AUDIO_TARGET: AudioLoudnessTarget = {
  integratedLufs: -16,
  truePeakDb: -1.5,
  loudnessRange: 11,
}

export const BGM_AUDIO_TARGET: AudioLoudnessTarget = {
  integratedLufs: -12,
  truePeakDb: -1.5,
  loudnessRange: 11,
}

async function hasAudioStream(runCommand: FinalRenderAudioCommandRunner, filePath: string): Promise<boolean> {
  const result = await runCommand('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'a:0',
    '-show_entries',
    'stream=index',
    '-of',
    'csv=p=0',
    filePath,
  ])
  return result.stdout.trim().length > 0
}

function parseLoudnormNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseLoudnormMeasurement(stderr: string): AudioLoudnessMeasurement {
  const match = /\{[\s\S]*"input_i"[\s\S]*?\}/.exec(stderr)
  if (!match) throw new Error('FINAL_VIDEO_RENDER_LOUDNESS_ANALYSIS_FAILED')
  const parsed = JSON.parse(match[0]) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('FINAL_VIDEO_RENDER_LOUDNESS_ANALYSIS_FAILED')
  }
  const record = parsed as Record<string, unknown>
  const inputIntegrated = parseLoudnormNumber(record.input_i)
  const inputTruePeak = parseLoudnormNumber(record.input_tp)
  const inputLra = parseLoudnormNumber(record.input_lra)
  const inputThreshold = parseLoudnormNumber(record.input_thresh)
  const targetOffset = parseLoudnormNumber(record.target_offset)
  if (
    inputIntegrated === null ||
    inputTruePeak === null ||
    inputLra === null ||
    inputThreshold === null ||
    targetOffset === null
  ) {
    throw new Error('FINAL_VIDEO_RENDER_LOUDNESS_ANALYSIS_FAILED')
  }
  return {
    inputIntegrated,
    inputTruePeak,
    inputLra,
    inputThreshold,
    targetOffset,
  }
}

function formatFilterNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error('FINAL_VIDEO_RENDER_AUDIO_FILTER_NUMBER_INVALID')
  return value.toFixed(3)
}

function loudnormAnalyzeFilter(target: AudioLoudnessTarget): string {
  return [
    `I=${formatFilterNumber(target.integratedLufs)}`,
    `TP=${formatFilterNumber(target.truePeakDb)}`,
    `LRA=${formatFilterNumber(target.loudnessRange)}`,
    'print_format=json',
  ].join(':')
}

function loudnormNormalizeFilter(target: AudioLoudnessTarget): string {
  return loudnormAnalyzeFilter(target).replace(':print_format=json', '')
}

function loudnormApplyFilter(target: AudioLoudnessTarget, measurement: AudioLoudnessMeasurement): string {
  return [
    `I=${formatFilterNumber(target.integratedLufs)}`,
    `TP=${formatFilterNumber(target.truePeakDb)}`,
    `LRA=${formatFilterNumber(target.loudnessRange)}`,
    `measured_I=${formatFilterNumber(measurement.inputIntegrated)}`,
    `measured_TP=${formatFilterNumber(measurement.inputTruePeak)}`,
    `measured_LRA=${formatFilterNumber(measurement.inputLra)}`,
    `measured_thresh=${formatFilterNumber(measurement.inputThreshold)}`,
    `offset=${formatFilterNumber(measurement.targetOffset)}`,
    'linear=true',
    'print_format=summary',
  ].join(':')
}

async function analyzeAudioLoudness(
  runCommand: FinalRenderAudioCommandRunner,
  inputPath: string,
  target: AudioLoudnessTarget,
): Promise<AudioLoudnessMeasurement> {
  const result = await runCommand('ffmpeg', [
    '-hide_banner',
    '-nostats',
    '-i',
    inputPath,
    '-af',
    `loudnorm=${loudnormAnalyzeFilter(target)}`,
    '-f',
    'null',
    '-',
  ])
  return parseLoudnormMeasurement(result.stderr)
}

export async function renderFinalRenderClipAudio(input: {
  readonly runCommand: FinalRenderAudioCommandRunner
  readonly sourcePath: string
  readonly outputPath: string
  readonly durationSeconds: number
}): Promise<boolean> {
  const hasAudio = await hasAudioStream(input.runCommand, input.sourcePath)
  if (!hasAudio) {
    await input.runCommand('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-t',
      input.durationSeconds.toFixed(3),
      '-i',
      'anullsrc=r=48000:cl=stereo',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      input.outputPath,
    ])
    return false
  }

  await input.runCommand('ffmpeg', [
    '-y',
    '-i',
    input.sourcePath,
    '-t',
    input.durationSeconds.toFixed(3),
    '-vn',
    '-af',
    `aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,loudnorm=${loudnormNormalizeFilter(MAIN_AUDIO_TARGET)}`,
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    input.outputPath,
  ])
  return true
}

export async function concatFinalRenderAudioClips(input: {
  readonly runCommand: FinalRenderAudioCommandRunner
  readonly clipAudioPaths: readonly string[]
  readonly outputPath: string
}): Promise<void> {
  if (input.clipAudioPaths.length === 0) throw new Error('FINAL_VIDEO_RENDER_NO_AUDIO_CLIPS')
  const audioInputs = input.clipAudioPaths.flatMap((clipPath) => ['-i', clipPath])
  const filterInputs = input.clipAudioPaths.map((_, index) => `[${index}:a]`).join('')
  await input.runCommand('ffmpeg', [
    '-y',
    ...audioInputs,
    '-filter_complex',
    `${filterInputs}concat=n=${input.clipAudioPaths.length}:v=0:a=1[aout]`,
    '-map',
    '[aout]',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    input.outputPath,
  ])
}

export async function muxFinalRenderAudio(input: {
  readonly runCommand: FinalRenderAudioCommandRunner
  readonly stitchedPath: string
  readonly mainAudioPath: string
  readonly hasSourceAudio: boolean
  readonly musicPath: string
  readonly outputPath: string
  readonly durationSeconds: number
  readonly volume: number
}): Promise<FinalRenderAudioMixResult> {
  const fadeDuration = Math.min(2, Math.max(0.4, input.durationSeconds / 8))
  const fadeOutStart = Math.max(0, input.durationSeconds - fadeDuration)
  const bgmMeasurement = await analyzeAudioLoudness(input.runCommand, input.musicPath, BGM_AUDIO_TARGET)

  if (!input.hasSourceAudio) {
    await input.runCommand('ffmpeg', [
      '-y',
      '-i',
      input.stitchedPath,
      '-stream_loop',
      '-1',
      '-i',
      input.musicPath,
      '-filter_complex',
      `[1:a]atrim=0:${input.durationSeconds.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${fadeDuration.toFixed(3)},afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeDuration.toFixed(3)},loudnorm=${loudnormApplyFilter(BGM_AUDIO_TARGET, bgmMeasurement)},volume=${input.volume.toFixed(3)},alimiter=limit=0.95[aout]`,
      '-map',
      '0:v:0',
      '-map',
      '[aout]',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
      '-shortest',
      input.outputPath,
    ])
    return {
      hasSourceAudio: false,
      bgm: bgmMeasurement,
    }
  }

  const mainMeasurement = await analyzeAudioLoudness(input.runCommand, input.mainAudioPath, MAIN_AUDIO_TARGET)
  await input.runCommand('ffmpeg', [
    '-y',
    '-i',
    input.stitchedPath,
    '-i',
    input.mainAudioPath,
    '-stream_loop',
    '-1',
    '-i',
    input.musicPath,
    '-filter_complex',
    [
      `[1:a]loudnorm=${loudnormApplyFilter(MAIN_AUDIO_TARGET, mainMeasurement)}[main_norm]`,
      `[2:a]atrim=0:${input.durationSeconds.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${fadeDuration.toFixed(3)},afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeDuration.toFixed(3)},loudnorm=${loudnormApplyFilter(BGM_AUDIO_TARGET, bgmMeasurement)},volume=${input.volume.toFixed(3)}[bgm_norm]`,
      '[main_norm][bgm_norm]amix=inputs=2:duration=first:dropout_transition=0,alimiter=limit=0.95[aout]',
    ].join(';'),
    '-map',
    '0:v:0',
    '-map',
    '[aout]',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    '-shortest',
    input.outputPath,
  ])
  return {
    hasSourceAudio: true,
    mainAudio: mainMeasurement,
    bgm: bgmMeasurement,
  }
}
