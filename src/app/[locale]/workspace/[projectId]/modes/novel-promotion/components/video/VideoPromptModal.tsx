'use client'

import { useTranslations } from 'next-intl'
import { VideoPanel } from './types'
import { AppIcon } from '@/components/ui/icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

interface VideoPromptModalProps {
  panel: VideoPanel | undefined
  panelIndex: number
  editValue: string
  onEditValueChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
}

export default function VideoPromptModal({
  panel,
  panelIndex,
  editValue,
  onEditValueChange,
  onSave,
  onCancel
}: VideoPromptModalProps) {
  const t = useTranslations('video')
  if (!panel) return null

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onCancel() }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto p-0">
        <DialogHeader className="sticky top-0 z-10 border-b bg-card px-6 py-4">
          <DialogTitle className="flex items-center justify-between gap-2 text-lg">
            {t('promptModal.title', { number: panelIndex + 1 })}
            <Button onClick={onCancel} variant="ghost" size="icon" className="h-8 w-8">
              <AppIcon name="close" className="h-5 w-5" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 p-6">
          <div className="space-y-1 rounded-lg bg-muted/50 p-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{t('promptModal.shotType')}</span>
              <span className="rounded bg-blue-100 px-2 py-0.5 text-blue-700">{panel.textPanel?.shot_type}</span>
              {panel.textPanel?.camera_move && (
                <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-700">{panel.textPanel.camera_move}</span>
              )}
              {panel.textPanel?.duration && (
                <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-muted-foreground">
                  <AppIcon name="clock" className="h-3 w-3" />
                  {panel.textPanel.duration}
                  {t('promptModal.duration')}
                </span>
              )}
            </div>
            <div><span className="text-muted-foreground">{t('promptModal.location')}</span>{panel.textPanel?.location || t('promptModal.locationUnknown')}</div>
            <div><span className="text-muted-foreground">{t('promptModal.characters')}</span>{panel.textPanel?.characters?.join('、') || t('promptModal.charactersNone')}</div>
            <div><span className="text-muted-foreground">{t('promptModal.description')}</span>{panel.textPanel?.description}</div>
            {panel.textPanel?.text_segment && (
              <div className="mt-2 border-t pt-2">
                <span className="text-muted-foreground">{t('promptModal.text')}</span>
                <span className="italic text-foreground">&quot;{panel.textPanel.text_segment}&quot;</span>
              </div>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">
              {t('promptModal.promptLabel')}
            </label>
            <Textarea
              value={editValue}
              onChange={(e) => onEditValueChange(e.target.value)}
              rows={6}
              placeholder={t('promptModal.placeholder')}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {t('promptModal.tip')}
            </p>
          </div>
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button onClick={onCancel} variant="outline">
            {t('promptModal.cancel')}
          </Button>
          <Button onClick={onSave}>
            {t('promptModal.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
