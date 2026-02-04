'use client'

import { useTranslations } from 'next-intl'
/**
 * 角色卡片组件 - 支持多图片选择和音色设置
 * 布局：上面名字+描述，下面三张图片（每张图片有独立的编辑和重新生成按钮）
 */

import { useState, useRef } from 'react'
import { Character, CharacterAppearance } from '@/types/project'
import { shouldShowError } from '@/lib/error-utils'
import VoiceSettings from './VoiceSettings'
import { useUploadProjectCharacterImage } from '@/lib/query/mutations'
import { useCancelGeneration } from '@/lib/query/hooks'

interface CharacterCardProps {
  character: Character
  appearance: CharacterAppearance
  onEdit: () => void
  onDelete: () => void
  onDeleteAppearance?: () => void  // 删除单个形象
  onRegenerate: () => void
  onGenerate: () => void
  onUndo?: () => void  // 撤回到上一版本
  onImageClick: (imageUrl: string) => void
  showDeleteButton: boolean
  appearanceCount?: number  // 该角色的形象数量
  onSelectImage?: (characterId: string, appearanceId: string, imageIndex: number | null) => void
  onEditDescription?: (characterId: string, appearanceIndex: number, descriptionIndex: number) => void
  onRegenerateSingle?: (characterId: string, appearanceId: string, imageIndex: number) => void
  regeneratingItems?: Set<string>
  onClearRegenerating?: (key: string) => void  // 🆕 取消生成后清除本地状态
  onImageEdit?: (characterId: string, appearanceId: string, imageIndex: number) => void
  isPrimaryAppearance?: boolean
  primaryAppearanceSelected?: boolean
  primaryAppearanceImageUrl?: string | null
  projectId: string
  onConfirmSelection?: (characterId: string, appearanceId: string) => void  // 确认选择
  // 音色相关
  onVoiceChange?: (characterId: string, customVoiceUrl?: string) => void
  onVoiceDesign?: (characterId: string, characterName: string) => void  // AI 声音设计
  onVoiceSelectFromHub?: (characterId: string) => void  // 从资产中心选择音色
}

export default function CharacterCard({
  character,
  appearance,
  onEdit,
  onDelete,
  onDeleteAppearance,
  onRegenerate,
  onGenerate,
  onUndo,
  onImageClick,
  showDeleteButton,
  appearanceCount = 1,
  onSelectImage,
  onEditDescription,
  onRegenerateSingle,
  regeneratingItems = new Set(),
  onClearRegenerating,
  onImageEdit,
  isPrimaryAppearance = false,
  primaryAppearanceSelected = false,
  primaryAppearanceImageUrl = null,
  projectId,
  onConfirmSelection,
  onVoiceChange,
  onVoiceDesign,
  onVoiceSelectFromHub
}: CharacterCardProps) {
  // 🔥 使用 mutation
  const uploadImage = useUploadProjectCharacterImage(projectId)
  const { cancelGeneration, isCancelling } = useCancelGeneration(projectId)
  const t = useTranslations('assets')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingUploadIndex, setPendingUploadIndex] = useState<number | undefined>(undefined)
  const [showDeleteMenu, setShowDeleteMenu] = useState(false)
  const [isConfirmingSelection, setIsConfirmingSelection] = useState(false)

  // 处理删除按钮点击
  const handleDeleteClick = () => {
    if (appearanceCount <= 1) {
      // 只有一个形象，直接删除角色
      onDelete()
    } else {
      // 多个形象，显示菜单
      setShowDeleteMenu(!showDeleteMenu)
    }
  }

  // 触发文件选择
  const triggerUpload = (imageIndex?: number) => {
    setPendingUploadIndex(imageIndex)
    fileInputRef.current?.click()
  }

  // 处理图片上传
  const handleUpload = () => {
    const file = fileInputRef.current?.files?.[0]
    if (!file) return

    const uploadIndex = pendingUploadIndex

    uploadImage.mutate(
      {
        file,
        characterId: character.id,
        appearanceId: appearance.id,
        imageIndex: uploadIndex,
        labelText: `${character.name} - ${appearance.changeReason}`
      },
      {
        onSuccess: () => {
          alert(t('image.uploadSuccess'))
        },
        onError: (error) => {
          if (shouldShowError(error)) {
            alert(t('image.uploadFailed') + ': ' + error.message)
          }
        },
        onSettled: () => {
          setPendingUploadIndex(undefined)
          if (fileInputRef.current) {
            fileInputRef.current.value = ''
          }
        }
      }
    )
  }

  // 音色设置由 VoiceSettings 组件处理

  // 获取图片数组（已经是数组，不需要 JSON 解析）
  const rawImageUrls = appearance.imageUrls || []
  const imageUrlsWithIndex = rawImageUrls
    .map((url, idx) => ({ url, originalIndex: idx }))
    .filter((item) => item.url !== null) as { url: string; originalIndex: number }[]

  const hasMultipleImages = imageUrlsWithIndex.length > 1
  const selectedIndex = appearance.selectedIndex ?? null

  // 🔥 统一图片URL优先级：imageUrl > imageUrls[selectedIndex] > imageUrls[0]
  // 这样确保编辑后的新图片能正确显示
  const currentImageUrl = appearance.imageUrl ||
    (selectedIndex !== null ? rawImageUrls[selectedIndex] : null) ||
    imageUrlsWithIndex[0]?.url

  // 调试日志
  if (!currentImageUrl && !appearance.generating) {
    console.log(`[CharacterCard调试] ${character.name}-${appearance.changeReason}:`, {
      imageUrl: appearance.imageUrl,
      imageUrls: appearance.imageUrls,
      rawImageUrls,
      imageUrlsWithIndex,
      currentImageUrl
    })
  }

  const showSelectionMode = hasMultipleImages

  const isImageRegenerating = (imageIndex: number) => {
    return regeneratingItems.has(`character-${character.id}-${appearance.appearanceIndex}-${imageIndex}`)
  }

  const isGroupRegenerating = regeneratingItems.has(`character-${character.id}-${appearance.appearanceIndex}-group`)

  const isAnyRegenerating = isGroupRegenerating || Array.from(regeneratingItems).some(key =>
    key.startsWith(`character-${character.id}-${appearance.appearanceIndex}`)
  )

  // 注意：不再使用 editingItems，生成/编辑状态直接由 appearance.generating 提供

  // 选择模式：显示名字+描述在上，三张图片在下
  if (showSelectionMode) {
    return (
      <div className="col-span-3 bg-white rounded-lg border-2 border-gray-200 p-4 shadow-sm transition-all">
        {/* 隐藏的文件输入 */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={() => handleUpload()}
          className="hidden"
        />

        {/* 顶部：名字 + 描述 + 操作按钮 */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-gray-900">{character.name}</span>
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{appearance.changeReason}</span>
              {isPrimaryAppearance ? (
                <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded">{t("character.primary")}</span>
              ) : (
                <span className="text-xs text-purple-600 bg-purple-100 px-2 py-0.5 rounded">{t("character.secondary")}</span>
              )}
            </div>
            <div className="text-xs text-gray-500">
              {selectedIndex !== null ? t('image.optionSelected', { number: selectedIndex + 1 }) : t("image.selectFirst")}
            </div>
          </div>
          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={onRegenerate}
              disabled={appearance.generating || isAnyRegenerating || uploadImage.isPending}
              className="w-6 h-6 rounded hover:bg-blue-100 flex items-center justify-center transition-colors disabled:opacity-50"
              title={t("image.regenerateGroup")}
            >
              {isGroupRegenerating ? (
                <svg className="animate-spin w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
            </button>
            {/* 撤回按钮 - 只有有历史版本时才显示 */}
            {onUndo && (appearance.previousImageUrl || appearance.previousImageUrls) && (
              <button
                onClick={onUndo}
                disabled={appearance.generating || isAnyRegenerating}
                className="w-6 h-6 rounded hover:bg-orange-100 flex items-center justify-center transition-colors disabled:opacity-50"
                title={t("image.undo")}
              >
                <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
              </button>
            )}
            {showDeleteButton && (
              <button
                onClick={onDelete}
                className="w-6 h-6 rounded hover:bg-red-100 flex items-center justify-center transition-colors"
                title={t("character.delete")}
              >
                <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* 图片列表 - 简化版：只显示选择功能 */}
        <div className="grid grid-cols-3 gap-3">
          {imageUrlsWithIndex.map(({ url, originalIndex }) => {
            const isThisSelected = selectedIndex === originalIndex
            const isThisRegenerating = isImageRegenerating(originalIndex) || isGroupRegenerating
            return (
              <div key={originalIndex} className="relative group/thumb">
                {/* 图片容器 - 点击放大预览 */}
                <div
                  onClick={() => onImageClick(url)}
                  className={`rounded-lg overflow-hidden border-2 transition-all cursor-pointer relative ${isThisSelected
                    ? 'border-green-500 ring-2 ring-green-300'
                    : 'border-gray-200 hover:border-blue-500'
                    }`}
                >
                  <img
                    src={url}
                    alt={`${character.name} - ${t('image.optionNumber', { number: originalIndex + 1 })}`}
                    className="w-full h-auto object-contain"
                  />

                  {isThisRegenerating && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <div className="text-center">
                        <svg className="animate-spin h-8 w-8 text-white mx-auto mb-2" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <div className="text-white text-xs">{t("video.panelCard.generating")}</div>
                      </div>
                    </div>
                  )}

                  {/* 方案编号 */}
                  <div
                    className={`absolute bottom-2 left-2 text-white text-xs px-2 py-0.5 rounded ${isThisSelected ? 'bg-green-500' : 'bg-black/70'
                      }`}
                  >
                    {t('image.optionNumber', { number: originalIndex + 1 })}{isThisSelected ? ' ✓' : ''}
                  </div>

                  {/* 选择按钮 - 点击选择/取消选择 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation() // 阻止触发父元素的放大预览
                      if (!isThisRegenerating) {
                        onSelectImage?.(character.id, appearance.id, isThisSelected ? null : originalIndex)
                      }
                    }}
                    disabled={isThisRegenerating}
                    className={`absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center transition-all shadow-sm ${isThisSelected
                      ? 'bg-green-500 text-white'
                      : 'bg-white/90 hover:bg-blue-500 hover:text-white'
                      } disabled:opacity-50`}
                    title={isThisSelected ? t('image.cancelSelection') : t("image.useThis")}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* 提示：选择后可编辑 */}
        <div className="mt-3 text-xs text-gray-400 text-center">
          {t("image.selectTip")}
        </div>

        {/* 确定选择按钮 - 选择图片后显示 */}
        {
          selectedIndex !== null && (
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => {
                  setIsConfirmingSelection(true)
                  onConfirmSelection?.(character.id, appearance.id)
                }}
                disabled={isConfirmingSelection}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium"
              >
                {isConfirmingSelection ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {t("character.confirming")}
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {t('image.confirmOption', { number: selectedIndex + 1 })}
                  </>
                )}
              </button>
            </div>
          )
        }

        {/* 音色设置区域 (选择模式下) */}
        {
          isPrimaryAppearance && (
            <VoiceSettings
              characterId={character.id}
              characterName={character.name}
              customVoiceUrl={character.customVoiceUrl}
              projectId={projectId}
              onVoiceChange={onVoiceChange}
              onVoiceDesign={onVoiceDesign}
              onSelectFromHub={onVoiceSelectFromHub}
            />
          )
        }
      </div>
    )
  }

  // 单图模式或已选择模式
  return (
    <div className="flex flex-col gap-2">
      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={() => handleUpload()}
        className="hidden"
      />
      <div className="relative">
        <div className="rounded-lg overflow-hidden border-2 border-gray-200 relative">
          {currentImageUrl ? (
            <div className="relative w-full">
              <img
                src={currentImageUrl}
                alt={`${character.name} - ${appearance.changeReason}`}
                className="w-full h-auto object-contain cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => onImageClick(currentImageUrl)}
              />
              {(appearance.generating || isGroupRegenerating) && (
                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center">
                  <svg className="animate-spin h-8 w-8 text-white mb-2" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <div className="text-white text-xs mb-2">{t("video.panelCard.generating")}</div>
                  <button
                    onClick={() => cancelGeneration({
                      type: 'character_appearance',
                      targetId: appearance.id,
                      onSuccess: () => {
                        // 🆕 清除本地 regeneratingItems 状态
                        onClearRegenerating?.(`character-${character.id}-${appearance.appearanceIndex}-group`)
                      }
                    })}
                    disabled={isCancelling}
                    className="px-3 py-1 text-xs bg-red-500/80 hover:bg-red-500 text-white rounded-lg transition-colors"
                  >
                    {isCancelling ? '取消中...' : '取消'}
                  </button>
                </div>
              )}
              {selectedIndex !== null && hasMultipleImages && (
                <div className="absolute bottom-2 left-2 bg-green-500 text-white text-xs px-2 py-0.5 rounded">
                  {t('image.optionNumber', { number: selectedIndex + 1 })}
                </div>
              )}
            </div>
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-purple-200 to-pink-200 flex items-center justify-center">
              {(appearance.generating || isGroupRegenerating) ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <svg className="animate-spin h-8 w-8 text-gray-600 mb-2" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <div className="text-gray-600 text-xs mb-2">{t("video.panelCard.generating")}</div>
                  <button
                    onClick={() => cancelGeneration({
                      type: 'character_appearance',
                      targetId: appearance.id,
                      onSuccess: () => {
                        // 🆕 清除本地 regeneratingItems 状态
                        onClearRegenerating?.(`character-${character.id}-${appearance.appearanceIndex}-group`)
                      }
                    })}
                    disabled={isCancelling}
                    className="px-3 py-1 text-xs bg-red-500/80 hover:bg-red-500 text-white rounded-lg transition-colors"
                  >
                    {isCancelling ? '取消中...' : '取消'}
                  </button>
                </div>
              ) : appearance.imageErrorMessage ? (
                // 🔥 显示错误信息
                <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                  <svg className="w-8 h-8 text-red-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div className="text-red-600 text-xs font-medium mb-1">{t("common.generateFailed")}</div>
                  <div className="text-red-500 text-xs max-w-full break-words">{appearance.imageErrorMessage}</div>
                </div>
              ) : (
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              )}
            </div>
          )}

          {/* 上传和操作按钮 - 非生成状态时显示 */}
          {!appearance.generating && (
            <div className="absolute top-2 left-2 flex gap-1">
              {/* 上传按钮 - 仅在非生成状态显示 */}
              {!appearance.generating && !isAnyRegenerating && (
                <button
                  onClick={() => triggerUpload(selectedIndex !== null ? selectedIndex : 0)}
                  disabled={uploadImage.isPending || appearance.generating || isAnyRegenerating}
                  className="w-7 h-7 rounded-full bg-white/90 hover:bg-green-500 hover:text-white flex items-center justify-center transition-all shadow-sm disabled:opacity-50"
                  title={currentImageUrl ? t("image.uploadReplace") : t("image.upload")}
                >
                  {uploadImage.isPending ? (
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                  )}
                </button>
              )}
              {/* 编辑图片按钮 - 仅在非生成状态有图片时显示 */}
              {!appearance.generating && !isAnyRegenerating && currentImageUrl && onImageEdit && (
                <button
                  onClick={() => onImageEdit(character.id, appearance.id, selectedIndex !== null ? selectedIndex : 0)}
                  className="w-7 h-7 rounded-full bg-purple-500/90 hover:bg-purple-500 flex items-center justify-center transition-all shadow-sm"
                  title={t("image.edit")}
                >
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              )}
              {/* 重新生成按钮 - 始终显示，点击时有缩放反馈 */}
              <button
                onClick={onRegenerate}
                disabled={uploadImage.isPending || appearance.generating}
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-all shadow-sm active:scale-90 ${(appearance.generating || isAnyRegenerating)
                  ? 'bg-green-500 hover:bg-green-600'
                  : 'bg-white/90 hover:bg-white'
                  }`}
                title={(appearance.generating || isAnyRegenerating) ? t("image.regenerateStuck") : t("location.regenerateImage")}
              >
                {isGroupRegenerating ? (
                  <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className={`w-4 h-4 ${(appearance.generating || isAnyRegenerating) ? 'text-white' : 'text-gray-700'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
              </button>
              {/* 撤回按钮 - 单图模式，只有有历史版本且非生成状态时显示 */}
              {!appearance.generating && !isAnyRegenerating && currentImageUrl && onUndo && (appearance.previousImageUrl || appearance.previousImageUrls) && (
                <button
                  onClick={onUndo}
                  disabled={appearance.generating || isAnyRegenerating}
                  className="w-7 h-7 rounded-full bg-white/90 hover:bg-orange-500 hover:text-white flex items-center justify-center transition-all shadow-sm disabled:opacity-50"
                  title={t("image.undo")}
                >
                  <svg className="w-4 h-4 text-orange-500 hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                </button>
              )}
            </div>
          )}

        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-1">
          <div className="text-xs font-semibold text-gray-900 truncate" title={character.name}>
            {character.name}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onEdit}
              className="flex-shrink-0 w-5 h-5 rounded hover:bg-gray-100 flex items-center justify-center transition-colors"
              title={t("video.panelCard.editPrompt")}
            >
              <svg className="w-3.5 h-3.5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
            {showDeleteButton && (
              <div className="relative">
                <button
                  onClick={handleDeleteClick}
                  className="flex-shrink-0 w-5 h-5 rounded hover:bg-red-100 flex items-center justify-center transition-colors"
                  title={appearanceCount <= 1 ? t("character.delete") : t("character.deleteOptions")}
                >
                  <svg className="w-3.5 h-3.5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>

                {/* 删除菜单 */}
                {showDeleteMenu && appearanceCount > 1 && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowDeleteMenu(false)}
                    />
                    <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[100px]">
                      <button
                        onClick={() => {
                          setShowDeleteMenu(false)
                          onDeleteAppearance?.()
                        }}
                        className="w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-100 whitespace-nowrap"
                      >
                        {t("image.deleteThis")}
                      </button>
                      <button
                        onClick={() => {
                          setShowDeleteMenu(false)
                          onDelete()
                        }}
                        className="w-full px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 whitespace-nowrap"
                      >
                        {t("character.deleteWhole")}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="text-xs text-gray-600 truncate" title={appearance.changeReason}>
          {appearance.changeReason}
        </div>
      </div>

      {/* 音色设置区域 - 使用 VoiceSettings 组件 */}
      {isPrimaryAppearance && (
        <VoiceSettings
          characterId={character.id}
          characterName={character.name}
          customVoiceUrl={character.customVoiceUrl}
          projectId={projectId}
          onVoiceChange={onVoiceChange}
          onVoiceDesign={onVoiceDesign}
          onSelectFromHub={onVoiceSelectFromHub}
          compact={true}
        />
      )}

      {!isPrimaryAppearance && !primaryAppearanceSelected ? (
        <div className="w-full py-2 text-xs text-center text-gray-500 bg-gray-100 rounded border border-dashed border-gray-300">
          <div className="flex items-center justify-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            {t("character.selectPrimaryFirst")}
          </div>
        </div>
      ) : (
        /* 只有在没有图片且不在生成中时才显示生成按钮 */
        !currentImageUrl && !appearance.generating && !isAnyRegenerating && (
          <button
            type="button"
            onClick={onGenerate}
            disabled={!appearance.description}
            className="btn-base w-full py-1 text-xs disabled:opacity-50"
            style={{
              background: isPrimaryAppearance ? '#3b82f6' : '#8b5cf6',
              color: 'white'
            }}
          >
            {isPrimaryAppearance ? t("common.generate") : t("character.generateFromPrimary")}
          </button>
        )
      )}
    </div>
  )
}
