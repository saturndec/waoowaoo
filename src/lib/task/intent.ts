import { TASK_TYPE, type TaskType } from './types'

export type TaskIntent =
  | 'generate'
  | 'regenerate'
  | 'modify'
  | 'analyze'
  | 'build'
  | 'convert'
  | 'process'

export const TASK_INTENTS: TaskIntent[] = [
  'generate',
  'regenerate',
  'modify',
  'analyze',
  'build',
  'convert',
  'process',
]

const TASK_INTENT_SET = new Set<string>(TASK_INTENTS)

const TASK_INTENT_BY_TYPE: Record<TaskType, TaskIntent> = {
  [TASK_TYPE.IMAGE_PANEL]: 'generate',
  [TASK_TYPE.IMAGE_CHARACTER]: 'generate',
  [TASK_TYPE.IMAGE_LOCATION]: 'generate',
  [TASK_TYPE.MUSIC_GENERATE]: 'generate',
  [TASK_TYPE.FINAL_VIDEO_RENDER]: 'process',
  [TASK_TYPE.VIDEO_PANEL]: 'generate',
  [TASK_TYPE.VIDEO_GROUP]: 'generate',
  [TASK_TYPE.LIP_SYNC]: 'process',
  [TASK_TYPE.VOICE_LINE]: 'generate',
  [TASK_TYPE.VOICE_DESIGN]: 'generate',
  [TASK_TYPE.ASSET_HUB_VOICE_DESIGN]: 'generate',
  [TASK_TYPE.REGENERATE_STORYBOARD_TEXT]: 'regenerate',
  [TASK_TYPE.INSERT_PANEL]: 'build',
  [TASK_TYPE.PANEL_VARIANT]: 'regenerate',
  [TASK_TYPE.MODIFY_ASSET_IMAGE]: 'modify',
  [TASK_TYPE.REGENERATE_GROUP]: 'regenerate',
  [TASK_TYPE.ASSET_HUB_IMAGE]: 'generate',
  [TASK_TYPE.ASSET_HUB_MODIFY]: 'modify',
  [TASK_TYPE.ANALYZE_NOVEL]: 'analyze',
  [TASK_TYPE.CLIPS_BUILD]: 'build',
  [TASK_TYPE.SCREENPLAY_CONVERT]: 'convert',
  [TASK_TYPE.VOICE_ANALYZE]: 'analyze',
  [TASK_TYPE.ANALYZE_GLOBAL]: 'analyze',
  [TASK_TYPE.AI_STORY_EXPAND]: 'generate',
  [TASK_TYPE.AI_MODIFY_APPEARANCE]: 'modify',
  [TASK_TYPE.AI_MODIFY_LOCATION]: 'modify',
  [TASK_TYPE.AI_MODIFY_PROP]: 'modify',
  [TASK_TYPE.AI_MODIFY_SHOT_PROMPT]: 'modify',
  [TASK_TYPE.ANALYZE_SHOT_VARIANTS]: 'analyze',
  [TASK_TYPE.AI_CREATE_CHARACTER]: 'generate',
  [TASK_TYPE.AI_CREATE_LOCATION]: 'generate',
  [TASK_TYPE.REFERENCE_TO_CHARACTER]: 'process',
  [TASK_TYPE.EPISODE_SPLIT_LLM]: 'build',
  [TASK_TYPE.ASSET_HUB_AI_DESIGN_CHARACTER]: 'generate',
  [TASK_TYPE.ASSET_HUB_AI_DESIGN_LOCATION]: 'generate',
  [TASK_TYPE.ASSET_HUB_AI_MODIFY_CHARACTER]: 'modify',
  [TASK_TYPE.ASSET_HUB_AI_MODIFY_LOCATION]: 'modify',
  [TASK_TYPE.ASSET_HUB_AI_MODIFY_PROP]: 'modify',
  [TASK_TYPE.ASSET_HUB_REFERENCE_TO_CHARACTER]: 'process',
}

export function resolveTaskIntent(taskType: string | null | undefined): TaskIntent {
  if (!taskType) return 'process'
  if (taskType in TASK_INTENT_BY_TYPE) {
    return TASK_INTENT_BY_TYPE[taskType as TaskType]
  }
  return 'process'
}

export function isTaskIntent(value: unknown): value is TaskIntent {
  return typeof value === 'string' && TASK_INTENT_SET.has(value)
}

export function coerceTaskIntent(value: unknown, fallbackTaskType?: string | null): TaskIntent {
  if (isTaskIntent(value)) return value
  return resolveTaskIntent(fallbackTaskType)
}
