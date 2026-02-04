'use client'
import { useTranslations } from 'next-intl'

interface StoryboardHeaderProps {
  totalSegments: number
  totalPanels: number
  isDownloadingImages: boolean
  generatingCount: number
  pendingPanelCount: number  // 待生成图片的镜头数量
  isGeneratingAll: boolean   // 是否正在批量生成
  onDownloadAllImages: () => void
  onGenerateAllPanels: () => void  // 生成所有未有图片的镜头
  onBack: () => void
}

export default function StoryboardHeader({
  totalSegments,
  totalPanels,
  isDownloadingImages,
  generatingCount,
  pendingPanelCount,
  isGeneratingAll,
  onDownloadAllImages,
  onGenerateAllPanels,
  onBack
}: StoryboardHeaderProps) {
  const t = useTranslations('storyboard')
  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-2xl shadow-sm p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-slate-700">
            {t("header.storyboardPanel")}
          </span>
          <span className="text-sm text-slate-500">
            {t("header.segmentsCount", { count: totalSegments })}
            {t("header.panelsCount", { count: totalPanels })}
            {generatingCount > 0 && (
              <span className="ml-2 text-blue-600 font-medium animate-pulse">
                {t("header.generatingStatus", { count: generatingCount })}
              </span>
            )}
          </span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
          {/* 生成所有镜头按钮 */}
          {pendingPanelCount > 0 && (
            <button
              onClick={onGenerateAllPanels}
              disabled={isGeneratingAll || generatingCount > 0}
              className="flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur-sm border border-slate-200/60 text-slate-600 text-sm font-medium rounded-xl hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              title={t("header.generatePendingPanels", { count: pendingPanelCount })}
            >
              {isGeneratingAll ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>{t("group.generating")}</span>
                </>
              ) : (
                <>
                  <span>🎬</span>
                  <span>{t("header.generateAllPanels")}</span>
                  <span className="bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded text-xs">{pendingPanelCount}</span>
                </>
              )}
            </button>
          )}

          <button
            onClick={onDownloadAllImages}
            disabled={totalPanels === 0 || isDownloadingImages}
            className="flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur-sm border border-slate-200/60 text-slate-600 text-sm font-medium rounded-xl hover:bg-sky-50 hover:text-sky-600 hover:border-sky-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            title={totalPanels === 0 ? t("header.noImages") : t("header.downloadAllImages")}
          >
            {isDownloadingImages ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>{t("header.downloading")}</span>
              </>
            ) : (
              <>
                <span>📥</span>
                <span>{t("header.downloadAll")}</span>
              </>
            )}
          </button>
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur-sm border border-slate-200/60 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 hover:text-blue-600 transition-all shadow-sm"
          >
            {t("header.back")}
          </button>
          </div>
          <div className="text-xs text-slate-400">
            批量生成并发上限: 10
          </div>
        </div>
      </div>
    </div>
  )
}


