'use client'
import { useTranslations } from 'next-intl'
import { useState, useRef, useCallback } from 'react'
import { Character, Location } from '@/types/project'
import { useProjectAssets } from '@/lib/query/hooks/useProjectAssets'
import { SelectedAsset } from './hooks/useImageGeneration'
import ImagePreviewModal from '@/components/ui/ImagePreviewModal'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import ImageEditModalSelectedAssets from './ImageEditModalSelectedAssets'
import ImageEditModalAssetPicker from './ImageEditModalAssetPicker'
import { AppIcon } from '@/components/ui/icons'

interface ImageEditModalProps {
  projectId: string
  defaultAssets: SelectedAsset[]
  onSubmit: (prompt: string, images: string[], assets: SelectedAsset[]) => void
  onClose: () => void
}

export default function ImageEditModal({
  projectId,
  defaultAssets,
  onSubmit,
  onClose,
}: ImageEditModalProps) {
  const t = useTranslations('storyboard')

  const { data: assets } = useProjectAssets(projectId)
  const characters: Character[] = assets?.characters ?? []
  const locations: Location[] = assets?.locations ?? []

  const [editPrompt, setEditPrompt] = useState('')
  const [editImages, setEditImages] = useState<string[]>([])
  const [selectedAssets, setSelectedAssets] = useState<SelectedAsset[]>(defaultAssets)
  const [showAssetPicker, setShowAssetPicker] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files) return

    Array.from(files).forEach((file) => {
      const reader = new FileReader()
      reader.onload = (readerEvent) => {
        const base64 = readerEvent.target?.result as string
        setEditImages((previous) => [...previous, base64])
      }
      reader.readAsDataURL(file)
    })

    event.target.value = ''
  }, [])

  const handlePaste = useCallback((event: React.ClipboardEvent) => {
    const items = event.clipboardData.items
    for (let index = 0; index < items.length; index++) {
      if (items[index].type.startsWith('image/')) {
        const file = items[index].getAsFile()
        if (file) {
          const reader = new FileReader()
          reader.onload = (readerEvent) => {
            const base64 = readerEvent.target?.result as string
            setEditImages((previous) => [...previous, base64])
          }
          reader.readAsDataURL(file)
        }
      }
    }
  }, [])

  const removeImage = (index: number) => {
    setEditImages((previous) => previous.filter((_, imageIndex) => imageIndex !== index))
  }

  const handleAddAsset = (asset: SelectedAsset) => {
    setSelectedAssets((previous) => {
      if (previous.some((item) => item.id === asset.id && item.type === asset.type)) return previous
      return [...previous, asset]
    })
  }

  const handleRemoveAsset = (assetId: string, assetType: string) => {
    setSelectedAssets((previous) => previous.filter((item) => !(item.id === assetId && item.type === assetType)))
  }

  const handleSubmit = () => {
    if (!editPrompt.trim()) {
      alert(t('prompts.enterInstruction'))
      return
    }
    onSubmit(editPrompt, editImages, selectedAssets)
  }

  return (
    <div className="fixed inset-0 bg-black/55 z-50 flex items-center justify-center p-4">
      <div
        className="bg-card rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onPaste={handlePaste}
      >
        <div className="p-6 border-b">
          <h3 className="text-lg font-bold text-foreground">{t('imageEdit.title')}</h3>
          <p className="text-sm text-muted-foreground mt-1">{t('imageEdit.subtitle')}</p>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">{t('prompts.aiInstruction')}</label>
            <textarea
              value={editPrompt}
              onChange={(event) => setEditPrompt(event.target.value)}
              placeholder={t('imageEdit.promptPlaceholder')}
              className="w-full h-24 px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary/40 resize-none"
              autoFocus
            />
          </div>

          <ImageEditModalSelectedAssets
            selectedAssets={selectedAssets}
            onOpenAssetPicker={() => setShowAssetPicker(true)}
            onPreviewImage={setPreviewImage}
            onRemoveAsset={handleRemoveAsset}
          />

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              {t('imageEdit.referenceImagesLabel')} <span className="text-muted-foreground font-normal">{t('imageEdit.referenceImagesHint')}</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              className="hidden"
            />
            <div className="flex flex-wrap gap-2">
              {editImages.map((image, index) => (
                <div key={index} className="relative w-16 h-16">
                  <MediaImageWithLoading
                    src={image}
                    alt=""
                    containerClassName="w-full h-full rounded-lg"
                    className="w-full h-full object-cover rounded-lg"
                  />
                  <button
                    onClick={() => removeImage(index)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-white rounded-full text-xs flex items-center justify-center hover:bg-destructive"
                  >
                    <AppIcon name="closeSm" className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-16 h-16 border-2 border-dashed border-border rounded-lg flex items-center justify-center text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
              >
                <AppIcon name="plus" className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 border-t flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-muted-foreground hover:bg-muted rounded-lg transition-colors"
          >
            {t('candidate.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!editPrompt.trim()}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {t('imageEdit.start')}
          </button>
        </div>
      </div>

      <ImageEditModalAssetPicker
        isOpen={showAssetPicker}
        characters={characters}
        locations={locations}
        selectedAssets={selectedAssets}
        onClose={() => setShowAssetPicker(false)}
        onAddAsset={handleAddAsset}
        onRemoveAsset={handleRemoveAsset}
        onPreviewImage={setPreviewImage}
      />

      {previewImage && (
        <ImagePreviewModal
          imageUrl={previewImage}
          onClose={() => setPreviewImage(null)}
        />
      )}
    </div>
  )
}
