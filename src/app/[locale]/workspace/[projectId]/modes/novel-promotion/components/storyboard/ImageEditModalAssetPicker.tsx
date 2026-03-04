'use client'

import type { Character, Location } from '@/types/project'
import { useTranslations } from 'next-intl'
import { toDisplayImageUrl } from '@/lib/media/image-url'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import type { SelectedAsset } from './hooks/useImageGeneration'
import { AppIcon } from '@/components/ui/icons'

interface ImageEditModalAssetPickerProps {
  isOpen: boolean
  characters: Character[]
  locations: Location[]
  selectedAssets: SelectedAsset[]
  onClose: () => void
  onAddAsset: (asset: SelectedAsset) => void
  onRemoveAsset: (assetId: string, assetType: string) => void
  onPreviewImage: (url: string | null) => void
}

export default function ImageEditModalAssetPicker({
  isOpen,
  characters,
  locations,
  selectedAssets,
  onClose,
  onAddAsset,
  onRemoveAsset,
  onPreviewImage,
}: ImageEditModalAssetPickerProps) {
  const t = useTranslations('storyboard')
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/45 z-[60] flex items-center justify-center p-4">
      <div className="rounded-xl border border-border bg-card shadow-lg w-full max-w-lg max-h-[80vh] overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h4 className="font-bold text-foreground">{t('imageEdit.selectAsset')}</h4>
          <button onClick={onClose} className="text-muted-foreground hover:text-muted-foreground">
            <AppIcon name="close" className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {characters.length > 0 && (
            <div className="mb-4">
              <h5 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <AppIcon name="user" className="h-4 w-4 text-muted-foreground" />
                <span>{t('prompts.character')}</span>
              </h5>

              <div className="grid grid-cols-4 gap-2">
                {characters.map((character) => {
                  const appearances = character.appearances || []
                  const hasMultipleAppearances = appearances.length > 1
                  return appearances.map((appearance) => {
                    const isSelected = selectedAssets.some(
                      (asset) =>
                        asset.id === character.id &&
                        asset.type === 'character' &&
                        asset.appearanceId === appearance.appearanceIndex,
                    )
                    const displayName = hasMultipleAppearances
                      ? `${character.name} - ${appearance.changeReason || t('panel.defaultAppearance')}`
                      : character.name
                    const displayImageUrl = toDisplayImageUrl(appearance.imageUrl)

                    return (
                      <button
                        key={`${character.id}-${appearance.appearanceIndex}`}
                        onClick={() => {
                          if (isSelected) {
                            onRemoveAsset(character.id, 'character')
                          } else {
                            onAddAsset({
                              id: character.id,
                              name: displayName,
                              type: 'character',
                              imageUrl: appearance.imageUrl,
                              appearanceId: appearance.appearanceIndex,
                              appearanceName: appearance.changeReason,
                            })
                          }
                        }}
                        className={`relative aspect-square rounded-lg overflow-hidden border-2 ${isSelected ? 'border-primary/40' : 'border-transparent'}`}
                      >
                        {displayImageUrl ? (
                          <MediaImageWithLoading
                            src={displayImageUrl}
                            alt={displayName}
                            containerClassName="w-full h-full"
                            className="w-full h-full object-cover cursor-zoom-in"
                            onClick={(event) => {
                              event.stopPropagation()
                              onPreviewImage(appearance.imageUrl || null)
                            }}
                          />
                        ) : (
                          <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground">
                            <AppIcon name="user" className="h-7 w-7" />
                          </div>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-black/55 text-white text-xs p-1 truncate" title={displayName}>
                          {displayName}
                        </div>
                        {isSelected && (
                          <div className="absolute top-1 right-1 w-5 h-5 bg-primary text-white rounded-full flex items-center justify-center">
                            <AppIcon name="checkXs" className="h-3 w-3" />
                          </div>
                        )}
                      </button>
                    )
                  })
                })}
              </div>
            </div>
          )}

          {locations.length > 0 && (
            <div>
              <h5 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <AppIcon name="imageAlt" className="h-4 w-4 text-muted-foreground" />
                <span>{t('prompts.location')}</span>
              </h5>

              <div className="grid grid-cols-4 gap-2">
                {locations.map((location) => {
                  const isSelected = selectedAssets.some((asset) => asset.id === location.id && asset.type === 'location')
                  const selectedImage = location.selectedImageId
                    ? location.images?.find((image) => image.id === location.selectedImageId)
                    : location.images?.find((image) => image.isSelected) || location.images?.find((image) => image.imageUrl) || location.images?.[0]
                  const imageUrl = selectedImage?.imageUrl
                  const displayImageUrl = toDisplayImageUrl(imageUrl || null)

                  return (
                    <button
                      key={location.id}
                      onClick={() => {
                        if (isSelected) {
                          onRemoveAsset(location.id, 'location')
                        } else {
                          onAddAsset({
                            id: location.id,
                            name: location.name,
                            type: 'location',
                            imageUrl: imageUrl ?? null,
                          })
                        }
                      }}
                      className={`relative aspect-[3/2] rounded-lg overflow-hidden border-2 ${isSelected ? 'border-primary/40' : 'border-transparent'}`}
                    >
                      {displayImageUrl ? (
                        <MediaImageWithLoading
                          src={displayImageUrl}
                          alt={location.name}
                          containerClassName="w-full h-full"
                          className="w-full h-full object-cover cursor-zoom-in"
                          onClick={(event) => {
                            event.stopPropagation()
                            onPreviewImage(imageUrl || null)
                          }}
                        />
                      ) : (
                        <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground">
                          <AppIcon name="imageAlt" className="h-7 w-7" />
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-black/55 text-white text-xs p-1 truncate">
                        {location.name}
                      </div>
                      {isSelected && (
                        <div className="absolute top-1 right-1 w-5 h-5 bg-primary text-white rounded-full flex items-center justify-center">
                          <AppIcon name="checkXs" className="h-3 w-3" />
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
          >
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
