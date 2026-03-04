'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { resolveErrorDisplay } from '@/lib/errors/display'
import TaskStatusOverlay from '@/components/task/TaskStatusOverlay'
import type { TaskPresentationState } from '@/lib/task/presentation'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import { AppIcon } from '@/components/ui/icons'

type CharacterCardGalleryProps =
  | {
    mode: 'selection'
    characterId: string
    appearanceId: string
    characterName: string
    imageUrlsWithIndex: Array<{ url: string; originalIndex: number }>
    selectedIndex: number | null
    isGroupTaskRunning: boolean
    isImageTaskRunning: (imageIndex: number) => boolean
    displayTaskPresentation: TaskPresentationState | null
    onImageClick: (imageUrl: string) => void
    onSelectImage?: (characterId: string, appearanceId: string, imageIndex: number | null) => void
  }
  | {
    mode: 'single'
    characterName: string
    changeReason: string
    currentImageUrl: string | null | undefined
    selectedIndex: number | null
    hasMultipleImages: boolean
    isAppearanceTaskRunning: boolean
    displayTaskPresentation: TaskPresentationState | null
    appearanceErrorMessage?: string | null
    onImageClick: (imageUrl: string) => void
    overlayActions: ReactNode
  }

export default function CharacterCardGallery(props: CharacterCardGalleryProps) {
  const t = useTranslations('assets')

  if (props.mode === 'selection') {
    return (
      <div className="grid grid-cols-3 gap-3">
        {props.imageUrlsWithIndex.map(({ url, originalIndex }) => {
          const isThisSelected = props.selectedIndex === originalIndex
          const isThisTaskRunning = props.isImageTaskRunning(originalIndex) || props.isGroupTaskRunning
          return (
            <div key={originalIndex} className="relative group/thumb">
              <div
                onClick={() => props.onImageClick(url)}
                className={`rounded-lg overflow-hidden border-2 transition-all cursor-pointer relative ${isThisSelected
                  ? 'border-emerald-300 ring-2 ring-primary/40'
                  : 'border-border hover:border-primary/40'
                  }`}
              >
                <MediaImageWithLoading
                  src={url}
                  alt={`${props.characterName} - ${t('image.optionNumber', { number: originalIndex + 1 })}`}
                  containerClassName="w-full min-h-[96px]"
                  className="w-full h-auto object-contain"
                />

                {isThisTaskRunning && (
                  <TaskStatusOverlay state={props.displayTaskPresentation} />
                )}

                <div
                  className={`absolute bottom-2 left-2 flex items-center gap-1 text-white text-xs px-2 py-0.5 rounded ${isThisSelected ? 'bg-emerald-700' : 'bg-black/55'
                    }`}
                >
                  <span>{t('image.optionNumber', { number: originalIndex + 1 })}</span>
                  {isThisSelected && (
                    <AppIcon name="checkTiny" className="h-3 w-3" />
                  )}
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!isThisTaskRunning) {
                      props.onSelectImage?.(props.characterId, props.appearanceId, isThisSelected ? null : originalIndex)
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

  const appearanceErrorDisplay = resolveErrorDisplay({
    code: props.appearanceErrorMessage || null,
    message: props.appearanceErrorMessage || null,
  })

  return (
    <div className="rounded-lg overflow-hidden border-2 border-border relative">
      {props.currentImageUrl ? (
        <div className="relative w-full">
          <MediaImageWithLoading
            src={props.currentImageUrl}
            alt={`${props.characterName} - ${props.changeReason}`}
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
          {appearanceErrorDisplay && !props.isAppearanceTaskRunning ? (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
              <AppIcon name="alert" className="w-8 h-8 text-destructive mb-2" />
              <div className="text-destructive text-xs font-medium mb-1">{t('common.generateFailed')}</div>
              <div className="text-destructive text-xs max-w-full break-words">{appearanceErrorDisplay.message}</div>
            </div>
          ) : (
            <AppIcon name="userAlt" className="w-8 h-8 text-muted-foreground" />
          )}
        </div>
      )}
      {props.isAppearanceTaskRunning && (
        <TaskStatusOverlay state={props.displayTaskPresentation} />
      )}
      {!props.isAppearanceTaskRunning && (
        <div className="absolute top-2 left-2 flex gap-1">
          {props.overlayActions}
        </div>
      )}
    </div>
  )
}
