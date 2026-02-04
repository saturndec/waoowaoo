'use client'
import { useTranslations } from 'next-intl'

import { useState } from 'react'
import { NovelPromotionStoryboard, NovelPromotionClip } from '@/types/project'
import PanelCard from './PanelCard'
import CandidateSelector from './CandidateSelector'
import ScreenplayDisplay from './ScreenplayDisplay'
import { StoryboardPanel } from './hooks/useStoryboardState'
import { PanelEditData } from '../PanelEditForm'
import { ASPECT_RATIO_CONFIGS } from '@/lib/constants'
import InsertPanelButton from './InsertPanelButton'
import InsertPanelModal from './InsertPanelModal'
import PanelVariantModal from './PanelVariantModal'
import { useCancelGeneration } from '@/lib/query/hooks'



interface StoryboardGroupProps {
  storyboard: NovelPromotionStoryboard
  clip: NovelPromotionClip | undefined
  sbIndex: number
  totalStoryboards: number
  textPanels: StoryboardPanel[]
  storyboardStartIndex: number
  videoRatio: string
  gridCols: number
  // 状态
  isExpanded: boolean
  isRegenerating: boolean
  isSelectingCandidate: boolean
  isRegeneratingText: boolean
  hasAnyImage: boolean
  failedError: string | null
  showCountDropdown: boolean
  // 面板操作
  savingPanels: Set<string>
  deletingPanelIds: Set<string>
  modifyingPanels: Set<string>
  regeneratingPanelIds: Set<string>
  failedPanels: Map<string, string>
  // 🔥 V6.5 删除：characters, locations - 未使用的传递 props
  // 回调
  onToggleExpand: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onRegenerateText: () => void
  onAddPanel: () => void
  onDeleteStoryboard: () => void
  onSetShowCountDropdown: (show: boolean) => void
  onGenerateAllIndividually: () => void
  onPreviewImage: (url: string) => void
  getImageUrl: (url: string | null) => string | null
  // 关闭错误
  onCloseError: () => void
  // Panel 回调
  getPanelEditData: (panel: StoryboardPanel) => PanelEditData
  onPanelUpdate: (panelId: string, panel: StoryboardPanel, updates: Partial<PanelEditData>) => void
  onPanelDelete: (panelId: string) => void
  onOpenCharacterPicker: (panelId: string) => void
  onOpenLocationPicker: (panelId: string) => void
  onRemoveCharacter: (panel: StoryboardPanel, index: number) => void
  onRemoveLocation: (panel: StoryboardPanel) => void
  onRegeneratePanelImage: (panelId: string, count?: number, force?: boolean) => void
  onOpenEditModal: (panelIndex: number) => void
  onOpenAIDataModal: (panelIndex: number) => void
  getPanelCandidates: (panel: any) => { candidates: string[], selectedIndex: number } | null
  onSelectPanelCandidateIndex: (panelId: string, index: number) => void
  onConfirmPanelCandidate: (panelId: string, imageUrl: string) => Promise<void>
  onCancelPanelCandidate: (panelId: string) => void
  onClearPanelError: (panelId: string) => void
  formatClipTitle: (clip: any) => string
  movingClipId: string | null
  addingStoryboardGroup: boolean
  // 插入分镜
  onInsertPanel: (storyboardId: string, insertAfterPanelId: string, userInput: string) => Promise<void>
  insertingAfterPanelId: string | null
  // 镜头变体
  projectId: string
  episodeId: string
  onPanelVariant: (sourcePanelId: string, storyboardId: string, insertAfterPanelId: string, variant: any, options: any) => Promise<void>
  generatingVariantPanelId: string | null
}

export default function StoryboardGroup({
  storyboard,
  clip,
  sbIndex,
  totalStoryboards,
  textPanels,
  storyboardStartIndex,
  videoRatio,
  gridCols,
  isExpanded,
  isRegenerating,
  isSelectingCandidate,
  isRegeneratingText,
  hasAnyImage,
  failedError,
  showCountDropdown,
  savingPanels,
  deletingPanelIds,
  modifyingPanels,
  regeneratingPanelIds,
  failedPanels,
  // 🔥 V6.5 删除：characters, locations - 未使用的传递 props
  onToggleExpand,
  onMoveUp,
  onMoveDown,
  onRegenerateText,
  onAddPanel,
  onDeleteStoryboard,
  onSetShowCountDropdown,
  onGenerateAllIndividually,
  onPreviewImage,
  getImageUrl,
  onCloseError,
  getPanelEditData,
  onPanelUpdate,
  onPanelDelete,
  onOpenCharacterPicker,
  onOpenLocationPicker,
  onRemoveCharacter,
  onRemoveLocation,
  onRegeneratePanelImage,
  onOpenEditModal,
  onOpenAIDataModal,
  getPanelCandidates,
  onSelectPanelCandidateIndex,
  onConfirmPanelCandidate,
  onCancelPanelCandidate,
  onClearPanelError,
  formatClipTitle,
  movingClipId,
  addingStoryboardGroup,
  onInsertPanel,
  insertingAfterPanelId,
  projectId,
  episodeId,
  onPanelVariant,
  generatingVariantPanelId
}: StoryboardGroupProps) {
  const t = useTranslations('storyboard')
  const { cancelGeneration, isCancelling } = useCancelGeneration(projectId, episodeId)
  // 插入分镜模态框状态
  const [insertModalOpen, setInsertModalOpen] = useState(false)
  const [insertAfterPanel, setInsertAfterPanel] = useState<{ id: string, panelNumber: number | null, description: string | null, imageUrl: string | null } | null>(null)
  const [nextPanelForInsert, setNextPanelForInsert] = useState<{ id: string, panelNumber: number | null, description: string | null, imageUrl: string | null } | null>(null)

  // 打开插入模态框
  const handleOpenInsertModal = (panelIndex: number) => {
    const prevPanel = textPanels[panelIndex]
    const nextPanel = textPanels[panelIndex + 1] || null

    setInsertAfterPanel({
      id: prevPanel.id,
      panelNumber: prevPanel.panel_number,
      description: prevPanel.description,
      imageUrl: prevPanel.imageUrl ?? null
    })

    setNextPanelForInsert(nextPanel ? {
      id: nextPanel.id,
      panelNumber: nextPanel.panel_number,
      description: nextPanel.description,
      imageUrl: nextPanel.imageUrl ?? null
    } : null)

    setInsertModalOpen(true)
  }

  // 处理插入
  const handleInsert = async (userInput: string) => {
    if (!insertAfterPanel) return
    await onInsertPanel(storyboard.id, insertAfterPanel.id, userInput)
    setInsertModalOpen(false)
    setInsertAfterPanel(null)
    setNextPanelForInsert(null)
  }

  // 镜头变体模态框状态
  const [variantModalPanel, setVariantModalPanel] = useState<{
    id: string
    panelNumber: number | null
    description: string | null
    imageUrl: string | null
    storyboardId: string
  } | null>(null)

  // 打开变体模态框
  const handleOpenVariantModal = (panelIndex: number) => {
    const panel = textPanels[panelIndex]
    setVariantModalPanel({
      id: panel.id,
      panelNumber: panel.panel_number,
      description: panel.description,
      imageUrl: panel.imageUrl ?? null,
      storyboardId: storyboard.id
    })
  }

  // 处理变体生成
  const handleVariant = async (variant: any, options: any) => {
    if (!variantModalPanel) return
    await onPanelVariant(
      variantModalPanel.id,
      variantModalPanel.storyboardId,
      variantModalPanel.id,
      variant,
      options
    )
    setVariantModalPanel(null)
  }

  // 计算当前分镜组中正在重新生成的panel数量（包括数据库状态和本地状态）
  const currentRegeneratingCount = textPanels.filter((p: any) => p.generatingImage || regeneratingPanelIds.has(p.id)).length

  // 显示的图片
  const displayImages = textPanels.map((p: any) => p.imageUrl || null)

  return (
    <div className={`bg-white/70 backdrop-blur-xl border border-white/60 rounded-3xl shadow-xl shadow-slate-200/40 p-6 relative ${failedError ? 'border-2 border-red-400 bg-red-50/30' : ''}`}>
      {/* 生成失败提示 */}
      {failedError && (
        <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <h4 className="text-sm font-bold text-red-800">⚠️ {t('group.failed')}</h4>
              <p className="text-sm text-red-700 mt-1">{failedError}</p>
            </div>
            <button
              onClick={onCloseError}
              className="text-red-500 hover:text-red-700 hover:bg-red-200 rounded p-1 transition-colors"
              title={t('common.cancel')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* 生成或选择候选图片时的遮罩 */}
      {(isRegenerating || isSelectingCandidate) && (
        <div className="absolute inset-0 bg-white/80 z-10 flex flex-col items-center justify-center rounded-lg gap-3">
          <div className="flex items-center gap-2 text-blue-600">
            <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>{isSelectingCandidate ? t('image.selectingCandidate') : (hasAnyImage ? t('group.regenerating') : t('group.generating'))}</span>
          </div>
          {isRegenerating && (
            <button
              onClick={() => cancelGeneration({ type: 'storyboard_text', targetId: storyboard.id })}
              disabled={isCancelling}
              className="px-3 py-1.5 text-xs bg-red-500/80 hover:bg-red-500 text-white rounded-lg transition-colors"
            >
              {isCancelling ? '取消中...' : '取消'}
            </button>
          )}
        </div>
      )}

      {/* 片段标题 */}
      <div className="mb-4 pb-3 border-b flex items-start justify-between">
        <div className="flex items-center gap-4">
          {/* 上下移动按钮组 */}
          <div className="flex flex-col gap-1">
            <button
              onClick={onMoveUp}
              disabled={sbIndex === 0 || movingClipId === storyboard.clipId}
              className={`p-1 rounded transition-colors ${sbIndex === 0 || movingClipId === storyboard.clipId
                ? 'text-gray-300 cursor-not-allowed'
                : 'text-gray-400 hover:text-blue-500 hover:bg-blue-50'
                }`}
              title={t("panel.moveUp")}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </button>
            <button
              onClick={onMoveDown}
              disabled={sbIndex === totalStoryboards - 1 || movingClipId === storyboard.clipId}
              className={`p-1 rounded transition-colors ${sbIndex === totalStoryboards - 1 || movingClipId === storyboard.clipId
                ? 'text-gray-300 cursor-not-allowed'
                : 'text-gray-400 hover:text-blue-500 hover:bg-blue-50'
                }`}
              title={t("panel.moveDown")}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
          {/* 大标题：顺序数字 */}
          <div className="flex items-center justify-center w-12 h-12 bg-blue-500 text-white rounded-2xl text-2xl font-bold shadow-lg shadow-blue-500/20">
            {sbIndex + 1}
          </div>
          <div>
            {/* 小标题：原文片段信息 */}
            <h3 className="text-sm text-slate-600 font-medium">
              {t('group.segment')}【{formatClipTitle(clip)}】
            </h3>
            <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{clip?.summary}</p>
          </div>
        </div>

        {/* 操作按钮组 - 白色玻璃态UI */}
        <div className="flex items-center gap-2">
          {/* 重新生成文字分镜按钮 */}
          <button
            onClick={onRegenerateText}
            disabled={isRegeneratingText}
            className={`px-3 py-1.5 text-xs rounded-xl transition-all flex items-center gap-1.5 shadow-sm ${isRegeneratingText
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-white/90 backdrop-blur-sm border border-slate-200/60 text-slate-600 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-300'
              }`}
          >
            {isRegeneratingText ? (
              <>
                <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
                <span>{t('group.regenerating')}</span>
              </>
            ) : (
              <>
                <span className="text-amber-500">🔄</span>
                <span>{t('group.regenerateText')}</span>
              </>
            )}
          </button>

          {/* 生成所有镜头（替代原来的逐个生成） */}
          {(() => {
            const pendingCount = textPanels.filter((p: any) => !p.imageUrl && !p.generatingImage && !regeneratingPanelIds.has(p.id)).length
            return pendingCount > 0 ? (
              <button
                onClick={onGenerateAllIndividually}
                disabled={currentRegeneratingCount > 0}
                className="px-3 py-1.5 text-xs rounded-xl transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed bg-white/90 backdrop-blur-sm border border-slate-200/60 text-slate-600 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300"
                title={t('group.generateMissingImages')}
              >
                {currentRegeneratingCount > 0 ? (
                  <>
                    <svg className="animate-spin h-3 w-3 text-blue-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                    </svg>
                    <span>{t("group.generating")}</span>
                  </>
                ) : (
                  <>
                    <span className="text-blue-500">🎬</span>
                    <span>{t('group.generateAll')}</span>
                    <span className="bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded text-[10px] font-medium">{pendingCount}</span>
                  </>
                )}
              </button>
            ) : null
          })()}

          {/* 添加镜头按钮 */}
          <button
            onClick={onAddPanel}
            className="px-3 py-1.5 text-xs rounded-xl transition-all flex items-center gap-1.5 shadow-sm bg-white/90 backdrop-blur-sm border border-slate-200/60 text-slate-600 hover:bg-green-50 hover:text-green-600 hover:border-green-300"
          >
            <span className="text-green-500">+</span>
            <span>{t('group.addPanel')}</span>
          </button>

          {/* 删除整组按钮 */}
          <button
            onClick={onDeleteStoryboard}
            disabled={isRegenerating}
            className="px-3 py-1.5 text-xs rounded-xl transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed bg-white/90 backdrop-blur-sm border border-slate-200/60 text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-300"
            title={t('common.delete')}
          >
            <span className="text-red-400">🗑️</span>
            <span>{t('common.delete')}</span>
          </button>
        </div>
      </div>

      {/* 原文/剧本内容折叠区 */}
      {
        clip && (
          <div className="mb-4">
            <button
              onClick={onToggleExpand}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800"
            >
              <span className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
              <span>📜 {clip.screenplay ? t('panel.stylePrompt') : t('panel.sourceText')}</span>
            </button>
            {isExpanded && (
              <div className="mt-2 border rounded-lg overflow-hidden">
                {/* 如果有剧本，显示标签切换 */}
                {clip.screenplay ? (
                  <ScreenplayDisplay screenplay={clip.screenplay} originalContent={clip.content} />
                ) : (
                  <div className="p-3 bg-gray-50 text-sm text-gray-700 whitespace-pre-wrap">
                    {clip.content}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      }



      {/* 镜头网格 - 根据比例是否竖屏决定列数 */}
      {
        (() => {
          const isVertical = ASPECT_RATIO_CONFIGS[videoRatio]?.isVertical ?? false
          return (
            <div className={`grid gap-4 ${isVertical ? 'grid-cols-4' : 'grid-cols-3'} ${isRegeneratingText ? 'opacity-50 pointer-events-none' : ''}`}>
              {textPanels.map((panel, index) => {
                const imageUrl = displayImages[index]
                const globalPanelNumber = storyboardStartIndex + index + 1
                const isPanelModifying = modifyingPanels.has(panel.id)
                const isPanelDeleting = deletingPanelIds.has(panel.id)
                const isPanelSaving = savingPanels.has(panel.id)
                const isPanelRegenerating = panel.generatingImage || regeneratingPanelIds.has(panel.id)
                // 🔥 合并本地状态和数据库错误：优先显示数据库中的 imageErrorMessage
                const panelFailedError = (panel as any).imageErrorMessage || failedPanels.get(panel.id) || null
                const panelData = getPanelEditData(panel)
                const panelCandidateData = getPanelCandidates(panel)

                return (
                  <div
                    key={panel.id || index}
                    className="relative group/panel"
                    style={{ zIndex: textPanels.length - index }}
                  >
                    <PanelCard
                      projectId={projectId}
                      panel={panel}
                      panelData={panelData}
                      imageUrl={imageUrl}
                      globalPanelNumber={globalPanelNumber}
                      storyboardId={storyboard.id}
                      videoRatio={videoRatio}
                      episodeId={episodeId}
                      isSaving={isPanelSaving}
                      isDeleting={isPanelDeleting}
                      isModifying={isPanelModifying}
                      isRegenerating={isPanelRegenerating}
                      failedError={panelFailedError}
                      candidateData={panelCandidateData}
                      onUpdate={(updates) => onPanelUpdate(panel.id, panel, updates)}
                      onDelete={() => onPanelDelete(panel.id)}
                      onOpenCharacterPicker={() => onOpenCharacterPicker(panel.id)}
                      onOpenLocationPicker={() => onOpenLocationPicker(panel.id)}
                      onRemoveCharacter={(idx) => onRemoveCharacter(panel, idx)}
                      onRemoveLocation={() => onRemoveLocation(panel)}
                      onRegeneratePanelImage={onRegeneratePanelImage}
                      onOpenEditModal={() => onOpenEditModal(index)}
                      onOpenAIDataModal={() => onOpenAIDataModal(index)}
                      onSelectCandidateIndex={onSelectPanelCandidateIndex}
                      onConfirmCandidate={onConfirmPanelCandidate}
                      onCancelCandidate={onCancelPanelCandidate}
                      onClearError={() => onClearPanelError(panel.id)}
                      onPreviewImage={onPreviewImage}
                      onInsertAfter={() => handleOpenInsertModal(index)}
                      onVariant={() => handleOpenVariantModal(index)}
                      isInsertDisabled={isRegeneratingText || insertingAfterPanelId === panel.id || generatingVariantPanelId === panel.id}
                    />
                  </div>
                )
              })}
            </div>
          )
        })()
      }

      {/* 插入分镜模态框 */}
      {
        insertAfterPanel && (
          <InsertPanelModal
            isOpen={insertModalOpen}
            onClose={() => {
              setInsertModalOpen(false)
              setInsertAfterPanel(null)
              setNextPanelForInsert(null)
            }}
            prevPanel={insertAfterPanel}
            nextPanel={nextPanelForInsert}
            onInsert={handleInsert}
            isInserting={insertingAfterPanelId === insertAfterPanel.id}
          />
        )
      }

      {/* 镜头变体模态框 */}
      {
        variantModalPanel && (
          <PanelVariantModal
            isOpen={!!variantModalPanel}
            onClose={() => setVariantModalPanel(null)}
            panel={variantModalPanel}
            projectId={projectId}
            onVariant={handleVariant}
            isGenerating={generatingVariantPanelId === variantModalPanel.id}
          />
        )
      }
    </div >
  )
}
