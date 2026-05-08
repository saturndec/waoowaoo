'use client'

import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { CanvasNodeLayout } from '@/lib/project-canvas/layout/canvas-layout.types'
import type {
  ProjectClip,
  ProjectEditAssetRequirement,
  ProjectEditScript,
  ProjectPanel,
  ProjectShot,
  ProjectStoryboard,
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

const STORY_NODE_WIDTH = 820
const DEFAULT_NODE_WIDTH = 320
const MEDIA_NODE_WIDTH = 300
const FINAL_NODE_WIDTH = 340
const DEFAULT_NODE_HEIGHT = 214
const STORY_NODE_HEIGHT = 440
const STORY_COLUMN_X = 260
const COLUMN_GAP = 940
const ROW_GAP = 248

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

function layoutStyle(width: number, height: number): CSSProperties {
  return { width, height }
}

function resolvePosition(params: {
  readonly nodeKey: string
  readonly fallbackX: number
  readonly fallbackY: number
  readonly savedLayoutByKey: ReadonlyMap<string, CanvasNodeLayout>
}): { readonly x: number; readonly y: number } {
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
}): WorkspaceCanvasFlowNode {
  const position = resolvePosition({
    nodeKey: params.id,
    fallbackX: params.fallbackX,
    fallbackY: params.fallbackY,
    savedLayoutByKey: params.savedLayoutByKey,
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
  projectId,
  episodeId,
  episodeName,
  storyText,
  clips,
  storyboards,
  shots = [],
  editScript,
  savedLayouts,
  translate,
  onAction,
}: BuildWorkspaceNodeCanvasProjectionInput): WorkspaceCanvasProjection {
  const savedLayoutByKey = new Map(savedLayouts.map((layout) => [layout.nodeKey, layout]))
  const nodes: WorkspaceCanvasFlowNode[] = []
  const edges: WorkspaceCanvasFlowEdge[] = []
  let zIndex = 0

  const storyBody = storyText.trim()
  const storyNodeId = `story:${episodeId}`
  nodes.push(createNode({
    id: storyNodeId,
    fallbackX: STORY_COLUMN_X,
    fallbackY: 24,
    zIndex: zIndex++,
    savedLayoutByKey,
    data: {
      kind: 'storyInput',
      projectId,
      episodeName,
      layoutNodeType: 'story',
      targetType: 'episode',
      targetId: episodeId,
      title: translate('nodes.story.title'),
      eyebrow: translate('nodes.story.eyebrow'),
      body: storyBody,
      meta: translate('nodes.story.meta', { chars: storyBody.length }),
      statusLabel: storyBody ? translate('status.ready') : translate('status.empty'),
      width: STORY_NODE_WIDTH,
      height: STORY_NODE_HEIGHT,
      onAction,
    },
  }))

  const hasStory = storyBody.length > 0
  const analysisNodeId = `analysis:${episodeId}`
  if (hasStory) {
    nodes.push(createNode({
      id: analysisNodeId,
      fallbackX: STORY_COLUMN_X + COLUMN_GAP,
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
    edges.push(createEdge('edge:story-analysis', storyNodeId, analysisNodeId))
  }

  if (editScript) {
    const editScriptNodeId = `edit-script:${editScript.id}`
    const assetsToGenerate = editScript.requirements.some((asset) => asset.status !== 'completed')
    const completedAssets = editScript.requirements.filter((asset) => asset.status === 'completed').length
    nodes.push(createNode({
      id: editScriptNodeId,
      fallbackX: STORY_COLUMN_X + COLUMN_GAP,
      fallbackY: hasStory ? 430 : 180,
      zIndex: zIndex++,
      savedLayoutByKey,
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
        width: 520,
        height: 430,
        indexLabel: 'E',
        editScriptDetails: {
          durationSec: editScript.durationSec,
          shotCount: editScript.shotCount,
          shots: editScript.shots,
        },
        actionLabel: assetsToGenerate ? translate('actions.generateEditAssets') : undefined,
        action: assetsToGenerate ? { type: 'generate_edit_assets', editScriptId: editScript.id } : undefined,
        onAction,
      },
    }))
    edges.push(createEdge(`edge:story-edit-script:${editScript.id}`, storyNodeId, editScriptNodeId))

    editScript.requirements.forEach((asset, index) => {
      const nodeId = `edit-asset:${asset.id}`
      nodes.push(createNode({
        id: nodeId,
        fallbackX: STORY_COLUMN_X + COLUMN_GAP * 2,
        fallbackY: 430 + index * ROW_GAP,
        zIndex: zIndex++,
        savedLayoutByKey,
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
          width: MEDIA_NODE_WIDTH,
          height: 330,
          indexLabel: asset.kind === 'character' ? 'C' : 'L',
          previewImageUrl: asset.previewImageUrl,
          editAssetDetails: {
            kind: asset.kind,
            description: asset.description,
            shotNumbers: asset.shotNumbers,
            targetId: asset.targetId,
            errorMessage: asset.errorMessage,
          },
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
      fallbackX: STORY_COLUMN_X + COLUMN_GAP * 2,
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
    edges.push(createEdge(`edge:analysis-clip:${clip.id}`, hasStory ? analysisNodeId : storyNodeId, nodeId))
  })

  const panelsWithStoryboard = sortedStoryboards(storyboards, clipOrder).flatMap((storyboard) => (
    sortPanels(storyboard.panels ?? []).map((panel) => ({ storyboard, panel }))
  ))

  const shotNodeIds = new Map<string, string>()
  panelsWithStoryboard.forEach(({ storyboard, panel }, index) => {
    const nodeId = `shot:${panel.id}`
    shotNodeIds.set(panel.id, nodeId)
    nodes.push(createNode({
      id: nodeId,
      fallbackX: STORY_COLUMN_X + COLUMN_GAP * 3,
      fallbackY: 24 + index * ROW_GAP,
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
        height: 380,
        indexLabel: panelDisplayNumber(panel),
        shotDetails: createShotDetails(panel, storyboard, shots),
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
    edges.push(createEdge(`edge:clip-shot:${panel.id}`, source, nodeId))
  })

  panelsWithStoryboard.forEach(({ panel }, index) => {
    const source = shotNodeIds.get(panel.id)
    if (!source) return

    if (hasImage(panel)) {
      const nodeId = `image:${panel.id}`
      nodes.push(createNode({
        id: nodeId,
        fallbackX: STORY_COLUMN_X + COLUMN_GAP * 4,
        fallbackY: 40 + index * ROW_GAP,
        zIndex: zIndex++,
        savedLayoutByKey,
        data: {
          kind: 'imageAsset',
          layoutNodeType: 'imageAsset',
          targetType: 'panel',
          targetId: panel.id,
          title: translate('nodes.image.title', { index: panelDisplayNumber(panel) }),
          eyebrow: translate('nodes.image.eyebrow'),
          body: compactText(panel.imagePrompt || panel.description, translate('empty.image')),
          meta: translate('nodes.image.meta'),
          statusLabel: panel.imageTaskRunning ? translate('status.processing') : translate('status.ready'),
          width: MEDIA_NODE_WIDTH,
          height: 390,
          indexLabel: `I${panelDisplayNumber(panel)}`,
          previewImageUrl: panel.media?.url ?? panel.imageUrl,
          imageDetails: createImageDetails(panel),
          actionLabel: panel.imageTaskRunning ? undefined : translate('actions.regenerateImage'),
          action: panel.imageTaskRunning ? undefined : { type: 'generate_image', panelId: panel.id },
          onAction,
        },
      }))
      edges.push(createEdge(`edge:shot-image:${panel.id}`, source, nodeId))
    }

    if (hasVideo(panel)) {
      const nodeId = `video:${panel.id}`
      const imageNodeId = `image:${panel.id}`
      const videoSource = hasImage(panel) ? imageNodeId : source
      nodes.push(createNode({
        id: nodeId,
        fallbackX: STORY_COLUMN_X + COLUMN_GAP * 5,
        fallbackY: 70 + index * ROW_GAP,
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
          height: 410,
          indexLabel: `V${panelDisplayNumber(panel)}`,
          previewImageUrl: panel.videoMedia?.url ?? panel.videoUrl ?? panel.media?.url ?? panel.imageUrl,
          videoDetails: createVideoDetails(panel),
          actionLabel: panel.videoTaskRunning ? undefined : translate('actions.generateVideo'),
          action: panel.videoTaskRunning
            ? undefined
            : {
                type: 'generate_video',
                storyboardId: panel.storyboardId,
                panelIndex: panel.panelIndex,
                panelId: panel.id,
              },
          onAction,
        },
      }))
      edges.push(createEdge(`edge:image-video:${panel.id}`, videoSource, nodeId))
    }
  })

  const videoNodeIds = nodes.filter((node) => node.data.kind === 'videoClip').map((node) => node.id)
  if (videoNodeIds.length > 0) {
    const finalNodeId = `final:${episodeId}`
    const totalDuration = panelsWithStoryboard.reduce((total, item) => total + (item.panel.duration ?? 0), 0)
    const imageCount = panelsWithStoryboard.filter((item) => hasImage(item.panel)).length
    nodes.push(createNode({
      id: finalNodeId,
      fallbackX: STORY_COLUMN_X + COLUMN_GAP * 6,
      fallbackY: 260,
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
        meta: translate('nodes.final.meta'),
        statusLabel: translate('status.ready'),
        width: FINAL_NODE_WIDTH,
        height: 280,
        finalDetails: {
          totalShots: panelsWithStoryboard.length,
          totalImages: imageCount,
          totalVideos: videoNodeIds.length,
          totalDuration: totalDuration > 0 ? totalDuration : null,
          orderedVideoLabels: videoNodeIds.map((videoNodeId) => videoNodeId.replace('video:', '')),
        },
        actionLabel: translate('actions.generateAllVideos'),
        action: { type: 'generate_all_videos' },
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
      savedLayouts,
      shots,
      editScript,
      storyText,
      storyboards,
      translate,
    ],
  )
}
