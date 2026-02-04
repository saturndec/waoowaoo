'use client'
import { useTranslations } from 'next-intl'

import { useEffect, useState } from 'react'
import { useCancelGeneration } from '@/lib/query/hooks'
import './ImageSection.css'

interface PanelCandidateData {
  candidates: string[]
  selectedIndex: number
}

interface ImageSectionProps {
  projectId: string
  panelId: string
  imageUrl: string | null
  globalPanelNumber: number
  shotType: string
  videoRatio: string
  episodeId: string
  isDeleting: boolean
  isModifying: boolean
  isRegenerating: boolean
  failedError: string | null
  candidateData: PanelCandidateData | null
  previousImageUrl?: string | null  // 支持撤回
  onRegeneratePanelImage: (panelId: string, count?: number, force?: boolean) => void
  onOpenEditModal: () => void
  onOpenAIDataModal: () => void
  onSelectCandidateIndex: (panelId: string, index: number) => void
  onConfirmCandidate: (panelId: string, imageUrl: string) => Promise<void>
  onCancelCandidate: (panelId: string) => void
  onClearError: () => void
  onUndo?: (panelId: string) => void  // 撤回到上一版本
  onPreviewImage?: (url: string) => void  // 放大预览图片
}

export default function ImageSection({
  projectId,
  panelId,
  imageUrl,
  globalPanelNumber,
  shotType,
  videoRatio,
  episodeId,
  isDeleting,
  isModifying,
  isRegenerating,
  failedError,
  candidateData,
  previousImageUrl,
  onRegeneratePanelImage,
  onOpenEditModal,
  onOpenAIDataModal,
  onSelectCandidateIndex,
  onConfirmCandidate,
  onCancelCandidate,
  onClearError,
  onUndo,
  onPreviewImage
}: ImageSectionProps) {
  const t = useTranslations('storyboard')
  const { cancelGeneration, isCancelling } = useCancelGeneration(projectId, episodeId)
  // 数量选择下拉菜单状态
  const [showCountDropdown, setShowCountDropdown] = useState(false)
  // 确认候选图片的loading状态
  const [isConfirming, setIsConfirming] = useState(false)
  // 重新生成动画状态
  const [isRegeneratingAnimating, setIsRegeneratingAnimating] = useState(false)
  // 将比例字符串转换为 CSS aspect-ratio 格式（如 "16:9" -> "16/9"）
  const cssAspectRatio = videoRatio.replace(':', '/')

  // 候选模式结束后重置确认状态，避免按钮卡在确认中
  useEffect(() => {
    if (!candidateData) {
      setIsConfirming(false)
    }
  }, [candidateData])
  // 渲染加载状态 - 可选显示强制重新生成按钮和取消按钮
  const renderLoadingState = (message: string, colorClass: string, showForceRegenButton: boolean = false, showCancelButton: boolean = false) => (
    <div className="w-full h-full flex items-center justify-center bg-gray-100 relative group/loading">
      <div className={`flex flex-col items-center gap-2 ${colorClass}`}>
        <svg className="animate-spin h-6 w-6" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span className="text-xs">{message}</span>
        {/* 取消生成按钮 */}
        {showCancelButton && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              cancelGeneration({ type: 'panel_image', targetId: panelId })
            }}
            disabled={isCancelling}
            className="px-3 py-1 text-xs bg-red-500/80 hover:bg-red-500 text-white rounded-lg transition-colors"
          >
            {isCancelling ? '取消中...' : '取消'}
          </button>
        )}
      </div>
      {/* 强制重新生成按钮 - 鼠标悬停时显示 */}
      {showForceRegenButton && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            console.log('[ImageSection] 🔥🔥🔥 强制重新生成按钮被点击')
            console.log('[ImageSection] panelId:', panelId)
            console.log('[ImageSection] 当前 isRegenerating 状态:', true)
            console.log('[ImageSection] 调用 onRegeneratePanelImage(panelId, 1, true)...')
            setIsRegeneratingAnimating(true)
            setTimeout(() => setIsRegeneratingAnimating(false), 600)
            onRegeneratePanelImage(panelId, 1, true) // 🔥 force=true 强制重新生成
            console.log('[ImageSection] onRegeneratePanelImage 调用完成')
          }}
          className="absolute bottom-2 left-2 bg-white/90 backdrop-blur-sm border border-orange-300 text-orange-600 px-2 py-1 rounded-lg text-xs hover:bg-orange-50 hover:border-orange-400 shadow-sm flex items-center gap-1 transition-all active:scale-95 active:bg-orange-100 z-20 opacity-0 group-hover/loading:opacity-100"
          title={t("video.panelCard.forceRegenerate")}
        >
          <span>🔄</span>
          <span>{t('image.forceRegenerate')}</span>
        </button>
      )}
    </div>
  )

  // 渲染失败状态
  const renderFailedState = () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-red-50 text-red-500 p-2">
      <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <span className="text-xs text-center font-medium">{t('image.failed')}</span>
      <span className="text-[10px] text-center mt-1 line-clamp-2 px-1">{failedError}</span>
      <button
        onClick={onClearError}
        className="mt-1 text-[10px] text-red-400 hover:text-red-600 underline"
      >
        {t("variant.close")}
      </button>
    </div>
  )

  // 渲染空图片状态
  const renderEmptyState = () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 text-gray-400 gap-2">
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      <span className="text-xs">{t("video.toolbar.showPending")}</span>
      <button
        onClick={() => {
          setIsRegeneratingAnimating(true)
          setTimeout(() => setIsRegeneratingAnimating(false), 600)
          onRegeneratePanelImage(panelId, 1, false)
        }}
        className="mt-1 px-4 py-2 text-xs bg-white/90 backdrop-blur-sm border border-slate-200/60 text-slate-600 rounded-lg hover:bg-green-50 hover:text-green-600 hover:border-green-300 shadow-sm transition-all active:scale-95 active:bg-green-100"
      >
        {t('panel.generateImage')}
      </button>
    </div>
  )

  // 渲染候选图片选择模式
  const renderCandidateMode = () => {
    // 🔥 过滤掉PENDING开头的未完成任务
    const validCandidates = candidateData!.candidates.filter(url => !url.startsWith('PENDING:'))

    // 如果没有有效候选图（全是PENDING），显示加载状态
    if (validCandidates.length === 0) {
      return renderLoadingState(t("group.generating"), 'text-green-600')
    }

    // 确保选中索引在有效范围内
    const safeSelectedIndex = Math.min(candidateData!.selectedIndex, validCandidates.length - 1)

    return (
      <div className="w-full h-full relative">
        <img
          src={validCandidates[safeSelectedIndex]}
          alt={t('image.candidateCount', { count: safeSelectedIndex + 1 })}
          className="w-full h-full object-cover cursor-pointer"
          onClick={() => onPreviewImage?.(validCandidates[safeSelectedIndex])}
          title={t('image.clickToPreview')}
        />
        {/* 候选图片控制栏 */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
          <div className="flex items-center justify-between">
            {/* 缩略图选择 */}
            <div className="flex gap-1">
              {validCandidates.map((url, idx) => (
                <div key={idx} className="relative group/thumb">
                  <button
                    onClick={() => onSelectCandidateIndex(panelId, idx)}
                    className={`w-8 h-8 rounded border-2 overflow-hidden ${idx === safeSelectedIndex
                      ? 'border-green-500'
                      : 'border-white/50 hover:border-white'
                      }`}
                  >
                    <img src={url} alt={t('image.candidateCount', { count: idx + 1 })} className="w-full h-full object-cover" />
                  </button>
                  {/* 放大预览按钮 */}
                  {onPreviewImage && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onPreviewImage(url)
                      }}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-black/70 text-white rounded-full flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity hover:bg-black"
                      title={t('image.enlargePreview')}
                    >
                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
            {/* 操作按钮 */}
            <div className="flex gap-1">
              <button
                onClick={() => onCancelCandidate(panelId)}
                disabled={isConfirming}
                className="px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t("candidate.cancel")}
              </button>
              <button
                onClick={async () => {
                  console.log('[ImageSection] 🎯 确认按钮被点击')
                  console.log('[ImageSection] panelId:', panelId)
                  console.log('[ImageSection] 选中的图片索引:', safeSelectedIndex)
                  console.log('[ImageSection] 选中的图片 URL:', validCandidates[safeSelectedIndex])
                  setIsConfirming(true)
                  try {
                    await onConfirmCandidate(panelId, validCandidates[safeSelectedIndex])
                    console.log('[ImageSection] ✅ 确认操作完成')
                    // 🔥 成功后不重置 isConfirming，保持按钮禁用状态
                    // 等待 candidateData 刷新为 null 后，整个候选模式会消失
                  } catch (err) {
                    console.error('[ImageSection] ❌ 确认操作失败:', err)
                    // 🔥 只在失败时重置，允许用户重试
                    setIsConfirming(false)
                    console.log('[ImageSection] isConfirming 状态已重置为 false (失败重试)')
                  }
                }}
                disabled={isConfirming}
                className="px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              >
                {isConfirming ? (
                  <>
                    <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {t("assets.character.confirming")}
                  </>
                ) : (
                  t("common.confirm")
                )}
              </button>
            </div>
          </div>
        </div>
        {/* 候选指示器 */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-green-500 text-white px-2 py-0.5 rounded text-xs">
          {t('image.candidateCount', { count: safeSelectedIndex + 1 })}/{validCandidates.length}
          {candidateData!.candidates.length > validCandidates.length &&
            ` (${t('image.candidateGenerating', { count: candidateData!.candidates.length - validCandidates.length })})`}
        </div>
      </div>
    )
  }

  return (
    <div
      className={`relative bg-gray-100 overflow-hidden group rounded-t-2xl transition-all ${isRegeneratingAnimating ? 'animate-brightness-boost' : ''
        }`}
      style={{ aspectRatio: cssAspectRatio }}
    >
      {
        isDeleting ? (
          renderLoadingState(t('common.delete'), 'text-red-600')
        ) : isModifying ? (
          renderLoadingState(t("assets.character.editing"), 'text-purple-600')
        ) : isRegenerating ? (
          renderLoadingState(t('group.regenerating'), 'text-green-600', true, true)
        ) : candidateData ? (
          renderCandidateMode()
        ) : failedError ? (
          // 🔥 failedError 优先于 imageUrl 显示，确保用户能看到 IMAGE_SAFETY 等错误
          renderFailedState()
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt={t('variant.shotNum', { number: globalPanelNumber })}
            className="w-full h-full object-cover"
          />
        ) : (
          renderEmptyState()
        )}

      {/* 镜头编号 - 全局连续 */}
      <div className="absolute top-2 left-2 bg-black/60 text-white px-2 py-0.5 rounded text-xs font-medium">
        {globalPanelNumber}
      </div>

      {/* 景别标签 */}
      <div className="absolute top-2 right-2 bg-blue-500/80 text-white px-2 py-0.5 rounded text-xs">
        {shotType}
      </div>

      {/* 左下角按钮组 - hover显示 - 白色玻璃态UI - 始终显示，包括生成中状态 */}
      {
        !candidateData && (
          <div className={`absolute bottom-2 left-2 flex gap-1 z-20 transition-opacity ${isRegenerating ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
            {/* 重新生成成品图候选按钮 - 白色玻璃态 */}
            <div className="relative">
              <div className="flex items-center">
                <button
                  onClick={() => {
                    console.log('[ImageSection] 🔄 左下角重新生成按钮被点击')
                    console.log('[ImageSection] isRegenerating:', isRegenerating)
                    console.log('[ImageSection] 将传递 force:', isRegenerating)
                    setIsRegeneratingAnimating(true)
                    setTimeout(() => setIsRegeneratingAnimating(false), 600)
                    // 🔥 如果已经在生成中，则使用 force=true 强制重新生成
                    onRegeneratePanelImage(panelId, 1, isRegenerating)
                  }}
                  className={`bg-white/90 backdrop-blur-sm border border-white/60 text-slate-600 px-2 py-1 rounded-l-lg text-xs hover:bg-green-50 hover:text-green-600 hover:border-green-300 shadow-sm flex items-center gap-1 transition-all active:scale-95 active:bg-green-100 ${isRegenerating ? 'opacity-75' : ''
                    }`}
                  title={isRegenerating ? t('video.panelCard.forceRegenerate') : t('panel.regenerateImage')}
                >
                  <span className="text-green-500">🔄</span>
                  <span>{isRegenerating ? t('image.forceRegenerate') : t('panel.regenerate')}</span>
                </button>
                <button
                  onClick={() => setShowCountDropdown(!showCountDropdown)}
                  className={`bg-white/90 backdrop-blur-sm border border-white/60 border-l-0 text-slate-500 px-1.5 py-1 rounded-r-lg text-xs hover:bg-green-50 hover:text-green-600 shadow-sm transition-all active:scale-95 active:bg-green-100 ${isRegenerating ? 'opacity-75' : ''
                    }`}
                  title={t('image.selectCount')}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              {/* 数量选择下拉菜单 */}
              {showCountDropdown && (
                <div className="absolute left-0 bottom-full mb-1 bg-white/95 backdrop-blur-sm border border-slate-200/60 rounded-lg shadow-lg z-30 py-1 min-w-[100px]">
                  <div className="px-2 py-1 text-xs text-slate-400 border-b border-slate-100">
                    {t('image.generateMultiple')}
                  </div>
                  {[2, 3, 4].map(count => (
                    <button
                      key={count}
                      onClick={() => {
                        setIsRegeneratingAnimating(true)
                        setTimeout(() => setIsRegeneratingAnimating(false), 600)
                        onRegeneratePanelImage(panelId, count)
                        setShowCountDropdown(false)
                      }}
                      className="w-full px-2 py-1.5 text-xs text-left text-slate-600 hover:bg-green-50 hover:text-green-600 flex items-center justify-between transition-all active:scale-95"
                    >
                      <span>{t('image.generateCount', { count })}</span>
                      {count === 3 && <span className="text-xs text-green-500">{t("smartImport.smartImport.recommended")}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 撤回按钮 - 仅在有上一版本时显示 */}
            {previousImageUrl && onUndo && (
              <button
                onClick={() => onUndo(panelId)}
                disabled={isRegenerating}
                className="bg-white/90 backdrop-blur-sm border border-white/60 text-slate-600 px-2 py-1 rounded-lg text-xs hover:bg-orange-50 hover:text-orange-600 hover:border-orange-300 shadow-sm flex items-center gap-1 transition-all active:scale-95 active:bg-orange-100 disabled:opacity-50"
                title={t("assets.image.undo")}
              >
                <span>↩️</span>
                <span>{t('assets.image.undo')}</span>
              </button>
            )}
          </div>
        )
      }

      {/* 图片编辑按钮和AI数据按钮 - 右下角 hover显示 - 白色玻璃态UI - 始终显示，包括生成中状态 */}
      {
        !candidateData && (
          <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
            {/* 摄影数据按钮 */}
            <button
              onClick={onOpenAIDataModal}
              className={`bg-white/90 backdrop-blur-sm border border-white/60 text-slate-600 px-2 py-1 rounded-lg text-xs hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 shadow-sm transition-all active:scale-95 active:bg-blue-100 ${isRegenerating || isModifying ? 'opacity-75' : ''
                }`}
              title={t('aiData.photographyRules')}
            >
              📹
            </button>
            {/* 演技数据按钮 */}
            <button
              onClick={onOpenAIDataModal}
              className={`bg-white/90 backdrop-blur-sm border border-white/60 text-slate-600 px-2 py-1 rounded-lg text-xs hover:bg-pink-50 hover:text-pink-600 hover:border-pink-300 shadow-sm transition-all active:scale-95 active:bg-pink-100 ${isRegenerating || isModifying ? 'opacity-75' : ''
                }`}
              title={t('aiData.actingNotes')}
            >
              🎭
            </button>
            {/* 修图按钮 - 仅在有图片时显示 */}
            {imageUrl && (
              <button
                onClick={onOpenEditModal}
                className={`bg-white/90 backdrop-blur-sm border border-white/60 text-slate-600 px-2 py-1 rounded-lg text-xs hover:bg-purple-50 hover:text-purple-600 hover:border-purple-300 shadow-sm flex items-center gap-1 transition-all active:scale-95 active:bg-purple-100 ${isRegenerating || isModifying ? 'opacity-75' : ''
                  }`}
              >
                <span className="text-purple-500">✏️</span>
                <span>{t('image.edit')}</span>
              </button>
            )}
          </div>
        )
      }
    </div >
  )
}
