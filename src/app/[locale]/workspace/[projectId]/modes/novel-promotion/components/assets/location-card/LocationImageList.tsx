'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { resolveErrorDisplay } from '@/lib/errors/display'
import TaskStatusOverlay from '@/components/task/TaskStatusOverlay'
import type { TaskPresentationState } from '@/lib/task/presentation'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import { AppIcon } from '@/components/ui/icons'

type SelectionImage = {
  id: string
  imageIndex: number
  imageUrl: string | null
  isSelected?: boolean
}

type LocationImageListProps =
  | {
    mode: 'selection'
    locationId: string
    locationName: string
    imagesWithUrl: SelectionImage[]
    selectedImageId?: string | null
    selectedIndex: number | null
    isGroupTaskRunning: boolean
    isImageTaskRunning: (imageIndex: number) => boolean
    displayTaskPresentation: TaskPresentationState | null
    onImageClick: (imageUrl: string) => void
    onSelectImage?: (locationId: string, imageIndex: number | null) => void
  }
  | {
    mode: 'single'
    locationName: string
    currentImageUrl: string | null | undefined
    selectedIndex: number | null
    hasMultipleImages: boolean
    isTaskRunning: boolean
    displayTaskPresentation: TaskPresentationState | null
    imageErrorMessage?: string | null
    onImageClick: (imageUrl: string) => void
    overlayActions: ReactNode
  }

export default function LocationImageList(props: LocationImageListProps) {
  const t = useTranslations('assets')

  if (props.mode === 'selection') {
    return (
      <div className="grid grid-cols-3 gap-3">
        {props.imagesWithUrl.map((img) => {
          const isThisSelected = props.selectedImageId
            ? img.id === props.selectedImageId
            : img.isSelected
          const isThisTaskRunning = props.isImageTaskRunning(img.imageIndex) || props.isGroupTaskRunning
          return (
            <div key={img.id} className="relative group/thumb">
              <div
                onClick={() => props.onImageClick(img.imageUrl!)}
                className={`rounded-lg overflow-hidden border-2 transition-all cursor-pointer relative ${isThisSelected
                  ? 'border-emerald-300 ring-2 ring-primary/40'
                  : 'border-border hover:border-primary/40'
                  }`}
              >
                <MediaImageWithLoading
                  src={img.imageUrl!}
                  alt={t('image.optionAlt', { name: props.locationName, number: img.imageIndex + 1 })}
                  containerClassName="w-full min-h-[88px]"
                  className="w-full h-auto object-contain"
                />

                {isThisTaskRunning && (
                  <TaskStatusOverlay state={props.displayTaskPresentation} />
                )}

                <div
                  className={`absolute bottom-2 left-2 flex items-center gap-1 text-white text-xs px-2 py-0.5 rounded ${isThisSelected ? 'bg-emerald-700' : 'bg-black/55'
                    }`}
                >
                  <span>{t('image.optionNumber', { number: img.imageIndex + 1 })}</span>
                  {isThisSelected && (
                    <AppIcon name="checkTiny" className="h-3 w-3" />
                  )}
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!isThisTaskRunning) {
                      props.onSelectImage?.(props.locationId, isThisSelected ? null : img.imageIndex)
                    }
                  }}
                  disabled={isThisTaskRunning}
                  className={`absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center transition-all shadow-sm ${isThisSelected
                    ? 'bg-emerald-700 text-white'
                    : 'bg-muted/40 hover:bg-primary hover:text-white'
                    } disabled:opacity-50`}
                  title={isThisSelected ? t('image.cancelSelection') : t('image.useThis')}
                >
                  <AppIcon name="check" className="w-4 h-4" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const locationErrorDisplay = resolveErrorDisplay({
    code: props.imageErrorMessage || null,
    message: props.imageErrorMessage || null,
  })

  return (
    <div className="rounded-lg overflow-hidden border-2 border-border relative">
      {props.currentImageUrl ? (
        <div className="relative w-full">
          <MediaImageWithLoading
            src={props.currentImageUrl}
            alt={props.locationName}
            containerClassName="w-full min-h-[120px]"
            className="w-full h-auto object-contain cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => props.onImageClick(props.currentImageUrl!)}
          />
          {props.selectedIndex !== null && props.hasMultipleImages && (
            <div className="absolute bottom-2 left-2 bg-emerald-700 text-white text-xs px-2 py-0.5 rounded">
              {t('image.optionNumber', { number: props.selectedIndex + 1 })}
            </div>
          )}
        </div>
      ) : (
        <div className="w-full h-full bg-muted flex items-center justify-center">
          {locationErrorDisplay && !props.isTaskRunning ? (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
              <AppIcon name="alert" className="w-8 h-8 text-destructive mb-2" />
              <div className="text-destructive text-xs font-medium mb-1">{t('common.generateFailed')}</div>
              <div className="text-destructive text-xs max-w-full break-words">{locationErrorDisplay.message}</div>
            </div>
          ) : (
            <AppIcon name="globe2" className="w-8 h-8 text-muted-foreground" />
          )}
        </div>
      )}
      {props.isTaskRunning && (
        <TaskStatusOverlay state={props.displayTaskPresentation} />
      )}
      {!props.isTaskRunning && (
        <div className="absolute top-2 left-2 flex gap-1">
          {props.overlayActions}
        </div>
      )}
    </div>
  )
}
