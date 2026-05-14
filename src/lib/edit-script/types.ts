import { z } from 'zod'

export const EDIT_ASSET_KINDS = ['character', 'location'] as const
export type EditAssetKind = (typeof EDIT_ASSET_KINDS)[number]

export const EDIT_ASSET_STATUSES = ['pending', 'generating', 'completed', 'failed'] as const
export type EditAssetStatus = (typeof EDIT_ASSET_STATUSES)[number]

export const EDIT_BRIEF_OPTION_IDS = ['A', 'B', 'C', 'D', 'E', 'F'] as const
export type EditBriefOptionId = (typeof EDIT_BRIEF_OPTION_IDS)[number]

export const EDIT_SCRIPT_VIDEO_RATIOS = ['9:16', '16:9', '21:9'] as const
export type EditScriptVideoRatio = (typeof EDIT_SCRIPT_VIDEO_RATIOS)[number]

export interface EditScriptBriefQuestionOption {
  readonly id: EditBriefOptionId
  readonly label: string
}

export interface EditScriptBriefQuestion {
  readonly id: string
  readonly label: string
  readonly options: readonly EditScriptBriefQuestionOption[]
}

export interface EditScriptBriefQuestionsPayload {
  readonly questions: readonly EditScriptBriefQuestion[]
}

export interface EditScriptShot {
  readonly shotNumber: number
  readonly durationSec: number
  readonly visualAction: string
  readonly charactersAndScene: string
  readonly camera: string
  readonly videoPrompt: string
  readonly sound: string
}

export interface EditScriptVideoBlock {
  readonly kind: 'single' | 'group'
  readonly shotNumbers: readonly number[]
  readonly gridMode?: '2x2' | '3x3'
  readonly reason: string
  readonly prompt: string
}

export interface EditAssetRequirement {
  readonly id?: string
  readonly kind: EditAssetKind
  readonly name: string
  readonly description: string
  readonly shotNumbers: readonly number[]
  readonly status?: EditAssetStatus
  readonly targetId?: string | null
  readonly errorMessage?: string | null
  readonly previewImageUrl?: string | null
}

export interface EditScriptPayload {
  readonly id?: string
  readonly projectId?: string
  readonly episodeId?: string
  readonly userPrompt?: string
  readonly title: string
  readonly logline?: string | null
  readonly durationSec: number
  readonly shotCount: number
  readonly status?: string
  readonly shots: readonly EditScriptShot[]
  readonly videoBlocks: readonly EditScriptVideoBlock[]
  readonly requirements: readonly EditAssetRequirement[]
}

export const editScriptShotSchema = z.object({
  shotNumber: z.number().int().positive(),
  durationSec: z.number().int().min(1).max(5),
  visualAction: z.string().trim().min(1),
  charactersAndScene: z.string().trim().min(1),
  camera: z.string().trim().min(1),
  videoPrompt: z.string().trim().min(1),
  sound: z.string().trim().min(1),
})

export const editScriptCoreSchema = z.object({
  title: z.string().trim().min(1),
  logline: z.string().trim().optional().nullable(),
  durationSec: z.number().int().positive(),
  shots: z.array(editScriptShotSchema).min(1).max(60),
  videoBlocks: z.array(z.object({
    type: z.enum(['single', 'group']).optional(),
    kind: z.enum(['single', 'group']).optional(),
    shotNumbers: z.array(z.number().int().positive()).min(1).max(9),
    gridMode: z.enum(['2x2', '3x3']).optional(),
    reason: z.string().trim().min(1),
    prompt: z.string().trim().min(1),
  })).min(1).max(60),
})

export const editAssetRequirementSchema = z.object({
  kind: z.enum(EDIT_ASSET_KINDS),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  shotNumbers: z.array(z.number().int().positive()).min(1),
})

export const editAssetExtractionSchema = z.object({
  assets: z.array(editAssetRequirementSchema).min(1).max(40),
})

export const editScriptBriefQuestionOptionSchema = z.object({
  id: z.enum(EDIT_BRIEF_OPTION_IDS),
  label: z.string().trim().min(1),
})

export const editScriptBriefQuestionSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  options: z.array(editScriptBriefQuestionOptionSchema).min(1).max(6),
})

export const editScriptBriefQuestionsSchema = z.object({
  questions: z.array(editScriptBriefQuestionSchema).min(0).max(3),
})

export const createEditScriptRequestSchema = z.object({
  episodeId: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  videoRatio: z.enum(EDIT_SCRIPT_VIDEO_RATIOS).optional(),
  artStyle: z.string().trim().min(1).optional(),
})

export const createEditScriptBriefQuestionsRequestSchema = z.object({
  episodeId: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
})

export const getEditScriptRequestSchema = z.object({
  episodeId: z.string().trim().min(1),
})

export const updateEditScriptVideoBlockPromptRequestSchema = z.object({
  episodeId: z.string().trim().min(1),
  editScriptId: z.string().trim().min(1),
  blockIndex: z.number().int().min(0).max(59),
  prompt: z.string().trim().min(1),
})

export const generateEditAssetsRequestSchema = z.object({
  episodeId: z.string().trim().min(1),
  editScriptId: z.string().trim().min(1).optional(),
  requirementId: z.string().trim().min(1).optional(),
})

export const generateEditStoryboardRequestSchema = z.object({
  episodeId: z.string().trim().min(1),
  editScriptId: z.string().trim().min(1).optional(),
})
