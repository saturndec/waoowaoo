'use client'

import { logError as _ulogError } from '@/lib/logging/core'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  VideoToolbar,
  type VideoGenerationOptionValue,
  type VideoGenerationOptions,
  type VideoModelOption,
} from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video'
import { AppIcon } from '@/components/ui/icons'
import {
  useDownloadRemoteBlob,
  useListProjectEpisodeVideoUrls,
  useMatchedVoiceLines,
  useUpdateProjectPanelLink,
} from '@/lib/query/hooks'
import { useLipSync } from '@/lib/query/hooks/useStoryboards'
import ImagePreviewModal from '@/components/ui/ImagePreviewModal'
import { ModelCapabilityDropdown } from '@/components/ui/config-modals/ModelCapabilityDropdown'
import VideoTimelinePanel from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage/VideoTimelinePanel'
import VideoRenderPanel from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage/VideoRenderPanel'
import type { VideoStageShellProps } from './video-stage-runtime/types'
import {
  type EffectiveVideoCapabilityDefinition,
  normalizeVideoGenerationSelections,
  resolveEffectiveVideoCapabilityDefinitions,
  resolveEffectiveVideoCapabilityFields,
} from '@/lib/model-capabilities/video-effective'
import { projectVideoPricingTiersByFixedSelections } from '@/lib/model-pricing/video-tier'
import { useVideoTaskStates } from './video-stage-runtime/useVideoTaskStates'
import { useVideoPanelsProjection } from './video-stage-runtime/useVideoPanelsProjection'
import { useVideoPromptState } from './video-stage-runtime/useVideoPromptState'
import { useVideoPanelLinking } from './video-stage-runtime/useVideoPanelLinking'
import { useVideoVoiceLines } from './video-stage-runtime/useVideoVoiceLines'
import { useVideoDownloadAll } from './video-stage-runtime/useVideoDownloadAll'
import { useVideoStageUiState } from './video-stage-runtime/useVideoStageUiState'
import { useVideoPanelViewport } from './video-stage-runtime/useVideoPanelViewport'
import { useVideoFirstLastFrameFlow } from './video-stage-runtime/useVideoFirstLastFrameFlow'

export type { VideoStageShellProps } from './video-stage-runtime/types'

type BatchCapabilityDefinition = EffectiveVideoCapabilityDefinition

interface BatchCapabilityField {
  field: string
  label: string
  labelKey?: string
  unitKey?: string
  options: VideoGenerationOptionValue[]
  disabledOptions?: VideoGenerationOptionValue[]
}

function toFieldLabel(field: string): string {
  return field.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase())
}

export function useVideoStageRuntime({
  projectId,
  episodeId,
  storyboards,
  clips,
  defaultVideoModel,
  capabilityOverrides,
  videoRatio = '16:9',
  userVideoModels,
  onGenerateVideo,
  onGenerateAllVideos,
  onBack,
  onUpdateVideoPrompt,
  onUpdatePanelVideoModel,
  onOpenAssetLibraryForCharacter,
  onEnterEditor,
}: VideoStageShellProps) {
  const t = useTranslations('video')

  const {
    panelVideoPreference,
    voiceLinesExpanded,
    previewImage,
    setPreviewImage,
    toggleVoiceLinesExpanded,
    toggleLipSyncVideo,
    closePreviewImage,
  } = useVideoStageUiState()

  const {
    panelRefs,
    highlightedPanelKey,
    locateVoiceLinePanel,
  } = useVideoPanelViewport()

  const lipSyncMutation = useLipSync(projectId, episodeId)
  const listEpisodeVideoUrlsMutation = useListProjectEpisodeVideoUrls(projectId)
  const updatePanelLinkMutation = useUpdateProjectPanelLink(projectId)
  const downloadRemoteBlobMutation = useDownloadRemoteBlob()
  const matchedVoiceLinesQuery = useMatchedVoiceLines(projectId, episodeId)

  const { panelVideoStates, panelLipStates } = useVideoTaskStates({
    projectId,
    storyboards,
  })
  const { allPanels } = useVideoPanelsProjection({
    storyboards,
    clips,
    panelVideoStates,
    panelLipStates,
  })

  const {
    savingPrompts,
    getLocalPrompt,
    updateLocalPrompt,
    savePrompt,
  } = useVideoPromptState({
    allPanels,
    onUpdateVideoPrompt,
  })

  const { linkedPanels, handleToggleLink } = useVideoPanelLinking({
    allPanels,
    updatePanelLinkMutation,
  })

  const {
    panelVoiceLines,
    allVoiceLines,
    runningVoiceLineIds,
    reloadVoiceLines,
  } = useVideoVoiceLines({
    projectId,
    matchedVoiceLinesQuery,
  })

  const {
    isDownloading,
    videosWithUrl,
    handleDownloadAllVideos,
  } = useVideoDownloadAll({
    episodeId,
    t: (key) => t(key as never),
    allPanels,
    panelVideoPreference,
    listEpisodeVideoUrlsMutation,
    downloadRemoteBlobMutation,
  })

  const {
    flModel,
    flModelOptions,
    flGenerationOptions,
    flCapabilityFields,
    flMissingCapabilityFields,
    flCustomPrompts,
    setFlModel,
    setFlCapabilityValue,
    setFlCustomPrompt,
    resetFlCustomPrompt,
    handleGenerateFirstLastFrame,
    getDefaultFlPrompt,
    getNextPanel,
    isLinkedAsLastFrame,
  } = useVideoFirstLastFrameFlow({
    allPanels,
    linkedPanels,
    videoModelOptions: userVideoModels || [],
    onGenerateVideo,
    t: (key) => t(key as never),
  })

  const safeTranslate = useCallback((key: string | undefined, fallback = ''): string => {
    if (!key) return fallback
    try {
      return t(key as never)
    } catch {
      return fallback
    }
  }, [t])

  const renderCapabilityLabel = useCallback((field: {
    field: string
    label: string
    labelKey?: string
    unitKey?: string
  }): string => {
    const labelText = safeTranslate(field.labelKey, safeTranslate(`capability.${field.field}`, field.label))
    const unitText = safeTranslate(field.unitKey)
    return unitText ? `${labelText} (${unitText})` : labelText
  }, [safeTranslate])

  const allVideoModelOptions = useMemo(
    () => userVideoModels || [],
    [userVideoModels],
  )
  const [isBatchConfigOpen, setIsBatchConfigOpen] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [batchSelectedModel, setBatchSelectedModel] = useState('')
  const [batchGenerationOptions, setBatchGenerationOptions] = useState<VideoGenerationOptions>({})

  useEffect(() => {
    if (allVideoModelOptions.length === 0) {
      if (batchSelectedModel) setBatchSelectedModel('')
      return
    }
    if (allVideoModelOptions.some((model) => model.value === batchSelectedModel)) return

    const nextDefault = allVideoModelOptions.some((model) => model.value === defaultVideoModel)
      ? defaultVideoModel
      : ''
    setBatchSelectedModel(nextDefault)
  }, [allVideoModelOptions, batchSelectedModel, defaultVideoModel])

  const selectedBatchModelOption = useMemo<VideoModelOption | undefined>(
    () => allVideoModelOptions.find((option) => option.value === batchSelectedModel),
    [allVideoModelOptions, batchSelectedModel],
  )
  const batchPricingTiers = useMemo(
    () => projectVideoPricingTiersByFixedSelections({
      tiers: selectedBatchModelOption?.videoPricingTiers ?? [],
      fixedSelections: {
        generationMode: 'normal',
      },
    }),
    [selectedBatchModelOption?.videoPricingTiers],
  )

  const batchCapabilityDefinitions = useMemo<BatchCapabilityDefinition[]>(() => {
    return resolveEffectiveVideoCapabilityDefinitions({
      videoCapabilities: selectedBatchModelOption?.capabilities?.video,
      pricingTiers: batchPricingTiers,
    })
  }, [batchPricingTiers, selectedBatchModelOption?.capabilities?.video])

  useEffect(() => {
    setBatchGenerationOptions((previous) => {
      return normalizeVideoGenerationSelections({
        definitions: batchCapabilityDefinitions,
        pricingTiers: batchPricingTiers,
        selection: previous,
      })
    })
  }, [batchCapabilityDefinitions, batchPricingTiers])

  const batchEffectiveCapabilityFields = useMemo(
    () => resolveEffectiveVideoCapabilityFields({
      definitions: batchCapabilityDefinitions,
      pricingTiers: batchPricingTiers,
      selection: batchGenerationOptions,
    }),
    [batchCapabilityDefinitions, batchGenerationOptions, batchPricingTiers],
  )

  const batchEffectiveFieldMap = useMemo(
    () => new Map(batchEffectiveCapabilityFields.map((field) => [field.field, field])),
    [batchEffectiveCapabilityFields],
  )
  const batchDefinitionFieldMap = useMemo(
    () => new Map(batchCapabilityDefinitions.map((definition) => [definition.field, definition])),
    [batchCapabilityDefinitions],
  )

  const batchCapabilityFields = useMemo<BatchCapabilityField[]>(() => {
    return batchCapabilityDefinitions.map((definition) => {
      const effectiveField = batchEffectiveFieldMap.get(definition.field)
      const enabledOptions = effectiveField?.options ?? []
      return {
        field: definition.field,
        label: toFieldLabel(definition.field),
        labelKey: definition.fieldI18n?.labelKey,
        unitKey: definition.fieldI18n?.unitKey,
        options: definition.options as VideoGenerationOptionValue[],
        disabledOptions: (definition.options as VideoGenerationOptionValue[])
          .filter((option) => !enabledOptions.includes(option)),
      }
    })
  }, [batchCapabilityDefinitions, batchEffectiveFieldMap])

  const batchMissingCapabilityFields = useMemo(
    () => batchEffectiveCapabilityFields
      .filter((field) => field.options.length === 0 || field.value === undefined)
      .map((field) => field.field),
    [batchEffectiveCapabilityFields],
  )

  const setBatchCapabilityValue = useCallback((field: string, rawValue: string) => {
    const capabilityDefinition = batchDefinitionFieldMap.get(field)
    if (!capabilityDefinition || capabilityDefinition.options.length === 0) return
    const sample = capabilityDefinition.options[0]
    const parsedValue =
      typeof sample === 'number'
        ? Number(rawValue)
        : typeof sample === 'boolean'
          ? rawValue === 'true'
          : rawValue
    if (!capabilityDefinition.options.includes(parsedValue)) return
    setBatchGenerationOptions((previous) => ({
      ...normalizeVideoGenerationSelections({
        definitions: batchCapabilityDefinitions,
        pricingTiers: batchPricingTiers,
        selection: {
          ...previous,
          [field]: parsedValue,
        },
        pinnedFields: [field],
      }),
    }))
  }, [batchCapabilityDefinitions, batchDefinitionFieldMap, batchPricingTiers])

  const handleLipSync = useCallback(async (
    storyboardId: string,
    panelIndex: number,
    voiceLineId: string,
    panelId?: string,
  ) => {
    try {
      await lipSyncMutation.mutateAsync({
        storyboardId,
        panelIndex,
        voiceLineId,
        panelId,
      })
    } catch (error: unknown) {
      _ulogError('Lip sync error:', error)
      throw error
    }
  }, [lipSyncMutation])

  const runningCount = allPanels.filter((panel) => panel.videoTaskRunning || panel.lipSyncTaskRunning).length
  const failedCount = allPanels.filter((panel) => !!panel.videoErrorMessage || !!panel.lipSyncErrorMessage).length
  const isAnyTaskRunning = runningCount > 0
  const canSubmitBatchGenerate = !!batchSelectedModel && batchMissingCapabilityFields.length === 0

  const handleOpenBatchGenerateModal = useCallback(() => {
    if (isAnyTaskRunning) return
    setIsBatchConfigOpen(true)
  }, [isAnyTaskRunning])

  const handleCloseBatchGenerateModal = useCallback(() => {
    setIsBatchConfigOpen(false)
  }, [])

  const handleConfirmBatchGenerate = useCallback(async () => {
    if (!canSubmitBatchGenerate || isConfirming) return

    setIsConfirming(true)
    try {
      await onGenerateAllVideos({
        videoModel: batchSelectedModel,
        generationOptions: batchGenerationOptions,
      })
      setIsBatchConfigOpen(false)
    } finally {
      setIsConfirming(false)
    }
  }, [
    batchGenerationOptions,
    batchSelectedModel,
    canSubmitBatchGenerate,
    isConfirming,
    onGenerateAllVideos,
  ])

  return (
    <div className="space-y-6 pb-20">
      <VideoToolbar
        totalPanels={allPanels.length}
        runningCount={runningCount}
        videosWithUrl={videosWithUrl}
        failedCount={failedCount}
        isAnyTaskRunning={isAnyTaskRunning}
        isDownloading={isDownloading}
        onGenerateAll={handleOpenBatchGenerateModal}
        onDownloadAll={handleDownloadAllVideos}
        onBack={onBack}
        onEnterEditor={onEnterEditor}
        videosReady={videosWithUrl > 0}
      />

      <VideoTimelinePanel
        projectId={projectId}
        episodeId={episodeId}
        allVoiceLines={allVoiceLines}
        expanded={voiceLinesExpanded}
        onToggleExpanded={toggleVoiceLinesExpanded}
        onReloadVoiceLines={reloadVoiceLines}
        onLocateVoiceLine={locateVoiceLinePanel}
        onOpenAssetLibraryForCharacter={onOpenAssetLibraryForCharacter}
      />

      <VideoRenderPanel
        allPanels={allPanels}
        linkedPanels={linkedPanels}
        highlightedPanelKey={highlightedPanelKey}
        panelRefs={panelRefs}
        videoRatio={videoRatio}
        defaultVideoModel={defaultVideoModel}
        capabilityOverrides={capabilityOverrides}
        userVideoModels={userVideoModels}
        projectId={projectId}
        episodeId={episodeId}
        runningVoiceLineIds={runningVoiceLineIds}
        panelVoiceLines={panelVoiceLines}
        panelVideoPreference={panelVideoPreference}
        savingPrompts={savingPrompts}
        flModel={flModel}
        flModelOptions={flModelOptions}
        flGenerationOptions={flGenerationOptions}
        flCapabilityFields={flCapabilityFields}
        flMissingCapabilityFields={flMissingCapabilityFields}
        flCustomPrompts={flCustomPrompts}
        onGenerateVideo={onGenerateVideo}
        onUpdatePanelVideoModel={onUpdatePanelVideoModel}
        onLipSync={handleLipSync}
        onToggleLink={handleToggleLink}
        onFlModelChange={setFlModel}
        onFlCapabilityChange={setFlCapabilityValue}
        onFlCustomPromptChange={setFlCustomPrompt}
        onResetFlPrompt={resetFlCustomPrompt}
        onGenerateFirstLastFrame={handleGenerateFirstLastFrame}
        onPreviewImage={setPreviewImage}
        onToggleLipSyncVideo={toggleLipSyncVideo}
        getNextPanel={getNextPanel}
        isLinkedAsLastFrame={isLinkedAsLastFrame}
        getDefaultFlPrompt={getDefaultFlPrompt}
        getLocalPrompt={getLocalPrompt}
        updateLocalPrompt={updateLocalPrompt}
        savePrompt={savePrompt}
      />

      {isBatchConfigOpen && (
        <div
          className="fixed inset-0 z-[120] bg-black/45 flex items-center justify-center p-4"
          onClick={handleCloseBatchGenerateModal}
        >
          <div
            className="rounded-xl border border-border bg-card shadow-lg w-full max-w-2xl p-5 space-y-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-foreground">
                {t('toolbar.batchConfigTitle')}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t('toolbar.batchConfigDesc')}
              </p>
            </div>

            <ModelCapabilityDropdown
              models={allVideoModelOptions}
              value={batchSelectedModel || undefined}
              onModelChange={setBatchSelectedModel}
              capabilityFields={batchCapabilityFields.map((field) => ({
                field: field.field,
                label: renderCapabilityLabel(field),
                options: field.options,
                disabledOptions: field.disabledOptions,
              }))}
              capabilityOverrides={batchGenerationOptions}
              onCapabilityChange={(field, rawValue) => setBatchCapabilityValue(field, rawValue)}
              placeholder={t('panelCard.selectModel')}
            />

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={handleCloseBatchGenerateModal}
                className="inline-flex items-center justify-center border border-input bg-background hover:bg-accent hover:text-accent-foreground px-4 py-2 text-sm font-medium"
              >
                {t('panelCard.cancel')}
              </button>
              <button
                type="button"
                onClick={() => { void handleConfirmBatchGenerate() }}
                disabled={!canSubmitBatchGenerate || isConfirming}
                className="inline-flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isConfirming ? (
                  <>
                    <AppIcon name="loader" className="animate-spin h-4 w-4" />
                    <span>{t('toolbar.confirming')}</span>
                  </>
                ) : (
                  <span>{t('toolbar.confirmGenerateAll')}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={closePreviewImage} />}
    </div>
  )
}
