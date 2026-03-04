import { useState, useEffect } from 'react'
import TaskStatusOverlay from '@/components/task/TaskStatusOverlay'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'

import type { VideoPanelRuntime } from './hooks/useVideoPanelActions'
import { AppIcon } from '@/components/ui/icons'

interface VideoPanelCardHeaderProps {
  runtime: VideoPanelRuntime
}

export default function VideoPanelCardHeader({ runtime }: VideoPanelCardHeaderProps) {
  const {
    t,
    panel,
    panelIndex,
    panelKey,
    layout,
    media,
    taskStatus,
    videoModel,
    player,
    actions,
  } = runtime

  const [errorDismissed, setErrorDismissed] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)

  useEffect(() => {
    setErrorDismissed(false)
  }, [taskStatus.panelErrorDisplay?.message])

  const hasVisibleBaseVideo = !!media.baseVideoUrl
  const showFirstLastFrameSwitch = layout.hasNext

  return (
    <div className="relative flex items-center justify-center bg-muted/50" style={{ aspectRatio: player.cssAspectRatio }}>
      {hasVisibleBaseVideo && player.isPlaying ? (
        <video
          ref={player.videoRef}
          key={`video-${panel.storyboardId}-${panel.panelIndex}-${media.currentVideoUrl}`}
          src={media.currentVideoUrl}
          controls
          playsInline
          className="w-full h-full object-contain bg-black"
          onEnded={() => player.setIsPlaying(false)}
        />
      ) : hasVisibleBaseVideo ? (
        <div
          className="relative w-full h-full group cursor-pointer"
          onClick={() => void player.handlePlayClick()}
        >
          <MediaImageWithLoading
            src={panel.imageUrl || ''}
            alt={t('panelCard.shot', { number: panelIndex + 1 })}
            containerClassName="w-full h-full bg-black"
            className="w-full h-full object-contain bg-black"
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/45 transition-colors group-hover:bg-black/55">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-card shadow-lg transition-transform group-hover:scale-110">
              <AppIcon name="play" className="w-8 h-8 text-white" />
            </div>
          </div>
        </div>
      ) : panel.imageUrl ? (
        <MediaImageWithLoading
          src={panel.imageUrl}
          alt={t('panelCard.shot', { number: panelIndex + 1 })}
          containerClassName="h-full w-full bg-muted/50"
          className={`h-full w-full object-contain bg-muted/50 ${media.onPreviewImage ? 'cursor-zoom-in' : ''}`}
          onClick={media.onPreviewImage ? player.handlePreviewImage : undefined}
        />
      ) : (
        <AppIcon name="playCircle" className="h-16 w-16 text-muted-foreground" />
      )}

      {/* 镜头编号 */}
      <div className="absolute left-2 top-2 rounded bg-black/45 px-2 py-0.5 text-xs font-medium text-white">
        {panelIndex + 1}
      </div>

      {/* 两卡片中间唯一的链接/断开按钮 */}

      {showFirstLastFrameSwitch && (
        <div className="absolute -right-6 top-1/2 -translate-y-1/2 z-30">
          <div className="relative">
            <button
              onClick={(event) => {
                event.stopPropagation()
                actions.onToggleLink(panelKey, panel.storyboardId, panel.panelIndex)
              }}
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              className={`flex h-8 w-8 items-center justify-center rounded-full shadow-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${layout.isLinked
                ? 'bg-primary text-primary-foreground shadow-[0_0_12px_rgba(30,41,59,0.35)]'
                : 'bg-card text-muted-foreground hover:bg-blue-100 hover:text-blue-700'
                }`}
            >
              <AppIcon name="unplug" size={16} />
            </button>

            {/* 自定义 Tooltip */}
            {showTooltip && (
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 pointer-events-none">
                <div className="whitespace-nowrap rounded-lg border border-border bg-popover px-3 py-1.5 text-xs text-foreground shadow-md">
                  {layout.isLinked ? t('firstLastFrame.unlinkAction') : t('firstLastFrame.linkToNext')}
                  <div className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-popover" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 口型同步切换 */}
      {panel.lipSyncVideoUrl && hasVisibleBaseVideo ? (
        <div
          className="absolute right-2 top-2 flex cursor-pointer items-center rounded-full bg-black/45 p-0.5"
          onClick={(event) => {
            event.stopPropagation()
            media.onToggleLipSyncVideo(panelKey, !media.showLipSyncVideo)
            player.setIsPlaying(false)
          }}
        >
          <div className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-all ${!media.showLipSyncVideo ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:text-white'}`}>
            {t('panelCard.original')}
          </div>
          <div className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-all ${media.showLipSyncVideo ? 'bg-primary text-primary-foreground' : 'text-slate-300 hover:text-white'}`}>
            {t('panelCard.synced')}
          </div>
        </div>
      ) : null}

      {/* 重新生成按钮 */}
      {!layout.isLinked && !layout.isLastFrame && (hasVisibleBaseVideo || taskStatus.isVideoTaskRunning) && (
        <button
          onClick={() =>
            actions.onGenerateVideo(
              panel.storyboardId,
              panel.panelIndex,
              videoModel.selectedModel,
              undefined,
              videoModel.generationOptions,
              panel.panelId,
            )}
          disabled={!videoModel.selectedModel || videoModel.missingCapabilityFields.length > 0}
          className="absolute bottom-2 right-2 z-20 rounded-full bg-black/45 p-2 text-white transition-all hover:bg-black/60 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <AppIcon name="refresh" className="w-4 h-4" />
        </button>
      )}

      {/* 任务进度遮罩 */}
      {(taskStatus.isVideoTaskRunning || taskStatus.isLipSyncTaskRunning) && (
        <TaskStatusOverlay state={taskStatus.overlayPresentation} className="z-10" />
      )}

      {/* 错误提示 */}
      {taskStatus.panelErrorDisplay && !taskStatus.isVideoTaskRunning && !taskStatus.isLipSyncTaskRunning && !errorDismissed && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-destructive/15 p-4">
          <button
            onClick={(e) => { e.stopPropagation(); setErrorDismissed(true) }}
            className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-black/30 text-xs text-white transition-colors hover:bg-black/50"
          >
            <AppIcon name="close" className="w-3 h-3" />
          </button>
          <span className="text-white text-xs text-center break-all">{taskStatus.panelErrorDisplay.message}</span>
        </div>
      )}
    </div>
  )
}
