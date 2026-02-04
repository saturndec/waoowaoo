'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useCancelGeneration } from '@/lib/query/hooks'
import EmotionSettingsPanel from './EmotionSettingsPanel'

interface VoiceLine {
    id: string
    lineIndex: number
    speaker: string
    content: string
    emotionPrompt: string | null
    emotionStrength: number | null
    audioUrl: string | null
    generating: boolean
}

interface VoiceLineCardProps {
    projectId: string
    episodeId: string
    line: VoiceLine
    isGenerating: boolean
    hasVoice: boolean
    onPlay: (audioUrl: string) => void
    onDownload: (audioUrl: string) => void
    onGenerate: (lineId: string) => void
    onEdit: (line: VoiceLine) => void
    onDelete: (lineId: string) => void
    onDeleteAudio: (lineId: string) => void
    onSaveEmotionSettings: (lineId: string, emotionPrompt: string | null, emotionStrength: number) => void
}

export default function VoiceLineCard({
    projectId,
    episodeId,
    line,
    isGenerating,
    hasVoice,
    onPlay,
    onDownload,
    onGenerate,
    onEdit,
    onDelete,
    onDeleteAudio,
    onSaveEmotionSettings
}: VoiceLineCardProps) {
    const t = useTranslations('voice')
    // 注意：音频生成状态由父组件管理，此处取消功能不会被调用
    const { cancelGeneration, isCancelling } = useCancelGeneration(projectId, episodeId)
    const [isEmotionExpanded, setIsEmotionExpanded] = useState(false)

    return (
        <div
            className={`relative bg-white/80 backdrop-blur-lg rounded-2xl border overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5 ${line.audioUrl ? 'border-green-200/60 shadow-green-100/50' : hasVoice ? 'border-white/60' : 'border-orange-200/60'
                } shadow-lg shadow-slate-200/40`}
        >
            {/* 顶部：播放/生成区域 */}
            <div className={`h-14 flex items-center justify-center gap-3 ${line.audioUrl
                ? 'bg-green-50/50'
                : 'bg-slate-50/50'
                }`}>
                {line.audioUrl ? (
                    <div className="flex items-center justify-center gap-3">
                        {/* 播放按钮 */}
                        <button
                            onClick={() => onPlay(line.audioUrl!)}
                            className="flex items-center justify-center w-9 h-9 bg-green-500 text-white rounded-xl hover:bg-green-600 shadow-lg shadow-green-500/20 transition-all"
                            title={t("video.panelCard.play")}
                        >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                        </button>
                        {/* 重新生成按钮 */}
                        <button
                            onClick={() => onGenerate(line.id)}
                            disabled={!hasVoice || isGenerating}
                            className="flex items-center justify-center w-8 h-8 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all disabled:opacity-50"
                            title={t("common.regenerate")}
                        >
                            {isGenerating ? (
                                <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            ) : (
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                            )}
                        </button>
                        {/* 下载按钮 */}
                        <button
                            onClick={() => onDownload(line.audioUrl!)}
                            className="flex items-center justify-center w-8 h-8 text-slate-400 hover:text-sky-500 hover:bg-sky-50 rounded-xl transition-all"
                            title={t("common.download")}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => onGenerate(line.id)}
                        disabled={!hasVoice || isGenerating}
                        className="flex items-center gap-2 px-5 py-2 bg-blue-500 text-white rounded-xl text-sm font-medium hover:bg-blue-600 shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isGenerating ? (
                            <>
                                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span>{t("lineCard.generatingVoice")}</span>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        cancelGeneration({ type: 'voice_line', targetId: line.id })
                                    }}
                                    disabled={isCancelling}
                                    className="ml-2 px-2 py-0.5 text-xs bg-red-500/80 hover:bg-red-500 text-white rounded transition-colors"
                                >
                                    {isCancelling ? '取消中...' : '取消'}
                                </button>
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                </svg>
                                {t("common.generate")}
                            </>
                        )}
                    </button>
                )}
            </div>

            {/* 序号标签 */}
            <div className="absolute top-2 left-2 bg-slate-800/70 backdrop-blur-sm text-white px-2 py-0.5 rounded-lg text-xs font-medium">
                #{line.lineIndex}
            </div>

            {/* 状态标签+删除配音按钮 */}
            {
                line.audioUrl && (
                    <div className="absolute top-2 right-2 flex items-center gap-1">
                        <div className="bg-green-500 text-white px-2 py-0.5 rounded-lg text-xs font-medium shadow-lg shadow-green-500/20">
                            ✓
                        </div>
                        <button
                            onClick={() => onDeleteAudio(line.id)}
                            className="flex items-center justify-center w-5 h-5 bg-amber-500 text-white rounded-md shadow-lg shadow-amber-500/20 hover:bg-amber-600 transition-colors"
                            title={t("lineCard.deleteAudio")}
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                )
            }

            {/* 中间：台词内容 */}
            <div className="px-4 py-3">
                <div className="group relative">
                    <p className="text-sm text-slate-700 line-clamp-3 leading-relaxed pr-12" title={line.content}>
                        {line.content}
                    </p>
                    {/* 操作按钮组 */}
                    <div className="absolute top-0 right-0 flex gap-0.5">
                        <button
                            onClick={() => onEdit(line)}
                            className="p-1 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors"
                            title={t("lineCard.editLine")}
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                        </button>
                        <button
                            onClick={() => onDelete(line.id)}
                            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                            title={t("lineCard.deleteLine")}
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
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
                            className="w-full px-4 py-2 text-xs text-blue-600 hover:bg-blue-50/50 flex items-center justify-center gap-1.5 font-medium transition-colors"
                        >
                            <svg className={`w-3.5 h-3.5 transition-transform ${isEmotionExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
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
                                isGenerating={isGenerating}
                            />
                        )}
                    </>
                )
            }

            {/* 底部：发言人 */}
            <div className="px-4 py-2.5 bg-slate-50/50 border-t border-slate-100/60 flex items-center justify-between gap-2">
                <span className="inline-flex items-center px-2.5 py-1 bg-blue-100/80 text-blue-700 text-xs rounded-lg truncate max-w-[160px] font-medium" title={line.speaker}>
                    {line.speaker}
                </span>
                {hasVoice ? (
                    <span className="text-xs text-green-600 font-medium">{t("lineCard.voiceConfigured")}</span>
                ) : (
                    <span className="text-xs text-orange-600 font-medium">{t("lineCard.needVoice")}</span>
                )}
            </div>
        </div >
    )
}
