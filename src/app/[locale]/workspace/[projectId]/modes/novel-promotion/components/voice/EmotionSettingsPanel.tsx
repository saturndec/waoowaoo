'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'

interface EmotionSettingsPanelProps {
    lineId: string
    emotionPrompt: string | null
    emotionStrength: number
    onSave: (lineId: string, emotionPrompt: string | null, emotionStrength: number) => void
    onGenerate: (lineId: string) => void
    isGenerating: boolean
}

export default function EmotionSettingsPanel({
    lineId,
    emotionPrompt,
    emotionStrength,
    onSave,
    onGenerate,
    isGenerating
}: EmotionSettingsPanelProps) {
    const t = useTranslations('voice')
    const [prompt, setPrompt] = useState(emotionPrompt || '')
    const [strength, setStrength] = useState(emotionStrength)
    const [isDirty, setIsDirty] = useState(false)

    const handlePromptChange = (value: string) => {
        setPrompt(value)
        setIsDirty(true)
    }

    const handleStrengthChange = (value: number) => {
        setStrength(value)
        setIsDirty(true)
    }

    const handleGenerate = () => {
        onSave(lineId, prompt.trim() || null, strength)
        setIsDirty(false)
        onGenerate(lineId)
    }

    return (
        <div className="px-4 py-3 bg-blue-50/50 space-y-3">
            {/* 情绪提示词 */}
            <div>
                <label className="block text-xs text-blue-700 mb-1.5 font-medium">
                    {t("emotionPrompt")} <span className="text-slate-400 font-normal">{t("emotionPromptTip")}</span>
                </label>
                <input
                    type="text"
                    value={prompt}
                    onChange={(e) => handlePromptChange(e.target.value)}
                    placeholder={t("emotionPlaceholder")}
                    className="w-full px-3 py-2 text-sm border border-blue-200/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 bg-white/70"
                />
            </div>

            {/* 情绪强度滑块 */}
            <div>
                <label className="block text-xs text-blue-700 mb-1.5 font-medium">
                    {t("emotionStrength")}: <span className="font-bold">{strength.toFixed(1)}</span>
                </label>
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={strength}
                    onChange={(e) => handleStrengthChange(parseFloat(e.target.value))}
                    className="w-full h-2 bg-blue-200/60 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                    <span>{t("flat")}</span>
                    <span>{t("intense")}</span>
                </div>
            </div>

            {/* 生成语音按钮 */}
            <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full py-2 text-sm bg-green-500 text-white rounded-xl hover:bg-green-600 font-medium transition-all shadow-lg shadow-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isGenerating ? (
                    <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        {t("generating")}
                    </span>
                ) : t("generateVoice")}
            </button>
        </div>
    )
}
