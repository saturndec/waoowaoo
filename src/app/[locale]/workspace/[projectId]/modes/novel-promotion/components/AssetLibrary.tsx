'use client'

/**
 * 资产库 - 全局浮动按钮,打开后显示完整的资产管理界面
 * 复用AssetsStage组件,保持功能完全一致
 * 
 * 🔥 V6.5 重构：删除 characters/locations props，AssetsStage 现在内部直接订阅
 * 🔥 V6.6 重构：删除 onGenerateImage prop，AssetsStage 现在内部使用 mutation hooks
 */


import { useState } from 'react'
import { useTranslations } from 'next-intl'
import AssetsStage from './AssetsStage'

interface AssetLibraryProps {
  projectId: string
  // 🔥 V6.5 删除：characters, locations, onCharactersUpdate, onLocationsUpdate
  // 🔥 V6.6 删除：onGenerateImage - AssetsStage 现在内部使用 mutation hooks
  globalAssetText: string | null
  novelText: string | null
  audioUrl: string | null
  srtContent: string | null
  onGenerateTTS: () => void
  onAnalyzeAssets: () => void
  isGeneratingTTS: boolean
  isAnalyzingAssets: boolean
}

export default function AssetLibrary({
  projectId,
  // 🔥 V6.5 删除：characters, locations, onCharactersUpdate, onLocationsUpdate
  // 🔥 V6.6 删除：onGenerateImage
  globalAssetText,
  novelText,
  audioUrl,
  srtContent,
  onGenerateTTS,
  onAnalyzeAssets,
  isGeneratingTTS,
  isAnalyzingAssets
}: AssetLibraryProps) {
  const [isOpen, setIsOpen] = useState(false)
  const t = useTranslations('assets')

  return (
    <>
      {/* 触发按钮 - 现代玻璃态风格 */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed top-20 right-4 z-40 flex items-center gap-2 px-5 py-2.5 bg-white/80 backdrop-blur-xl text-slate-700 font-medium rounded-xl border border-white/60 shadow-lg shadow-slate-200/40 hover:bg-white hover:shadow-xl transition-all"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        {t('assetLibrary.button')}
      </button>

      {/* 全屏弹窗 - 现代玻璃态风格 */}
      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl w-full h-full max-w-[95vw] max-h-[95vh] flex flex-col border border-white/60 overflow-hidden">
            {/* 头部 */}
            <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-blue-500 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-slate-800">{t('assetLibrary.title')}</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
              >
                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 内容区域 - 复用AssetsStage，现在 AssetsStage 内部直接订阅和处理图片生成 */}
            <div className="flex-1 overflow-y-auto p-8">
              <AssetsStage
                projectId={projectId}
                workflowMode="srt"
                globalAssetText={globalAssetText}
                novelText={novelText}
                audioUrl={audioUrl}
                srtContent={srtContent}
                ttsVoice=""
                onTtsVoiceChange={() => { }}
                onGenerateTTS={onGenerateTTS}
                onAnalyzeAssets={onAnalyzeAssets}
                isGeneratingTTS={isGeneratingTTS}
                isAnalyzingAssets={isAnalyzingAssets}
                onConfirm={() => setIsOpen(false)}
                isConfirming={false}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

