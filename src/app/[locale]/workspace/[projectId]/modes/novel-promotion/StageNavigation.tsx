/**
 * 小说推文模式 - 阶段导航组件
 */

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'

interface StageNavigationProps {
  projectId: string  // 用于构建链接
  episodeId?: string | null  // 当前剧集ID，用于新标签页打开时保持剧集
  currentStage: string
  hasNovelText: boolean  // 是否有文本输入（用于启用配音阶段）
  hasAudio: boolean
  hasAssets: boolean
  hasStoryboards: boolean
  hasTextStoryboards: boolean  // 是否有文字分镜（用于启用分镜面板）
  hasVideos?: boolean
  hasVoiceLines?: boolean  // 是否有配音台词
  isDisabled: boolean
  onStageClick: (stage: string) => void
}

export function StageNavigation({
  projectId,
  episodeId,
  currentStage,
  hasNovelText,
  hasAudio,
  hasAssets,
  hasStoryboards,
  hasTextStoryboards,
  hasVideos,
  hasVoiceLines,
  isDisabled,
  onStageClick
}: StageNavigationProps) {
  const t = useTranslations('stages')
  // 如果 currentStage 是旧的 'text-storyboard'，自动重定向到 'storyboard'
  const effectiveStage = currentStage === 'text-storyboard' ? 'storyboard' : currentStage

  const stages = [
    { id: 'config', label: t('config'), enabled: true },
    { id: 'assets', label: t('assets'), enabled: hasAudio || hasAssets },
    { id: 'storyboard', label: t('storyboard'), enabled: hasTextStoryboards || hasStoryboards },
    { id: 'videos', label: t('videos'), enabled: hasStoryboards || hasVideos },
    // 配音阶段只要有文本输入就可以启用，不受其他条件限制
    { id: 'voice', label: t('voice'), enabled: hasNovelText || hasVoiceLines }
  ]

  return (
    <div className="flex items-center justify-center space-x-3 text-sm mt-6">
      {stages.map((stage, index) => {
        const isEnabled = stage.enabled && !isDisabled
        const isCurrent = effectiveStage === stage.id
        // 构建 URL，包含 episode 参数以支持新标签页打开时保持当前剧集
        const href = episodeId
          ? `/workspace/${projectId}?stage=${stage.id}&episode=${episodeId}`
          : `/workspace/${projectId}?stage=${stage.id}`

        const className = `px-5 py-2.5 rounded-xl transition-all font-medium inline-block ${isCurrent
          ? 'bg-primary text-primary-foreground shadow-sm'
          : isEnabled
            ? 'bg-secondary text-secondary-foreground hover:bg-secondary/80 cursor-pointer'
            : 'bg-muted text-muted-foreground cursor-not-allowed pointer-events-none'
          }`

        return (
          <div key={stage.id} className="flex items-center space-x-3">
            {isEnabled ? (
              <Link
                href={href}
                onClick={(e) => {
                  // 左键点击时阻止默认行为，使用 onStageClick
                  if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                    e.preventDefault()
                    onStageClick(stage.id)
                  }
                  // 中键点击或 Ctrl/Cmd+点击 会使用默认的链接行为打开新标签
                }}
                className={className}
              >
                {stage.label}
              </Link>
            ) : (
              <span className={className}>
                {stage.label}
              </span>
            )}
            {index < stages.length - 1 && (
              <AppIcon name="chevronRight" className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
        )
      })}
    </div>
  )
}
