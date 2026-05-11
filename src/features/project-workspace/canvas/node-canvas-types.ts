import type { Edge, Node } from '@xyflow/react'
import type { CanvasLayoutNodeType } from '@/lib/project-canvas/layout/canvas-layout-contract'

export type WorkspaceCanvasNodeKind =
  | 'storyInput'
  | 'analysis'
  | 'scriptClip'
  | 'shot'
  | 'imageAsset'
  | 'videoClip'
  | 'finalTimeline'
  | 'editScript'
  | 'editRequiredAsset'

export type WorkspaceCanvasTargetType = 'episode' | 'clip' | 'panel' | 'videoGroup' | 'editScript' | 'editAssetRequirement'

export type WorkspaceCanvasNodeAction =
  | { readonly type: 'update_story'; readonly value: string }
  | { readonly type: 'generate_script' }
  | { readonly type: 'generate_storyboard' }
  | { readonly type: 'update_clip'; readonly clipId: string; readonly data: Record<string, unknown> }
  | { readonly type: 'open_asset_library'; readonly characterId?: string | null }
  | {
      readonly type: 'update_panel'
      readonly storyboardId: string
      readonly panelIndex: number
      readonly panelId: string
      readonly data: Record<string, unknown>
    }
  | { readonly type: 'delete_panel'; readonly storyboardId: string; readonly panelId: string }
  | { readonly type: 'copy_panel'; readonly panelId: string }
  | { readonly type: 'insert_panel'; readonly storyboardId: string; readonly panelId: string; readonly userInput: string }
  | {
      readonly type: 'create_panel_variant'
      readonly storyboardId: string
      readonly panelId: string
      readonly variant: {
        readonly title: string
        readonly description: string
        readonly shot_type: string
        readonly camera_move: string
        readonly video_prompt: string
      }
      readonly includeCharacterAssets: boolean
      readonly includeLocationAsset: boolean
    }
  | { readonly type: 'generate_image'; readonly panelId: string }
  | { readonly type: 'select_candidate'; readonly panelId: string; readonly imageUrl: string }
  | { readonly type: 'cancel_candidate'; readonly panelId: string }
  | {
      readonly type: 'modify_image'
      readonly storyboardId: string
      readonly panelIndex: number
      readonly modifyPrompt: string
      readonly extraImageUrls: readonly string[]
    }
  | { readonly type: 'download_images' }
  | {
      readonly type: 'generate_video'
      readonly storyboardId: string
      readonly panelIndex: number
      readonly panelId: string
      readonly videoModel?: string
      readonly generationOptions?: Record<string, string | number | boolean>
      readonly firstLastFrame?: {
        readonly lastFrameStoryboardId: string
        readonly lastFramePanelIndex: number
        readonly flModel: string
        readonly customPrompt?: string
      }
    }
  | {
      readonly type: 'update_video_prompt'
      readonly storyboardId: string
      readonly panelIndex: number
      readonly value: string
      readonly field?: 'videoPrompt' | 'firstLastFramePrompt'
    }
  | { readonly type: 'update_panel_video_model'; readonly storyboardId: string; readonly panelIndex: number; readonly model: string }
  | { readonly type: 'toggle_panel_link'; readonly storyboardId: string; readonly panelIndex: number; readonly linked: boolean }
  | {
      readonly type: 'generate_all_videos'
      readonly videoModel?: string
      readonly generationOptions?: Record<string, string | number | boolean>
    }
  | { readonly type: 'render_final_video' }
  | { readonly type: 'generate_edit_assets'; readonly editScriptId: string }
  | { readonly type: 'generate_edit_asset'; readonly editScriptId: string; readonly requirementId: string }
  | { readonly type: 'generate_edit_storyboard'; readonly editScriptId: string }

export type WorkspaceCanvasNodeActionHandler = (action: WorkspaceCanvasNodeAction) => void

export interface WorkspaceCanvasAssetRef {
  readonly name: string
  readonly appearance?: string | null
}

export interface WorkspaceCanvasTextLine {
  readonly kind: 'action' | 'dialogue' | 'voiceover' | 'text'
  readonly speaker?: string | null
  readonly text: string
}

export interface WorkspaceCanvasScriptScene {
  readonly sceneNumber?: number | null
  readonly heading?: string | null
  readonly description?: string | null
  readonly characters: readonly string[]
  readonly lines: readonly WorkspaceCanvasTextLine[]
}

export interface WorkspaceCanvasScriptDetails {
  readonly originalText: string
  readonly screenplayText?: string | null
  readonly scenes: readonly WorkspaceCanvasScriptScene[]
  readonly characters: readonly WorkspaceCanvasAssetRef[]
  readonly locations: readonly string[]
  readonly props: readonly string[]
  readonly timeRange?: string | null
  readonly duration?: number | null
  readonly shotCount?: number | null
}

export interface WorkspaceCanvasShotDetails {
  readonly shotType?: string | null
  readonly cameraMove?: string | null
  readonly characters: readonly WorkspaceCanvasAssetRef[]
  readonly location?: string | null
  readonly props: readonly string[]
  readonly srtSegment?: string | null
  readonly timeRange?: string | null
  readonly duration?: number | null
  readonly imagePrompt?: string | null
  readonly videoPrompt?: string | null
  readonly photographyRules?: string | null
  readonly actingNotes?: string | null
  readonly storyboardTextJson?: string | null
  readonly photographyPlan?: string | null
  readonly errorMessage?: string | null
  readonly promptShot?: {
    readonly sequence?: string | null
    readonly locations?: string | null
    readonly characters?: string | null
    readonly plot?: string | null
    readonly pov?: string | null
    readonly imagePrompt?: string | null
    readonly scale?: string | null
    readonly module?: string | null
    readonly focus?: string | null
    readonly zhSummarize?: string | null
  } | null
}

export interface WorkspaceCanvasImageDetails {
  readonly imagePrompt?: string | null
  readonly description?: string | null
  readonly candidateImages: readonly string[]
  readonly imageHistory?: string | null
  readonly sketchImageUrl?: string | null
  readonly previousImageUrl?: string | null
  readonly errorMessage?: string | null
}

export interface WorkspaceCanvasVideoDetails {
  readonly videoPrompt?: string | null
  readonly firstLastFramePrompt?: string | null
  readonly videoGenerationMode?: string | null
  readonly lastVideoGenerationOptions?: readonly WorkspaceCanvasTextLine[]
  readonly videoUrl?: string | null
  readonly videoModel?: string | null
  readonly linkedToNextPanel?: boolean | null
  readonly errorMessage?: string | null
}

export interface WorkspaceCanvasFinalDetails {
  readonly totalShots: number
  readonly totalImages: number
  readonly totalVideos: number
  readonly totalDuration?: number | null
  readonly orderedVideoLabels: readonly string[]
  readonly outputUrl?: string | null
  readonly renderStatus?: string | null
}

export interface WorkspaceCanvasEditScriptDetails {
  readonly durationSec: number
  readonly shotCount: number
  readonly shots: readonly {
    readonly shotNumber: number
    readonly durationSec: number
    readonly visualAction: string
    readonly charactersAndScene: string
    readonly camera: string
    readonly videoPrompt: string
    readonly sound: string
  }[]
}

export interface WorkspaceCanvasEditAssetDetails {
  readonly kind: 'character' | 'location'
  readonly description: string
  readonly shotNumbers: readonly number[]
  readonly targetId?: string | null
  readonly errorMessage?: string | null
}

export interface WorkspaceCanvasNodeData extends Record<string, unknown> {
  readonly nodeId?: string
  readonly projectId?: string
  readonly episodeName?: string
  readonly kind: WorkspaceCanvasNodeKind
  readonly layoutNodeType: CanvasLayoutNodeType
  readonly targetType: WorkspaceCanvasTargetType
  readonly targetId: string
  readonly title: string
  readonly eyebrow: string
  readonly body: string
  readonly meta: string
  readonly statusLabel: string
  readonly width: number
  readonly height: number
  readonly actionLabel?: string
  readonly action?: WorkspaceCanvasNodeAction
  readonly actionDisabled?: boolean
  readonly onAction?: WorkspaceCanvasNodeActionHandler
  readonly expanded?: boolean
  readonly onToggleExpanded?: (nodeId: string) => void
  readonly indexLabel?: string
  readonly previewImageUrl?: string | null
  readonly previewAspectRatio?: number | null
  readonly previewDisplayHeight?: number | null
  readonly scriptDetails?: WorkspaceCanvasScriptDetails
  readonly shotDetails?: WorkspaceCanvasShotDetails
  readonly imageDetails?: WorkspaceCanvasImageDetails
  readonly videoDetails?: WorkspaceCanvasVideoDetails
  readonly finalDetails?: WorkspaceCanvasFinalDetails
  readonly editScriptDetails?: WorkspaceCanvasEditScriptDetails
  readonly editAssetDetails?: WorkspaceCanvasEditAssetDetails
}

export type WorkspaceCanvasFlowNode = Node<WorkspaceCanvasNodeData, 'workspaceNode'>
export type WorkspaceCanvasFlowEdge = Edge

export interface WorkspaceCanvasProjection {
  readonly nodes: readonly WorkspaceCanvasFlowNode[]
  readonly edges: readonly WorkspaceCanvasFlowEdge[]
}
