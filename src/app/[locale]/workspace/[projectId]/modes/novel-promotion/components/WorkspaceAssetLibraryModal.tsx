'use client'

import AssetsStage from './AssetsStage'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import type { TaskPresentationState } from '@/lib/task/presentation'
import { AppIcon } from '@/components/ui/icons'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface WorkspaceAssetLibraryModalProps {
  isOpen: boolean
  onClose: () => void
  assetsLoading: boolean
  assetsLoadingState: TaskPresentationState | null
  hasCharacters: boolean
  hasLocations: boolean
  projectId: string
  isAnalyzingAssets: boolean
  focusCharacterId: string | null
  focusCharacterRequestId: number
  triggerGlobalAnalyze: boolean
  onGlobalAnalyzeComplete: () => void
}

export default function WorkspaceAssetLibraryModal({
  isOpen,
  onClose,
  assetsLoading,
  assetsLoadingState,
  hasCharacters,
  hasLocations,
  projectId,
  isAnalyzingAssets,
  focusCharacterId,
  focusCharacterRequestId,
  triggerGlobalAnalyze,
  onGlobalAnalyzeComplete,
}: WorkspaceAssetLibraryModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(nextOpen) => { if (!nextOpen) onClose() }}>
      <DialogContent className="z-[100] flex h-[90vh] w-[95vw] max-w-6xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-8 py-5">
          <DialogTitle className="flex items-center gap-3 text-2xl font-bold text-foreground">
            <AppIcon name="package" className="h-7 w-7 text-muted-foreground" />
            资产库
          </DialogTitle>
        </DialogHeader>

        <div className="custom-scrollbar flex-1 overflow-y-auto p-6" data-asset-scroll-container="1">
          {assetsLoading && !hasCharacters && !hasLocations && (
            <div className="flex h-64 animate-pulse flex-col items-center justify-center text-muted-foreground">
              <TaskStatusInline state={assetsLoadingState} className="text-base [&>span]:text-base" />
            </div>
          )}
          <AssetsStage
            projectId={projectId}
            isAnalyzingAssets={isAnalyzingAssets}
            focusCharacterId={focusCharacterId}
            focusCharacterRequestId={focusCharacterRequestId}
            triggerGlobalAnalyze={triggerGlobalAnalyze}
            onGlobalAnalyzeComplete={onGlobalAnalyzeComplete}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
