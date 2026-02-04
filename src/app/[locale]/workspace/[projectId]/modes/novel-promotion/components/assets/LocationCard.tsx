'use client'

import { useTranslations } from 'next-intl'
/**
 * 场景卡片组件 - 支持多图片选择
 * 布局：上面名字+描述，下面三张图片
 */

import { useState, useRef } from 'react'
import { Location, LocationImage } from '@/types/project'
import { shouldShowError } from '@/lib/error-utils'
import { useUploadProjectLocationImage } from '@/lib/query/mutations'
import { useCancelGeneration } from '@/lib/query/hooks'

interface LocationCardProps {
  location: Location
  onEdit: () => void
  onDelete: () => void
  onRegenerate: () => void
  onGenerate: () => void
  onUndo?: () => void  // 撤回到上一版本
  onImageClick: (imageUrl: string) => void
  onSelectImage?: (locationId: string, imageIndex: number | null) => void
  onEditDescription?: (locationId: string, imageIndex: number) => void
  onRegenerateSingle?: (locationId: string, imageIndex: number) => void
  onImageEdit?: (locationId: string, imageIndex: number) => void  // 新增：图片编辑
  onCopyFromGlobal?: () => void
  regeneratingItems?: Set<string>
  onClearRegenerating?: (key: string) => void  // 🆕 取消生成后清除本地状态
  projectId: string
  onConfirmSelection?: (locationId: string) => void
}

export default function LocationCard({
  location,
  onEdit,
  onDelete,
  onRegenerate,
  onGenerate,
  onUndo,
  onImageClick,
  onSelectImage,
  onEditDescription,
  onRegenerateSingle,
  onImageEdit,
  onCopyFromGlobal,
  regeneratingItems = new Set(),
  onClearRegenerating,
  projectId,
  onConfirmSelection
}: LocationCardProps) {
  // 🔥 使用 mutation
  const uploadImage = useUploadProjectLocationImage(projectId)
  const { cancelGeneration, isCancelling } = useCancelGeneration(projectId)
  const t = useTranslations('assets')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingUploadIndex, setPendingUploadIndex] = useState<number | undefined>(undefined)
  const [isConfirmingSelection, setIsConfirmingSelection] = useState(false)

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
        locationId: location.id,
        imageIndex: uploadIndex,
        labelText: location.name
      },
      {
        onSuccess: () => {
          alert('上传成功！')
        },
        onError: (error) => {
          if (shouldShowError(error)) {
            alert('上传失败: ' + error.message)
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

  // 获取有图片的记录
  const imagesWithUrl = location.images?.filter(img => img.imageUrl) || []
  const hasMultipleImages = imagesWithUrl.length > 1

  // 获取选中的图片
  const selectedImage = location.images?.find(img => img.isSelected)
  const selectedIndex = selectedImage?.imageIndex ?? null

  // 当前显示的图片及其 imageIndex
  const currentImageUrl = selectedImage?.imageUrl || imagesWithUrl[0]?.imageUrl || null
  const currentImageIndex = selectedIndex ?? imagesWithUrl[0]?.imageIndex ?? 0

  const isImageRegenerating = (imageIndex: number) => {
    return regeneratingItems.has(`location-${location.id}-${imageIndex}`)
  }

  const isGroupRegenerating = regeneratingItems.has(`location-${location.id}-group`)

  const isAnyRegenerating = isGroupRegenerating || Array.from(regeneratingItems).some(key =>
    key.startsWith(`location-${location.id}`)
  )

  // 注意：不再使用 editingItems，生成/编辑状态直接由 isAnyGenerating 提供

  // 组合检查：数据库字段 + 前端状态
  const isAnyGenerating = (location.images?.some(img => img.generating) || false) || isAnyRegenerating

  // 检查是否有历史版本（用于撤回功能）
  const hasPreviousVersion = location.images?.some(img => img.previousImageUrl) || false

  const showSelectionMode = hasMultipleImages

  // 选择模式：显示名字在上，三张图片在下
  if (showSelectionMode) {
    return (
      <div className="col-span-3 bg-white/70 backdrop-blur-xl border border-white/60 rounded-2xl p-4 shadow-lg shadow-slate-200/30 transition-all">
        {/* 隐藏的文件输入 */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={() => handleUpload()}
          className="hidden"
        />
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-gray-900">{location.name}</span>
            </div>
            {location.summary && (
              <div className="text-xs text-gray-600 mb-1" title={location.summary}>
                {location.summary}
              </div>
            )}
            <div className="text-xs text-gray-500">
              {selectedIndex !== null ? `已选择方案${selectedIndex + 1}` : t("image.selectFirst")}
            </div>
          </div>
          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={onRegenerate}
              disabled={isAnyGenerating || isAnyRegenerating || uploadImage.isPending}
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
            {onUndo && hasPreviousVersion && (
              <button
                onClick={onUndo}
                disabled={isAnyGenerating || isAnyRegenerating}
                className="w-6 h-6 rounded hover:bg-orange-100 flex items-center justify-center transition-colors disabled:opacity-50"
                title={t("image.undo")}
              >
                <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
              </button>
            )}
            <button
              onClick={onDelete}
              className="w-6 h-6 rounded hover:bg-red-100 flex items-center justify-center transition-colors"
              title={t("location.delete")}
            >
              <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* 图片列表 - 简化版：只显示选择功能 */}
        <div className="grid grid-cols-3 gap-3">
          {imagesWithUrl.map((img) => {
            const isThisSelected = img.isSelected
            const isThisRegenerating = isImageRegenerating(img.imageIndex) || isGroupRegenerating
            return (
              <div key={img.id} className="relative group/thumb">
                {/* 图片容器 - 点击放大预览 */}
                <div
                  onClick={() => onImageClick(img.imageUrl!)}
                  className={`rounded-lg overflow-hidden border-2 transition-all cursor-pointer relative ${isThisSelected
                    ? 'border-green-500 ring-2 ring-green-300'
                    : 'border-gray-200 hover:border-blue-500'
                    }`}
                >
                  <img
                    src={img.imageUrl!}
                    alt={`${location.name} - 方案${img.imageIndex + 1}`}
                    className="w-full h-auto object-contain"
                  />

                  {isThisRegenerating && (
                    <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center">
                      <svg className="animate-spin h-8 w-8 text-white mb-2" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <div className="text-white text-xs mb-2">{t("video.panelCard.generating")}</div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          cancelGeneration({
                            type: 'location_image',
                            targetId: img.id,
                            onSuccess: () => {
                              // 🆕 清除本地 regeneratingItems 状态
                              onClearRegenerating?.(`location-${location.id}-${img.imageIndex}`)
                              onClearRegenerating?.(`location-${location.id}-group`)
                            }
                          })
                        }}
                        disabled={isCancelling}
                        className="px-3 py-1 text-xs bg-red-500/80 hover:bg-red-500 text-white rounded-lg transition-colors"
                      >
                        {isCancelling ? '取消中...' : '取消'}
                      </button>
                    </div>
                  )}

                  {/* 方案编号 */}
                  <div
                    className={`absolute bottom-2 left-2 text-white text-xs px-2 py-0.5 rounded ${isThisSelected ? 'bg-green-500' : 'bg-black/70'
                      }`}
                  >
                    方案{img.imageIndex + 1}{isThisSelected ? ' ✓' : ''}
                  </div>

                  {/* 选择按钮 - 点击选择/取消选择 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation() // 阻止触发父元素的放大预览
                      if (!isThisRegenerating) {
                        onSelectImage?.(location.id, isThisSelected ? null : img.imageIndex)
                      }
                    }}
                    disabled={isThisRegenerating}
                    className={`absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center transition-all shadow-sm ${isThisSelected
                      ? 'bg-green-500 text-white'
                      : 'bg-white/90 hover:bg-blue-500 hover:text-white'
                      } disabled:opacity-50`}
                    title={isThisSelected ? '取消选择' : t("image.useThis")}
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

        {/* 确定选择按钮 - 当已选择一张图片时显示 */}
        {selectedIndex !== null && onConfirmSelection && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => {
                setIsConfirmingSelection(true)
                onConfirmSelection(location.id)
              }}
              disabled={isConfirmingSelection}
              className="px-4 py-2 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
                  确定选择方案{selectedIndex + 1}
                  <span className="text-xs opacity-75">(删除其他)</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    )
  }

  // 单图模式
  const firstImage = location.images?.[0]
  const hasDescription = firstImage?.description

  return (
    <div className="flex flex-col gap-2 bg-white/70 backdrop-blur-xl border border-white/60 rounded-2xl p-3 shadow-lg shadow-slate-200/30">
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
                alt={location.name}
                className="w-full h-auto object-contain cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => onImageClick(currentImageUrl)}
              />
              {isAnyGenerating && (
                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center">
                  <svg className="animate-spin h-8 w-8 text-white mb-2" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <div className="text-white text-xs mb-2">{t("video.panelCard.generating")}</div>
                  <button
                    onClick={() => {
                      const generatingImg = location.images?.find(img => img.generating)
                      if (generatingImg) {
                        cancelGeneration({
                          type: 'location_image',
                          targetId: generatingImg.id,
                          onSuccess: () => {
                            // 🆕 清除本地 regeneratingItems 状态
                            onClearRegenerating?.(`location-${location.id}-group`)
                          }
                        })
                      }
                    }}
                    disabled={isCancelling}
                    className="px-3 py-1 text-xs bg-red-500/80 hover:bg-red-500 text-white rounded-lg transition-colors"
                  >
                    {isCancelling ? '取消中...' : '取消'}
                  </button>
                </div>
              )}
              {selectedIndex !== null && hasMultipleImages && (
                <div className="absolute bottom-2 left-2 bg-green-500 text-white text-xs px-2 py-0.5 rounded">
                  方案{selectedIndex + 1}
                </div>
              )}
            </div>
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-blue-200 to-cyan-200 flex items-center justify-center">
              {isAnyGenerating ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <svg className="animate-spin h-8 w-8 text-gray-600 mb-2" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <div className="text-gray-600 text-xs mb-2">{t("video.panelCard.generating")}</div>
                  <button
                    onClick={() => {
                      const generatingImg = location.images?.find(img => img.generating)
                      if (generatingImg) {
                        cancelGeneration({
                          type: 'location_image',
                          targetId: generatingImg.id,
                          onSuccess: () => {
                            // 🆕 清除本地 regeneratingItems 状态
                            onClearRegenerating?.(`location-${location.id}-group`)
                          }
                        })
                      }
                    }}
                    disabled={isCancelling}
                    className="px-3 py-1 text-xs bg-red-500/80 hover:bg-red-500 text-white rounded-lg transition-colors"
                  >
                    {isCancelling ? '取消中...' : '取消'}
                  </button>
                </div>
              ) : firstImage?.imageErrorMessage ? (
                // 🔥 显示错误信息
                <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                  <svg className="w-8 h-8 text-red-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div className="text-red-600 text-xs font-medium mb-1">{t("common.generateFailed")}</div>
                  <div className="text-red-500 text-xs max-w-full break-words">{firstImage.imageErrorMessage}</div>
                </div>
              ) : (
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>
          )}

          {/* 上传和操作按钮 - 非生成状态时显示 */}
          {!isAnyGenerating && (
            <div className="absolute top-2 left-2 flex gap-1">
              {/* 上传按钮 - 仅在非生成状态显示 */}
              {!isAnyGenerating && (
                <button
                  onClick={() => triggerUpload(selectedIndex !== null ? selectedIndex : 0)}
                  disabled={uploadImage.isPending || isAnyGenerating || isAnyRegenerating}
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
              {!isAnyGenerating && currentImageUrl && onImageEdit && (
                <button
                  onClick={() => onImageEdit(location.id, currentImageIndex)}
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
                disabled={uploadImage.isPending || isAnyGenerating}
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-all shadow-sm active:scale-90 ${isAnyGenerating
                  ? 'bg-green-500 hover:bg-green-600'
                  : 'bg-white/90 hover:bg-white'
                  }`}
                title={isAnyGenerating ? t("image.regenerateStuck") : t("location.regenerateImage")}
              >
                {isGroupRegenerating ? (
                  <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className={`w-4 h-4 ${isAnyGenerating ? 'text-white' : 'text-gray-700'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
              </button>
              {/* 撤回按钮 - 单图模式，只有有历史版本且非生成状态时显示 */}
              {!isAnyGenerating && currentImageUrl && onUndo && hasPreviousVersion && (
                <button
                  onClick={onUndo}
                  disabled={isAnyGenerating || isAnyRegenerating}
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
          <div className="text-xs font-semibold text-gray-900 truncate" title={location.name}>
            {location.name}
          </div>
          <div className="flex items-center gap-1">
            {/* 🆕 从资产中心复制按钮 */}
            {onCopyFromGlobal && (
              <button
                onClick={onCopyFromGlobal}
                className="flex-shrink-0 w-5 h-5 rounded hover:bg-blue-100 flex items-center justify-center transition-colors"
                title={t("character.copyFromGlobal")}
              >
                <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            )}
            <button
              onClick={onEdit}
              className="flex-shrink-0 w-5 h-5 rounded hover:bg-gray-100 flex items-center justify-center transition-colors"
              title={t("location.edit")}
            >
              <svg className="w-3.5 h-3.5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
            <button
              onClick={onDelete}
              className="flex-shrink-0 w-5 h-5 rounded hover:bg-red-100 flex items-center justify-center transition-colors"
              title={t("location.delete")}
            >
              <svg className="w-3.5 h-3.5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
        {location.summary && (
          <div className="text-xs text-gray-500 truncate" title={location.summary}>
            {location.summary}
          </div>
        )}
      </div>

      {/* 只有在没有图片且不在生成中时才显示生成按钮 */}
      {!currentImageUrl && !isAnyGenerating && (
        <button
          type="button"
          onClick={onGenerate}
          disabled={!hasDescription}
          className="btn-base w-full py-1 text-xs disabled:opacity-50"
          style={{
            background: '#3b82f6',
            color: 'white'
          }}
        >
          {t("common.generate")}
        </button>
      )}
    </div>
  )
}
