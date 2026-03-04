'use client'
import { resolveErrorDisplay } from '@/lib/errors/display'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  useGenerateLocationImage,
  useSelectLocationImage,
  useUndoLocationImage,
  useUploadLocationImage,
  useDeleteLocation
} from '@/lib/query/mutations'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import TaskStatusOverlay from '@/components/task/TaskStatusOverlay'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { Button } from '@/components/ui/button'
import { AppIcon } from '@/components/ui/icons'

interface LocationImage {
  id: string
  imageIndex: number
  description: string | null
  imageUrl: string | null
  previousImageUrl: string | null
  isSelected: boolean
  imageTaskRunning: boolean
  lastError?: { code: string; message: string } | null
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

  const t = useTranslations('assetHub')
  const tAssets = useTranslations('assets')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const latestSelectRequestRef = useRef(0)

  // 解析图片
  const imagesWithUrl = location.images?.filter(img => img.imageUrl) || []
  const hasMultipleImages = imagesWithUrl.length > 1
  const selectedImage = location.images?.find(img => img.isSelected)
  const serverSelectedIndex = selectedImage?.imageIndex ?? null
  const effectiveSelectedIndex = serverSelectedIndex
  const currentImageUrl = selectedImage?.imageUrl || imagesWithUrl[0]?.imageUrl || null
  const currentImageIndex = effectiveSelectedIndex ?? imagesWithUrl[0]?.imageIndex ?? 0
  const hasPreviousVersion = location.images?.some(img => img.previousImageUrl) || false

  const isValidUrl = (url: string | null | undefined): boolean => {
    if (!url || url.trim() === '') return false
    if (url.startsWith('/')) return true
    if (url.startsWith('data:') || url.startsWith('blob:')) return true
    try { new URL(url); return true } catch { return false }
  }
  const displayImageUrl = isValidUrl(currentImageUrl) ? currentImageUrl : null
  const serverTaskRunning = (location.images || []).some((image) => image.imageTaskRunning)
  const transientSubmitting = generateImage.isPending
  const isTaskRunning = serverTaskRunning || transientSubmitting
  const displayTaskPresentation = isTaskRunning
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: displayImageUrl ? 'process' : 'generate',
      resource: 'image',
      hasOutput: !!displayImageUrl,
    })
    : null
  // 取第一个有错误的 image 的 lastError
  const firstImageError = !isTaskRunning
    ? (location.images || []).find(img => img.lastError)?.lastError || null
    : null
  const taskErrorDisplay = firstImageError ? resolveErrorDisplay(firstImageError) : null
  const selectImageRunningState = selectImage.isPending
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: 'process',
      resource: 'image',
      hasOutput: !!displayImageUrl,
    })
    : null

  // 生成图片
  const handleGenerate = () => {
    generateImage.mutate(location.id, {
      onError: (error) => alert(error.message || t('generateFailed'))
    })
  }

  // 选择图片（依赖 query 缓存乐观更新）
  const handleSelectImage = (imageIndex: number | null) => {
    if (imageIndex === effectiveSelectedIndex) return
    const requestId = latestSelectRequestRef.current + 1
    latestSelectRequestRef.current = requestId
    selectImage.mutate({
      locationId: location.id,
      imageIndex,
      confirm: false
    }, {
      onError: (error) => {
        if (latestSelectRequestRef.current !== requestId) return
        alert(error.message || t('selectFailed'))
      }
    })
  }

  // 确认选择
  const handleConfirmSelection = () => {
    if (effectiveSelectedIndex === null) return
    const requestId = latestSelectRequestRef.current + 1
    latestSelectRequestRef.current = requestId
    selectImage.mutate({
      locationId: location.id,
      imageIndex: effectiveSelectedIndex,
      confirm: true
    }, {
      onError: (error) => {
        if (latestSelectRequestRef.current !== requestId) return
        alert(error.message || t('selectFailed'))
      }
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
      <div className="col-span-1 rounded-xl border bg-card p-4 shadow-sm md:col-span-2">
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />

        {/* 顶部：名字 + 操作 */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-foreground">{location.name}</span>
            </div>
            {location.summary && (
              <div className="mb-1 line-clamp-2 text-xs text-muted-foreground" title={location.summary}>
                {location.summary}
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              {effectiveSelectedIndex !== null ? tAssets('image.optionNumber', { number: effectiveSelectedIndex + 1 }) : tAssets('image.selectFirst')}
            </div>
          </div>
          <div className="flex items-center gap-1 ml-2">
            <Button onClick={handleGenerate} disabled={isTaskRunning} variant="ghost" size="icon" className="h-7 w-7" title={t('regenerate')}>
              {isTaskRunning ? (
                <TaskStatusInline state={displayTaskPresentation} className="[&_span]:sr-only [&_svg]:text-primary" />
              ) : (
                <AppIcon name="refresh" className="h-4 w-4 text-primary" />
              )}
            </Button>
            {hasPreviousVersion && (
              <Button onClick={handleUndo} variant="ghost" size="icon" className="h-7 w-7" title={tAssets('image.undo')}>
                <AppIcon name="sparkles" className="h-4 w-4 text-amber-600" />
              </Button>
            )}
            <Button onClick={() => setShowDeleteConfirm(true)} variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
              <AppIcon name="trash" className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 任务失败错误提示 */}
        {taskErrorDisplay && !isTaskRunning && (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-destructive/10 p-2 text-destructive">
            <AppIcon name="alert" className="h-4 w-4 shrink-0" />
            <span className="text-xs line-clamp-2">{taskErrorDisplay.message}</span>
          </div>
        )}

        {/* 图片列表 */}
        <div className="grid grid-cols-3 gap-3">
          {imagesWithUrl.map((img) => {
            const isThisSelected = img.isSelected
            return (
              <div key={img.id} className="relative group/thumb">
                <div
                  onClick={() => onImageClick?.(img.imageUrl!)}
                  className={`cursor-zoom-in overflow-hidden rounded-lg border-2 transition-all ${isThisSelected ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-border hover:border-primary/40'}`}
                >
                  <MediaImageWithLoading
                    src={img.imageUrl!}
                    alt={`${location.name} ${img.imageIndex + 1}`}
                    containerClassName="w-full min-h-[88px]"
                    className="w-full h-auto object-contain"
                  />
                  <div className={`absolute bottom-2 left-2 rounded px-2 py-0.5 text-xs ${isThisSelected ? 'bg-emerald-600 text-white' : 'bg-background/90 text-foreground'}`}>
                    {tAssets('image.optionNumber', { number: img.imageIndex + 1 })}
                  </div>
                </div>
                <Button
                  onClick={(e) => { e.stopPropagation(); handleSelectImage(isThisSelected ? null : img.imageIndex) }}
                  variant={isThisSelected ? 'default' : 'secondary'}
                  size="icon"
                  className="absolute right-2 top-2 h-7 w-7 rounded-full"
                >
                  <AppIcon name="check" className="h-4 w-4" />
                </Button>
              </div>
            )
          })}
        </div>

        {/* 确认按钮 */}
        {effectiveSelectedIndex !== null && (
          <div className="mt-4 flex justify-end">
            <Button onClick={handleConfirmSelection} disabled={selectImage.isPending} className="h-9 gap-2 px-4 text-sm">
              {selectImage.isPending ? (
                <TaskStatusInline state={selectImageRunningState} className="text-white [&>span]:sr-only [&_svg]:text-white" />
              ) : (
                <AppIcon name="check" className="h-4 w-4" />
              )}
              {tAssets('image.confirmOption', { number: effectiveSelectedIndex + 1 })}
            </Button>
          </div>
        )}

        {/* 删除确认 */}
        {showDeleteConfirm && (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-black/45">
            <div className="m-4 w-full max-w-sm rounded-xl border bg-card p-4 shadow-xl">
              <p className="mb-4 text-sm text-foreground">{t('confirmDeleteLocation')}</p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>{t('cancel')}</Button>
                <Button variant="destructive" size="sm" onClick={handleDelete}>{t('delete')}</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // 单图模式
  return (
    <div className="group relative overflow-hidden rounded-xl border bg-card shadow-sm">
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />

      {/* 图片区域 */}
      <div className="relative min-h-[100px] bg-muted/50">
        {displayImageUrl ? (
          <>
            <MediaImageWithLoading
              src={displayImageUrl}
              alt={location.name}
              containerClassName="w-full min-h-[120px]"
              className="w-full h-auto object-contain cursor-zoom-in"
              onClick={() => onImageClick?.(displayImageUrl)}
            />
            {/* 操作按钮 - 非生成时显示 */}
            {!isTaskRunning && (
              <div className="absolute top-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button onClick={() => fileInputRef.current?.click()} disabled={uploadImage.isPending} variant="secondary" size="icon" className="h-7 w-7 rounded-full">
                  <AppIcon name="upload" className="h-4 w-4 text-emerald-600" />
                </Button>
                <Button onClick={() => onImageEdit?.('location', location.id, location.name, currentImageIndex)} variant="secondary" size="icon" className="h-7 w-7 rounded-full">
                  <AppIcon name="edit" className="h-4 w-4" />
                </Button>
                <Button onClick={handleGenerate} variant="secondary" size="icon" className="h-7 w-7 rounded-full">
                  <AppIcon name="refresh" className="h-4 w-4 text-primary" />
                </Button>
                {hasPreviousVersion && (
                  <Button onClick={handleUndo} variant="secondary" size="icon" className="h-7 w-7 rounded-full">
                    <AppIcon name="sparkles" className="h-4 w-4 text-amber-600" />
                  </Button>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <AppIcon name="globe2" className="mb-3 h-12 w-12" />
            <Button onClick={handleGenerate} className="h-8 gap-1.5 px-3 text-sm">
              <AppIcon name="sparklesAlt" className="h-4 w-4" />
              {t('generate')}
            </Button>
          </div>
        )}
        {isTaskRunning && (
          <TaskStatusOverlay state={displayTaskPresentation} />
        )}
        {taskErrorDisplay && !isTaskRunning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-destructive/10 p-3 text-destructive">
            <AppIcon name="alert" className="h-6 w-6" />
            <span className="text-xs text-center font-medium line-clamp-3">{taskErrorDisplay.message}</span>
          </div>
        )}
      </div>

      {/* 信息区域 */}
      <div className="p-3">
        <div className="flex items-center justify-between">
          <h3 className="truncate text-sm font-medium text-foreground">{location.name}</h3>
          <div className="flex items-center gap-1">
            {/* 编辑按钮 */}
            <Button
              onClick={() => onEdit?.(location, currentImageIndex)}
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
              title={tAssets('video.panelCard.editPrompt')}
            >
              <AppIcon name="edit" className="h-4 w-4 text-muted-foreground" />
            </Button>
            {/* 删除按钮 */}
            <Button onClick={() => setShowDeleteConfirm(true)} variant="ghost" size="icon" className="h-6 w-6 text-destructive opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive">
              <AppIcon name="trash" className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {location.summary && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{location.summary}</p>}
      </div>

      {/* 删除确认 */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/45">
          <div className="m-4 w-full max-w-sm rounded-xl border bg-card p-4 shadow-xl">
            <p className="mb-4 text-sm text-foreground">{t('confirmDeleteLocation')}</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>{t('cancel')}</Button>
              <Button variant="destructive" size="sm" onClick={handleDelete}>{t('delete')}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default LocationCard
