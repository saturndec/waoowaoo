'use client'

import { useTranslations } from 'next-intl'
/**
 * 场景卡片组件 - 支持多图片选择
 * 布局：上面名字+描述，下面三张图片
 */

import { useState, useRef } from 'react'
import { Location } from '@/types/project'
import { shouldShowError } from '@/lib/error-utils'
import { useUploadProjectLocationImage } from '@/lib/query/mutations'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import LocationCardHeader from './location-card/LocationCardHeader'
import LocationImageList from './location-card/LocationImageList'
import LocationCardActions from './location-card/LocationCardActions'
import { AppIcon } from '@/components/ui/icons'

interface LocationCardProps {
  location: Location
  onEdit: () => void
  onDelete: () => void
  onRegenerate: () => void
  onGenerate: () => void
  onUndo?: () => void  // 撤回到上一版本
  onImageClick: (imageUrl: string) => void
  onSelectImage?: (locationId: string, imageIndex: number | null) => void
  onImageEdit?: (locationId: string, imageIndex: number) => void  // 新增：图片编辑
  onCopyFromGlobal?: () => void
  activeTaskKeys?: Set<string>
  onClearTaskKey?: (key: string) => void
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
  onImageEdit,
  onCopyFromGlobal,
  activeTaskKeys = new Set(),
  projectId,
  onConfirmSelection
}: LocationCardProps) {
  // 🔥 使用 mutation
  const uploadImage = useUploadProjectLocationImage(projectId)
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
          alert(t('image.uploadSuccess'))
        },
        onError: (error) => {
          if (shouldShowError(error)) {
            alert(t('image.uploadFailedError', { error: error.message }))
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
  const selectedImage = location.selectedImageId
    ? location.images?.find(img => img.id === location.selectedImageId)
    : location.images?.find(img => img.isSelected)
  const selectedIndex = selectedImage?.imageIndex ?? null

  // 当前显示的图片及其 imageIndex
  const currentImageUrl = selectedImage?.imageUrl || imagesWithUrl[0]?.imageUrl || null
  const currentImageIndex = selectedIndex ?? imagesWithUrl[0]?.imageIndex ?? 0

  const isImageTaskRunning = (imageIndex: number) => {
    return activeTaskKeys.has(`location-${location.id}-${imageIndex}`)
  }

  const isGroupTaskRunning = activeTaskKeys.has(`location-${location.id}-group`)

  const isAnyTaskRunning = isGroupTaskRunning || Array.from(activeTaskKeys).some(key =>
    key.startsWith(`location-${location.id}`)
  )

  const locationTaskRunning = (location.images || []).some((image) => !!image.imageTaskRunning)
  const locationTaskPresentation = locationTaskRunning
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: currentImageUrl ? 'regenerate' : 'generate',
      resource: 'image',
      hasOutput: !!currentImageUrl,
    })
    : null
  const fallbackRunningPresentation = isAnyTaskRunning
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: 'regenerate',
      resource: 'image',
      hasOutput: !!currentImageUrl,
    })
    : null
  const displayTaskPresentation = locationTaskPresentation || fallbackRunningPresentation
  const confirmingSelectionState = isConfirmingSelection
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: 'process',
      resource: 'image',
      hasOutput: !!currentImageUrl,
    })
    : null
  const uploadPendingState = uploadImage.isPending
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: 'process',
      resource: 'image',
      hasOutput: !!currentImageUrl,
    })
    : null

  // 统一任务态 + 前端瞬时提交态
  const isTaskRunning =
    locationTaskRunning ||
    isAnyTaskRunning

  // 检查是否有历史版本（用于撤回功能）
  const hasPreviousVersion = location.images?.some(img => img.previousImageUrl) || false

  const showSelectionMode = hasMultipleImages

  // 选择模式：显示名字在上，三张图片在下
  if (showSelectionMode) {
    const selectionHeaderActions = (
      <>
        <button
          onClick={onRegenerate}
          disabled={isTaskRunning || isAnyTaskRunning || uploadImage.isPending}
          className="w-6 h-6 rounded hover:bg-primary/10 flex items-center justify-center transition-colors disabled:opacity-50"
          title={t('image.regenerateGroup')}
        >
          {isGroupTaskRunning ? (
            <TaskStatusInline state={displayTaskPresentation} className="[&_span]:sr-only [&_svg]:text-primary" />
          ) : (
            <AppIcon name="refresh" className="w-4 h-4 text-primary" />
          )}
        </button>
        {onUndo && hasPreviousVersion && (
          <button
            onClick={onUndo}
            disabled={isTaskRunning || isAnyTaskRunning}
            className="w-6 h-6 rounded hover:bg-amber-100 flex items-center justify-center transition-colors disabled:opacity-50"
            title={t('image.undo')}
          >
            <AppIcon name="undo" className="w-4 h-4 text-amber-700" />
          </button>
        )}
        <button
          onClick={onDelete}
          className="w-6 h-6 rounded hover:bg-destructive/10 flex items-center justify-center transition-colors"
          title={t('location.delete')}
        >
          <AppIcon name="trash" className="w-4 h-4 text-destructive" />
        </button>
      </>
    )

    return (
      <div className="col-span-3 rounded-xl border border-border bg-card shadow-md p-4 transition-all">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={() => handleUpload()}
          className="hidden"
        />
        <LocationCardHeader
          mode="selection"
          locationName={location.name}
          summary={location.summary}
          selectedIndex={selectedIndex}
          actions={selectionHeaderActions}
        />

        <LocationImageList
          mode="selection"
          locationId={location.id}
          locationName={location.name}
          imagesWithUrl={imagesWithUrl}
          selectedImageId={location.selectedImageId}
          selectedIndex={selectedIndex}
          isGroupTaskRunning={isGroupTaskRunning}
          isImageTaskRunning={isImageTaskRunning}
          displayTaskPresentation={displayTaskPresentation}
          onImageClick={onImageClick}
          onSelectImage={onSelectImage}
        />

        <LocationCardActions
          mode="selection"
          selectedIndex={selectedIndex}
          isConfirmingSelection={isConfirmingSelection}
          confirmingSelectionState={confirmingSelectionState}
          onConfirmSelection={selectedIndex !== null && onConfirmSelection
            ? () => {
              setIsConfirmingSelection(true)
              onConfirmSelection(location.id)
            }
            : undefined}
        />
      </div>
    )
  }

  // 单图模式
  const singleOverlayActions = (
    <>
      <button
        onClick={() => triggerUpload(selectedIndex !== null ? selectedIndex : 0)}
        disabled={uploadImage.isPending || isTaskRunning || isAnyTaskRunning}
        className="w-7 h-7 rounded-full bg-muted/40 hover:bg-emerald-700 hover:text-white flex items-center justify-center transition-all shadow-sm disabled:opacity-50"
        title={currentImageUrl ? t('image.uploadReplace') : t('image.upload')}
      >
        {uploadImage.isPending ? (
          <TaskStatusInline state={uploadPendingState} className="[&_span]:sr-only [&_svg]:text-current" />
        ) : (
          <AppIcon name="upload" className="w-4 h-4 text-emerald-700" />
        )}
      </button>
      {!isTaskRunning && currentImageUrl && onImageEdit && (
        <button
          onClick={() => onImageEdit(location.id, currentImageIndex)}
          className="w-7 h-7 rounded-full flex items-center justify-center transition-all shadow-sm"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
          title={t('image.edit')}
        >
          <AppIcon name="edit" className="w-4 h-4 text-white" />
        </button>
      )}
      <button
        onClick={onRegenerate}
        disabled={uploadImage.isPending || isTaskRunning}
        className={`w-7 h-7 rounded-full flex items-center justify-center transition-all shadow-sm active:scale-90 ${isTaskRunning
          ? 'bg-emerald-700 hover:bg-emerald-700'
          : 'bg-muted/40 hover:bg-card'
          }`}
        title={isTaskRunning ? t('image.regenerateStuck') : t('location.regenerateImage')}
      >
        {isGroupTaskRunning ? (
          <TaskStatusInline state={displayTaskPresentation} className="[&_span]:sr-only [&_svg]:text-white" />
        ) : (
          <AppIcon name="refresh" className={`w-4 h-4 ${isTaskRunning ? 'text-white' : 'text-muted-foreground'}`} />
        )}
      </button>
      {!isTaskRunning && currentImageUrl && onUndo && hasPreviousVersion && (
        <button
          onClick={onUndo}
          disabled={isTaskRunning || isAnyTaskRunning}
          className="w-7 h-7 rounded-full bg-muted/40 hover:bg-amber-700 hover:text-white flex items-center justify-center transition-all shadow-sm disabled:opacity-50"
          title={t('image.undo')}
        >
          <AppIcon name="undo" className="w-4 h-4 text-amber-700 hover:text-white" />
        </button>
      )}
    </>
  )

  const compactHeaderActions = (
    <>
      {onCopyFromGlobal && (
        <button
          onClick={onCopyFromGlobal}
          className="flex-shrink-0 w-5 h-5 rounded hover:bg-primary/10 flex items-center justify-center transition-colors"
          title={t('character.copyFromGlobal')}
        >
          <AppIcon name="copy" className="w-3.5 h-3.5 text-primary" />
        </button>
      )}
      <button
        onClick={onEdit}
        className="flex-shrink-0 w-5 h-5 rounded hover:bg-muted flex items-center justify-center transition-colors"
        title={t('location.edit')}
      >
        <AppIcon name="edit" className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
      <button
        onClick={onDelete}
        className="flex-shrink-0 w-5 h-5 rounded hover:bg-destructive/10 flex items-center justify-center transition-colors"
        title={t('location.delete')}
      >
        <AppIcon name="trash" className="w-3.5 h-3.5 text-destructive" />
      </button>
    </>
  )

  const firstImage = location.images?.[0]
  const hasDescription = !!firstImage?.description

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card shadow-md p-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={() => handleUpload()}
        className="hidden"
      />
      <div className="relative">
        <LocationImageList
          mode="single"
          locationName={location.name}
          currentImageUrl={currentImageUrl}
          selectedIndex={selectedIndex}
          hasMultipleImages={hasMultipleImages}
          isTaskRunning={isTaskRunning}
          displayTaskPresentation={displayTaskPresentation}
          imageErrorMessage={firstImage?.lastError?.message || firstImage?.imageErrorMessage}
          onImageClick={onImageClick}
          overlayActions={singleOverlayActions}
        />
      </div>

      <LocationCardHeader
        mode="compact"
        locationName={location.name}
        summary={location.summary}
        actions={compactHeaderActions}
      />

      <LocationCardActions
        mode="compact"
        currentImageUrl={currentImageUrl}
        isTaskRunning={isTaskRunning}
        hasDescription={hasDescription}
        onGenerate={onGenerate}
      />
    </div>
  )
}
