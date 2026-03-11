'use client'

import ProgressToast from '@/components/ProgressToast'
import ConfirmDialog from '@/components/ConfirmDialog'
import { AnimatedBackground } from '@/components/ui/SharedComponents'
import { WorkspaceProvider } from './WorkspaceProvider'
import WorkspaceRunStreamConsoles from './components/WorkspaceRunStreamConsoles'
import WorkspaceStageContent from './components/WorkspaceStageContent'
import WorkspaceAssetLibraryModal from './components/WorkspaceAssetLibraryModal'
import WorkspaceHeaderShell from './components/WorkspaceHeaderShell'
import { WorkspaceStageRuntimeProvider } from './WorkspaceStageRuntimeContext'
import { useNovelPromotionWorkspaceController } from './hooks/useNovelPromotionWorkspaceController'
import type { NovelPromotionWorkspaceProps } from './types'
import '@/styles/animations.css'

function NovelPromotionWorkspaceContent(props: NovelPromotionWorkspaceProps) {
  const vm = useNovelPromotionWorkspaceController(props)

  const {
    project,
    projectId,
    episodeId,
    episodes = [],
    onEpisodeSelect,
    onEpisodeCreate,
    onEpisodeRename,
    onEpisodeDelete,
  } = props

  if (!vm.project.projectData) {
    return <div className="text-center text-[var(--glass-text-secondary)]">{vm.i18n.tc('loading')}</div>
  }

  return (
    <div>
      <AnimatedBackground />

      <WorkspaceHeaderShell
        isSettingsModalOpen={vm.ui.isSettingsModalOpen}
        isWorldContextModalOpen={vm.ui.isWorldContextModalOpen}
        onCloseSettingsModal={() => vm.ui.setIsSettingsModalOpen(false)}
        onCloseWorldContextModal={() => vm.ui.setIsWorldContextModalOpen(false)}
        availableModels={vm.ui.userModelsForSettings || undefined}
        modelsLoaded={vm.ui.userModelsLoaded}
        artStyle={vm.project.artStyle}
        analysisModel={vm.project.analysisModel}
        characterModel={vm.project.characterModel}
        locationModel={vm.project.locationModel}
        storyboardModel={vm.project.storyboardModel}
        editModel={vm.project.editModel}
        videoModel={vm.project.videoModel}
        capabilityOverrides={vm.project.capabilityOverrides}
        videoRatio={vm.project.videoRatio}
        ttsRate={vm.project.ttsRate !== undefined && vm.project.ttsRate !== null ? String(vm.project.ttsRate) : undefined}
        onUpdateConfig={vm.actions.handleUpdateConfig}
        globalAssetText={vm.project.globalAssetText}
        projectName={project.name}
        episodes={episodes}
        currentEpisodeId={episodeId}
        onEpisodeSelect={onEpisodeSelect}
        onEpisodeCreate={onEpisodeCreate}
        onEpisodeRename={onEpisodeRename}
        onEpisodeDelete={onEpisodeDelete}
        capsuleNavItems={vm.stageNav.capsuleNavItems}
        currentStage={vm.stageNav.currentStage}
        onStageChange={vm.stageNav.handleStageChange}
        projectId={projectId}
        episodeId={episodeId}
        onOpenAssetLibrary={() => vm.ui.openAssetLibrary()}
        onOpenSettingsModal={() => vm.ui.setIsSettingsModalOpen(true)}
        onRefresh={() => vm.ui.onRefresh({ mode: 'full' })}
        assetLibraryLabel={vm.i18n.t('buttons.assetLibrary')}
        settingsLabel={vm.i18n.t('buttons.settings')}
        refreshTitle={vm.i18n.t('buttons.refreshData')}
        journeyType={vm.runtime.stageRuntime.journeyType}
      />

      <div className="pt-36 sm:pt-32">
        <WorkspaceStageRuntimeProvider value={vm.runtime.stageRuntime}>
          <WorkspaceStageContent currentStage={vm.stageNav.currentStage} />
        </WorkspaceStageRuntimeProvider>

        <WorkspaceAssetLibraryModal
          isOpen={vm.ui.isAssetLibraryOpen}
          onClose={vm.ui.closeAssetLibrary}
          assetsLoading={vm.ui.assetsLoading}
          assetsLoadingState={vm.ui.assetsLoadingState}
          hasCharacters={vm.project.projectCharacters.length > 0}
          hasLocations={vm.project.projectLocations.length > 0}
          projectId={projectId}
          isAnalyzingAssets={vm.execution.isAssetAnalysisRunning}
          focusCharacterId={vm.ui.assetLibraryFocusCharacterId}
          focusCharacterRequestId={vm.ui.assetLibraryFocusRequestId}
          triggerGlobalAnalyze={vm.ui.triggerGlobalAnalyzeOnOpen}
          onGlobalAnalyzeComplete={() => vm.ui.setTriggerGlobalAnalyzeOnOpen(false)}
        />

        {vm.execution.showCreatingToast && (
          <ProgressToast show={true} message={vm.i18n.t('storyInput.creating')} step={vm.execution.transitionProgress.step || ''} />
        )}

        <ConfirmDialog
          show={vm.rebuild.showRebuildConfirm}
          type="warning"
          title={vm.rebuild.rebuildConfirmTitle}
          message={vm.rebuild.rebuildConfirmMessage}
          confirmText={vm.i18n.t('rebuildConfirm.confirm')}
          cancelText={vm.i18n.t('rebuildConfirm.cancel')}
          onConfirm={vm.rebuild.handleAcceptRebuildConfirm}
          onCancel={vm.rebuild.handleCancelRebuildConfirm}
        />

        <WorkspaceRunStreamConsoles
          storyToScriptStream={vm.execution.storyToScriptStream}
          scriptToStoryboardStream={vm.execution.scriptToStoryboardStream}
          storyToScriptConsoleMinimized={vm.execution.storyToScriptConsoleMinimized}
          scriptToStoryboardConsoleMinimized={vm.execution.scriptToStoryboardConsoleMinimized}
          onStoryToScriptMinimizedChange={vm.execution.setStoryToScriptConsoleMinimized}
          onScriptToStoryboardMinimizedChange={vm.execution.setScriptToStoryboardConsoleMinimized}
        />
      </div>
    </div>
  )
}

export default function NovelPromotionWorkspace(props: NovelPromotionWorkspaceProps) {
  const { projectId, episodeId } = props
  return (
    <WorkspaceProvider projectId={projectId} episodeId={episodeId}>
      <NovelPromotionWorkspaceContent {...props} />
    </WorkspaceProvider>
  )
}
