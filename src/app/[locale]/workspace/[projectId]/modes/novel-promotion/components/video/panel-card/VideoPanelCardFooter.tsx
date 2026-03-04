import TaskStatusInline from '@/components/task/TaskStatusInline'
import type { VideoPanelRuntime } from './hooks/useVideoPanelActions'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface VideoPanelCardFooterProps {
  runtime: VideoPanelRuntime
}

export default function VideoPanelCardFooter({ runtime }: VideoPanelCardFooterProps) {
  const { t, lipSync, taskStatus, voiceManager } = runtime

  if (!lipSync.showLipSyncPanel) return null

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open && !lipSync.executingLipSync) lipSync.closeLipSyncPanel() }}>
      <DialogContent className="max-w-md p-6" onClick={(event) => event.stopPropagation()}>
        <DialogHeader className="mb-1">
          <DialogTitle className="flex items-center justify-between gap-2 text-lg">
            {t('panelCard.lipSyncTitle')}
            {!lipSync.executingLipSync && (
              <Button onClick={lipSync.closeLipSyncPanel} variant="ghost" size="icon" className="h-8 w-8">×</Button>
            )}
          </DialogTitle>
        </DialogHeader>

        {lipSync.lipSyncError && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {lipSync.lipSyncError}
          </div>
        )}

        {lipSync.executingLipSync && (
          <div className="flex flex-col items-center py-8">
            <TaskStatusInline state={taskStatus.lipSyncInlineState} className="text-muted-foreground [&>span]:text-muted-foreground [&_svg]:text-primary" />
            <p className="mt-2 text-xs text-muted-foreground">{t('panelCard.lipSyncMayTakeMinutes')}</p>
          </div>
        )}

        {!lipSync.executingLipSync && (
          <div>
            <p className="mb-3 text-sm text-muted-foreground">{t('panelCard.selectVoice')}</p>
            <div className="space-y-2">
              {voiceManager.localVoiceLines
                .filter((voiceLine) => voiceLine.audioUrl)
                .map((voiceLine) => (
                  <Button
                    key={voiceLine.id}
                    onClick={() => void lipSync.executeLipSync(voiceLine)}
                    variant="outline"
                    className="h-auto w-full justify-start rounded-lg p-3 text-left hover:border-primary/50 hover:bg-blue-50"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{voiceLine.speaker}</span>
                      {voiceLine.audioDuration && <span className="text-xs text-muted-foreground">{(voiceLine.audioDuration / 1000).toFixed(1)}s</span>}
                    </div>
                    <div className="text-sm text-foreground">&ldquo;{voiceLine.content}&rdquo;</div>
                  </Button>
                ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
