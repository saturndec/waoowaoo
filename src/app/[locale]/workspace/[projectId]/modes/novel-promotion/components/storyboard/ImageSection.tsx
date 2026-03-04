'use client'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import './ImageSection.css'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import TaskStatusOverlay from '@/components/task/TaskStatusOverlay'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import ImageSectionCandidateMode from './ImageSectionCandidateMode'
import ImageSectionActionButtons from './ImageSectionActionButtons'
import { AppIcon } from '@/components/ui/icons'

interface PanelCandidateData {
  candidates: string[]
  selectedIndex: number
}

interface ImageSectionProps {
  panelId: string
  imageUrl: string | null
  globalPanelNumber: number
  shotType: string
  videoRatio: string
  isDeleting: boolean
  isModifying: boolean
  isSubmittingPanelImageTask: boolean
  failedError: string | null
  candidateData: PanelCandidateData | null
  previousImageUrl?: string | null
  onRegeneratePanelImage: (panelId: string, count?: number, force?: boolean) => void
  onOpenEditModal: () => void
  onOpenAIDataModal: () => void
  onSelectCandidateIndex: (panelId: string, index: number) => void
  onConfirmCandidate: (panelId: string, imageUrl: string) => Promise<void>
  onCancelCandidate: (panelId: string) => void
  onClearError: () => void
  onUndo?: (panelId: string) => void
  onPreviewImage?: (url: string) => void
}

export default function ImageSection({
  panelId,
  imageUrl,
  globalPanelNumber,
  shotType,
  videoRatio,
  isDeleting,
  isModifying,
  isSubmittingPanelImageTask,
  failedError,
  candidateData,
  previousImageUrl,
  onRegeneratePanelImage,
  onOpenEditModal,
  onOpenAIDataModal,
  onSelectCandidateIndex,
  onConfirmCandidate,
  onCancelCandidate,
  onClearError,
  onUndo,
  onPreviewImage,
}: ImageSectionProps) {
  const t = useTranslations('storyboard')
  const [isTaskPulseAnimating, setIsTaskPulseAnimating] = useState(false)
  const cssAspectRatio = videoRatio.replace(':', '/')
  const hasValidCandidates = !!candidateData && candidateData.candidates.some((url) => !url.startsWith('PENDING:'))

  const triggerPulse = () => {
    setIsTaskPulseAnimating(true)
    setTimeout(() => setIsTaskPulseAnimating(false), 600)
  }

  const renderLoadingState = (
    intent: 'generate' | 'regenerate' | 'modify' | 'process',
    backdropImageUrl: string | null = null,
  ) => {
    const state = resolveTaskPresentationState({
      phase: 'processing',
      intent,
      resource: 'image',
      hasOutput: !!backdropImageUrl,
    })

    return (
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black/60 backdrop-blur-md group/loading">
        {backdropImageUrl && (
          <MediaImageWithLoading
            src={backdropImageUrl}
            alt={t('image.clickToPreview')}
            containerClassName="absolute inset-0 h-full w-full"
            className="absolute inset-0 h-full w-full object-cover"
            sizes="(max-width: 768px) 100vw, 33vw"
          />
        )}
        <div className={`absolute inset-0 ${backdropImageUrl ? 'bg-black/45 backdrop-blur-[1px]' : 'bg-black/60 backdrop-blur-md'}`} />
        <TaskStatusOverlay
          state={state}
          className={backdropImageUrl ? 'bg-black/45 backdrop-blur-[1px]' : undefined}
        />
      </div>
    )
  }

  const renderFailedState = () => (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-destructive/10 text-destructive p-2">
      <AppIcon name="alert" className="w-6 h-6 mb-1" />
      <span className="text-xs text-center font-medium">{t('image.failed')}</span>
      <span className="text-[10px] text-center mt-1 line-clamp-2 px-1">{failedError}</span>
      <button
        onClick={onClearError}
        className="inline-flex items-center justify-center rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20 mt-1 px-2 py-1 text-[10px] rounded-md"
      >
        {t('variant.close')}
      </button>
    </div>
  )

  const renderEmptyState = () => (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted/40 text-muted-foreground">
      <AppIcon name="imagePreview" className="w-8 h-8" />
      <span className="text-xs">{t('video.toolbar.showPending')}</span>
      <button
        onClick={() => {
          triggerPulse()
          onRegeneratePanelImage(panelId, 1, false)
        }}
        className="inline-flex items-center justify-center rounded-md bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-200 mt-1 px-4 py-2 text-xs rounded-lg transition-all active:scale-95"
      >
        {t('panel.generateImage')}
      </button>
    </div>
  )

  return (
    <div
      className={`relative overflow-hidden group rounded-t-2xl transition-all bg-muted ${isTaskPulseAnimating ? 'animate-brightness-boost' : ''}`}
      style={{ aspectRatio: cssAspectRatio }}
    >
      {isDeleting ? (
        renderLoadingState('process', imageUrl)
      ) : isModifying ? (
        renderLoadingState('modify', imageUrl)
      ) : isSubmittingPanelImageTask ? (
        renderLoadingState('regenerate', imageUrl)
      ) : candidateData ? (
        hasValidCandidates ? (
          <ImageSectionCandidateMode
            panelId={panelId}
            imageUrl={imageUrl}
            candidateData={candidateData}
            onSelectCandidateIndex={onSelectCandidateIndex}
            onConfirmCandidate={onConfirmCandidate}
            onCancelCandidate={onCancelCandidate}
            onPreviewImage={onPreviewImage}
          />
        ) : (
          renderLoadingState(imageUrl ? 'regenerate' : 'generate', imageUrl)
        )
      ) : failedError ? (
        renderFailedState()
      ) : imageUrl ? (
        <MediaImageWithLoading
          src={imageUrl}
          alt={t('variant.shotNum', { number: globalPanelNumber })}
          containerClassName="h-full w-full"
          className={`w-full h-full object-cover ${onPreviewImage ? 'cursor-zoom-in' : ''}`}
          onClick={onPreviewImage ? () => onPreviewImage(imageUrl) : undefined}
          title={onPreviewImage ? t('image.clickToPreview') : undefined}
          sizes="(max-width: 768px) 100vw, 33vw"
        />
      ) : (
        renderEmptyState()
      )}

      <div className="absolute top-2 left-2">
        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground px-2 py-0.5 text-xs font-medium">{globalPanelNumber}</span>
      </div>

      <div className="absolute top-2 right-2">
        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary px-2 py-0.5 text-xs">{shotType}</span>
      </div>

      {!candidateData && (
        <ImageSectionActionButtons
          panelId={panelId}
          imageUrl={imageUrl}
          previousImageUrl={previousImageUrl}
          isSubmittingPanelImageTask={isSubmittingPanelImageTask}
          isModifying={isModifying}
          onRegeneratePanelImage={onRegeneratePanelImage}
          onOpenEditModal={onOpenEditModal}
          onOpenAIDataModal={onOpenAIDataModal}
          onUndo={onUndo}
          triggerPulse={triggerPulse}
        />
      )}
    </div>
  )
}
