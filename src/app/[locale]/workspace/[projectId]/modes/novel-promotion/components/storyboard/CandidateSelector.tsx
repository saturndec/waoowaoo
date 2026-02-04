'use client'
import { useTranslations } from 'next-intl'

import { useState } from 'react'

interface CandidateSelectorProps {
  originalImageUrl: string | null
  candidates: string[]
  selectedIndex: number  // 0 = 原图, 1-n = 候选图
  videoRatio: string  // 完整比例字符串，如 "16:9", "3:2" 等
  onSelect: (index: number) => void
  onConfirm: () => void
  onCancel: () => void
  onPreview: (imageUrl: string) => void
  getImageUrl: (url: string | null) => string | null
}

export default function CandidateSelector({
  originalImageUrl,
  candidates,
  selectedIndex,
  videoRatio,
  onSelect,
  onConfirm,
  onCancel,
  onPreview,
  getImageUrl
}: CandidateSelectorProps) {
  const t = useTranslations('storyboard')
  const [isConfirming, setIsConfirming] = useState(false)

  // 根据比例计算缩略图尺寸（固定宽度 120px）
  const [w, h] = videoRatio.split(':').map(Number)
  const thumbWidth = 120
  const thumbHeight = Math.round(thumbWidth * h / w)
  return (
    <div className="mb-4 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="font-bold text-gray-900 text-sm">🎨 {t('candidate.title')}</h4>
          <p className="text-xs text-gray-500">{t('image.clickToPreview')}</p>
        </div>
        <button
          onClick={onCancel}
          disabled={isConfirming}
          className="text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 缩略图选择 - 横向排列 */}
      <div className="flex gap-3 flex-wrap">
        {/* 原图 */}
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={() => {
              onSelect(0)
              if (originalImageUrl) onPreview(getImageUrl(originalImageUrl)!)
            }}
            className={`relative rounded-lg overflow-hidden border-3 transition-all hover:scale-105 ${selectedIndex === 0
              ? 'border-blue-500 ring-2 ring-blue-300 shadow-lg'
              : 'border-gray-300 hover:border-gray-400'
              }`}
            style={{ width: `${thumbWidth}px`, height: `${thumbHeight}px` }}
          >
            {originalImageUrl ? (
              <img
                src={getImageUrl(originalImageUrl)!}
                alt={t('candidate.original')}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gray-200 flex items-center justify-center text-gray-400 text-xs">
                {t('image.noValidCandidates')}
              </div>
            )}
            {selectedIndex === 0 && (
              <div className="absolute top-1 right-1 w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center shadow">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
            {/* 放大图标 */}
            <div className="absolute bottom-1 right-1 w-5 h-5 bg-black/50 text-white rounded flex items-center justify-center">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
              </svg>
            </div>
          </button>
          <span className="text-xs text-gray-600">{t('candidate.original')}</span>
        </div>

        {/* 候选图片 */}
        {candidates.map((url, index) => (
          <div key={index} className="flex flex-col items-center gap-1">
            <button
              onClick={() => {
                onSelect(index + 1)
                onPreview(getImageUrl(url)!)
              }}
              className={`relative rounded-lg overflow-hidden border-3 transition-all hover:scale-105 ${selectedIndex === index + 1
                ? 'border-blue-500 ring-2 ring-blue-300 shadow-lg'
                : 'border-gray-300 hover:border-gray-400'
                }`}
              style={{ width: `${thumbWidth}px`, height: `${thumbHeight}px` }}
            >
              <img
                src={getImageUrl(url)!}
                alt={`${t('image.candidateCount', { count: index + 1 })}`}
                className="w-full h-full object-cover"
              />
              {selectedIndex === index + 1 && (
                <div className="absolute top-1 right-1 w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center shadow">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
              {/* 放大图标 */}
              <div className="absolute bottom-1 right-1 w-5 h-5 bg-black/50 text-white rounded flex items-center justify-center">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                </svg>
              </div>
            </button>
            <span className="text-xs text-gray-600">{t('image.candidateCount', { count: index + 1 })}</span>
          </div>
        ))}
      </div>

      {/* 底部按钮 */}
      <div className="mt-4 flex justify-between items-center">
        <span className="text-sm text-gray-600 font-medium">
          ✓ {t('image.confirmCandidate')}: <span className="text-blue-600">{selectedIndex === 0 ? t('candidate.original') : t('image.candidateCount', { count: selectedIndex })}</span>
        </span>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={isConfirming}
            className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("candidate.cancel")}
          </button>
          <button
            onClick={() => {
              setIsConfirming(true)
              onConfirm()
            }}
            disabled={isConfirming}
            className="px-5 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-sm"
          >
            {isConfirming ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {t("assets.character.confirming")}
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {t('candidate.select')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}





