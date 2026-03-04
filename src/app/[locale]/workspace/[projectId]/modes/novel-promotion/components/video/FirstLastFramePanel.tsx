'use client'
import { useTranslations } from 'next-intl'

import type { VideoGenerationOptions, VideoModelOption, VideoPanel } from './types'
import type { CapabilityValue } from '@/lib/model-config-contract'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import { ModelCapabilityDropdown } from '@/components/ui/config-modals/ModelCapabilityDropdown'
import { Button } from '@/components/ui/button'
import { AppIcon } from '@/components/ui/icons'

interface FirstLastFramePanelProps {
  panel: VideoPanel
  nextPanel: VideoPanel
  panelIndex: number
  panelKey: string
  isVideoTaskRunning: boolean
  flModel: string
  flModelOptions: VideoModelOption[]
  flGenerationOptions: VideoGenerationOptions
  flCapabilityFields: Array<{
    field: string
    label: string
    options: CapabilityValue[]
    disabledOptions?: CapabilityValue[]
    value: CapabilityValue | undefined
  }>
  customPrompt: string
  defaultPrompt: string
  hasMissingCapabilities?: boolean
  videoRatio?: string  // 视频比例，如 "16:9", "3:2" 等
  onFlModelChange: (model: string) => void
  onFlCapabilityChange: (field: string, rawValue: string) => void
  onCustomPromptChange: (panelKey: string, value: string) => void
  onResetPrompt: (panelKey: string) => void
  onToggleLink: (panelKey: string, storyboardId: string, panelIndex: number) => void
  onGenerate: (
    firstStoryboardId: string,
    firstPanelIndex: number,
    lastStoryboardId: string,
    lastPanelIndex: number,
    panelKey: string,
    generationOptions?: VideoGenerationOptions,
    firstPanelId?: string,
  ) => void
  onPreviewImage?: (imageUrl: string) => void
}

export default function FirstLastFramePanel({
  panel,
  nextPanel,
  panelIndex,
  panelKey,
  isVideoTaskRunning,
  flModel,
  flModelOptions,
  flGenerationOptions,
  flCapabilityFields,
  customPrompt,
  defaultPrompt,
  hasMissingCapabilities = false,
  videoRatio = '16:9',
  onFlModelChange,
  onFlCapabilityChange,
  onCustomPromptChange,
  onResetPrompt,
  onToggleLink,
  onGenerate,
  onPreviewImage
}: FirstLastFramePanelProps) {
  const t = useTranslations('video')
  const renderCapabilityLabel = (field: string, fallback: string): string => {
    try {
      return t(`capability.${field}` as never)
    } catch {
      return fallback
    }
  }
  const isFirstLastFrameGenerated = panel.videoGenerationMode === 'firstlastframe' && !!panel.videoUrl
  const videoTaskRunningState = isVideoTaskRunning
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: isFirstLastFrameGenerated ? 'regenerate' : 'generate',
      resource: 'video',
      hasOutput: isFirstLastFrameGenerated,
    })
    : null
  const currentPrompt = customPrompt || defaultPrompt
  const hasCustomPrompt = customPrompt !== ''

  // 根据视频比例设置 aspect ratio（支持任意比例）
  const cssAspectRatio = videoRatio.replace(':', '/')

  return (
    <div className="mb-2 space-y-2">
      <div className="rounded-lg border border-primary/30 bg-blue-50 p-2">
        <div className="mb-2 flex items-center gap-2 text-xs text-primary">
          <span>{t("firstLastFrame.title")}</span>
          <span>{t("firstLastFrame.range", { from: panelIndex + 1, to: panelIndex + 2 })}</span>
          <Button
            onClick={() => onToggleLink(panelKey, panel.storyboardId, panel.panelIndex)}
            variant="ghost"
            size="sm"
            className="ml-auto h-6 px-2 text-xs text-primary hover:text-foreground"
          >
            {t("firstLastFrame.unlinkAction")}
          </Button>
        </div>
        <div className="flex gap-2 items-center">
          <div className="relative flex-1 overflow-hidden rounded bg-muted/50" style={{ aspectRatio: cssAspectRatio }}>
            {panel.imageUrl && (
              <MediaImageWithLoading
                src={panel.imageUrl}
                alt={t("firstLastFrame.firstFrame")}
                containerClassName="w-full h-full"
                className={`w-full h-full object-cover ${onPreviewImage ? 'cursor-zoom-in' : ''}`}
                onClick={() => {
                  if (panel.imageUrl) onPreviewImage?.(panel.imageUrl)
                }}
              />
            )}
            <span className="absolute bottom-1 left-1 rounded bg-primary px-1 text-[10px] text-primary-foreground">{t("firstLastFrame.firstFrame")}</span>
          </div>
          <AppIcon name="arrowRight" className="h-4 w-4 text-primary" />
          <div className="relative flex-1 overflow-hidden rounded bg-muted/50" style={{ aspectRatio: cssAspectRatio }}>
            {nextPanel.imageUrl && (
              <MediaImageWithLoading
                src={nextPanel.imageUrl}
                alt={t("firstLastFrame.lastFrame")}
                containerClassName="w-full h-full"
                className={`w-full h-full object-cover ${onPreviewImage ? 'cursor-zoom-in' : ''}`}
                onClick={() => {
                  if (nextPanel.imageUrl) onPreviewImage?.(nextPanel.imageUrl)
                }}
              />
            )}
            <span className="absolute bottom-1 left-1 rounded bg-amber-600 px-1 text-[10px] text-white">{t("firstLastFrame.lastFrame")}</span>
          </div>
        </div>
        {/* 首尾帧提示词编辑 */}
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-primary">{t("firstLastFrame.customPrompt")}</span>
            {hasCustomPrompt && (
              <Button
                onClick={() => onResetPrompt(panelKey)}
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-primary"
              >
                {t("firstLastFrame.useDefault")}
              </Button>
            )}
          </div>
          <textarea
            value={currentPrompt}
            onChange={(e) => onCustomPromptChange(panelKey, e.target.value)}
            className="w-full resize-none rounded border border-primary/40 bg-background p-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            rows={3}
            placeholder={t("firstLastFrame.promptPlaceholder")}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          onClick={() => onGenerate(panel.storyboardId, panel.panelIndex, nextPanel.storyboardId, nextPanel.panelIndex, panelKey, flGenerationOptions, panel.panelId)}
          disabled={isVideoTaskRunning || !panel.imageUrl || !nextPanel.imageUrl || !flModel || hasMissingCapabilities}
          variant={isFirstLastFrameGenerated ? 'secondary' : 'default'}
          className="h-9 flex-1 text-sm font-medium"
        >
          {isFirstLastFrameGenerated ? t("firstLastFrame.generated") : isVideoTaskRunning ? (
            <TaskStatusInline state={videoTaskRunningState} className="text-white [&>span]:text-white [&_svg]:text-white" />
          ) : t("firstLastFrame.generate")}
        </Button>
        <div className="min-w-[220px] max-w-[280px]">
          <ModelCapabilityDropdown
            compact
            models={flModelOptions}
            value={flModel || undefined}
            onModelChange={onFlModelChange}
            capabilityFields={flCapabilityFields.map((field) => ({
              field: field.field,
              label: renderCapabilityLabel(field.field, field.label),
              options: field.options,
              disabledOptions: field.disabledOptions,
            }))}
            capabilityOverrides={flGenerationOptions}
            onCapabilityChange={(field, rawValue) => onFlCapabilityChange(field, rawValue)}
            placeholder={t('panelCard.selectModel')}
          />
        </div>
      </div>
    </div>
  )
}
