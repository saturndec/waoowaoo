'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MouseEvent } from 'react'
import type { Character, CharacterAppearance, Location } from '@/types/project'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import { AppIcon } from '@/components/ui/icons'
import ImagePreviewModal from '@/components/ui/ImagePreviewModal'


type SpotlightCharCardProps = {
  char: Character
  appearance?: CharacterAppearance
  isActive: boolean
  onClick: () => void
  onOpenAssetLibrary?: () => void
  onRemove?: () => void
}

export function SpotlightCharCard({
  char,
  appearance,
  isActive,
  onClick,
  onOpenAssetLibrary,
  onRemove,
}: SpotlightCharCardProps) {
  const tScript = useTranslations('scriptView')
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioRef, setAudioRef] = useState<HTMLAudioElement | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  const selectedIdx = appearance?.selectedIndex ?? null
  const imageUrl = appearance?.imageUrl ||
    (selectedIdx !== null ? appearance?.imageUrls?.[selectedIdx] : null) ||
    (appearance?.imageUrls?.[0])

  const hasVoice = !!char.customVoiceUrl

  const handlePlayVoice = (e: MouseEvent) => {
    e.stopPropagation()
    if (!char.customVoiceUrl) return

    if (isPlaying && audioRef) {
      audioRef.pause()
      audioRef.currentTime = 0
      setIsPlaying(false)
      return
    }

    const audio = new Audio(char.customVoiceUrl)
    setAudioRef(audio)

    audio.onended = () => {
      setIsPlaying(false)
      setAudioRef(null)
    }

    audio.onerror = () => {
      setIsPlaying(false)
      setAudioRef(null)
    }

    audio.play()
    setIsPlaying(true)
  }

  useEffect(() => {
    return () => {
      if (audioRef) {
        audioRef.pause()
        audioRef.currentTime = 0
      }
    }
  }, [audioRef])

  return (
    <div
      onClick={onClick}
      className={`
        group relative rounded-xl cursor-pointer transition-all duration-500 ease-out
        ${isActive
          ? 'opacity-100 scale-100 ring-2 ring-primary/50 shadow-md bg-card'
          : 'opacity-50 scale-95 grayscale hover:grayscale-0 hover:opacity-100 hover:scale-95 bg-muted'
        }
      `}
    >
      <div className="aspect-square relative bg-muted">
        {imageUrl ? (
          <MediaImageWithLoading
            src={imageUrl}
            alt={char.name}
            containerClassName="w-full h-full"
            className="w-full h-full object-cover cursor-zoom-in"
            onClick={(e) => { e.stopPropagation(); setPreviewImage(imageUrl) }}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-muted/40 p-3">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-2">
              <AppIcon name="userCircle" className="w-5 h-5 text-muted-foreground" />
            </div>
            {onOpenAssetLibrary && (
              <button
                onClick={(e) => { e.stopPropagation(); onOpenAssetLibrary() }}
                className="text-[11px] text-muted-foreground font-medium hover:text-primary transition-colors text-center leading-tight"
              >
                {tScript('asset.generateCharacter')}
              </button>
            )}
          </div>
        )}
        {isActive && (
          <div className="absolute top-2 right-2 w-2 h-2 bg-emerald-700 rounded-full shadow-[0_0_8px_rgba(74,222,128,0.8)] border border-white" />
        )}
        {isActive && onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (confirm(tScript('confirm.removeCharacter'))) {
                onRemove()
              }
            }}
            className="absolute top-0 right-0 translate-x-1/2 -translate-y-1/2 w-5 h-5 bg-destructive rounded-full text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-md hover:bg-destructive hover:scale-110 z-20"
            title={tScript('asset.removeFromClip')}
          >
            <AppIcon name="closeSm" className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="p-2 text-center">
        <div className={`text-sm font-bold truncate ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
          {char.name}
        </div>
        {appearance?.changeReason && (
          <div className="text-xs text-muted-foreground truncate">{appearance.changeReason}</div>
        )}
        <button
          onClick={hasVoice ? handlePlayVoice : undefined}
          disabled={!hasVoice}
          className={`mt-1.5 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${!hasVoice
            ? 'bg-muted text-muted-foreground cursor-not-allowed border border-dashed border-border'
            : isPlaying
              ? 'bg-primary text-white'
              : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary'
            }`}
        >
          {!hasVoice ? (
            <>
              <AppIcon name="volumeOff" className="w-3 h-3" />
              <span>{tScript('asset.noAudio')}</span>
            </>
          ) : isPlaying ? (
            <>
              <span className="flex gap-0.5">
                <span className="w-0.5 h-3 bg-card rounded-full animate-pulse" />
                <span className="w-0.5 h-3 bg-card rounded-full animate-pulse" style={{ animationDelay: '0.1s' }} />
                <span className="w-0.5 h-3 bg-card rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
              </span>
              <span>{tScript('asset.playing')}</span>
            </>
          ) : (
            <>
              <AppIcon name="play" className="w-3 h-3" />
              <span>{tScript('asset.listen')}</span>
            </>
          )}
        </button>
      </div>
      {previewImage && typeof document !== 'undefined' && createPortal(
        <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />,
        document.body
      )}
    </div>
  )
}

export function getSelectedLocationImage(location: Location) {
  const byId = location.selectedImageId
    ? location.images?.find(img => img.id === location.selectedImageId)
    : undefined
  const byFlag = location.images?.find(img => img.isSelected)
  const withUrl = location.images?.find(img => img.imageUrl)
  return byId || byFlag || withUrl || location.images?.[0]
}

type SpotlightLocationCardProps = {
  location: Location
  isActive: boolean
  onClick: () => void
  onOpenAssetLibrary?: () => void
  onRemove?: () => void
}

export function SpotlightLocationCard({
  location,
  isActive,
  onClick,
  onOpenAssetLibrary,
  onRemove,
}: SpotlightLocationCardProps) {
  const tScript = useTranslations('scriptView')
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const image = getSelectedLocationImage(location)
  const imageUrl = image?.imageUrl

  return (
    <div
      onClick={onClick}
      className={`
        group relative rounded-xl cursor-pointer transition-all duration-500 ease-out
        ${isActive
          ? 'opacity-100 scale-100 ring-2 ring-emerald-300 shadow-md bg-card'
          : 'opacity-50 scale-95 grayscale hover:grayscale-0 hover:opacity-100 hover:scale-95 bg-muted'
        }
      `}
    >
      <div className="aspect-video relative bg-muted">
        {imageUrl ? (
          <MediaImageWithLoading
            src={imageUrl}
            alt={location.name}
            containerClassName="w-full h-full"
            className="w-full h-full object-cover cursor-zoom-in"
            onClick={(e) => { e.stopPropagation(); setPreviewImage(imageUrl) }}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-muted/40 p-3">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-2">
              <AppIcon name="imagePreview" className="w-5 h-5 text-muted-foreground" />
            </div>
            {onOpenAssetLibrary && (
              <button
                onClick={(e) => { e.stopPropagation(); onOpenAssetLibrary() }}
                className="text-[11px] text-muted-foreground font-medium hover:text-primary transition-colors text-center leading-tight"
              >
                {tScript('asset.generateLocation')}
              </button>
            )}
          </div>
        )}
        {isActive && (
          <div className="absolute top-2 right-2 w-2 h-2 bg-emerald-700 rounded-full shadow-[0_0_8px_rgba(74,222,128,0.8)] border border-white" />
        )}
        {isActive && onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (confirm(tScript('confirm.removeLocation'))) {
                onRemove()
              }
            }}
            className="absolute top-0 right-0 translate-x-1/2 -translate-y-1/2 w-5 h-5 bg-destructive rounded-full text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-md hover:bg-destructive hover:scale-110 z-20"
            title={tScript('asset.removeFromClip')}
          >
            <AppIcon name="closeSm" className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="p-2 text-center">
        <div className={`text-sm font-bold truncate ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
          {location.name}
        </div>
      </div>
      {previewImage && typeof document !== 'undefined' && createPortal(
        <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />,
        document.body
      )}
    </div>
  )
}
