'use client'

import { useTranslations } from 'next-intl'
import { useState, useRef } from 'react'
import { NovelPromotionShot, AssetLibraryCharacter, AssetLibraryLocation } from '@/types/project'
import ImagePreviewModal from '@/components/ui/ImagePreviewModal'
import { ART_STYLES } from '@/lib/constants'
import { shouldShowError } from '@/lib/error-utils'
import { useCancelGeneration } from '@/lib/query/hooks'

interface PromptsStageProps {
  projectId: string
  shots: NovelPromotionShot[]
  viewMode: 'card' | 'table'
  onViewModeChange: (mode: 'card' | 'table') => void
  onGenerateImage: (shotId: string, extraReferenceAssetIds?: string[]) => void
  onGenerateAllImages: () => void
  isGeneratingAll?: boolean
  onBack?: () => void
  onNext: () => void
  onUpdatePrompt: (shotId: string, field: 'imagePrompt', value: string) => Promise<void>
  artStyle: string  // 从项目配置中读取的风格value
  assetLibraryCharacters: AssetLibraryCharacter[]
  assetLibraryLocations: AssetLibraryLocation[]
  onAppendContent?: (content: string) => Promise<void>
}

// 注意：数据库中存储的imagePrompt是不带风格的原始提示词
// 风格（artStylePrompt）只在生成图片时临时拼接，不存储在shot.imagePrompt中
// 所以这里直接返回原始提示词即可
function parseImagePrompt(imagePrompt: string | null) {
  if (!imagePrompt) return { content: '' }
  return { content: imagePrompt }
}

export default function PromptsStage({
  projectId,
  shots,
  viewMode,
  onViewModeChange,
  onGenerateImage,
  onGenerateAllImages,
  isGeneratingAll = false,
  onBack,
  onNext,
  onUpdatePrompt,
  artStyle,
  assetLibraryCharacters,
  assetLibraryLocations,
  onAppendContent
}: PromptsStageProps) {
  const t = useTranslations('storyboard')
  const tCommon = useTranslations('common')
  // 注意：Shot图片生成状态由父组件管理，此处取消功能不会被调用
  const { cancelGeneration, isCancelling } = useCancelGeneration(projectId)
  // 根据artStyle获取风格标签
  const styleLabel = ART_STYLES.find(style => style.value === artStyle)?.label || 'Custom Style'
  const generatingCount = shots.filter(s => s.generatingImage).length
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [editingPrompt, setEditingPrompt] = useState<{ shotId: string, field: 'imagePrompt' } | null>(null)

  // 按镜头ID管理编辑状态，避免切换时互相干扰
  const [shotEditStates, setShotEditStates] = useState<Record<string, {
    editValue: string
    aiModifyInstruction: string
    selectedAssets: Array<{ id: string, name: string, description: string, type: 'character' | 'location' }>
    showAssetPicker: boolean
  }>>({})

  const [aiModifyingShots, setAiModifyingShots] = useState<Set<string>>(new Set())
  // 续写功能状态
  const [appendContent, setAppendContent] = useState('')
  const [isAppending, setIsAppending] = useState(false)
  const [shotExtraAssets, setShotExtraAssets] = useState<Record<string, string[]>>({}) // shotId -> assetIds[]
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isAnyGenerating = generatingCount > 0 || isGeneratingAll

  // 获取当前编辑镜头的状态
  const currentEditState = editingPrompt ? shotEditStates[editingPrompt.shotId] : null
  const editValue = currentEditState?.editValue || ''
  const aiModifyInstruction = currentEditState?.aiModifyInstruction || ''
  const selectedAssets = currentEditState?.selectedAssets || []
  const showAssetPicker = currentEditState?.showAssetPicker || false

  const handleStartEdit = (shotId: string, field: 'imagePrompt', currentValue: string) => {
    // 设置当前编辑的镜头
    setEditingPrompt({ shotId, field })

    // 初始化或更新该镜头的编辑状态
    setShotEditStates(prev => ({
      ...prev,
      [shotId]: {
        editValue: currentValue,
        aiModifyInstruction: prev[shotId]?.aiModifyInstruction || '',
        selectedAssets: prev[shotId]?.selectedAssets || [],
        showAssetPicker: false
      }
    }))
  }

  const handleSaveEdit = async () => {
    if (!editingPrompt) return

    const currentShotId = editingPrompt.shotId
    const currentState = shotEditStates[currentShotId]
    if (!currentState) return

    try {
      await onUpdatePrompt(editingPrompt.shotId, editingPrompt.field, currentState.editValue)

      // 如果用户使用了AI修改并引用了资产，保存这些资产ID
      if (currentState.selectedAssets.length > 0) {
        setShotExtraAssets(prev => ({
          ...prev,
          [editingPrompt.shotId]: currentState.selectedAssets.map(a => a.id)
        }))
      }

      // 只有当前编辑的还是这个镜头时才关闭
      setEditingPrompt(prev => {
        if (prev?.shotId === currentShotId) {
          return null
        }
        return prev
      })

      // 清除该镜头的编辑状态
      setShotEditStates(prev => {
        const newStates = { ...prev }
        delete newStates[currentShotId]
        return newStates
      })
    } catch (err: any) {
      if (shouldShowError(err)) {
        alert(t('prompts.updateFailed', { error: err.message }))
      }
    }
  }

  const handleCancelEdit = () => {
    if (editingPrompt) {
      // 清除该镜头的编辑状态
      setShotEditStates(prev => {
        const newStates = { ...prev }
        delete newStates[editingPrompt.shotId]
        return newStates
      })
    }
    setEditingPrompt(null)
  }

  // 处理@符号输入，显示资产选择器，并同步资产列表
  const handleModifyInstructionChange = (value: string) => {
    if (!editingPrompt) return

    const shotId = editingPrompt.shotId
    const currentState = shotEditStates[shotId]
    if (!currentState) return

    // 检测是否输入了@符号
    const lastAtIndex = value.lastIndexOf('@')
    const shouldShowPicker = lastAtIndex !== -1 && lastAtIndex === value.length - 1

    // 同步资产列表：检查已选资产的@名称是否还在文本中
    const updatedAssets = currentState.selectedAssets.filter(asset => {
      const assetMention = `@${asset.name}`
      return value.includes(assetMention)
    })

    // 更新该镜头的编辑状态
    setShotEditStates(prev => ({
      ...prev,
      [shotId]: {
        ...currentState,
        aiModifyInstruction: value,
        showAssetPicker: shouldShowPicker,
        selectedAssets: updatedAssets
      }
    }))
  }

  // 选择资产
  const handleSelectAsset = (asset: { id: string, name: string, description: string, type: 'character' | 'location' }) => {
    if (!editingPrompt) return

    const shotId = editingPrompt.shotId
    const currentState = shotEditStates[shotId]
    if (!currentState) return

    // 检查是否已经选择过这个资产
    const alreadySelected = currentState.selectedAssets.find(a => a.id === asset.id)

    // 替换最后一个@为资产名称（不添加空格）
    const lastAtIndex = currentState.aiModifyInstruction.lastIndexOf('@')
    let newInstruction = currentState.aiModifyInstruction
    if (lastAtIndex !== -1) {
      newInstruction = currentState.aiModifyInstruction.substring(0, lastAtIndex) + `@${asset.name}`
    }

    // 更新该镜头的编辑状态
    setShotEditStates(prev => ({
      ...prev,
      [shotId]: {
        ...currentState,
        aiModifyInstruction: newInstruction,
        selectedAssets: alreadySelected ? currentState.selectedAssets : [...currentState.selectedAssets, asset],
        showAssetPicker: false
      }
    }))

    // 聚焦回输入框
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }

  // AI修改提示词 - 自动保存并生成图片
  const handleAiModify = async () => {
    if (!editingPrompt) return

    const shotId = editingPrompt.shotId
    const currentState = shotEditStates[shotId]

    if (!currentState || !currentState.aiModifyInstruction.trim()) {
      alert(t("prompts.enterInstruction"))
      return
    }

    // 保存当前状态的快照，避免异步过程中状态被修改
    const snapshotEditValue = currentState.editValue
    const snapshotAiInstruction = currentState.aiModifyInstruction
    const snapshotSelectedAssets = currentState.selectedAssets

    try {
      // 标记当前shot为修改中
      setAiModifyingShots(prev => new Set(prev).add(shotId))

      // 1. 调用AI修改API
      const res = await fetch(`/api/novel-promotion/${projectId}/ai-modify-shot-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPrompt: snapshotEditValue,
          currentVideoPrompt: '',
          modifyInstruction: snapshotAiInstruction,
          referencedAssets: snapshotSelectedAssets
        })
      })

      if (!res.ok) throw new Error(t("prompts.modifyFailed", { error: '' }))

      const data = await res.json()
      const newImagePrompt = data.modifiedImagePrompt

      // 2. 自动保存新的图片提示词到数据库
      await onUpdatePrompt(shotId, 'imagePrompt', newImagePrompt)

      // 4. 保存引用的资产ID
      const assetIds = snapshotSelectedAssets.map(a => a.id)
      if (assetIds.length > 0) {
        setShotExtraAssets(prev => ({
          ...prev,
          [shotId]: assetIds
        }))
      }

      // 5. 关闭编辑模式（只有当前编辑的还是这个镜头时才关闭）
      setEditingPrompt(prev => {
        if (prev?.shotId === shotId) {
          return null
        }
        return prev
      })

      // 清除该镜头的编辑状态
      setShotEditStates(prev => {
        const newStates = { ...prev }
        delete newStates[shotId]
        return newStates
      })

      // 6. 自动触发图片生成
      await onGenerateImage(shotId, assetIds.length > 0 ? assetIds : undefined)

    } catch (error: any) {
      if (shouldShowError(error)) {
        alert(t("prompts.modifyFailed", { error: error.message }))
      }
    } finally {
      // 移除修改中标记
      setAiModifyingShots(prev => {
        const newSet = new Set(prev)
        newSet.delete(shotId)
        return newSet
      })
    }
  }

  return (
    <div className="space-y-6">
      {/* 图片预览模态框 */}
      {previewImage && (
        <ImagePreviewModal
          imageUrl={previewImage}
          onClose={() => setPreviewImage(null)}
        />
      )}

      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          {onBack && (
            <button
              onClick={onBack}
              disabled={isAnyGenerating}
              className="btn-base px-4 py-2 bg-gray-200 text-gray-700 hover:bg-gray-300 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ← {tCommon('back')}
            </button>
          )}
          <span className="text-sm text-gray-600">
            {t('header.panels')}: {shots.length}
            {generatingCount > 0 && (
              <span className="ml-2 text-blue-600 font-medium">
                ({generatingCount} {t('group.generating')})
              </span>
            )}
          </span>
          <button
            onClick={onGenerateAllImages}
            disabled={isAnyGenerating}
            className="btn-base px-4 py-2 bg-green-500 text-white hover:bg-green-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {isAnyGenerating ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {t("group.generating")}
              </>
            ) : (
              t('group.generateAll')
            )}
          </button>
        </div>

        {/* 视图切换 */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => onViewModeChange('card')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${viewMode === 'card' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
          >
            {tCommon('preview')}
          </button>
          <button
            onClick={() => onViewModeChange('table')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${viewMode === 'table' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
          >
            {t('common.status')}
          </button>
        </div>
      </div>

      {/* 卡片视图 */}
      {viewMode === 'card' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {shots.map((shot) => (
            <div key={shot.id} className="card-base overflow-hidden">
              <div className="aspect-video bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center relative">
                {shot.imageUrl ? (
                  <img
                    src={shot.imageUrl}
                    alt={`${t('panel.shot')}${shot.shotId}`}
                    className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => setPreviewImage(shot.imageUrl)}
                  />
                ) : (
                  <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
                <div className="absolute top-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs font-medium">
                  #{shot.shotId}
                </div>
                {/* 重新生成按钮 - 始终显示（生成中也可以点击） */}
                {shot.imageUrl && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onGenerateImage(shot.id, shotExtraAssets[shot.id])
                    }}
                    disabled={isGeneratingAll}
                    className="absolute top-2 right-2 bg-black/70 hover:bg-black/90 text-white p-2 rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed z-10"
                    title={t("panel.regenerateImage")}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                )}
                {shot.generatingImage && (
                  <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center">
                    <svg className="animate-spin h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        cancelGeneration({ type: 'shot_image', targetId: shot.id })
                      }}
                      disabled={isCancelling}
                      className="mt-2 px-3 py-1 text-xs bg-red-500/80 hover:bg-red-500 text-white rounded-lg transition-colors"
                    >
                      {isCancelling ? '取消中...' : '取消'}
                    </button>
                  </div>
                )}
              </div>

              <div className="p-5 space-y-4">
                {/* 图片提示词 - 移到最上方 */}
                {shot.imagePrompt && (() => {
                  const { content } = parseImagePrompt(shot.imagePrompt)
                  const isEditing = editingPrompt?.shotId === shot.id && editingPrompt?.field === 'imagePrompt'

                  return (
                    <div className="space-y-2 border-b pb-4">
                      {/* 画风标签 */}
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-md text-sm font-medium">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                          </svg>
                          {styleLabel}
                        </span>
                      </div>

                      {/* 图片提示词 */}
                      <div className="text-sm">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-gray-800 text-base">{t("prompts.imagePrompt")}</span>
                          {!isEditing && (
                            <button
                              onClick={() => handleStartEdit(shot.id, 'imagePrompt', shot.imagePrompt || '')}
                              className="text-blue-600 hover:text-blue-800 p-1.5 hover:bg-blue-50 rounded transition-colors"
                              title={t("prompts.imagePrompt")}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                          )}
                        </div>
                        {isEditing ? (
                          <div className="space-y-3">
                            {/* 当前提示词编辑 */}
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">{t("prompts.currentPrompt")}</label>
                              <textarea
                                value={editValue}
                                onChange={(e) => {
                                  if (editingPrompt) {
                                    setShotEditStates(prev => ({
                                      ...prev,
                                      [editingPrompt.shotId]: {
                                        ...prev[editingPrompt.shotId],
                                        editValue: e.target.value
                                      }
                                    }))
                                  }
                                }}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none"
                                rows={4}
                                autoFocus
                              />
                            </div>

                            {/* AI修改区域 */}
                            <div className="border-t pt-3">
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                {t("prompts.aiInstruction")} <span className="text-gray-400">{t("prompts.supportReference")}</span>
                              </label>
                              <div className="relative">
                                <textarea
                                  ref={textareaRef}
                                  value={aiModifyInstruction}
                                  onChange={(e) => handleModifyInstructionChange(e.target.value)}
                                  placeholder={t("prompts.instructionPlaceholder")}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm resize-none"
                                  rows={2}
                                />

                                {/* 资产选择器下拉 */}
                                {showAssetPicker && (
                                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                    <div className="p-2">
                                      <div className="text-xs font-medium text-gray-500 mb-2">{t("prompts.selectAsset")}</div>

                                      {/* 人物列表 */}
                                      {assetLibraryCharacters.length > 0 && (
                                        <div className="mb-2">
                                          <div className="text-xs text-gray-400 mb-1">{t("prompts.character")}</div>
                                          {assetLibraryCharacters.map(char => (
                                            <button
                                              key={char.id}
                                              onClick={() => handleSelectAsset({
                                                id: char.id,
                                                name: char.name,
                                                description: char.description,
                                                type: 'character'
                                              })}
                                              className="w-full text-left px-2 py-1.5 hover:bg-purple-50 rounded text-sm"
                                            >
                                              {char.name}
                                            </button>
                                          ))}
                                        </div>
                                      )}

                                      {/* 场景列表 */}
                                      {assetLibraryLocations.length > 0 && (
                                        <div>
                                          <div className="text-xs text-gray-400 mb-1">{t("prompts.location")}</div>
                                          {assetLibraryLocations.map(loc => {
                                            // 从 images 数组获取描述（如果有的话），否则使用旧的 description 字段
                                            const locAny = loc as any
                                            const selectedImage = locAny.images?.find((img: any) => img.isSelected) || locAny.images?.[0]
                                            const description = selectedImage?.description || locAny.description || ''
                                            return (
                                              <button
                                                key={loc.id}
                                                onClick={() => handleSelectAsset({
                                                  id: loc.id,
                                                  name: loc.name,
                                                  description,
                                                  type: 'location'
                                                })}
                                                className="w-full text-left px-2 py-1.5 hover:bg-blue-50 rounded text-sm"
                                              >
                                                {loc.name}
                                              </button>
                                            )
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* 已选资产标签 - 低饱和度设计 */}
                              {selectedAssets.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-3 p-2.5 bg-slate-50/50 rounded-lg border border-slate-200">
                                  <div className="text-xs text-slate-500 font-medium w-full mb-1">{t("prompts.referencedAssets")}</div>
                                  {selectedAssets.map((asset, index) => (
                                    <span
                                      key={asset.id}
                                      className={`group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${asset.type === 'character'
                                        ? 'bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200 hover:border-slate-400'
                                        : 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 hover:border-blue-300'
                                        }`}
                                    >
                                      <span className="text-sm opacity-70">{asset.type === 'character' ? '👤' : '📍'}</span>
                                      <span>{asset.name}</span>
                                      <button
                                        onClick={() => {
                                          if (editingPrompt) {
                                            const currentState = shotEditStates[editingPrompt.shotId]
                                            if (currentState) {
                                              // 从指令文本中移除所有@资产名（使用正则全局替换）
                                              const assetMention = `@${asset.name}`
                                              const regex = new RegExp(assetMention.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
                                              const newInstruction = currentState.aiModifyInstruction.replace(regex, '').replace(/\s+/g, ' ').trim()

                                              setShotEditStates(prev => ({
                                                ...prev,
                                                [editingPrompt.shotId]: {
                                                  ...currentState,
                                                  selectedAssets: currentState.selectedAssets.filter((_, i) => i !== index),
                                                  aiModifyInstruction: newInstruction
                                                }
                                              }))
                                            }
                                          }
                                        }}
                                        className="ml-0.5 hover:bg-slate-300/50 rounded p-0.5 transition-colors"
                                        title={t("prompts.removeAsset")}
                                      >
                                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                        </svg>
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              )}

                              <button
                                onClick={handleAiModify}
                                disabled={editingPrompt ? aiModifyingShots.has(editingPrompt.shotId) || !aiModifyInstruction.trim() : true}
                                className="mt-2 w-full px-3 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg text-sm font-medium hover:from-purple-700 hover:to-pink-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md"
                                title={t("prompts.aiModifyTip")}
                              >
                                {editingPrompt && aiModifyingShots.has(editingPrompt.shotId) ? (
                                  <>
                                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    {t("prompts.aiModifying")}
                                  </>
                                ) : (
                                  <>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                    {t("prompts.aiModify")}
                                  </>
                                )}
                              </button>
                              <p className="text-xs text-gray-500 mt-1 text-center">
                                {t("prompts.aiModifyTip")}
                              </p>
                            </div>

                            {/* 保存/取消按钮 */}
                            <div className="flex gap-2 pt-2 border-t">
                              <button
                                onClick={handleSaveEdit}
                                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                              >
                                {t("prompts.save")}
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors"
                              >
                                {t("common.cancel")}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-gray-700 leading-relaxed">{content}</p>
                        )}
                      </div>
                    </div>
                  )
                })()}

                {/* 基础信息 - 紧凑布局 */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 font-medium">SRT:</span>
                    <span className="text-gray-800">{shot.srtStart}-{shot.srtEnd}</span>
                    <span className="text-gray-500">({shot.srtDuration?.toFixed(1)}s)</span>
                  </div>

                  {shot.scale && (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 font-medium">{t("panel.shotType")}</span>
                      <span className="text-gray-800">{shot.scale}</span>
                    </div>
                  )}

                  {shot.locations && (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 font-medium">{t("panel.location")}</span>
                      <span className="text-gray-800">{shot.locations}</span>
                    </div>
                  )}

                  {shot.module && (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 font-medium">{t("panel.mode")}</span>
                      <span className="text-gray-800">{shot.module}</span>
                    </div>
                  )}

                  {shot.characters && (
                    <div className="col-span-2 flex items-center gap-2">
                      <span className="text-gray-500 font-medium">{t("panel.characters")}</span>
                      <span className="text-gray-800">
                        {JSON.parse(shot.characters).join(', ')}
                      </span>
                    </div>
                  )}

                  {shot.pov && (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 font-medium">{t("panel.pov")}</span>
                      <span className="text-gray-800">{shot.pov}</span>
                    </div>
                  )}

                  {shot.focus && (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 font-medium">{t("panel.focus")}</span>
                      <span className="text-gray-800">{shot.focus}</span>
                    </div>
                  )}
                </div>

                {/* 剧情和总结 - 完整宽度 */}
                {(shot.plot || shot.zhSummarize) && (
                  <div className="space-y-2 text-sm">
                    {shot.plot && (
                      <div>
                        <span className="text-gray-500 font-medium">{t("panel.plot")} </span>
                        <span className="text-gray-800">{shot.plot}</span>
                      </div>
                    )}
                    {shot.zhSummarize && (
                      <div>
                        <span className="text-gray-500 font-medium">{t("panel.summary")} </span>
                        <span className="text-gray-800">{shot.zhSummarize}</span>
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={() => onGenerateImage(shot.id, shotExtraAssets[shot.id])}
                  disabled={shot.generatingImage || isGeneratingAll}
                  className="btn-base w-full py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: shot.imageUrl ? '#10b981' : shot.generatingImage ? '#6b7280' : '#3b82f6',
                    color: 'white'
                  }}
                >
                  {shot.imageUrl ? t("group.hasSynced") : shot.generatingImage ? t("group.generating") : t("assets.location.generateImage")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 表格视图 */}
      {viewMode === 'table' && (
        <div className="card-base overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t("panel.shot")}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t("common.preview")}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SRT</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t("panel.segment")}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t("insert.location")}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t("insert.characters")}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t("panel.plot")}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t("panel.shotMode")}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t("panel.stylePrompt")}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {shots.map((shot) => {
                  const { content } = parseImagePrompt(shot.imagePrompt)

                  return (
                    <tr key={shot.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                        #{shot.shotId}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="w-20 h-12 bg-gray-200 rounded overflow-hidden">
                          {shot.imageUrl ? (
                            <img
                              src={shot.imageUrl}
                              alt={`${t('panel.shot')}${shot.shotId}`}
                              className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => setPreviewImage(shot.imageUrl)}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {shot.srtStart}-{shot.srtEnd}
                        <div className="text-xs text-gray-400">{shot.srtDuration?.toFixed(1)}s</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                        {shot.sequence}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {shot.locations}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {shot.characters && JSON.parse(shot.characters).join(', ')}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-md">
                        <div className="line-clamp-2">{shot.plot || shot.zhSummarize}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        <div>{shot.scale}</div>
                        <div className="text-xs text-gray-400">{shot.module}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-md">
                        {/* 画风标签 */}
                        <div className="mb-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                            </svg>
                            {styleLabel}
                          </span>
                        </div>
                        {/* 提示词内容 */}
                        <div className="flex items-center gap-1">
                          <div className="line-clamp-2 text-xs flex-1">{content}</div>
                          <button
                            onClick={() => handleStartEdit(shot.id, 'imagePrompt', shot.imagePrompt || '')}
                            className="text-blue-600 hover:text-blue-800 p-1 flex-shrink-0"
                            title={t("prompts.imagePrompt")}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => onGenerateImage(shot.id, shotExtraAssets[shot.id])}
                            disabled={shot.generatingImage || isGeneratingAll}
                            className="btn-base px-3 py-1 text-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1"
                            style={{
                              background: shot.imageUrl ? '#10b981' : shot.generatingImage ? '#6b7280' : '#3b82f6',
                              color: 'white'
                            }}
                          >
                            {shot.generatingImage ? (
                              <>
                                <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span>生成中</span>
                              </>
                            ) : shot.imageUrl ? (
                              <>
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                <span>{t("common.regenerate")}</span>
                              </>
                            ) : (
                              <span>{t("common.generate")}</span>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 续写功能区域 */}
      {onAppendContent && (
        <div className="mt-8 p-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">📝 续写内容</h3>
          <p className="text-sm text-gray-600 mb-4">
            输入新的SRT内容，系统会自动切分并生成新的镜头，追加到当前列表末尾
          </p>
          <textarea
            value={appendContent}
            onChange={(e) => setAppendContent(e.target.value)}
            placeholder="粘贴新的SRT内容..."
            disabled={isAppending}
            className="w-full h-48 p-4 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed font-mono text-sm"
          />
          <div className="flex justify-end mt-4">
            <button
              onClick={async () => {
                if (!appendContent.trim()) {
                  alert(t("prompts.enterContinuation"))
                  return
                }
                setIsAppending(true)
                try {
                  await onAppendContent(appendContent.trim())
                  setAppendContent('')
                  alert('续写成功！新镜头已追加到列表末尾')
                } catch (error: any) {
                  if (shouldShowError(error)) {
                    alert('续写失败: ' + error.message)
                  }
                } finally {
                  setIsAppending(false)
                }
              }}
              disabled={isAppending || !appendContent.trim()}
              className="btn-base px-6 py-3 bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {isAppending ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  处理中...
                </>
              ) : (
                '✨ 续写并生成镜头'
              )}
            </button>
          </div>
        </div>
      )}

      {/* 底部操作栏 */}
      <div className="flex justify-end items-center pt-4">
        <button
          onClick={onNext}
          disabled={isAnyGenerating}
          className="btn-base px-6 py-2 bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          进入视频生成 →
        </button>
      </div>
    </div>
  )
}
