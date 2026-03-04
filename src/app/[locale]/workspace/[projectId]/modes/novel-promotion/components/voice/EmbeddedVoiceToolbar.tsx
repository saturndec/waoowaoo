'use client'
import { useTranslations } from 'next-intl'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'

interface EmbeddedVoiceToolbarProps {
    totalLines: number
    linesWithAudio: number
    analyzing: boolean
    isDownloading: boolean
    isBatchSubmitting: boolean
    runningCount: number
    allSpeakersHaveVoice: boolean
    onAddLine: () => void
    onAnalyze: () => void
    onDownloadAll: () => void
    onGenerateAll: () => void
}

export default function EmbeddedVoiceToolbar({
    totalLines,
    linesWithAudio,
    analyzing,
    isDownloading,
    isBatchSubmitting,
    runningCount,
    allSpeakersHaveVoice,
    onAddLine,
    onAnalyze,
    onDownloadAll,
    onGenerateAll
}: EmbeddedVoiceToolbarProps) {
    const t = useTranslations('voice')
    const voiceTaskRunningState = isBatchSubmitting
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'generate',
            resource: 'audio',
            hasOutput: linesWithAudio > 0,
        })
        : null
    const voiceAnalyzingState = analyzing
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'generate',
            resource: 'text',
            hasOutput: false,
        })
        : null
    const voiceDownloadingState = isDownloading
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'generate',
            resource: 'audio',
            hasOutput: linesWithAudio > 0,
        })
        : null

    const getGenerateButtonTitle = () => {
        if (isBatchSubmitting) return t("embedded.generatingHint")
        if (!allSpeakersHaveVoice) return t("embedded.noVoiceHint")
        if (totalLines === 0) return t("embedded.noLinesHint")
        if (linesWithAudio >= totalLines) return t("embedded.allDoneHint")
        return t("embedded.generateHint", { count: totalLines - linesWithAudio })
    }

    return (
        <div className="flex items-center justify-end mb-3 px-4">
            <div className="flex items-center gap-3">
                <div className="text-xs text-muted-foreground">
                    {t("embedded.linesStats", { total: totalLines, audio: linesWithAudio })}
                </div>

                {/* 重新分析按钮 */}
                <button
                    onClick={onAnalyze}
                    disabled={analyzing}
                    className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 flex items-center gap-2 px-4 py-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    title={totalLines > 0 ? t("embedded.reanalyzeHint") : t("embedded.analyzeHint")}
                >
                    {analyzing ? (
                        <TaskStatusInline state={voiceAnalyzingState} className="text-white [&>span]:text-white [&_svg]:text-white" />
                    ) : totalLines > 0 ? t("embedded.reanalyze") : t("embedded.analyzeLines")}
                </button>

                <button
                    onClick={onAddLine}
                    className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground flex items-center gap-2 px-4 py-2 font-medium border border-border"
                >
                    {t("embedded.addLine")}
                </button>

                {/* 下载按钮 */}
                <button
                    onClick={onDownloadAll}
                    disabled={linesWithAudio === 0 || isDownloading}
                    className="inline-flex items-center justify-center rounded-md bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15 flex items-center gap-2 px-4 py-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    title={linesWithAudio === 0 ? t("toolbar.noDownload") : t("toolbar.downloadCount", { count: linesWithAudio })}
                >
                    {isDownloading ? (
                        <TaskStatusInline state={voiceDownloadingState} className="text-white [&>span]:text-white [&_svg]:text-white" />
                    ) : (
                        <>{t("embedded.downloadVoice")}</>
                    )}
                </button>

                {/* 生成全部按钮 */}
                <button
                    onClick={onGenerateAll}
                    disabled={isBatchSubmitting || !allSpeakersHaveVoice || totalLines === 0}
                    className="inline-flex items-center justify-center rounded-md bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-200 flex items-center gap-2 px-4 py-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    title={getGenerateButtonTitle()}
                >
                    {isBatchSubmitting ? (
                        <>
                            <TaskStatusInline state={voiceTaskRunningState} className="text-white [&>span]:text-white [&_svg]:text-white" />
                            <span className="text-xs text-white/90">{t("embedded.generatingProgress", { current: runningCount, total: totalLines - linesWithAudio })}</span>
                        </>
                    ) : (
                        <>
                            {t("embedded.generateAllVoice")}
                            {linesWithAudio > 0 && (
                                <span className="text-xs opacity-75">{t("embedded.pendingCount", { count: totalLines - linesWithAudio })}</span>
                            )}
                        </>
                    )}
                </button>
            </div>
        </div>
    )
}
