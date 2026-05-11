export const VIDEO_GRID_MODES = ['2x2', '3x3'] as const
export type VideoGridMode = (typeof VIDEO_GRID_MODES)[number]

export interface VideoGroupShot {
  readonly shotNumber: number
  readonly durationSec: number
  readonly visualAction: string
  readonly charactersAndScene?: string | null
  readonly camera: string
  readonly videoPrompt: string
  readonly sound: string
}

export interface VideoGroupPromptInput {
  readonly title: string
  readonly logline?: string | null
  readonly aspectRatio?: string | null
  readonly gridMode: VideoGridMode
  readonly styleContext?: string | null
  readonly shots: readonly VideoGroupShot[]
}
