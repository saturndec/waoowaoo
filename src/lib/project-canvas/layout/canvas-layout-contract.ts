import { z } from 'zod'
import type { CanvasNodeLayout, CanvasViewportLayout } from '@/lib/project-canvas/layout/canvas-layout.types'

export const CANVAS_LAYOUT_SCHEMA_VERSION = 1

export const projectCanvasNodeTypeSchema = z.enum([
  'story',
  'analysis',
  'scriptClip',
  'shot',
  'imageAsset',
  'videoClip',
  'finalTimeline',
  'editScript',
  'editRequiredAsset',
])

export type CanvasLayoutNodeType = z.infer<typeof projectCanvasNodeTypeSchema>

export const projectCanvasTargetTypeSchema = z.enum([
  'project',
  'episode',
  'clip',
  'storyboard',
  'panel',
  'videoGroup',
  'editScript',
  'editAssetRequirement',
])

const finiteNumberSchema = z.number().finite()

export const canvasViewportLayoutSchema = z.object({
  x: finiteNumberSchema,
  y: finiteNumberSchema,
  zoom: finiteNumberSchema.positive(),
}) satisfies z.ZodType<CanvasViewportLayout>

export const canvasNodeLayoutInputSchema = z.object({
  nodeKey: z.string().trim().min(1),
  nodeType: projectCanvasNodeTypeSchema,
  targetType: projectCanvasTargetTypeSchema,
  targetId: z.string().trim().min(1),
  x: finiteNumberSchema,
  y: finiteNumberSchema,
  width: finiteNumberSchema.positive(),
  height: finiteNumberSchema.positive(),
  zIndex: z.number().int(),
  locked: z.boolean(),
  collapsed: z.boolean(),
})

export type CanvasNodeLayoutInput = z.infer<typeof canvasNodeLayoutInputSchema>

export interface CanvasNodeLayoutSnapshot extends CanvasNodeLayout {
  readonly nodeType: CanvasLayoutNodeType
  readonly targetType: z.infer<typeof projectCanvasTargetTypeSchema>
  readonly targetId: string
}

export interface ProjectCanvasLayoutSnapshot {
  readonly projectId: string
  readonly episodeId: string
  readonly schemaVersion: number
  readonly viewport: CanvasViewportLayout
  readonly nodeLayouts: readonly CanvasNodeLayoutSnapshot[]
}

export const canvasNodeLayoutSnapshotSchema: z.ZodType<CanvasNodeLayoutSnapshot> = canvasNodeLayoutInputSchema

export const projectCanvasLayoutSnapshotSchema: z.ZodType<ProjectCanvasLayoutSnapshot> = z.object({
  projectId: z.string().trim().min(1),
  episodeId: z.string().trim().min(1),
  schemaVersion: z.number().int(),
  viewport: canvasViewportLayoutSchema,
  nodeLayouts: z.array(canvasNodeLayoutSnapshotSchema),
})

export const upsertCanvasLayoutInputSchema = z.object({
  episodeId: z.string().trim().min(1),
  viewport: canvasViewportLayoutSchema,
  nodeLayouts: z.array(canvasNodeLayoutInputSchema).max(2000),
})

export type UpsertCanvasLayoutInput = z.infer<typeof upsertCanvasLayoutInputSchema>
