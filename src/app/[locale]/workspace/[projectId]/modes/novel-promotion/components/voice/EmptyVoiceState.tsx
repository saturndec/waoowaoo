'use client'
import { useTranslations } from 'next-intl'

interface EmptyVoiceStateProps {
    onAnalyze: () => void
    analyzing: boolean
}

export default function EmptyVoiceState({
    onAnalyze,
    analyzing
}: EmptyVoiceStateProps) {
    const t = useTranslations('voice')

    return (
        <div className="bg-white/70 backdrop-blur-xl border border-white/60 rounded-3xl shadow-xl shadow-slate-200/40 p-10 text-center">
            <div className="text-slate-300 text-5xl mb-4">🎙️</div>
            <h3 className="text-xl font-bold text-slate-700 mb-2">{t("empty.title")}</h3>
            <p className="text-slate-500 mb-6">{t("empty.description")}</p>
            <button
                onClick={onAnalyze}
                disabled={analyzing}
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-500 text-white font-medium rounded-xl shadow-lg shadow-blue-500/20 hover:bg-blue-600 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
                {analyzing ? (
                    <>
                        <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        {t("assets.stage.analyzing")}
                    </>
                ) : (
                    <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                        </svg>
                        {t("empty.analyzeButton")}
                    </>
                )}
            </button>
            <p className="text-sm text-slate-400 mt-6">
                {t("empty.hint")}
            </p>
        </div>
    )
}
