'use client'
import { useTranslations } from 'next-intl'

interface EmbeddedVoiceToolbarProps {
    totalLines: number
    linesWithAudio: number
    analyzing: boolean
    isDownloading: boolean
    generatingAll: boolean
    generatingCount: number
    allSpeakersHaveVoice: boolean
    onAnalyze: () => void
    onDownloadAll: () => void
    onGenerateAll: () => void
}

export default function EmbeddedVoiceToolbar({
    totalLines,
    linesWithAudio,
    analyzing,
    isDownloading,
    generatingAll,
    generatingCount,
    allSpeakersHaveVoice,
    onAnalyze,
    onDownloadAll,
    onGenerateAll
}: EmbeddedVoiceToolbarProps) {
    const t = useTranslations('voice')

    const getGenerateButtonTitle = () => {
        if (generatingAll) return t("embedded.generatingHint")
        if (!allSpeakersHaveVoice) return t("embedded.noVoiceHint")
        if (totalLines === 0) return t("embedded.noLinesHint")
        if (linesWithAudio >= totalLines) return t("embedded.allDoneHint")
        return t("embedded.generateHint", { count: totalLines - linesWithAudio })
    }

    return (
        <div className="flex items-center justify-end mb-3 px-4">
            <div className="flex items-center gap-3">
                <div className="text-xs text-slate-500">
                    {t("embedded.linesStats", { total: totalLines, audio: linesWithAudio })}
                </div>

                {/* 重新分析按钮 */}
                <button
                    onClick={onAnalyze}
                    disabled={analyzing}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white font-medium rounded-xl shadow-lg shadow-blue-500/20 hover:bg-blue-600 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                    title={totalLines > 0 ? t("embedded.reanalyzeHint") : t("embedded.analyzeHint")}
                >
                    {analyzing ? (
                        <>
                            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            {t("assets.stage.analyzing")}
                        </>
                    ) : totalLines > 0 ? t("embedded.reanalyze") : t("embedded.analyzeLines")}
                </button>

                {/* 下载按钮 */}
                <button
                    onClick={onDownloadAll}
                    disabled={linesWithAudio === 0 || isDownloading}
                    className="flex items-center gap-2 px-4 py-2 bg-sky-500 text-white font-medium rounded-xl shadow-lg shadow-sky-500/20 hover:bg-sky-600 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                    title={linesWithAudio === 0 ? t("toolbar.noDownload") : t("toolbar.downloadCount", { count: linesWithAudio })}
                >
                    {isDownloading ? (
                        <>
                            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            {t("toolbar.packing")}
                        </>
                    ) : (
                        <>{t("embedded.downloadVoice")}</>
                    )}
                </button>

                {/* 生成全部按钮 */}
                <button
                    onClick={onGenerateAll}
                    disabled={generatingAll || !allSpeakersHaveVoice || totalLines === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white font-medium rounded-xl shadow-lg shadow-green-500/20 hover:bg-green-600 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                    title={getGenerateButtonTitle()}
                >
                    {generatingAll ? (
                        <>
                            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            {t("embedded.generatingProgress", { current: generatingCount, total: totalLines - linesWithAudio })}
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
