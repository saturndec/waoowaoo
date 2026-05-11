'use client'

import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { CanvasNodeLayout } from '@/lib/project-canvas/layout/canvas-layout.types'
import type {
  ProjectClip,
  ProjectEditAssetRequirement,
  ProjectEditScript,
  ProjectFinalVideo,
  ProjectPanel,
  ProjectShot,
  ProjectStoryboard,
  ProjectVideoGroup,
} from '@/types/project'
import type {
  WorkspaceCanvasAssetRef,
  WorkspaceCanvasFlowEdge,
  WorkspaceCanvasFlowNode,
  WorkspaceCanvasImageDetails,
  WorkspaceCanvasNodeActionHandler,
  WorkspaceCanvasNodeData,
  WorkspaceCanvasProjection,
  WorkspaceCanvasScriptDetails,
  WorkspaceCanvasScriptScene,
  WorkspaceCanvasShotDetails,
  WorkspaceCanvasTextLine,
  WorkspaceCanvasVideoDetails,
} from '../node-canvas-types'

const DEFAULT_NODE_WIDTH = 320
const MEDIA_NODE_WIDTH = 300
const FINAL_NODE_WIDTH = 340
const DEFAULT_NODE_HEIGHT = 214
const EDIT_SCRIPT_NODE_HEIGHT = 620
const EDIT_ASSET_NODE_HEIGHT = 520
const STORY_COLUMN_X = 260
const COLUMN_GAP = 940
const ROW_GAP = 248
const EDIT_SCRIPT_TABLE_NODE_WIDTH = 1480
const EDIT_ASSET_NODE_WIDTH = 420
const EDIT_ASSET_GRID_COLUMNS = 4
const EDIT_ASSET_GRID_GAP_X = 44
const EDIT_ASSET_GRID_GAP_Y = 120
const PANEL_GRID_COLUMNS = 5
const PANEL_GRID_GAP_X = 44
const SHOT_NODE_HEIGHT = 560
const SHOT_GRID_ROW_GAP = 632
const MEDIA_GRID_ROW_GAP = 462
const PANEL_GRID_BASE_X = STORY_COLUMN_X + COLUMN_GAP * 2
const NODE_CONTENT_INLINE_PADDING = 40
const DEFAULT_MEDIA_PREVIEW_HEIGHT = 118
const MAX_MEDIA_PREVIEW_HEIGHT = 220

interface TranslateValues {
  readonly [key: string]: string | number
}

type Translate = (key: string, values?: TranslateValues) => string

export interface BuildWorkspaceNodeCanvasProjectionInput {
  readonly projectId?: string
  readonly episodeId: string
  readonly episodeName?: string
  readonly storyText: string
  readonly clips: readonly ProjectClip[]
  readonly storyboards: readonly ProjectStoryboard[]
  readonly shots?: readonly ProjectShot[]
  readonly editScript?: ProjectEditScript | null
  readonly finalVideo?: ProjectFinalVideo | null
  readonly videoGroups?: readonly ProjectVideoGroup[]
  readonly defaultVideoModel?: string | null
  readonly finalRenderPhase?: 'idle' | 'queued' | 'processing' | 'completed' | 'failed'
  readonly finalRenderErrorMessage?: string | null
  readonly savedLayouts: readonly CanvasNodeLayout[]
  readonly translate: Translate
  readonly onAction?: WorkspaceCanvasNodeActionHandler
}

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parseJson(value: string | null | undefined): unknown | null {
  if (!value?.trim()) return null
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  values.forEach((value) => {
    const normalized = value.trim()
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    output.push(normalized)
  })
  return output
}

function parseStringList(value: string | null | undefined): string[] {
  if (!value?.trim()) return []
  const parsed = parseJson(value)
  if (Array.isArray(parsed)) {
    return uniqueStrings(parsed.flatMap((item) => {
      if (typeof item === 'string') return [item]
      if (isRecord(item)) {
        const name = stringValue(item.name) ?? stringValue(item.location) ?? stringValue(item.title)
        return name ? [name] : []
      }
      return []
    }))
  }
  return uniqueStrings(value.split(','))
}

function parseAssetRefs(value: string | null | undefined): WorkspaceCanvasAssetRef[] {
  if (!value?.trim()) return []
  const parsed = parseJson(value)
  if (Array.isArray(parsed)) {
    const refs = parsed.flatMap((item): WorkspaceCanvasAssetRef[] => {
      if (typeof item === 'string' && item.trim()) return [{ name: item.trim() }]
      if (!isRecord(item)) return []
      const name = stringValue(item.name)
      if (!name) return []
      return [{ name, appearance: stringValue(item.appearance) }]
    })
    const seen = new Set<string>()
    return refs.filter((ref) => {
      const key = `${ref.name}::${ref.appearance ?? ''}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  return parseStringList(value).map((name) => ({ name }))
}

function formatTimeRange(start: number | null | undefined, end: number | null | undefined): string | null {
  if (typeof start !== 'number' || typeof end !== 'number') return null
  return `${start}s - ${end}s`
}

function parseScreenplayScenes(screenplay: string | null | undefined): WorkspaceCanvasScriptScene[] {
  const parsed = parseJson(screenplay)
  const scenesValue = isRecord(parsed) ? parsed.scenes : parsed
  if (!Array.isArray(scenesValue)) return []

  return scenesValue.flatMap((scene): WorkspaceCanvasScriptScene[] => {
    if (!isRecord(scene)) return []
    const headingValue = scene.heading
    const heading = (() => {
      if (typeof headingValue === 'string') return headingValue
      if (!isRecord(headingValue)) return null
      const parts = [
        stringValue(headingValue.int_ext),
        stringValue(headingValue.location),
        stringValue(headingValue.time),
      ].filter((part): part is string => Boolean(part))
      return parts.length > 0 ? parts.join(' · ') : null
    })()

    const rawCharacters = scene.characters
    const characters = Array.isArray(rawCharacters)
      ? uniqueStrings(rawCharacters.flatMap((item) => (typeof item === 'string' ? [item] : [])))
      : []

    const rawContent = scene.content
    const lines = Array.isArray(rawContent)
      ? rawContent.flatMap((item): WorkspaceCanvasTextLine[] => {
        if (typeof item === 'string' && item.trim()) return [{ kind: 'text', text: item.trim() }]
        if (!isRecord(item)) return []
        const text = stringValue(item.text)
        if (!text) return []
        const type = stringValue(item.type)
        const kind: WorkspaceCanvasTextLine['kind'] =
          type === 'dialogue' || type === 'voiceover' || type === 'action' ? type : 'text'
        return [{
          kind,
          speaker: stringValue(item.character),
          text,
        }]
      })
      : []

    return [{
      sceneNumber: numberValue(scene.scene_number),
      heading,
      description: stringValue(scene.description),
      characters,
      lines,
    }]
  })
}

function collectSceneLocations(scenes: readonly WorkspaceCanvasScriptScene[]): string[] {
  return uniqueStrings(scenes.flatMap((scene) => {
    if (!scene.heading) return []
    const parts = scene.heading.split(' · ')
    return parts.length >= 2 ? [parts[1]] : []
  }))
}

function createScriptDetails(clip: ProjectClip): WorkspaceCanvasScriptDetails {
  const scenes = parseScreenplayScenes(clip.screenplay)
  const sceneCharacters = scenes.flatMap((scene) => scene.characters).map((name) => ({ name }))
  const explicitCharacters = parseAssetRefs(clip.characters)
  const characters = explicitCharacters.length > 0 ? explicitCharacters : sceneCharacters
  const explicitLocations = parseStringList(clip.location)
  return {
    originalText: clip.content,
    screenplayText: clip.screenplay,
    scenes,
    characters,
    locations: explicitLocations.length > 0 ? explicitLocations : collectSceneLocations(scenes),
    props: parseStringList(clip.props),
    timeRange: formatTimeRange(clip.start, clip.end),
    duration: clip.duration ?? null,
    shotCount: clip.shotCount ?? null,
  }
}

function parseCandidateImages(value: string | null | undefined): string[] {
  const parsed = parseJson(value)
  if (!Array.isArray(parsed)) return []
  return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function stringifyJsonObject(value: unknown): readonly WorkspaceCanvasTextLine[] {
  if (!isRecord(value)) return []
  return Object.entries(value).flatMap(([key, entry]): WorkspaceCanvasTextLine[] => {
    if (entry === null || entry === undefined || entry === '') return []
    const text = typeof entry === 'object' ? JSON.stringify(entry) : String(entry)
    return [{ kind: 'text', speaker: key, text }]
  })
}

function createImageDetails(panel: ProjectPanel): WorkspaceCanvasImageDetails {
  return {
    imagePrompt: panel.imagePrompt,
    description: panel.description,
    candidateImages: parseCandidateImages(panel.candidateImages),
    imageHistory: panel.imageHistory,
    sketchImageUrl: panel.sketchImageMedia?.url ?? panel.sketchImageUrl,
    previousImageUrl: panel.previousImageMedia?.url ?? panel.previousImageUrl,
    errorMessage: panel.imageErrorMessage,
  }
}

function primaryPanelImageUrl(panel: ProjectPanel): string | null {
  return panel.media?.url
    ?? panel.imageUrl
    ?? parseCandidateImages(panel.candidateImages).find((url) => !url.startsWith('PENDING:'))
    ?? null
}

function createVideoDetails(panel: ProjectPanel): WorkspaceCanvasVideoDetails {
  return {
    videoPrompt: panel.videoPrompt,
    firstLastFramePrompt: panel.firstLastFramePrompt,
    videoGenerationMode: panel.videoGenerationMode,
    lastVideoGenerationOptions: stringifyJsonObject(panel.lastVideoGenerationOptions),
    videoUrl: panel.videoMedia?.url ?? panel.videoUrl,
    videoModel: panel.videoModel,
    linkedToNextPanel: panel.linkedToNextPanel,
    errorMessage: panel.videoErrorMessage,
  }
}

function mediaAspectRatio(media: { readonly width?: number | null; readonly height?: number | null } | null | undefined): number | null {
  const width = media?.width
  const height = media?.height
  if (typeof width !== 'number' || typeof height !== 'number') return null
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  return width / height
}

function panelImageAspectRatio(panel: ProjectPanel): number | null {
  return mediaAspectRatio(panel.media)
}

function panelVideoAspectRatio(panel: ProjectPanel): number | null {
  return mediaAspectRatio(panel.lipSyncVideoMedia)
    ?? mediaAspectRatio(panel.videoMedia)
    ?? panelImageAspectRatio(panel)
}

function estimateMediaPreviewHeight(nodeWidth: number, aspectRatio: number | null): number {
  if (!aspectRatio || aspectRatio <= 0 || !Number.isFinite(aspectRatio)) return DEFAULT_MEDIA_PREVIEW_HEIGHT
  const contentWidth = Math.max(120, nodeWidth - NODE_CONTENT_INLINE_PADDING)
  return Math.min(MAX_MEDIA_PREVIEW_HEIGHT, Math.max(96, Math.round(contentWidth / aspectRatio)))
}

function estimateMediaNodeHeight(baseHeight: number, previewHeight: number): number {
  return baseHeight + Math.max(0, previewHeight - DEFAULT_MEDIA_PREVIEW_HEIGHT)
}

function findPromptShot(panel: ProjectPanel, shots: readonly ProjectShot[]): ProjectShot | null {
  const panelNumber = panel.panelNumber ?? panel.panelIndex + 1
  const paddedPanelNumber = String(panelNumber).padStart(2, '0')
  return shots.find((shot) => (
    shot.id === panel.id ||
    shot.shotId === String(panelNumber) ||
    shot.shotId === paddedPanelNumber
  )) ?? null
}

function createShotDetails(
  panel: ProjectPanel,
  storyboard: ProjectStoryboard,
  shots: readonly ProjectShot[],
): WorkspaceCanvasShotDetails {
  const promptShot = findPromptShot(panel, shots)
  return {
    shotType: panel.shotType,
    cameraMove: panel.cameraMove,
    characters: parseAssetRefs(panel.characters),
    location: panel.location,
    props: parseStringList(panel.props),
    srtSegment: panel.srtSegment,
    timeRange: formatTimeRange(panel.srtStart, panel.srtEnd),
    duration: panel.duration,
    imagePrompt: panel.imagePrompt,
    videoPrompt: panel.videoPrompt,
    photographyRules: panel.photographyRules,
    actingNotes: panel.actingNotes,
    storyboardTextJson: storyboard.storyboardTextJson,
    photographyPlan: storyboard.photographyPlan,
    errorMessage: panel.imageErrorMessage ?? storyboard.lastError,
    promptShot: promptShot
      ? {
          sequence: promptShot.sequence,
          locations: promptShot.locations,
          characters: promptShot.characters,
          plot: promptShot.plot,
          pov: promptShot.pov,
          imagePrompt: promptShot.imagePrompt,
          scale: promptShot.scale,
          module: promptShot.module,
          focus: promptShot.focus,
          zhSummarize: promptShot.zhSummarize,
        }
      : null,
  }
}

function compactText(value: string | null | undefined, fallback: string): string {
  const text = value?.trim()
  if (!text) return fallback
  return text.length > 220 ? `${text.slice(0, 220)}...` : text
}

function estimateWrappedLineCount(text: string | null | undefined, charactersPerLine: number): number {
  const normalized = text?.trim()
  if (!normalized) return 1
  return normalized
    .split(/\r?\n/)
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.trim().length / charactersPerLine)), 0)
}

function estimateEditScriptNodeHeight(editScript: ProjectEditScript): number {
  if (editScript.shots.length <= 8) return EDIT_SCRIPT_NODE_HEIGHT
  const rowHeightTotal = editScript.shots.reduce((total, shot) => {
    const textLength = [
      shot.visualAction,
      shot.charactersAndScene,
      shot.camera,
      shot.videoPrompt,
      shot.sound,
    ].reduce((sum, value) => sum + (value?.trim().length ?? 0), 0)
    return total + Math.max(110, 74 + Math.ceil(textLength / 120) * 22)
  }, 0)
  const summaryHeight = estimateWrappedLineCount(editScript.logline || editScript.userPrompt, 90) * 22
  return 230 + summaryHeight + rowHeightTotal
}

function estimateEditAssetNodeHeight(asset: ProjectEditAssetRequirement): number {
  return asset.status === 'pending' || asset.status === 'failed'
    ? EDIT_ASSET_NODE_HEIGHT + 64
    : EDIT_ASSET_NODE_HEIGHT
}

function sortPanels(panels: readonly ProjectPanel[]): ProjectPanel[] {
  return [...panels].sort((a, b) => {
    const aNumber = a.panelNumber ?? a.panelIndex
    const bNumber = b.panelNumber ?? b.panelIndex
    return aNumber - bNumber
  })
}

function sortedStoryboards(storyboards: readonly ProjectStoryboard[], clipOrder: ReadonlyMap<string, number>): ProjectStoryboard[] {
  return [...storyboards].sort((a, b) => {
    const aOrder = clipOrder.get(a.clipId) ?? Number.MAX_SAFE_INTEGER
    const bOrder = clipOrder.get(b.clipId) ?? Number.MAX_SAFE_INTEGER
    if (aOrder !== bOrder) return aOrder - bOrder
    return a.id.localeCompare(b.id)
  })
}

function gridPosition(input: {
  readonly index: number
  readonly baseX: number
  readonly baseY: number
  readonly width: number
  readonly rowGap: number
}): { readonly x: number; readonly y: number } {
  const column = input.index % PANEL_GRID_COLUMNS
  const row = Math.floor(input.index / PANEL_GRID_COLUMNS)
  return {
    x: input.baseX + column * (input.width + PANEL_GRID_GAP_X),
    y: input.baseY + row * input.rowGap,
  }
}

function layoutStyle(width: number, height: number): CSSProperties {
  return { width, height }
}

function resolvePosition(params: {
  readonly nodeKey: string
  readonly fallbackX: number
  readonly fallbackY: number
  readonly savedLayoutByKey: ReadonlyMap<string, CanvasNodeLayout>
  readonly ignoreSavedLayout?: boolean
}): { readonly x: number; readonly y: number } {
  if (params.ignoreSavedLayout) return { x: params.fallbackX, y: params.fallbackY }
  const saved = params.savedLayoutByKey.get(params.nodeKey)
  if (!saved) return { x: params.fallbackX, y: params.fallbackY }
  return { x: saved.x, y: saved.y }
}

function createNode(params: {
  readonly id: string
  readonly fallbackX: number
  readonly fallbackY: number
  readonly zIndex: number
  readonly data: WorkspaceCanvasNodeData
  readonly savedLayoutByKey: ReadonlyMap<string, CanvasNodeLayout>
  readonly ignoreSavedLayout?: boolean
}): WorkspaceCanvasFlowNode {
  const position = resolvePosition({
    nodeKey: params.id,
    fallbackX: params.fallbackX,
    fallbackY: params.fallbackY,
    savedLayoutByKey: params.savedLayoutByKey,
    ignoreSavedLayout: params.ignoreSavedLayout,
  })

  return {
    id: params.id,
    type: 'workspaceNode',
    position,
    zIndex: params.zIndex,
    draggable: true,
    selectable: true,
    style: layoutStyle(params.data.width, params.data.height),
    data: {
      ...params.data,
      nodeId: params.id,
    },
  }
}

function createEdge(id: string, source: string, target: string): WorkspaceCanvasFlowEdge {
  return {
    id,
    source,
    target,
    type: 'smoothstep',
    animated: false,
    style: {
      stroke: '#64748b',
      strokeWidth: 1.5,
    },
  }
}

function hasImage(panel: ProjectPanel): boolean {
  return Boolean(
    panel.imageUrl ||
    panel.media?.url ||
    panel.imageTaskRunning ||
    panel.candidateImages ||
    panel.imageHistory ||
    panel.sketchImageUrl ||
    panel.sketchImageMedia?.url ||
    panel.previousImageUrl ||
    panel.previousImageMedia?.url ||
    panel.imageErrorMessage
  )
}

function hasVideo(panel: ProjectPanel): boolean {
  return Boolean(
    panel.videoUrl ||
    panel.videoMedia?.url ||
    panel.videoTaskRunning ||
    panel.videoErrorMessage
  )
}

function hasGeneratedVideo(panel: ProjectPanel): boolean {
  return Boolean(panel.videoUrl || panel.videoMedia?.url)
}

function canGenerateVideo(panel: ProjectPanel): boolean {
  return Boolean((panel.imageUrl || panel.media?.url) && !panel.videoTaskRunning)
}

function shouldShowVideoNode(panel: ProjectPanel): boolean {
  return hasVideo(panel) || canGenerateVideo(panel)
}

function panelDisplayNumber(panel: ProjectPanel): string {
  return String(panel.panelNumber ?? panel.panelIndex + 1).padStart(2, '0')
}

function assetStatusLabel(status: ProjectEditAssetRequirement['status'], translate: Translate): string {
  if (status === 'generating') return translate('status.processing')
  if (status === 'failed') return translate('status.failed')
  if (status === 'completed') return translate('status.ready')
  return translate('status.pending')
}

function assetKindLabel(kind: ProjectEditAssetRequirement['kind'], translate: Translate): string {
  return kind === 'character' ? translate('nodeFields.characterAsset') : translate('nodeFields.locationAsset')
}

export function buildWorkspaceNodeCanvasProjection({
  episodeId,
  storyText,
  clips,
  storyboards,
  shots = [],
  editScript,
  finalVideo,
  videoGroups = [],
  defaultVideoModel,
  finalRenderPhase,
  finalRenderErrorMessage,
  savedLayouts,
  translate,
  onAction,
}: BuildWorkspaceNodeCanvasProjectionInput): WorkspaceCanvasProjection {
  const savedLayoutByKey = new Map(savedLayouts.map((layout) => [layout.nodeKey, layout]))
  const nodes: WorkspaceCanvasFlowNode[] = []
  const edges: WorkspaceCanvasFlowEdge[] = []
  let zIndex = 0

  const storyBody = storyText.trim()
  const hasStory = storyBody.length > 0
  const analysisNodeId = `analysis:${episodeId}`
  if (hasStory) {
    nodes.push(createNode({
      id: analysisNodeId,
      fallbackX: STORY_COLUMN_X,
      fallbackY: 180,
      zIndex: zIndex++,
      savedLayoutByKey,
      data: {
        kind: 'analysis',
        layoutNodeType: 'analysis',
        targetType: 'episode',
        targetId: episodeId,
        title: translate('nodes.analysis.title'),
        eyebrow: translate('nodes.analysis.eyebrow'),
        body: translate('nodes.analysis.body', {
          clips: clips.length,
          storyboards: storyboards.length,
          panels: storyboards.reduce((total, storyboard) => total + (storyboard.panels?.length ?? 0), 0),
        }),
        meta: translate('nodes.analysis.meta'),
        statusLabel: translate('status.ready'),
        width: DEFAULT_NODE_WIDTH,
        height: DEFAULT_NODE_HEIGHT,
        onAction,
      },
    }))
  }

  if (editScript) {
    const editScriptNodeId = `edit-script:${editScript.id}`
    const editScriptFallbackY = hasStory ? 430 : 180
    const editScriptHeight = estimateEditScriptNodeHeight(editScript)
    const assetsToGenerate = editScript.requirements.some((asset) => asset.status !== 'completed')
    const completedAssets = editScript.requirements.filter((asset) => asset.status === 'completed').length
    const hasStoryboardPanels = storyboards.some((storyboard) => (storyboard.panels?.length ?? 0) > 0)
    const editScriptAction = assetsToGenerate
      ? { label: translate('actions.generateEditAssets'), action: { type: 'generate_edit_assets', editScriptId: editScript.id } as const }
      : hasStoryboardPanels
        ? null
        : { label: translate('actions.generateStoryboard'), action: { type: 'generate_edit_storyboard', editScriptId: editScript.id } as const }
    nodes.push(createNode({
      id: editScriptNodeId,
      fallbackX: STORY_COLUMN_X,
      fallbackY: editScriptFallbackY,
      zIndex: zIndex++,
      savedLayoutByKey,
      ignoreSavedLayout: true,
      data: {
        kind: 'editScript',
        layoutNodeType: 'editScript',
        targetType: 'editScript',
        targetId: editScript.id,
        title: editScript.title,
        eyebrow: translate('nodes.editScript.eyebrow'),
        body: compactText(editScript.logline || editScript.userPrompt, translate('empty.editScript')),
        meta: translate('nodes.editScript.meta', {
          shots: editScript.shotCount,
          duration: editScript.durationSec,
          assets: editScript.requirements.length,
          completed: completedAssets,
        }),
        statusLabel: translate('status.ready'),
        width: EDIT_SCRIPT_TABLE_NODE_WIDTH,
        height: editScriptHeight,
        indexLabel: 'E',
        editScriptDetails: {
          durationSec: editScript.durationSec,
          shotCount: editScript.shotCount,
          shots: editScript.shots,
        },
        actionLabel: editScriptAction?.label,
        action: editScriptAction?.action,
        onAction,
      },
    }))

    const assetBaseY = editScriptFallbackY + editScriptHeight + 120
    let assetRowY = assetBaseY
    let assetRowMaxHeight = 0
    editScript.requirements.forEach((asset, index) => {
      const nodeId = `edit-asset:${asset.id}`
      const canGenerateAsset = asset.status === 'pending' || asset.status === 'failed'
      const nodeHeight = estimateEditAssetNodeHeight(asset)
      const column = index % EDIT_ASSET_GRID_COLUMNS
      if (column === 0 && index > 0) {
        assetRowY += assetRowMaxHeight + EDIT_ASSET_GRID_GAP_Y
        assetRowMaxHeight = 0
      }
      assetRowMaxHeight = Math.max(assetRowMaxHeight, nodeHeight)
      nodes.push(createNode({
        id: nodeId,
        fallbackX: STORY_COLUMN_X + column * (EDIT_ASSET_NODE_WIDTH + EDIT_ASSET_GRID_GAP_X),
        fallbackY: assetRowY,
        zIndex: zIndex++,
        savedLayoutByKey,
        ignoreSavedLayout: true,
        data: {
          kind: 'editRequiredAsset',
          layoutNodeType: 'editRequiredAsset',
          targetType: 'editAssetRequirement',
          targetId: asset.id,
          title: asset.name,
          eyebrow: assetKindLabel(asset.kind, translate),
          body: compactText(asset.description, translate('empty.editAsset')),
          meta: translate('nodes.editAsset.meta', { shots: asset.shotNumbers.join(', ') }),
          statusLabel: assetStatusLabel(asset.status, translate),
          width: EDIT_ASSET_NODE_WIDTH,
          height: nodeHeight,
          indexLabel: asset.kind === 'character' ? 'C' : 'L',
          previewImageUrl: asset.previewImageUrl,
          editAssetDetails: {
            kind: asset.kind,
            description: asset.description,
            shotNumbers: asset.shotNumbers,
            targetId: asset.targetId,
            errorMessage: asset.errorMessage,
          },
          actionLabel: canGenerateAsset ? translate('actions.generateEditAsset') : undefined,
          action: canGenerateAsset ? { type: 'generate_edit_asset', editScriptId: editScript.id, requirementId: asset.id } : undefined,
          onAction,
        },
      }))
      edges.push(createEdge(`edge:edit-script-asset:${asset.id}`, editScriptNodeId, nodeId))
    })
  }

  const clipOrder = new Map(clips.map((clip, index) => [clip.id, index]))
  const clipNodeIds = new Map<string, string>()
  clips.forEach((clip, index) => {
    const nodeId = `clip:${clip.id}`
    clipNodeIds.set(clip.id, nodeId)
    nodes.push(createNode({
      id: nodeId,
      fallbackX: STORY_COLUMN_X + COLUMN_GAP,
      fallbackY: 80 + index * ROW_GAP,
      zIndex: zIndex++,
      savedLayoutByKey,
      data: {
        kind: 'scriptClip',
        layoutNodeType: 'scriptClip',
        targetType: 'clip',
        targetId: clip.id,
        title: clip.summary || translate('nodes.clip.title', { index: index + 1 }),
        eyebrow: translate('nodes.clip.eyebrow'),
        body: compactText(clip.screenplay || clip.content || clip.summary, translate('empty.clip')),
        meta: translate('nodes.clip.meta', { index: index + 1 }),
        statusLabel: translate('status.ready'),
        width: DEFAULT_NODE_WIDTH,
        height: 360,
        indexLabel: `C${index + 1}`,
        scriptDetails: createScriptDetails(clip),
        actionLabel: translate('actions.generateStoryboard'),
        action: { type: 'generate_storyboard' },
        onAction,
      },
    }))
    if (hasStory) {
      edges.push(createEdge(`edge:analysis-clip:${clip.id}`, analysisNodeId, nodeId))
    }
  })

  const panelsWithStoryboard = sortedStoryboards(storyboards, clipOrder).flatMap((storyboard) => (
    sortPanels(storyboard.panels ?? []).map((panel) => ({ storyboard, panel }))
  ))
  const panelGridRows = Math.max(1, Math.ceil(panelsWithStoryboard.length / PANEL_GRID_COLUMNS))
  const shotPreviewByPanelId = new Map<string, { aspectRatio: number | null; height: number; nodeHeight: number }>()
  const videoPreviewByPanelId = new Map<string, { aspectRatio: number | null; height: number; nodeHeight: number }>()
  panelsWithStoryboard.forEach(({ panel }) => {
    const shotAspectRatio = panelImageAspectRatio(panel)
    const shotPreviewHeight = estimateMediaPreviewHeight(DEFAULT_NODE_WIDTH, shotAspectRatio)
    shotPreviewByPanelId.set(panel.id, {
      aspectRatio: shotAspectRatio,
      height: shotPreviewHeight,
      nodeHeight: estimateMediaNodeHeight(SHOT_NODE_HEIGHT, shotPreviewHeight),
    })

    const videoAspectRatio = panelVideoAspectRatio(panel)
    const videoPreviewHeight = estimateMediaPreviewHeight(MEDIA_NODE_WIDTH, videoAspectRatio)
    videoPreviewByPanelId.set(panel.id, {
      aspectRatio: videoAspectRatio,
      height: videoPreviewHeight,
      nodeHeight: estimateMediaNodeHeight(410, videoPreviewHeight),
    })
  })
  const shotGridRowGap = Math.max(
    SHOT_GRID_ROW_GAP,
    ...Array.from(shotPreviewByPanelId.values()).map((preview) => preview.nodeHeight + 72),
  )
  const mediaGridRowGap = Math.max(
    MEDIA_GRID_ROW_GAP,
    ...Array.from(videoPreviewByPanelId.values()).map((preview) => preview.nodeHeight + 72),
  )
  const shotGridBaseY = 24
  const videoGridBaseY = shotGridBaseY + panelGridRows * shotGridRowGap + 160

  const shotNodeIds = new Map<string, string>()
  panelsWithStoryboard.forEach(({ storyboard, panel }, index) => {
    const nodeId = `shot:${panel.id}`
    shotNodeIds.set(panel.id, nodeId)
    const position = gridPosition({
      index,
      baseX: PANEL_GRID_BASE_X,
      baseY: shotGridBaseY,
      width: DEFAULT_NODE_WIDTH,
      rowGap: shotGridRowGap,
    })
    const preview = shotPreviewByPanelId.get(panel.id)
    nodes.push(createNode({
      id: nodeId,
      fallbackX: position.x,
      fallbackY: position.y,
      zIndex: zIndex++,
      savedLayoutByKey,
      data: {
        kind: 'shot',
        layoutNodeType: 'shot',
        targetType: 'panel',
        targetId: panel.id,
        title: translate('nodes.shot.title', { index: panelDisplayNumber(panel) }),
        eyebrow: translate('nodes.shot.eyebrow'),
        body: compactText(panel.description || panel.imagePrompt || panel.videoPrompt, translate('empty.panel')),
        meta: translate('nodes.shot.meta', {
          location: panel.location || translate('empty.location'),
        }),
        statusLabel: panel.imageTaskRunning ? translate('status.processing') : translate('status.ready'),
        width: DEFAULT_NODE_WIDTH,
        height: preview?.nodeHeight ?? SHOT_NODE_HEIGHT,
        indexLabel: panelDisplayNumber(panel),
        previewImageUrl: primaryPanelImageUrl(panel),
        previewAspectRatio: preview?.aspectRatio ?? null,
        previewDisplayHeight: preview?.height ?? DEFAULT_MEDIA_PREVIEW_HEIGHT,
        shotDetails: createShotDetails(panel, storyboard, shots),
        imageDetails: createImageDetails(panel),
        actionLabel: panel.imageTaskRunning
          ? undefined
          : hasImage(panel)
            ? translate('actions.regenerateImage')
            : translate('actions.generateImage'),
        action: panel.imageTaskRunning
          ? undefined
          : { type: 'generate_image', panelId: panel.id },
        onAction,
      },
    }))

    const source = clipNodeIds.get(storyboard.clipId) ?? analysisNodeId
    if (clipNodeIds.has(storyboard.clipId) || hasStory) {
      edges.push(createEdge(`edge:clip-shot:${panel.id}`, source, nodeId))
    }
  })

  panelsWithStoryboard.forEach(({ panel }, index) => {
    const source = shotNodeIds.get(panel.id)
    if (!source) return

    if (shouldShowVideoNode(panel)) {
      const nodeId = `video:${panel.id}`
      const position = gridPosition({
        index,
        baseX: PANEL_GRID_BASE_X,
        baseY: videoGridBaseY,
        width: MEDIA_NODE_WIDTH,
        rowGap: mediaGridRowGap,
      })
      const preview = videoPreviewByPanelId.get(panel.id)
      nodes.push(createNode({
        id: nodeId,
        fallbackX: position.x,
        fallbackY: position.y,
        zIndex: zIndex++,
        savedLayoutByKey,
        data: {
          kind: 'videoClip',
          layoutNodeType: 'videoClip',
          targetType: 'panel',
          targetId: panel.id,
          title: translate('nodes.video.title', { index: panelDisplayNumber(panel) }),
          eyebrow: translate('nodes.video.eyebrow'),
          body: compactText(panel.videoPrompt || panel.description, translate('empty.video')),
          meta: translate('nodes.video.meta'),
          statusLabel: panel.videoTaskRunning ? translate('status.processing') : translate('status.ready'),
          width: MEDIA_NODE_WIDTH,
          height: preview?.nodeHeight ?? 410,
          indexLabel: `V${panelDisplayNumber(panel)}`,
          previewImageUrl: panel.videoMedia?.url ?? panel.videoUrl ?? primaryPanelImageUrl(panel),
          previewAspectRatio: preview?.aspectRatio ?? null,
          previewDisplayHeight: preview?.height ?? DEFAULT_MEDIA_PREVIEW_HEIGHT,
          videoDetails: createVideoDetails(panel),
          actionLabel: panel.videoTaskRunning ? undefined : translate('actions.generateVideo'),
          action: panel.videoTaskRunning
            ? undefined
            : {
                type: 'generate_video',
                storyboardId: panel.storyboardId,
                panelIndex: panel.panelIndex,
                panelId: panel.id,
                videoModel: panel.videoModel || defaultVideoModel || undefined,
              },
          onAction,
        },
      }))
      edges.push(createEdge(`edge:shot-video:${panel.id}`, source, nodeId))
    }
  })

  videoGroups.forEach((group, index) => {
    const nodeId = `video-group:${group.id}`
    const sourceShotNumber = Array.isArray(group.shotNumbers) && typeof group.shotNumbers[0] === 'number'
      ? group.shotNumbers[0]
      : index + 1
    const position = gridPosition({
      index,
      baseX: PANEL_GRID_BASE_X,
      baseY: videoGridBaseY + panelGridRows * mediaGridRowGap + 40,
      width: MEDIA_NODE_WIDTH,
      rowGap: mediaGridRowGap,
    })
    const previewAspectRatio = mediaAspectRatio(group.videoMedia) ?? mediaAspectRatio(group.referenceImageMedia) ?? null
    const previewHeight = estimateMediaPreviewHeight(MEDIA_NODE_WIDTH, previewAspectRatio)
    const isRunning = group.status === 'queued' || group.status === 'processing'
    const hasOutput = Boolean(group.videoMedia?.url ?? group.videoUrl)
    nodes.push(createNode({
      id: nodeId,
      fallbackX: position.x,
      fallbackY: position.y,
      zIndex: zIndex++,
      savedLayoutByKey,
      data: {
        kind: 'videoClip',
        layoutNodeType: 'videoClip',
        targetType: 'videoGroup',
        targetId: group.id,
        title: translate('nodes.videoGroup.title', { index: index + 1 }),
        eyebrow: translate('nodes.videoGroup.eyebrow'),
        body: compactText(group.prompt || translate('nodes.videoGroup.body'), translate('empty.video')),
        meta: translate('nodes.videoGroup.meta', {
          grid: group.gridMode,
          shots: Array.isArray(group.shotNumbers) ? group.shotNumbers.join(', ') : '',
          duration: group.durationSec,
        }),
        statusLabel: isRunning
          ? translate('status.processing')
          : group.status === 'failed'
            ? translate('status.failed')
            : hasOutput
              ? translate('status.ready')
              : translate('status.pending'),
        width: MEDIA_NODE_WIDTH,
        height: 292 + previewHeight,
        indexLabel: `G${index + 1}`,
        previewImageUrl: group.videoMedia?.url ?? group.videoUrl ?? group.referenceImageMedia?.url ?? group.referenceImageUrl,
        previewAspectRatio,
        previewDisplayHeight: previewHeight,
        actionLabel: undefined,
        action: undefined,
        onAction,
      },
    }))
    const shotNodeId = [...shotNodeIds.entries()].find(([panelId]) => {
      const found = panelsWithStoryboard.find((item) => item.panel.id === panelId)
      return found?.panel.panelNumber === sourceShotNumber
    })?.[1]
    if (shotNodeId) edges.push(createEdge(`edge:shot-video-group:${group.id}`, shotNodeId, nodeId))
  })

  const videoNodeIds = nodes.filter((node) => node.data.kind === 'videoClip').map((node) => node.id)
  if (videoNodeIds.length > 0) {
    const finalNodeId = `final:${episodeId}`
    const totalDuration = panelsWithStoryboard.reduce((total, item) => total + (item.panel.duration ?? 0), 0)
    const imageCount = panelsWithStoryboard.filter((item) => hasImage(item.panel)).length
    const generatedVideoCount = panelsWithStoryboard.filter((item) => hasGeneratedVideo(item.panel)).length
    const isFinalRenderRunning = finalRenderPhase === 'queued' || finalRenderPhase === 'processing'
    const isFinalRenderFailed = finalRenderPhase === 'failed'
    const hasFinalOutput = Boolean(finalVideo?.outputUrl && finalVideo.renderStatus === 'completed')
    nodes.push(createNode({
      id: finalNodeId,
      fallbackX: PANEL_GRID_BASE_X,
      fallbackY: videoGridBaseY + (panelGridRows + Math.ceil(videoGroups.length / PANEL_GRID_COLUMNS)) * mediaGridRowGap + 180,
      zIndex: zIndex++,
      savedLayoutByKey,
      data: {
        kind: 'finalTimeline',
        layoutNodeType: 'finalTimeline',
        targetType: 'episode',
        targetId: episodeId,
        title: translate('nodes.final.title'),
        eyebrow: translate('nodes.final.eyebrow'),
        body: translate('nodes.final.body', { videos: videoNodeIds.length }),
        meta: isFinalRenderFailed && finalRenderErrorMessage
          ? finalRenderErrorMessage
          : hasFinalOutput
            ? translate('nodes.final.outputReady')
            : translate('nodes.final.meta'),
        statusLabel: isFinalRenderRunning
          ? translate('status.aiEditing')
          : isFinalRenderFailed
            ? translate('status.failed')
            : hasFinalOutput
              ? translate('status.finalReady')
              : translate('status.ready'),
        width: FINAL_NODE_WIDTH,
        height: 280,
        finalDetails: {
          totalShots: panelsWithStoryboard.length,
          totalImages: imageCount,
          totalVideos: generatedVideoCount,
          totalDuration: totalDuration > 0 ? totalDuration : null,
          orderedVideoLabels: videoNodeIds.map((videoNodeId) => videoNodeId.replace('video:', '')),
          outputUrl: finalVideo?.outputUrl ?? null,
          renderStatus: finalVideo?.renderStatus ?? null,
        },
        actionLabel: isFinalRenderRunning ? translate('actions.aiEditing') : translate('actions.renderFinalVideo'),
        action: { type: 'render_final_video' },
        actionDisabled: isFinalRenderRunning,
        onAction,
      },
    }))
    videoNodeIds.forEach((videoNodeId) => {
      edges.push(createEdge(`edge:video-final:${videoNodeId}`, videoNodeId, finalNodeId))
    })
  }

  return { nodes, edges }
}

export function useWorkspaceNodeCanvasProjection({
  projectId,
  episodeId,
  episodeName,
  storyText,
  clips,
  storyboards,
  shots,
  editScript,
  finalVideo,
  defaultVideoModel,
  finalRenderPhase,
  finalRenderErrorMessage,
  savedLayouts,
  translate,
  onAction,
}: BuildWorkspaceNodeCanvasProjectionInput): WorkspaceCanvasProjection {
  return useMemo(
    () => buildWorkspaceNodeCanvasProjection({
      projectId,
      episodeId,
      episodeName,
      storyText,
      clips,
      storyboards,
      shots,
      editScript,
      finalVideo,
      defaultVideoModel,
      finalRenderPhase,
      finalRenderErrorMessage,
      savedLayouts,
      translate,
      onAction,
    }),
    [
      clips,
      episodeId,
      episodeName,
      onAction,
      projectId,
      defaultVideoModel,
      finalRenderPhase,
      finalRenderErrorMessage,
      finalVideo,
      savedLayouts,
      shots,
      editScript,
      storyText,
      storyboards,
      translate,
    ],
  )
}
