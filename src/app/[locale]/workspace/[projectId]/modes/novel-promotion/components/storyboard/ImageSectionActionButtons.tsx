'use client'
import { logInfo as _ulogInfo } from '@/lib/logging/core'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'

interface ImageSectionActionButtonsProps {
  panelId: string
  imageUrl: string | null
  previousImageUrl?: string | null
  isSubmittingPanelImageTask: boolean
  isModifying: boolean
  onRegeneratePanelImage: (panelId: string, count?: number, force?: boolean) => void
  onOpenEditModal: () => void
  onOpenAIDataModal: () => void
  onUndo?: (panelId: string) => void
  triggerPulse: () => void
}

export default function ImageSectionActionButtons({
  panelId,
  imageUrl,
  previousImageUrl,
  isSubmittingPanelImageTask,
  isModifying,
  onRegeneratePanelImage,
  onOpenEditModal,
  onOpenAIDataModal,
  onUndo,
  triggerPulse,
}: ImageSectionActionButtonsProps) {
  const t = useTranslations('storyboard')
  const [showCountDropdown, setShowCountDropdown] = useState(false)

  return (
    <>
      <div className={`absolute bottom-1.5 left-1/2 -translate-x-1/2 z-20 transition-opacity ${isSubmittingPanelImageTask ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        <div className="relative rounded-xl border border-border bg-card shadow-lg border border-border rounded-lg p-0.5">
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => {
                _ulogInfo('[ImageSection] 🔄 左下角重新生成按钮被点击')
                _ulogInfo('[ImageSection] isSubmittingPanelImageTask:', isSubmittingPanelImageTask)
                _ulogInfo('[ImageSection] 将传递 force:', isSubmittingPanelImageTask)
                triggerPulse()
                onRegeneratePanelImage(panelId, 1, isSubmittingPanelImageTask)
              }}
              className={`inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] transition-all active:scale-95 ${isSubmittingPanelImageTask ? 'opacity-75' : ''}`}
              title={isSubmittingPanelImageTask ? t('video.panelCard.forceRegenerate') : t('panel.regenerateImage')}
            >
              <AppIcon name="refresh" className="w-2.5 h-2.5" />
              <span>{isSubmittingPanelImageTask ? t('image.forceRegenerate') : t('panel.regenerate')}</span>
            </button>
            <button
              onClick={() => setShowCountDropdown(!showCountDropdown)}
              className={`inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground px-1 py-0.5 rounded-md text-[10px] transition-all active:scale-95 ${isSubmittingPanelImageTask ? 'opacity-75' : ''}`}
              title={t('image.selectCount')}
            >
              <AppIcon name="chevronDown" className="w-2.5 h-2.5" />
            </button>

            <div className="w-px h-3 bg-border" />

            <button
              onClick={onOpenAIDataModal}
              className={`inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] transition-all active:scale-95 ${isSubmittingPanelImageTask || isModifying ? 'opacity-75' : ''}`}
              title={t('aiData.viewData')}
            >
              <AppIcon name="chart" className="w-2.5 h-2.5" />
              <span>{t('aiData.viewData')}</span>
            </button>
            {imageUrl && (
              <button
                onClick={onOpenEditModal}
                className={`inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] transition-all active:scale-95 ${isSubmittingPanelImageTask || isModifying ? 'opacity-75' : ''}`}
              >
                <span>{t('image.editImage')}</span>
              </button>
            )}

            {previousImageUrl && onUndo && (
              <>
                <div className="w-px h-3 bg-border" />
                <button
                  onClick={() => onUndo(panelId)}
                  disabled={isSubmittingPanelImageTask}
                  className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] transition-all active:scale-95 disabled:opacity-50"
                  title={t('assets.image.undo')}
                >
                  <span>{t('assets.image.undo')}</span>
                </button>
              </>
            )}
          </div>

          {showCountDropdown && (
            <div className="absolute left-0 bottom-full mb-1 z-30 rounded-xl border border-border bg-card shadow-lg border border-border rounded-lg py-1 min-w-[120px] shadow-[0_4px_16px_rgba(0,0,0,0.1)]">
              {[2, 3, 4].map((count) => (
                <button
                  key={count}
                  onClick={() => {
                    triggerPulse()
                    onRegeneratePanelImage(panelId, count)
                    setShowCountDropdown(false)
                  }}
                  className="w-full px-3 py-1.5 text-left text-[11px] text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                >
                  {t('image.generateCount', { count })}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
