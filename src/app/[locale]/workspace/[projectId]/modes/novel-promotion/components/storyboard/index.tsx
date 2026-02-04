'use client'

import { useState, useCallback, useMemo } from 'react'
import { NovelPromotionStoryboard, NovelPromotionClip, Character, Location } from '@/types/project'
import { useProjectAssets } from '@/lib/query/hooks/useProjectAssets'
import { CharacterPickerModal, LocationPickerModal, PanelEditData } from '../PanelEditForm'
import StoryboardHeader from './StoryboardHeader'
import StoryboardGroup from './StoryboardGroup'
import ImageEditModal from './ImageEditModal'
import AIDataModal from './AIDataModal'
import { useStoryboardState, StoryboardPanel } from './hooks/useStoryboardState'
import { usePanelOperations } from './hooks/usePanelOperations'
import { useImageGeneration, SelectedAsset } from './hooks/useImageGeneration'
import { usePanelVariant } from './hooks/usePanelVariant'
import { ASPECT_RATIO_CONFIGS } from '@/lib/constants'
import { StoryboardProvider } from './StoryboardContext'

interface StoryboardStageProps {
  projectId: string
  episodeId: string
  storyboards: NovelPromotionStoryboard[]
  clips: NovelPromotionClip[]
  // 🔥 V6.5 删除：characters, locations - 现在内部直接订阅
  videoRatio: string
  onBack: () => void
  onNext: () => void
  isTransitioning?: boolean
}

export default function StoryboardStage({
  projectId,
  episodeId,
  storyboards: initialStoryboards,
  clips,
  // 🔥 V6.5 删除：characters, locations - 现在内部直接订阅
  videoRatio,
  onBack,
  onNext,
  isTransitioning = false
}: StoryboardStageProps) {
  // 🔥 V6.5 重构：直接订阅缓存，消除 props drilling
  const { data: assets } = useProjectAssets(projectId)
  // 🔧 使用 useMemo 稳定引用，防止 useCallback/useEffect 依赖问题
  const characters: Character[] = useMemo(() => assets?.characters ?? [], [assets?.characters])
  const locations: Location[] = useMemo(() => assets?.locations ?? [], [assets?.locations])
  // 使用状态管理 hook
  const storyboardState = useStoryboardState({
    initialStoryboards,
    clips
  })

  const {
    localStoryboards,
    setLocalStoryboards,
    sortedStoryboards,
    expandedClips,
    toggleExpandedClip,
    panelEditsRef,
    getClipInfo,
    getTextPanels,
    getPanelEditData,
    updatePanelEdit,
    formatClipTitle,
    totalPanels,
    storyboardStartIndex
  } = storyboardState

  // 使用面板操作 hook - 🔥 统一使用 useRefreshProjectAssets
  const panelOps = usePanelOperations({
    projectId,
    episodeId,
    panelEditsRef
  })

  const {
    savingPanels,
    deletingPanelIds,
    regeneratingStoryboards,
    addingStoryboardGroup,
    movingClipId,
    insertingAfterPanelId,
    savePanelWithData,
    debouncedSave,
    addPanel,
    deletePanel,
    deleteStoryboard,
    regenerateStoryboardText,
    addStoryboardGroup,
    moveStoryboardGroup,
    addCharacterToPanel,
    removeCharacterFromPanel,
    setPanelLocation,
    insertPanel
  } = panelOps

  // 使用镜头变体 hook - 🔥 需要 setLocalStoryboards 来实现乐观更新
  const variantOps = usePanelVariant({
    projectId,
    episodeId,
    setLocalStoryboards: storyboardState.setLocalStoryboards
  })

  const {
    generatingVariantPanelId,
    generatePanelVariant
  } = variantOps

  // 使用图片生成 hook - 🔥 统一使用 useRefreshProjectAssets
  const imageOps = useImageGeneration({
    projectId,
    episodeId,
    localStoryboards,
    setLocalStoryboards
  })

  const {
    regeneratingIds,
    regeneratingPanelIds,
    selectingCandidateIds,
    panelCandidateIndex,
    failedStoryboards,
    failedPanels,
    editingPanel,
    setEditingPanel,
    modifyingPanels,
    showCountDropdown,
    setShowCountDropdown,
    isDownloadingImages,
    previewImage,
    setPreviewImage,
    regeneratePanelImage,
    regenerateAllPanelsIndividually,
    selectPanelCandidate,
    selectPanelCandidateIndex,  // 🆕 本地选择候选索引
    cancelPanelCandidate,
    getPanelCandidates,
    modifyPanelImage,
    downloadAllImages,
    clearStoryboardError,
    clearPanelError
  } = imageOps

  // 资产选择弹窗状态
  const [assetPickerPanel, setAssetPickerPanel] = useState<{ panelId: string; type: 'character' | 'location' } | null>(null)

  // AI数据编辑弹窗状态
  const [aiDataPanel, setAIDataPanel] = useState<{ storyboardId: string; panelIndex: number } | null>(null)

  // 剧集级别批量生成状态（独立于片段级别）
  const [isGeneratingAllEpisode, setIsGeneratingAllEpisode] = useState(false)

  // 根据视频比例计算网格配置（使用配置表判断是否竖屏）
  const isVertical = ASPECT_RATIO_CONFIGS[videoRatio]?.isVertical ?? false
  const gridCols = isVertical ? 4 : 3

  // 获取图片URL（处理COS签名）
  const getImageUrl = useCallback((url: string | null) => {
    if (!url) return null
    return url.startsWith('images/') ? `/api/cos/sign?key=${encodeURIComponent(url)}` : url
  }, [])

  // 从clip获取默认资产
  const getDefaultAssetsForClip = useCallback((clipId: string): SelectedAsset[] => {
    const clip = clips.find(c => c.id === clipId)
    if (!clip) return []

    const assets: SelectedAsset[] = []

    // 添加角色
    if (clip.characters) {
      try {
        const characterNames: string[] = JSON.parse(clip.characters)
        for (const charName of characterNames) {
          const character = characters.find(
            c => c.name.toLowerCase() === charName.toLowerCase()
          )
          if (character?.appearances) {
            const appearances = character.appearances || []
            const firstAppearance = appearances[0]
            if (firstAppearance?.imageUrl) {
              const displayName = appearances.length > 1
                ? `${character.name} - ${firstAppearance.changeReason || '初始形象'}`
                : character.name
              assets.push({
                id: character.id,
                name: displayName,
                type: 'character',
                imageUrl: firstAppearance.imageUrl,
                appearanceId: firstAppearance.appearanceIndex,
                appearanceName: firstAppearance.changeReason
              })
            }
          }
        }
      } catch (e) {
        console.error('Failed to parse characters:', e)
      }
    }

    // 添加场景
    if (clip.location) {
      const location = locations.find(
        l => l.name.toLowerCase() === clip.location?.toLowerCase()
      )
      if (location?.images) {
        const selectedImage = location.images.find((img: any) => img.isSelected) || location.images[0]
        if (selectedImage?.imageUrl) {
          assets.push({
            id: location.id,
            name: location.name,
            type: 'location',
            imageUrl: selectedImage.imageUrl
          })
        }
      }
    }

    return assets
  }, [clips, characters, locations])

  // 处理图片编辑提交
  const handleEditSubmit = useCallback(async (prompt: string, images: string[], assets: SelectedAsset[]) => {
    if (!editingPanel) return
    const { storyboardId, panelIndex } = editingPanel
    setEditingPanel(null)
    await modifyPanelImage(storyboardId, panelIndex, prompt, images, assets)
  }, [editingPanel, modifyPanelImage])

  // 处理面板更新
  const handlePanelUpdate = useCallback((panelId: string, panel: StoryboardPanel, updates: Partial<PanelEditData>) => {
    updatePanelEdit(panelId, panel, updates)
    // 找到对应的 storyboard
    const storyboard = localStoryboards.find(sb =>
      getTextPanels(sb).some(p => p.id === panelId)
    )
    if (storyboard) {
      debouncedSave(panelId, storyboard.id)
    }
  }, [updatePanelEdit, localStoryboards, getTextPanels, debouncedSave])

  // 处理角色添加
  const handleAddCharacter = useCallback((charName: string, appearance: string) => {
    if (!assetPickerPanel || assetPickerPanel.type !== 'character') return

    const storyboard = localStoryboards.find(sb =>
      getTextPanels(sb).some(p => p.id === assetPickerPanel.panelId)
    )
    const panel = storyboard ? getTextPanels(storyboard).find(p => p.id === assetPickerPanel.panelId) : null

    if (storyboard && panel) {
      addCharacterToPanel(panel, charName, appearance, storyboard.id, getPanelEditData, updatePanelEdit)
    }
    setAssetPickerPanel(null)
  }, [assetPickerPanel, localStoryboards, getTextPanels, addCharacterToPanel, getPanelEditData, updatePanelEdit])

  // 处理场景设置
  const handleSetLocation = useCallback((locationName: string) => {
    if (!assetPickerPanel || assetPickerPanel.type !== 'location') return

    const storyboard = localStoryboards.find(sb =>
      getTextPanels(sb).some(p => p.id === assetPickerPanel.panelId)
    )
    const panel = storyboard ? getTextPanels(storyboard).find(p => p.id === assetPickerPanel.panelId) : null

    if (storyboard && panel) {
      setPanelLocation(panel, locationName, storyboard.id, updatePanelEdit)
    }
    setAssetPickerPanel(null)
  }, [assetPickerPanel, localStoryboards, getTextPanels, setPanelLocation, updatePanelEdit])

  // 渲染添加分镜组按钮
  const renderAddStoryboardGroupButton = (insertIndex: number, text: string, className: string = '') => (
    <div className={`flex justify-center ${className}`}>
      <button
        onClick={() => addStoryboardGroup(insertIndex)}
        disabled={addingStoryboardGroup}
        className="group flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 hover:border-green-400 hover:bg-green-50 rounded-lg text-gray-500 hover:text-green-600 transition-all"
      >
        {addingStoryboardGroup ? (
          <>
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
            <span>添加中...</span>
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <span>{text}</span>
          </>
        )}
      </button>
    </div>
  )

  // 创建 Context 共享值（用于减少 props 传递）
  // 🔥 V6.5 重构：删除 characters, locations - 子组件直接订阅 useProjectAssets
  const storyboardContextValue = useMemo(() => ({
    projectId,
    videoRatio,
    // 🔥 V6.5 删除：characters, locations - 子组件直接订阅 useProjectAssets(projectId)
    regeneratePanelImage,
    getPanelCandidates,
    onSelectPanelCandidateIndex: selectPanelCandidateIndex,
    onConfirmPanelCandidate: selectPanelCandidate,
    onCancelPanelCandidate: cancelPanelCandidate,
    onClearPanelError: clearPanelError,
    getImageUrl,
    formatClipTitle,
    savingPanels,
    deletingPanelIds,
    modifyingPanels,
    regeneratingPanelIds,
    failedPanels
  }), [
    projectId, videoRatio,
    regeneratePanelImage, getPanelCandidates, selectPanelCandidate, cancelPanelCandidate,
    clearPanelError, getImageUrl, formatClipTitle,
    savingPanels, deletingPanelIds, modifyingPanels, regeneratingPanelIds, failedPanels
  ])

  return (
    <StoryboardProvider value={storyboardContextValue}>
      <div className="space-y-6 pb-20">
        {/* 标题 */}
        <StoryboardHeader
          totalSegments={sortedStoryboards.length}
          totalPanels={totalPanels}
          isDownloadingImages={isDownloadingImages}
          generatingCount={regeneratingPanelIds.size}
          pendingPanelCount={(() => {
            // 计算当前剧集所有未生成图片的镜头数量
            return sortedStoryboards.reduce((count, sb) => {
              const panels = getTextPanels(sb)
              return count + panels.filter(p => !p.imageUrl && !p.generatingImage && !regeneratingPanelIds.has(p.id)).length
            }, 0)
          })()}
          isGeneratingAll={isGeneratingAllEpisode}
          onDownloadAllImages={downloadAllImages}
          onGenerateAllPanels={async () => {
            setIsGeneratingAllEpisode(true)
            try {
              // 收集所有需要生成的镜头
              const panelsToGenerate: string[] = []
              sortedStoryboards.forEach(sb => {
                const panels = getTextPanels(sb)
                panels.forEach(panel => {
                  const isGenerating = panel.generatingImage || regeneratingPanelIds.has(panel.id)
                  if (!panel.imageUrl && !isGenerating) {
                    panelsToGenerate.push(panel.id)
                  }
                })
              })

              if (panelsToGenerate.length === 0) {
                console.log('[批量生成] 没有需要生成的分镜图片')
                return
              }

              console.log(`[批量生成] 开始生成 ${panelsToGenerate.length} 个分镜图片`)

              // 🔥 并发控制: 每次最多10个,避免服务器压力过大
              const CONCURRENCY_LIMIT = 10
              const results: Array<PromiseSettledResult<any>> = []

              for (let i = 0; i < panelsToGenerate.length; i += CONCURRENCY_LIMIT) {
                const batch = panelsToGenerate.slice(i, i + CONCURRENCY_LIMIT)
                const currentBatchNum = Math.floor(i / CONCURRENCY_LIMIT) + 1
                const totalBatches = Math.ceil(panelsToGenerate.length / CONCURRENCY_LIMIT)

                console.log(`[批量生成] 处理第 ${currentBatchNum}/${totalBatches} 批 (${batch.length} 个)`)

                const batchResults = await Promise.allSettled(
                  batch.map(panelId => regeneratePanelImage(panelId, 1))
                )
                results.push(...batchResults)

                const completed = Math.min(i + CONCURRENCY_LIMIT, panelsToGenerate.length)
                console.log(`[批量生成] 已完成 ${completed}/${panelsToGenerate.length}`)
              }

              // 🔥 统计成功/失败
              const succeeded = results.filter(r => r.status === 'fulfilled').length
              const failed = results.filter(r => r.status === 'rejected').length

              console.log(`[批量生成] 完成: 成功 ${succeeded}, 失败 ${failed}`)

              if (failed > 0) {
                const failedReasons = results
                  .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
                  .map(r => r.reason?.message || r.reason)
                  .slice(0, 3) // 只显示前3个错误
                  .join('; ')

                alert(`批量生成完成:\n成功: ${succeeded}\n失败: ${failed}\n\n部分错误: ${failedReasons}`)
              } else if (succeeded > 0) {
                console.log(`[批量生成] 全部成功生成 ${succeeded} 个分镜图片`)
              }
            } catch (error: any) {
              console.error('[批量生成] 发生意外错误:', error)
              alert('批量生成失败: ' + (error.message || '未知错误'))
            } finally {
              setIsGeneratingAllEpisode(false)
            }
          }}
          onBack={onBack}
        />

        {/* 添加分镜组按钮（顶部） */}
        {renderAddStoryboardGroupButton(0, '在开头添加新分镜组')}

        {/* 分镜列表 */}
        {sortedStoryboards.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>暂无分镜数据</p>
            <p className="text-sm mt-2">请先生成Clips和文字分镜，或点击上方按钮添加分镜组</p>
          </div>
        ) : (
          sortedStoryboards.map((storyboard, sbIndex) => {
            const clip = getClipInfo(storyboard.clipId)
            const textPanels = getTextPanels(storyboard)
            const isRegenerating = regeneratingIds.has(storyboard.id)
            const isSelectingCandidate = selectingCandidateIds.has(storyboard.id)
            const isRegeneratingText = regeneratingStoryboards.has(storyboard.id)
            const hasAnyImage = textPanels.some(p => p.imageUrl)
            const failedError = failedStoryboards.get(storyboard.id) || (storyboard as any).lastError

            return (
              <div key={storyboard.id}>
                <StoryboardGroup
                  storyboard={storyboard}
                  clip={clip}
                  sbIndex={sbIndex}
                  totalStoryboards={sortedStoryboards.length}
                  textPanels={textPanels}
                  storyboardStartIndex={storyboardStartIndex[storyboard.id]}
                  videoRatio={videoRatio}
                  gridCols={gridCols}
                  isExpanded={expandedClips.has(storyboard.id)}
                  isRegenerating={isRegenerating}
                  isSelectingCandidate={isSelectingCandidate}
                  isRegeneratingText={isRegeneratingText}
                  hasAnyImage={hasAnyImage}
                  failedError={failedError}
                  showCountDropdown={showCountDropdown === storyboard.id}
                  savingPanels={savingPanels}
                  deletingPanelIds={deletingPanelIds}
                  modifyingPanels={modifyingPanels}
                  regeneratingPanelIds={regeneratingPanelIds}
                  failedPanels={failedPanels}
                  onToggleExpand={() => toggleExpandedClip(storyboard.id)}
                  onMoveUp={() => moveStoryboardGroup(storyboard.clipId, 'up')}
                  onMoveDown={() => moveStoryboardGroup(storyboard.clipId, 'down')}
                  onRegenerateText={() => regenerateStoryboardText(storyboard.id)}
                  onAddPanel={() => addPanel(storyboard.id)}
                  onDeleteStoryboard={() => deleteStoryboard(storyboard.id, textPanels.length)}
                  onSetShowCountDropdown={(show) => setShowCountDropdown(show ? storyboard.id : null)}
                  onGenerateAllIndividually={() => regenerateAllPanelsIndividually(storyboard.id)}
                  onPreviewImage={setPreviewImage}
                  getImageUrl={getImageUrl}
                  onCloseError={() => clearStoryboardError(storyboard.id)}
                  getPanelEditData={getPanelEditData}
                  onPanelUpdate={handlePanelUpdate}
                  onPanelDelete={(panelId) => deletePanel(panelId, storyboard.id, setLocalStoryboards)}
                  onOpenCharacterPicker={(panelId) => setAssetPickerPanel({ panelId, type: 'character' })}
                  onOpenLocationPicker={(panelId) => setAssetPickerPanel({ panelId, type: 'location' })}
                  onRemoveCharacter={(panel, idx) => {
                    removeCharacterFromPanel(panel, idx, storyboard.id, getPanelEditData, updatePanelEdit)
                  }}
                  onRemoveLocation={(panel) => {
                    setPanelLocation(panel, null, storyboard.id, updatePanelEdit)
                  }}
                  onRegeneratePanelImage={regeneratePanelImage}
                  onOpenEditModal={(panelIndex) => {
                    setEditingPanel({ storyboardId: storyboard.id, panelIndex })
                  }}
                  onOpenAIDataModal={(panelIndex) => {
                    setAIDataPanel({ storyboardId: storyboard.id, panelIndex })
                  }}
                  getPanelCandidates={getPanelCandidates}
                  onSelectPanelCandidateIndex={selectPanelCandidateIndex}
                  onConfirmPanelCandidate={selectPanelCandidate}
                  onCancelPanelCandidate={cancelPanelCandidate}
                  onClearPanelError={clearPanelError}
                  formatClipTitle={formatClipTitle}
                  movingClipId={movingClipId}
                  addingStoryboardGroup={addingStoryboardGroup}
                  onInsertPanel={insertPanel}
                  insertingAfterPanelId={insertingAfterPanelId}
                  projectId={projectId}
                  episodeId={episodeId}
                  onPanelVariant={generatePanelVariant}
                  generatingVariantPanelId={generatingVariantPanelId}
                />

                {/* 在分镜组之间的插入按钮 */}
                <div className="flex justify-center py-2">
                  <button
                    onClick={() => addStoryboardGroup(sbIndex + 1)}
                    disabled={addingStoryboardGroup}
                    className="group flex items-center gap-1 px-3 py-1.5 border border-dashed border-transparent hover:border-green-300 hover:bg-green-50 rounded text-gray-400 hover:text-green-600 text-xs transition-all"
                  >
                    <svg className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity">在此插入新分镜组</span>
                  </button>
                </div>
              </div>
            )
          })
        )}

        {/* 右下角浮动下一步按钮 */}
        <button
          onClick={onNext}
          disabled={isTransitioning || localStoryboards.length === 0}
          className="fixed bottom-6 right-6 z-40 btn-base px-6 py-3 bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg flex items-center gap-2"
        >
          {isTransitioning ? (
            <>
              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>处理中...</span>
            </>
          ) : (
            '生成视频 →'
          )}
        </button>

        {/* 编辑单个分镜弹窗 */}
        {editingPanel && (
          <ImageEditModal
            projectId={projectId}
            defaultAssets={getDefaultAssetsForClip(
              localStoryboards.find(sb => sb.id === editingPanel.storyboardId)?.clipId || ''
            )}
            onSubmit={handleEditSubmit}
            onClose={() => setEditingPanel(null)}
          />
        )}

        {/* AI数据编辑弹窗 */}
        {aiDataPanel && (() => {
          const storyboard = localStoryboards.find(sb => sb.id === aiDataPanel.storyboardId)
          if (!storyboard) return null
          const textPanels = getTextPanels(storyboard)
          const panel = textPanels[aiDataPanel.panelIndex]
          if (!panel) return null

          const panelData = getPanelEditData(panel)

          // 解析单镜头摄影规则（从 Panel 读取）
          let photographyRules = null
          if (panel.photographyRules) {
            try {
              photographyRules = typeof panel.photographyRules === 'string'
                ? JSON.parse(panel.photographyRules)
                : panel.photographyRules
            } catch (e) {
              console.warn('Failed to parse photographyRules:', e)
            }
          }

          // 解析演技指导数据（从 Panel 读取）
          let actingNotes = null
          if (panel.actingNotes) {
            try {
              actingNotes = typeof panel.actingNotes === 'string'
                ? JSON.parse(panel.actingNotes)
                : panel.actingNotes
            } catch (e) {
              console.warn('Failed to parse actingNotes:', e)
            }
          }

          // 获取角色名称列表
          const characterNames = panelData.characters.map(c => c.name)

          return (
            <AIDataModal
              isOpen={true}
              onClose={() => setAIDataPanel(null)}
              panelNumber={panelData.panelNumber || aiDataPanel.panelIndex + 1}
              shotType={panelData.shotType}
              cameraMove={panelData.cameraMove}
              description={panelData.description}
              location={panelData.location}
              characters={characterNames}
              videoPrompt={panelData.videoPrompt}
              photographyRules={photographyRules}
              actingNotes={actingNotes}
              videoRatio={videoRatio}
              onSave={async (data) => {
                // 构建更新后的完整数据
                const updatedPanelData: PanelEditData = {
                  ...panelData,
                  shotType: data.shotType,
                  cameraMove: data.cameraMove,
                  description: data.description,
                  videoPrompt: data.videoPrompt
                }

                // 更新本地状态
                updatePanelEdit(panel.id, panel, {
                  shotType: data.shotType,
                  cameraMove: data.cameraMove,
                  description: data.description,
                  videoPrompt: data.videoPrompt
                })

                // 直接使用完整数据保存到数据库（避免ref同步问题）
                savePanelWithData(storyboard.id, updatedPanelData)

                // 如果摄影规则有更新，保存到storyboard
                if (data.photographyRules) {
                  try {
                    const res = await fetch(`/api/novel-promotion/${projectId}/photography-plan`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        storyboardId: storyboard.id,
                        photographyPlan: data.photographyRules
                      })
                    })
                    if (!res.ok) {
                      console.error('保存摄影规则失败')
                    } else {
                      console.log('[AIDataModal] 摄影规则保存成功')
                    }
                  } catch (err) {
                    console.error('保存摄影规则失败:', err)
                  }
                }

                // 如果演技指导有更新，保存到panel
                if (data.actingNotes !== undefined) {
                  try {
                    const res = await fetch(`/api/novel-promotion/${projectId}/panel`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        storyboardId: storyboard.id,
                        panelIndex: panel.panelIndex,
                        actingNotes: data.actingNotes
                      })
                    })
                    if (!res.ok) {
                      console.error('保存演技指导失败')
                    } else {
                      console.log('[AIDataModal] 演技指导保存成功')
                    }
                  } catch (err) {
                    console.error('保存演技指导失败:', err)
                  }
                }
              }}
            />
          )
        })()}

        {/* 大图预览弹窗 */}
        {previewImage && (
          <div
            className="fixed inset-0 bg-black/90 z-[80] flex items-center justify-center p-4 cursor-zoom-out"
            onClick={() => setPreviewImage(null)}
          >
            <button
              className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              onClick={() => setPreviewImage(null)}
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <img
              src={previewImage}
              alt="预览大图"
              className="max-w-[95vw] max-h-[95vh] object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}

        {/* 角色选择弹窗 */}
        {assetPickerPanel?.type === 'character' && (() => {
          const targetStoryboard = localStoryboards.find(sb =>
            getTextPanels(sb).some(p => p.id === assetPickerPanel.panelId)
          )
          const targetPanel = targetStoryboard ? getTextPanels(targetStoryboard).find(p => p.id === assetPickerPanel.panelId) : null
          const currentPanelData = targetPanel ? getPanelEditData(targetPanel) : null

          return (
            <CharacterPickerModal
              projectId={projectId}
              currentCharacters={currentPanelData?.characters || []}
              onSelect={handleAddCharacter}
              onClose={() => setAssetPickerPanel(null)}
            />
          )
        })()}

        {/* 场景选择弹窗 */}
        {assetPickerPanel?.type === 'location' && (() => {
          const targetStoryboard = localStoryboards.find(sb =>
            getTextPanels(sb).some(p => p.id === assetPickerPanel.panelId)
          )
          const targetPanel = targetStoryboard ? getTextPanels(targetStoryboard).find(p => p.id === assetPickerPanel.panelId) : null
          const currentPanelData = targetPanel ? getPanelEditData(targetPanel) : null

          return (
            <LocationPickerModal
              projectId={projectId}
              currentLocation={currentPanelData?.location || null}
              onSelect={handleSetLocation}
              onClose={() => setAssetPickerPanel(null)}
            />
          )
        })()}
      </div>
    </StoryboardProvider>
  )
}

