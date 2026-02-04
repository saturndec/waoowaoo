'use client'

import { useState, useRef } from 'react'
import { useTranslations } from 'next-intl'
import {
  useGenerateLocationImage,
  useSelectLocationImage,
  useUndoLocationImage,
  useUploadLocationImage,
  useDeleteLocation
} from '@/lib/query/mutations'
import { useCancelGeneration } from '@/lib/query/hooks'

interface LocationImage {
  id: string
  imageIndex: number
  description: string | null
  imageUrl: string | null
  previousImageUrl: string | null
  isSelected: boolean
  generating: boolean
}

interface Location {
  id: string
  name: string
  summary: string | null
  folderId: string | null
  images: LocationImage[]
}

interface LocationCardProps {
  location: Location
  onImageClick?: (url: string) => void
  onImageEdit?: (type: 'character' | 'location', id: string, name: string, imageIndex: number) => void
  onEdit?: (location: Location, imageIndex: number) => void
}

export function LocationCard({ location, onImageClick, onImageEdit, onEdit }: LocationCardProps) {
  // 🔥 使用 mutation hooks
  const generateImage = useGenerateLocationImage()
  const selectImage = useSelectLocationImage()
  const undoImage = useUndoLocationImage()
  const uploadImage = useUploadLocationImage()
  const deleteLocation = useDeleteLocation()
  // 全局资产没有 projectId, 使用缺省参数
  const { cancelGeneration, isCancelling } = useCancelGeneration()

  const t = useTranslations('assetHub')
  const tAssets = useTranslations('assets')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [localSelectedIndex, setLocalSelectedIndex] = useState<number | null>(null)

  // 解析图片
  const imagesWithUrl = location.images?.filter(img => img.imageUrl) || []
  const hasMultipleImages = imagesWithUrl.length > 1
  const selectedImage = location.images?.find(img => img.isSelected)
  const serverSelectedIndex = selectedImage?.imageIndex ?? null
  const effectiveSelectedIndex = localSelectedIndex ?? serverSelectedIndex
  const currentImageUrl = selectedImage?.imageUrl || imagesWithUrl[0]?.imageUrl || null
  const currentImageIndex = effectiveSelectedIndex ?? imagesWithUrl[0]?.imageIndex ?? 0
  const hasPreviousVersion = location.images?.some(img => img.previousImageUrl) || false

  const isValidUrl = (url: string | null | undefined): boolean => {
    if (!url || url.trim() === '') return false
    try { new URL(url); return true } catch { return false }
  }
  const displayImageUrl = isValidUrl(currentImageUrl) ? currentImageUrl : null
  const isAnyGenerating = location.images?.some(img => img.generating) || generateImage.isPending

  // 生成图片
  const handleGenerate = () => {
    generateImage.mutate(location.id, {
      onError: (error) => alert(error.message || t('generateFailed'))
    })
  }

  // 选择图片（本地状态更新，不刷新）
  const handleSelectImage = (imageIndex: number | null) => {
    setLocalSelectedIndex(imageIndex)
    selectImage.mutate({
      locationId: location.id,
      imageIndex,
      confirm: false
    })
  }

  // 确认选择
  const handleConfirmSelection = () => {
    if (effectiveSelectedIndex === null) return
    selectImage.mutate({
      locationId: location.id,
      imageIndex: effectiveSelectedIndex,
      confirm: true
    })
  }

  // 撤回
  const handleUndo = () => {
    undoImage.mutate(location.id)
  }

  // 上传图片
  const handleUpload = () => {
    const file = fileInputRef.current?.files?.[0]
    if (!file) return

    uploadImage.mutate(
      {
        file,
        locationId: location.id,
        labelText: location.name,
        imageIndex: currentImageIndex
      },
      {
        onError: (error) => alert(error.message || t('uploadFailed')),
        onSettled: () => {
          if (fileInputRef.current) fileInputRef.current.value = ''
        }
      }
    )
  }

  // 删除场景
  const handleDelete = () => {
    deleteLocation.mutate(location.id, {
      onSettled: () => setShowDeleteConfirm(false)
    })
  }

  // 多图选择模式
  if (hasMultipleImages) {
    return (
      <div className="col-span-3 bg-white/80 backdrop-blur-sm rounded-xl shadow-sm p-4">
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />

        {/* 顶部：名字 + 操作 */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-gray-900">{location.name}</span>
            </div>
            {location.summary && (
              <div className="text-xs text-gray-600 mb-1 line-clamp-2" title={location.summary}>
                {location.summary}
              </div>
            )}
            <div className="text-xs text-gray-500">
              {effectiveSelectedIndex !== null ? tAssets('image.optionNumber', { number: effectiveSelectedIndex + 1 }) : tAssets('image.selectFirst')}
            </div>
          </div>
          <div className="flex items-center gap-1 ml-2">
            <button onClick={handleGenerate} disabled={isAnyGenerating} className="w-6 h-6 rounded hover:bg-blue-100 flex items-center justify-center" title={t('regenerate')}>
              {isAnyGenerating ? (
                <svg className="animate-spin w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
              ) : (
                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
            </button>
            {hasPreviousVersion && (
              <button onClick={handleUndo} className="w-6 h-6 rounded hover:bg-orange-100 flex items-center justify-center" title={tAssets('image.undo')}>
                <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
              </button>
            )}
            <button onClick={() => setShowDeleteConfirm(true)} className="w-6 h-6 rounded hover:bg-red-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* 图片列表 */}
        <div className="grid grid-cols-3 gap-3">
          {imagesWithUrl.map((img) => {
            const isThisSelected = img.isSelected
            return (
              <div key={img.id} className="relative group/thumb">
                <div
                  onClick={() => onImageClick?.(img.imageUrl!)}
                  className={`rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${isThisSelected ? 'border-green-500 ring-2 ring-green-300' : 'border-gray-200 hover:border-blue-500'}`}
                >
                  <img src={img.imageUrl!} alt={`${location.name} ${img.imageIndex + 1}`} className="w-full h-auto object-contain" />
                  <div className={`absolute bottom-2 left-2 text-xs px-2 py-0.5 rounded ${isThisSelected ? 'bg-green-500 text-white' : 'bg-black/70 text-white'}`}>
                    {tAssets('image.optionNumber', { number: img.imageIndex + 1 })}{isThisSelected ? ' ✓' : ''}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleSelectImage(isThisSelected ? null : img.imageIndex) }}
                  className={`absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center shadow-sm ${isThisSelected ? 'bg-green-500 text-white' : 'bg-white/90 hover:bg-blue-500 hover:text-white'}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </button>
              </div>
            )
          })}
        </div>

        {/* 确认按钮 */}
        {effectiveSelectedIndex !== null && (
          <div className="mt-4 flex justify-end">
            <button onClick={handleConfirmSelection} disabled={selectImage.isPending} className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-2 text-sm">
              {selectImage.isPending ? (
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {tAssets('image.confirmOption', { number: effectiveSelectedIndex + 1 })}
            </button>
          </div>
        )}

        {/* 删除确认 */}
        {showDeleteConfirm && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center backdrop-blur-sm z-20 rounded-xl">
            <div className="bg-white rounded-lg p-4 m-4 shadow-xl">
              <p className="mb-4 text-sm">{t('confirmDeleteLocation')}</p>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowDeleteConfirm(false)} className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">{t('cancel')}</button>
                <button onClick={handleDelete} className="px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm">{t('delete')}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // 单图模式
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-sm overflow-hidden relative group">
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />

      {/* 图片区域 */}
      <div className="relative bg-gradient-to-br from-blue-50 to-cyan-50 min-h-[100px]">
        {displayImageUrl ? (
          <>
            <img src={displayImageUrl} alt={location.name} className="w-full h-auto object-contain cursor-pointer" onClick={() => onImageClick?.(displayImageUrl)} />
            {/* 生成中遮罩 - 覆盖在图片上 */}
            {isAnyGenerating && (
              <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white mb-2"></div>
                <p className="text-xs text-white mb-2">{t('generating')}</p>
                <button
                  onClick={() => {
                    const generatingImg = location.images?.find(img => img.generating)
                    if (generatingImg) {
                      cancelGeneration({ type: 'global_location', targetId: generatingImg.id })
                    }
                  }}
                  disabled={isCancelling}
                  className="px-3 py-1 text-xs bg-red-500/80 hover:bg-red-500 text-white rounded-lg transition-colors"
                >
                  {isCancelling ? '取消中...' : '取消'}
                </button>
              </div>
            )}
            {/* 操作按钮 - 非生成时显示 */}
            {!isAnyGenerating && (
              <div className="absolute top-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => fileInputRef.current?.click()} disabled={uploadImage.isPending} className="w-7 h-7 rounded-full bg-white/90 hover:bg-green-500 hover:text-white flex items-center justify-center shadow-sm">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                </button>
                <button onClick={() => onImageEdit?.('location', location.id, location.name, currentImageIndex)} className="w-7 h-7 rounded-full bg-purple-500/90 hover:bg-purple-500 flex items-center justify-center shadow-sm">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                <button onClick={handleGenerate} className="w-7 h-7 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow-sm">
                  <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
                {hasPreviousVersion && (
                  <button onClick={handleUndo} className="w-7 h-7 rounded-full bg-white/90 hover:bg-orange-500 hover:text-white flex items-center justify-center shadow-sm">
                    <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </>
        ) : isAnyGenerating ? (
          <div className="flex flex-col items-center justify-center py-12 bg-black/30">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white mb-2"></div>
            <p className="text-xs text-white mb-2">{t('generating')}</p>
            <button
              onClick={() => {
                const generatingImg = location.images?.find(img => img.generating)
                if (generatingImg) {
                  cancelGeneration({ type: 'global_location', targetId: generatingImg.id })
                }
              }}
              disabled={isCancelling}
              className="px-3 py-1 text-xs bg-red-500/80 hover:bg-red-500 text-white rounded-lg transition-colors"
            >
              {isCancelling ? '取消中...' : '取消'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <button onClick={handleGenerate} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
              {t('generate')}
            </button>
          </div>
        )}
      </div>

      {/* 信息区域 */}
      <div className="p-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-gray-900 text-sm truncate">{location.name}</h3>
          <div className="flex items-center gap-1">
            {/* 编辑按钮 */}
            <button
              onClick={() => onEdit?.(location, currentImageIndex)}
              className="w-6 h-6 rounded hover:bg-gray-100 flex items-center justify-center opacity-0 group-hover:opacity-100"
              title={tAssets('video.panelCard.editPrompt')}
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
            {/* 删除按钮 */}
            <button onClick={() => setShowDeleteConfirm(true)} className="w-6 h-6 rounded hover:bg-red-100 text-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
        {location.summary && <p className="mt-1 text-xs text-gray-500 line-clamp-2">{location.summary}</p>}
      </div>

      {/* 删除确认 */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center backdrop-blur-sm z-20">
          <div className="bg-white rounded-lg p-4 m-4 shadow-xl">
            <p className="mb-4 text-sm">{t('confirmDeleteLocation')}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowDeleteConfirm(false)} className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">{t('cancel')}</button>
              <button onClick={handleDelete} className="px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm">{t('delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default LocationCard
