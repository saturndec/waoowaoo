'use client'
import { useTranslations } from 'next-intl'

interface Character {
    id: string
    name: string
    customVoiceUrl?: string | null
}

interface SpeakerVoiceStatusProps {
    speakers: string[]
    speakerStats: Record<string, number>
    getSpeakerVoiceUrl: (speaker: string) => string | null
    onPlayVoice: (voiceUrl: string) => void
    onDesignVoice: (speaker: string) => void
    onUploadVoice: (speaker: string) => void
    onSelectAzureVoice: (speaker: string, voiceId: string) => void
    uploadingVoice: string | null
    generatingAzureVoice: string | null
    showVoiceDropdown: string | null
    setShowVoiceDropdown: (speaker: string | null) => void
    embedded?: boolean
}

export default function SpeakerVoiceStatus({
    speakers,
    speakerStats,
    getSpeakerVoiceUrl,
    onPlayVoice,
    onDesignVoice,
    onUploadVoice,
    onSelectAzureVoice,
    uploadingVoice,
    generatingAzureVoice,
    showVoiceDropdown,
    setShowVoiceDropdown,
    embedded = false
}: SpeakerVoiceStatusProps) {
    const t = useTranslations('voice')

    if (speakers.length === 0) return null

    // 嵌入模式：紧凑布局
    if (embedded) {
        return (
            <div className="bg-gradient-to-br from-slate-50 to-slate-100/50 border border-slate-200/60 rounded-xl p-2.5 mb-3 mx-4">
                <div className="flex items-center justify-between mb-2 px-1">
                    <h4 className="text-xs font-semibold text-slate-700">{t("embedded.speakerVoiceStatus")}</h4>
                    <span className="text-xs text-slate-500">{t("embedded.speakersCount", { count: speakers.length })}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-1.5">
                    {speakers.map(speaker => {
                        const hasVoice = !!getSpeakerVoiceUrl(speaker)
                        const count = speakerStats[speaker]
                        return (
                            <div
                                key={speaker}
                                className={`relative group rounded-lg border transition-all ${hasVoice
                                    ? 'bg-white border-green-200 hover:border-green-300'
                                    : 'bg-white border-orange-200 hover:border-orange-300'
                                    }`}
                            >
                                <div className={`h-0.5 rounded-t-lg ${hasVoice ? 'bg-green-400' : 'bg-orange-400'}`} />
                                <div className="p-1.5">
                                    <div className="flex items-start justify-between gap-1 mb-1">
                                        <span className="text-xs font-medium text-slate-700 truncate flex-1">{speaker}</span>
                                        <span className={`text-[10px] px-1 py-0.5 rounded leading-none ${hasVoice
                                            ? 'bg-green-100 text-green-700'
                                            : 'bg-orange-100 text-orange-700'
                                            }`}>
                                            {count}
                                        </span>
                                    </div>
                                    <div className="flex gap-0.5">
                                        {hasVoice ? (
                                            <>
                                                <button
                                                    onClick={() => {
                                                        const voiceUrl = getSpeakerVoiceUrl(speaker)
                                                        if (voiceUrl) onPlayVoice(voiceUrl)
                                                    }}
                                                    className="flex-1 text-[10px] px-1 py-0.5 bg-green-50 text-green-700 hover:bg-green-100 rounded transition-colors font-medium"
                                                    title={t("embedded.listenVoice")}
                                                >
                                                    {t("embedded.listen")}
                                                </button>
                                                <button
                                                    onClick={() => onDesignVoice(speaker)}
                                                    className="flex-1 text-[10px] px-1 py-0.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded transition-colors font-medium"
                                                    title={t("embedded.resetDesign")}
                                                >
                                                    {t("embedded.reset")}
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => onUploadVoice(speaker)}
                                                    disabled={uploadingVoice === speaker}
                                                    className="flex-1 text-[10px] px-1 py-0.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded transition-colors font-medium disabled:opacity-50"
                                                    title={t("speakerVoice.uploadAudio")}
                                                >
                                                    {uploadingVoice === speaker ? '...' : t("common.upload")}
                                                </button>
                                                <button
                                                    onClick={() => onDesignVoice(speaker)}
                                                    className="flex-1 text-[10px] px-1 py-0.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded transition-colors font-medium"
                                                    title={t("embedded.aiDesign")}
                                                >
                                                    {t("embedded.aiDesign")}
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        )
    }

    // 标准模式：完整布局
    return (
        <div className="bg-white/70 backdrop-blur-xl border border-white/60 rounded-3xl shadow-xl shadow-slate-200/40 p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <span className="w-1.5 h-6 bg-purple-500 rounded-full" />
                {t("speakerVoice.title")}
                <span className="text-sm font-normal text-gray-500 ml-2">
                    （{t("speakerVoice.hint")}）
                </span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {speakers.map(speaker => {
                    const voiceUrl = getSpeakerVoiceUrl(speaker)
                    const hasVoice = !!voiceUrl

                    return (
                        <div key={speaker} className={`flex items-center gap-3 p-3 rounded-lg ${hasVoice ? 'bg-green-50 border border-green-200' : 'bg-orange-50/80 border-2 border-red-300'
                            }`}>
                            <div className="flex-1">
                                <div className="font-medium truncate flex items-center gap-1.5" title={speaker}>
                                    {!hasVoice && (
                                        <span className="text-red-500 text-lg" title={t("speakerVoice.noVoice")}>⚠️</span>
                                    )}
                                    {speaker}
                                </div>
                                <div className="text-xs text-gray-500">{t("speakerVoice.linesCount", { count: speakerStats[speaker] })}</div>
                                {!hasVoice && (
                                    <div className="text-xs text-red-600 font-medium mt-1">{t("speakerVoice.noVoice")}</div>
                                )}
                            </div>

                            {hasVoice ? (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded">
                                        {t("speakerVoice.configured")}
                                    </span>
                                    <button
                                        onClick={() => voiceUrl && onPlayVoice(voiceUrl)}
                                        className="btn-base px-2 py-1 bg-green-500 text-white text-xs hover:bg-green-600"
                                        title={t("speakerVoice.playVoice")}
                                    >
                                        🔊
                                    </button>
                                    <button
                                        onClick={() => onDesignVoice(speaker)}
                                        className="text-xs text-indigo-600 bg-indigo-100 px-2 py-1 rounded hover:bg-indigo-200"
                                        title={t("speakerVoice.redesign")}
                                    >
                                        {t("speakerVoice.aiDesign")}
                                    </button>
                                </div>
                            ) : (
                                <div className="flex flex-col items-end gap-2">
                                    <button
                                        onClick={() => onDesignVoice(speaker)}
                                        className="text-sm text-white bg-indigo-500 px-4 py-2 rounded-lg hover:bg-indigo-600 font-medium shadow-md hover:shadow-lg transition-all"
                                    >
                                        {t("speakerVoice.aiDesignVoice")}
                                    </button>

                                    <div className="flex items-center gap-1.5">
                                        <button
                                            onClick={() => onUploadVoice(speaker)}
                                            disabled={uploadingVoice === speaker}
                                            className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-1 rounded hover:bg-blue-100 disabled:opacity-50"
                                            title={t("speakerVoice.uploadAudio")}
                                        >
                                            {uploadingVoice === speaker ? t("speakerVoice.uploading") : t("speakerVoice.upload")}
                                        </button>

                                        {/* 微软语音选择功能已移除 */}
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
