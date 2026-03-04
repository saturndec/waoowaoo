'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import EmotionSettingsPanel from './EmotionSettingsPanel'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState, type TaskPresentationState } from '@/lib/task/presentation'
import { AppIcon } from '@/components/ui/icons'

interface VoiceLine {
    id: string
    lineIndex: number
    speaker: string
    content: string
    emotionPrompt: string | null
    emotionStrength: number | null
    audioUrl: string | null
    lineTaskRunning: boolean
    matchedPanelId?: string | null
    matchedStoryboardId?: string | null
    matchedPanelIndex?: number | null
}

interface VoiceLineCardProps {
    line: VoiceLine
    isVoiceTaskRunning: boolean
    statusState?: TaskPresentationState | null
    isPlaying: boolean
    hasVoice: boolean
    onTogglePlay: (lineId: string, audioUrl: string) => void
    onDownload: (audioUrl: string) => void
    onGenerate: (lineId: string) => void
    onEdit: (line: VoiceLine) => void
    onLocatePanel?: (line: VoiceLine) => void
    onDelete: (lineId: string) => void
    onDeleteAudio: (lineId: string) => void
    onSaveEmotionSettings: (lineId: string, emotionPrompt: string | null, emotionStrength: number) => void
}

export default function VoiceLineCard({
    line,
    isVoiceTaskRunning,
    statusState,
    isPlaying,
    hasVoice,
    onTogglePlay,
    onDownload,
    onGenerate,
    onEdit,
    onLocatePanel,
    onDelete,
    onDeleteAudio,
    onSaveEmotionSettings
}: VoiceLineCardProps) {
    const t = useTranslations('voice')
    const [isEmotionExpanded, setIsEmotionExpanded] = useState(false)
    const hasPanelBinding = !!onLocatePanel && !!line.matchedStoryboardId && line.matchedPanelIndex !== null && line.matchedPanelIndex !== undefined
    const locateTitle = t("lineCard.locateVideo")
    const inlineStatusState = statusState || (
        isVoiceTaskRunning
            ? resolveTaskPresentationState({
                phase: 'processing',
                intent: 'generate',
                resource: 'audio',
                hasOutput: !!line.audioUrl,
            })
            : null
    )

    return (
        <div
            className={`relative rounded-xl border border-border bg-card shadow-md overflow-hidden transition-all hover:shadow-md hover:-translate-y-0.5 ${line.audioUrl ? 'ring-1 ring-primary/40' : hasVoice ? '' : 'ring-1 ring-amber-300/60'
                }`}
        >
            {/* 顶部：播放/生成区域 */}
            <div className={`h-14 flex items-center justify-center gap-3 ${line.audioUrl
                ? 'bg-emerald-100/50'
                : 'bg-muted/50'
                }`}>
                {line.audioUrl ? (
                    <div className="flex items-center justify-center gap-3">
                        {/* 播放按钮 */}
                        <button
                            onClick={() => onTogglePlay(line.id, line.audioUrl!)}
                            className="flex items-center justify-center w-9 h-9 bg-emerald-700 text-white rounded-xl hover:bg-emerald-700 shadow-sm transition-all"
                            title={isPlaying ? t("lineCard.pause") : t("lineCard.play")}
                        >
                            {isPlaying ? (
                                <AppIcon name="pauseSolid" className="w-4 h-4" />
                            ) : (
                                <AppIcon name="play" className="w-4 h-4" />
                            )}
                        </button>
                        {/* 重新生成按钮 */}
                        <button
                            onClick={() => onGenerate(line.id)}
                            disabled={!hasVoice || isVoiceTaskRunning}
                            className="flex items-center justify-center w-8 h-8 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl transition-all disabled:opacity-50"
                            title={t("common.regenerate")}
                        >
                            {isVoiceTaskRunning ? (
                                <TaskStatusInline state={inlineStatusState} className="[&_span]:sr-only [&_svg]:text-current" />
                            ) : (
                                <AppIcon name="refresh" className="w-3.5 h-3.5" />
                            )}
                        </button>
                        {/* 下载按钮 */}
                        <button
                            onClick={() => onDownload(line.audioUrl!)}
                            className="flex items-center justify-center w-8 h-8 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl transition-all"
                            title={t("common.download")}
                        >
                            <AppIcon name="download" className="w-4 h-4" />
                        </button>
                    </div>
                ) : isVoiceTaskRunning ? (
                    /* 生成中状态：显示状态指示器 */
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-xl text-sm font-medium shadow-sm">
                            <TaskStatusInline state={inlineStatusState} className="text-white [&>span]:text-white [&_svg]:text-white" />
                        </div>
                    </div>
                ) : (
                    /* 生成按钮 */
                    <button
                        onClick={() => onGenerate(line.id)}
                        disabled={!hasVoice}
                        className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/90 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <AppIcon name="mic" className="w-4 h-4" />
                        {t("common.generate")}
                    </button>
                )}
            </div>

            {/* 序号标签 */}
            <div className="absolute top-2 left-2 bg-black/55 backdrop-blur-sm text-white px-2 py-0.5 rounded-lg text-xs font-medium">
                #{line.lineIndex}
            </div>

            {/* 状态标签+删除配音按钮 */}
            {
                line.audioUrl && (
                    <div className="absolute top-2 right-2 flex items-center gap-1">
                        <div className="flex items-center justify-center bg-emerald-700 text-white px-2 py-0.5 rounded-lg text-xs font-medium shadow-sm">
                            <AppIcon name="checkXs" className="h-3 w-3" />
                        </div>
                        <button
                            onClick={() => onDeleteAudio(line.id)}
                            className="flex items-center justify-center w-5 h-5 bg-amber-700 text-white rounded-md shadow-sm hover:bg-amber-700 transition-colors"
                            title={t("lineCard.deleteAudio")}
                        >
                            <AppIcon name="close" className="w-3 h-3" />
                        </button>
                    </div>
                )
            }

            {/* 中间：台词内容 */}
            <div className="px-4 py-3">
                <div className="group">
                    <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed" title={line.content}>
                        {line.content}
                    </p>
                    {/* 操作按钮组 */}
                    <div className="mt-2 flex justify-end gap-0.5">
                        {hasPanelBinding && (
                            <button
                                onClick={() => onLocatePanel?.(line)}
                                className="px-2 py-1 text-[11px] leading-none text-muted-foreground hover:text-primary hover:bg-primary/10 border border-border hover:border-primary/40 rounded-md transition-colors"
                                title={locateTitle}
                            >
                                <span>{t("lineCard.locateVideo")}</span>
                            </button>
                        )}
                        <button
                            onClick={() => onEdit(line)}
                            className="p-1 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors"
                            title={t("lineCard.editLine")}
                        >
                            <AppIcon name="editSquare" className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={() => onDelete(line.id)}
                            className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                            title={t("lineCard.deleteLine")}
                        >
                            <AppIcon name="trash" className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* 情绪设置面板 */}
            {
                hasVoice && (
                    <>
                        <button
                            onClick={() => setIsEmotionExpanded(!isEmotionExpanded)}
                            className="w-full px-4 py-2 text-xs text-primary hover:bg-primary/10 flex items-center justify-center gap-1.5 font-medium transition-colors"
                        >
                            <AppIcon name="chevronDown" className={`w-3.5 h-3.5 transition-transform ${isEmotionExpanded ? 'rotate-180' : ''}`} />
                            {line.emotionPrompt || (line.emotionStrength !== null && line.emotionStrength !== 0.4)
                                ? t("lineCard.emotionConfigured")
                                : t("lineCard.emotionSettings")}
                        </button>

                        {isEmotionExpanded && (
                            <EmotionSettingsPanel
                                lineId={line.id}
                                emotionPrompt={line.emotionPrompt}
                                emotionStrength={line.emotionStrength ?? 0.4}
                                onSave={onSaveEmotionSettings}
                                onGenerate={onGenerate}
                                isVoiceGenerationRunning={isVoiceTaskRunning}
                            />
                        )}
                    </>
                )
            }

            {/* 底部：发言人 */}
            <div className="px-4 py-2.5 bg-muted/50 border-t border-border/60 flex items-center justify-between gap-2">
                <span className="inline-flex max-w-[160px] items-center truncate rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary" title={line.speaker}>
                    {line.speaker}
                </span>
                {hasVoice ? (
                    <span className="text-xs text-emerald-700 font-medium">{t("lineCard.voiceConfigured")}</span>
                ) : (
                    <span className="text-xs text-amber-700 font-medium">{t("lineCard.needVoice")}</span>
                )}
            </div>
        </div >
    )
}
