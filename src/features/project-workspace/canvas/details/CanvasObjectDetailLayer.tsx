'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import {
  useClearProjectStoryboardError,
  useCopyProjectPanel,
  useCreateProjectPanelVariant,
  useDeleteProjectPanel,
  useDownloadProjectImages,
  useInsertProjectPanel,
  useModifyProjectStoryboardImage,
  useRefreshEpisodeData,
  useRefreshProjectAssets,
  useRefreshStoryboards,
  useRegenerateProjectPanelImage,
  useRevertProjectPanelImage,
  useUpdateProjectClip,
  useUpdateProjectPanel,
  useUpdateProjectPanelLink,
} from '@/lib/query/hooks'
import { useSelectProjectPanelCandidate } from '@/lib/query/mutations/storyboard-prompt-mutations'
import type { SelectedAsset } from '../../components/storyboard/hooks/useImageGeneration'
import type { VideoGenerationOptions } from '../../components/video/types'
import { useWorkspaceProvider } from '../../WorkspaceProvider'
import { useWorkspaceRuntime } from '../../WorkspaceRuntimeContext'
import type { ProjectClip, ProjectStoryboard } from '@/types/project'
import type { WorkspaceCanvasFlowNode } from '../node-canvas-types'
import FinalDetail from './FinalDetail'
import ImageDetail from './ImageDetail'
import ScriptClipDetail from './ScriptClipDetail'
import ShotDetail from './ShotDetail'
import StoryDetail from './StoryDetail'
import VideoDetail from './VideoDetail'
import {
  downloadBlob,
  findPanelContext,
  resolveTone,
  toneClassName,
  type PanelContext,
} from './detail-shared'

interface CanvasObjectDetailLayerProps {
  readonly selectedNode: WorkspaceCanvasFlowNode | null
  readonly clips: readonly ProjectClip[]
  readonly storyboards: readonly ProjectStoryboard[]
  readonly storyText: string
  readonly episodeName?: string
  readonly onClose: () => void
}

interface PanelVariantInput {
  readonly title: string
  readonly description: string
  readonly shot_type: string
  readonly camera_move: string
  readonly video_prompt: string
}

export default function CanvasObjectDetailLayer({
  selectedNode,
  clips,
  storyboards,
  storyText,
  episodeName,
  onClose,
}: CanvasObjectDetailLayerProps) {
  const t = useTranslations('projectWorkflow.canvas.workspace.detail')
  const { projectId, episodeId } = useWorkspaceProvider()
  const runtime = useWorkspaceRuntime()
  const refreshAssets = useRefreshProjectAssets(projectId)
  const refreshEpisode = useRefreshEpisodeData(projectId, episodeId ?? null)
  const refreshStoryboards = useRefreshStoryboards(episodeId ?? null)
  const updateClipMutation = useUpdateProjectClip(projectId)
  const updatePanelMutation = useUpdateProjectPanel(projectId, episodeId)
  const deletePanelMutation = useDeleteProjectPanel(projectId, episodeId)
  const copyPanelMutation = useCopyProjectPanel(projectId, episodeId)
  const insertPanelMutation = useInsertProjectPanel(projectId, episodeId)
  const createPanelVariantMutation = useCreateProjectPanelVariant(projectId, episodeId)
  const regenerateImageMutation = useRegenerateProjectPanelImage(projectId, episodeId)
  const revertPanelImageMutation = useRevertProjectPanelImage(projectId, episodeId)
  const selectCandidateMutation = useSelectProjectPanelCandidate(projectId, episodeId)
  const modifyImageMutation = useModifyProjectStoryboardImage(projectId, episodeId)
  const downloadImagesMutation = useDownloadProjectImages(projectId)
  const updatePanelLinkMutation = useUpdateProjectPanelLink(projectId, episodeId)
  const clearStoryboardErrorMutation = useClearProjectStoryboardError(projectId, episodeId)

  const clip = selectedNode?.data.kind === 'scriptClip'
    ? clips.find((item) => item.id === selectedNode.data.targetId) ?? null
    : null
  const panelContext = selectedNode?.data.targetType === 'panel'
    ? findPanelContext(storyboards, selectedNode.data.targetId)
    : null
  const tone = selectedNode ? resolveTone(selectedNode.data.kind) : 'story'

  if (!selectedNode || selectedNode.data.kind === 'analysis') return null

  const refreshAll = async () => {
    await Promise.all([
      refreshAssets(),
      refreshEpisode(),
      refreshStoryboards(),
    ])
  }

  const saveClip = async (clipId: string, data: Record<string, unknown>) => {
    if (!episodeId) return
    await updateClipMutation.mutateAsync({ clipId, data, episodeId })
    await refreshAll()
  }

  const savePanel = async (context: PanelContext, data: Record<string, unknown>) => {
    await updatePanelMutation.mutateAsync({
      storyboardId: context.storyboard.id,
      panelIndex: context.panel.panelIndex,
      id: context.panel.id,
      panelNumber: context.panel.panelNumber,
      ...data,
    })
  }

  const deletePanel = async (context: PanelContext) => {
    if (!window.confirm(t('confirm.deletePanel'))) return
    await deletePanelMutation.mutateAsync({ panelId: context.panel.id })
    await refreshAll()
    onClose()
  }

  const copyPanel = async (panelId: string) => {
    await copyPanelMutation.mutateAsync({ sourcePanelId: panelId, insertAfterPanelId: panelId, includeImages: true })
    await refreshAll()
  }

  const insertPanel = async (context: PanelContext, userInput: string) => {
    await insertPanelMutation.mutateAsync({ storyboardId: context.storyboard.id, insertAfterPanelId: context.panel.id, userInput })
    await refreshAll()
  }

  const createVariant = async (
    context: PanelContext,
    variant: PanelVariantInput,
    options: { readonly includeCharacterAssets: boolean; readonly includeLocationAsset: boolean },
  ) => {
    await createPanelVariantMutation.mutateAsync({
      storyboardId: context.storyboard.id,
      sourcePanelId: context.panel.id,
      insertAfterPanelId: context.panel.id,
      variant,
      includeCharacterAssets: options.includeCharacterAssets,
      includeLocationAsset: options.includeLocationAsset,
    })
    await refreshAll()
  }

  const generateImage = async (
    panelId: string,
    count = 1,
    references: {
      readonly referencePanelIds?: readonly string[]
      readonly extraImageUrls?: readonly string[]
      readonly referenceImageNotes?: readonly unknown[]
    } = {},
  ) => {
    await regenerateImageMutation.mutateAsync({
      panelId,
      count,
      ...(references.referencePanelIds && references.referencePanelIds.length > 0 ? { referencePanelIds: [...references.referencePanelIds] } : {}),
      ...(references.extraImageUrls && references.extraImageUrls.length > 0 ? { extraImageUrls: [...references.extraImageUrls] } : {}),
      ...(references.referenceImageNotes && references.referenceImageNotes.length > 0 ? { referenceImageNotes: [...references.referenceImageNotes] } : {}),
    })
    await refreshAll()
  }

  const selectCandidate = async (panelId: string, imageUrl: string) => {
    await selectCandidateMutation.mutateAsync({ panelId, selectedImageUrl: imageUrl, action: 'select' })
    await refreshAll()
  }

  const cancelCandidate = async (panelId: string) => {
    await selectCandidateMutation.mutateAsync({ panelId, action: 'cancel' })
    await refreshAll()
  }

  const modifyImage = async (
    storyboardId: string,
    panelIndex: number,
    prompt: string,
    urls: readonly string[],
    selectedAssets: readonly SelectedAsset[],
  ) => {
    await modifyImageMutation.mutateAsync({
      storyboardId,
      panelIndex,
      modifyPrompt: prompt,
      extraImageUrls: [...urls],
      selectedAssets: selectedAssets.map((asset) => ({ ...asset })),
    })
    await refreshAll()
  }

  const undoImage = async (panelId: string) => {
    await revertPanelImageMutation.mutateAsync({ panelId })
    await refreshAll()
  }

  const clearStoryboardError = async (storyboardId: string) => {
    await clearStoryboardErrorMutation.mutateAsync({ storyboardId })
    await refreshAll()
  }

  const downloadImages = async () => {
    if (!episodeId) return
    const blob = await downloadImagesMutation.mutateAsync({ episodeId })
    downloadBlob(blob, 'images.zip')
  }

  const downloadVideos = async () => {
    if (!episodeId) return
    const response = await fetch(`/api/projects/${projectId}/download-videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ episodeId, panelPreferences: {} }),
    })
    if (!response.ok) throw new Error(t('errors.downloadVideosFailed'))
    const blob = await response.blob()
    downloadBlob(blob, 'videos.zip')
  }

  const content = (() => {
    if (selectedNode.data.kind === 'storyInput') {
      return (
        <StoryDetail
          projectId={projectId}
          storyText={storyText}
          episodeName={episodeName}
        />
      )
    }

    if (selectedNode.data.kind === 'scriptClip' && clip) {
      return (
        <ScriptClipDetail
          clip={clip}
          node={selectedNode}
          projectId={projectId}
          allClips={clips}
          onSave={saveClip}
          onGenerateStoryboard={async () => runtime.onRequestAssistantPlan()}
          onOpenAssetLibrary={(characterName) => runtime.onOpenAssetLibraryForCharacter(characterName ?? null)}
        />
      )
    }

    if ((selectedNode.data.kind === 'shot' || selectedNode.data.kind === 'imageAsset' || selectedNode.data.kind === 'videoClip') && !panelContext) {
      return <p className="text-sm text-[var(--glass-tone-danger-fg)]">{t('errors.panelNotFound')}</p>
    }

    if (selectedNode.data.kind === 'shot' && panelContext) {
      return (
        <ShotDetail
          context={panelContext}
          projectId={projectId}
          storyboards={storyboards}
          onSave={savePanel}
          onDelete={deletePanel}
          onCopy={copyPanel}
          onInsert={insertPanel}
          onVariant={createVariant}
          onGenerateImage={generateImage}
          onClearError={clearStoryboardError}
          onOpenAssetLibrary={(characterName) => runtime.onOpenAssetLibraryForCharacter(characterName ?? null)}
        />
      )
    }

    if (selectedNode.data.kind === 'imageAsset' && panelContext) {
      return (
        <ImageDetail
          context={panelContext}
          node={selectedNode}
          projectId={projectId}
          storyboards={storyboards}
          onGenerateImage={generateImage}
          onSelectCandidate={selectCandidate}
          onCancelCandidate={cancelCandidate}
          onModifyImage={modifyImage}
          onUndoImage={undoImage}
          onClearError={clearStoryboardError}
          onDownloadImages={downloadImages}
        />
      )
    }

    if (selectedNode.data.kind === 'videoClip' && panelContext) {
      return (
        <VideoDetail
          context={panelContext}
          storyboards={storyboards}
          node={selectedNode}
          onUpdatePrompt={runtime.onUpdateVideoPrompt}
          onUpdateModel={runtime.onUpdatePanelVideoModel}
          onToggleLink={async (storyboardId, panelIndex, linked) => {
            await updatePanelLinkMutation.mutateAsync({ storyboardId, panelIndex, linked })
            await refreshAll()
          }}
          onGenerateVideo={async (storyboardId, panelIndex, panelId, model, options: VideoGenerationOptions, firstLastFrame) => {
            await runtime.onGenerateVideo(storyboardId, panelIndex, model, firstLastFrame, options, panelId)
          }}
          onGenerateAllVideos={async (model, options) => {
            await runtime.onGenerateAllVideos({ videoModel: model, generationOptions: options })
          }}
          onDownloadVideos={downloadVideos}
        />
      )
    }

    if (selectedNode.data.kind === 'finalTimeline') {
      return (
        <FinalDetail
          storyboards={storyboards}
          onGenerateAllVideos={async () => runtime.onGenerateAllVideos()}
          onDownloadVideos={downloadVideos}
        />
      )
    }

    return <p className="text-sm text-[var(--glass-text-tertiary)]">{t('empty.noDetail')}</p>
  })()

  return (
    <div className="fixed inset-x-6 bottom-6 z-40 max-h-[78vh] overflow-hidden rounded-xl border bg-white shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
      <header className={`flex items-start justify-between gap-4 border-b px-5 py-4 ${toneClassName(tone)}`}>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--glass-text-tertiary)]">{selectedNode.data.eyebrow}</p>
          <h2 className="truncate text-lg font-semibold text-[var(--glass-text-primary)]">{selectedNode.data.title}</h2>
          <p className="mt-1 truncate text-xs text-[var(--glass-text-secondary)]">{selectedNode.data.meta}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-black/10 bg-white p-2 text-[var(--glass-text-secondary)] transition hover:bg-[#f8fafc]"
          aria-label={t('actions.close')}
        >
          <AppIcon name="closeMd" className="h-4 w-4" />
        </button>
      </header>
      <div className="max-h-[calc(78vh-5rem)] overflow-y-auto px-5 py-5">
        {content}
      </div>
    </div>
  )
}
