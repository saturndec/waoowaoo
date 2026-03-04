'use client'

import type { DragEvent, RefObject } from 'react'
import { useTranslations } from 'next-intl'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import { AppIcon } from '@/components/ui/icons'

interface CharacterCreationPreviewProps {
  referenceImagesBase64: string[]
  fileInputRef: RefObject<HTMLInputElement | null>
  onDrop: (event: DragEvent<HTMLDivElement>) => void
  onFileSelect: (files: FileList) => void
  onClearReference: (index?: number) => void
}

const PhotoIcon = ({ className }: { className?: string }) => (
  <AppIcon name="image" className={className} />
)

export default function CharacterCreationPreview({
  referenceImagesBase64,
  fileInputRef,
  onDrop,
  onFileSelect,
  onClearReference,
}: CharacterCreationPreviewProps) {
  const t = useTranslations('assetModal')

  return (
    <div
      className="border-2 border-dashed border-border rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer hover:border-primary/40 hover:bg-primary/10 transition-all relative min-h-[120px]"
      onDrop={onDrop}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
      onClick={() => fileInputRef.current?.click()}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && onFileSelect(e.target.files)}
      />

      {referenceImagesBase64.length > 0 ? (
        <div className="w-full">
          <div className="grid grid-cols-3 gap-2 mb-2">
            {referenceImagesBase64.map((base64, index) => (
              <div key={index} className="relative aspect-square">
                <MediaImageWithLoading
                  src={base64}
                  alt={`参考图 ${index + 1}`}
                  containerClassName="w-full h-full rounded"
                  className="w-full h-full object-cover rounded"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onClearReference(index)
                  }}
                  className="inline-flex items-center justify-center bg-destructive/10 text-destructive hover:bg-destructive/20 absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs text-center text-muted-foreground">
            {t('character.selectedCount', { count: referenceImagesBase64.length })}
          </p>
        </div>
      ) : (
        <>
          <PhotoIcon className="w-10 h-10 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">{t('character.dropOrClick')}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('character.maxReferenceImages')}</p>
        </>
      )}
    </div>
  )
}
