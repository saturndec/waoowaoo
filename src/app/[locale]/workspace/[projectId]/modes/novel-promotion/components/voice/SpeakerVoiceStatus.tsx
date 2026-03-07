'use client'
import { useTranslations } from 'next-intl'

interface SpeakerVoiceStatusProps {
    speakers: string[]
    speakerStats: Record<string, number>
    getSpeakerVoiceUrl: (speaker: string) => string | null
    onOpenAssetLibrary: (speaker: string) => void
    /** 内联绑定回调：当发言人不在资产库中时调用 */
    onOpenInlineBinding?: (speaker: string) => void
    /** 判断发言人是否有匹配的项目角色 */
    hasSpeakerCharacter?: (speaker: string) => boolean
    embedded?: boolean
}

export default function SpeakerVoiceStatus({
    speakers,
    speakerStats,
    getSpeakerVoiceUrl,
    onOpenAssetLibrary,
    onOpenInlineBinding,
    hasSpeakerCharacter,
    embedded = false
}: SpeakerVoiceStatusProps) {
    const t = useTranslations('voice')
    const tStoryboard = useTranslations('storyboard')

    if (speakers.length === 0) return null

    /**
     * 点击"音色设置"按钮的处理逻辑：
     * - 有匹配的项目角色 → 跳转资产中心（现有行为）
     * - 无匹配的项目角色 → 打开内联绑定弹窗
     */
    const handleVoiceSettings = (speaker: string) => {
        const hasCharacter = hasSpeakerCharacter ? hasSpeakerCharacter(speaker) : true
        if (hasCharacter || !onOpenInlineBinding) {
            onOpenAssetLibrary(speaker)
        } else {
            onOpenInlineBinding(speaker)
        }
    }

    // 嵌入模式：紧凑布局
    if (embedded) {
        return (
            <div className="glass-surface px-4 py-3 mb-3 mx-4">
                <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-[var(--glass-text-primary)]">{t("embedded.speakerVoiceStatus")}</h4>
                    <span className="text-xs text-[var(--glass-text-tertiary)]">{t("embedded.speakersCount", { count: speakers.length })}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                    {speakers.map(speaker => {
                        const hasVoice = !!getSpeakerVoiceUrl(speaker)
                        const count = speakerStats[speaker]
                        const hasCharacter = hasSpeakerCharacter ? hasSpeakerCharacter(speaker) : true
                        return (
                            <div
                                key={speaker}
                                className="w-full sm:w-[280px] max-w-full flex flex-wrap items-center gap-2 rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)] px-3 py-2"
                            >
                                <div className="min-w-0">
                                    <div className="text-sm font-semibold text-[var(--glass-text-primary)] truncate">{speaker}</div>
                                    <div className="text-xs text-[var(--glass-text-tertiary)]">{t("speakerVoice.linesCount", { count })}</div>
                                </div>
                                <span className={`text-xs px-2 py-1 rounded-full ${hasVoice
                                    ? 'bg-[var(--glass-tone-success-bg)] text-[var(--glass-tone-success-fg)]'
                                    : 'bg-[var(--glass-tone-warning-bg)] text-[var(--glass-tone-warning-fg)]'
                                    }`}>
                                    {hasVoice ? t("speakerVoice.configuredStatus") : t("speakerVoice.pendingStatus")}
                                </span>
                                {/* 无匹配角色时显示内联标记 */}
                                {!hasCharacter && !hasVoice && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)]">
                                        {t("speakerVoice.inlineLabel")}
                                    </span>
                                )}
                                <button
                                    onClick={() => handleVoiceSettings(speaker)}
                                    className="glass-btn-base glass-btn-secondary text-xs px-2.5 py-1.5 font-medium whitespace-nowrap shrink-0"
                                >
                                    {t("speakerVoice.voiceSettings")}
                                </button>
                            </div>
                        )
                    })}
                </div>
            </div>
        )
    }

    // 标准模式：完整布局
    return (
        <div className="glass-surface p-5">
            <h3 className="text-lg font-bold text-[var(--glass-text-primary)] mb-4 flex items-center gap-2">
                <span className="w-1.5 h-5 bg-[var(--glass-accent-from)] rounded-full" />
                {t("speakerVoice.title")}
                <span className="text-sm font-normal text-[var(--glass-text-tertiary)] ml-2">
                    {tStoryboard("fixes.hintWrapped", { hint: t("speakerVoice.hint") })}
                </span>
            </h3>
            <div className="flex flex-wrap gap-2">
                {speakers.map(speaker => {
                    const voiceUrl = getSpeakerVoiceUrl(speaker)
                    const hasVoice = !!voiceUrl
                    const hasCharacter = hasSpeakerCharacter ? hasSpeakerCharacter(speaker) : true

                    return (
                        <div key={speaker} className="w-full sm:w-[280px] max-w-full flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)]">
                            <div className="min-w-0">
                                <div className="font-semibold text-[var(--glass-text-primary)] truncate" title={speaker}>{speaker}</div>
                                <div className="text-xs text-[var(--glass-text-tertiary)]">{t("speakerVoice.linesCount", { count: speakerStats[speaker] })}</div>
                            </div>
                            <span className={`text-xs px-2 py-1 rounded-full ${hasVoice ? 'bg-[var(--glass-tone-success-bg)] text-[var(--glass-tone-success-fg)]' : 'bg-[var(--glass-tone-warning-bg)] text-[var(--glass-tone-warning-fg)]'}`}>
                                {hasVoice ? t("speakerVoice.configuredStatus") : t("speakerVoice.pendingStatus")}
                            </span>
                            {/* 无匹配角色时显示内联标记 */}
                            {!hasCharacter && !hasVoice && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)]">
                                    {t("speakerVoice.inlineLabel")}
                                </span>
                            )}
                            <button
                                onClick={() => handleVoiceSettings(speaker)}
                                className="glass-btn-base glass-btn-secondary text-xs px-2.5 py-1.5"
                            >
                                {t("speakerVoice.voiceSettings")}
                            </button>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
