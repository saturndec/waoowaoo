'use client'
import { useTranslations } from 'next-intl'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface VoiceToolbarProps {
    onBack?: () => void
    onAddLine: () => void
    onAnalyze: () => void
    onGenerateAll: () => void
    onDownloadAll: () => void
    analyzing: boolean
    isBatchSubmitting: boolean
    runningCount: number
    isDownloading: boolean
    allSpeakersHaveVoice: boolean
    totalLines: number
    linesWithVoice: number
    linesWithAudio: number
}

export default function VoiceToolbar({
    onBack,
    onAddLine,
    onAnalyze,
    onGenerateAll,
    onDownloadAll,
    analyzing,
    isBatchSubmitting,
    runningCount,
    isDownloading,
    allSpeakersHaveVoice,
    totalLines,
    linesWithVoice,
    linesWithAudio
}: VoiceToolbarProps) {
    const t = useTranslations('voice')
    const voiceTaskRunningState = isBatchSubmitting
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'generate',
            resource: 'audio',
            hasOutput: linesWithAudio > 0,
        })
        : null
    const voiceDownloadRunningState = isDownloading
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'process',
            resource: 'audio',
            hasOutput: linesWithAudio > 0,
        })
        : null

    return (
        <Card>
            <CardContent className="p-6">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-4">
                    <Button
                        onClick={onBack}
                        variant="outline"
                        className="h-10 gap-2 px-5 font-medium hover:text-primary"
                    >
                        {t("toolbar.back")}
                    </Button>
                    <Button
                        onClick={onAnalyze}
                        disabled={analyzing}
                        className="h-10 gap-2 px-5 font-medium"
                    >
                        {analyzing ? t("assets.stage.analyzing") : t("toolbar.analyzeLines")}
                    </Button>
                    <Button
                        onClick={onAddLine}
                        variant="outline"
                        className="h-10 gap-2 px-5 font-medium"
                    >
                        {t("toolbar.addLine")}
                    </Button>
                    <Button
                        onClick={onGenerateAll}
                        disabled={isBatchSubmitting || !allSpeakersHaveVoice || totalLines === 0}
                        variant="secondary"
                        className="h-10 gap-2 px-5 font-medium disabled:opacity-50"
                        title={!allSpeakersHaveVoice ? t("toolbar.uploadReferenceHint") : ''}
                    >
                        {isBatchSubmitting ? (
                            <>
                                <TaskStatusInline state={voiceTaskRunningState} className="[&>span]:text-foreground [&_svg]:text-foreground" />
                                <span className="text-xs text-muted-foreground">({runningCount})</span>
                            </>
                        ) : t("toolbar.generateAll")}
                    </Button>
                    <Button
                        onClick={onDownloadAll}
                        disabled={linesWithAudio === 0 || isDownloading}
                        variant="secondary"
                        className="h-10 gap-2 px-5 font-medium disabled:opacity-50"
                        title={linesWithAudio === 0 ? t("toolbar.noDownload") : t("toolbar.downloadCount", { count: linesWithAudio })}
                    >
                        {isDownloading ? (
                            <TaskStatusInline state={voiceDownloadRunningState} className="[&>span]:text-foreground [&_svg]:text-foreground" />
                        ) : t("toolbar.downloadAll")}
                    </Button>
                </div>
                <div className="text-sm text-muted-foreground">
                    {t("toolbar.stats", { total: totalLines, withVoice: linesWithVoice, withAudio: linesWithAudio })}
                </div>
            </div>
            </CardContent>
        </Card>
    )
}
