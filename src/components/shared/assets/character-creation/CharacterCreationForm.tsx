'use client'

import type { DragEvent, RefObject } from 'react'
import { useTranslations } from 'next-intl'
import { ART_STYLES } from '@/lib/constants'
import CharacterCreationPreview from './CharacterCreationPreview'
import { AppIcon } from '@/components/ui/icons'

type Mode = 'asset-hub' | 'project'

interface AvailableCharacter {
  id: string
  name: string
  appearances: unknown[]
}

interface CharacterCreationFormProps {
  mode: Mode
  createMode: 'reference' | 'description'
  setCreateMode: (mode: 'reference' | 'description') => void
  name: string
  setName: (value: string) => void
  description: string
  setDescription: (value: string) => void
  aiInstruction: string
  setAiInstruction: (value: string) => void
  artStyle: string
  setArtStyle: (value: string) => void
  referenceImagesBase64: string[]
  referenceSubMode: 'direct' | 'extract'
  setReferenceSubMode: (mode: 'direct' | 'extract') => void
  isSubAppearance: boolean
  setIsSubAppearance: (value: boolean) => void
  selectedCharacterId: string
  setSelectedCharacterId: (value: string) => void
  changeReason: string
  setChangeReason: (value: string) => void
  availableCharacters: AvailableCharacter[]
  fileInputRef: RefObject<HTMLInputElement | null>
  handleDrop: (event: DragEvent<HTMLDivElement>) => void
  handleFileSelect: (files: FileList) => void
  handleClearReference: (index?: number) => void
  handleExtractDescription: () => void
  handleCreateWithReference: () => void
  handleAiDesign: () => void
  handleSubmit: () => void
  isSubmitting: boolean
  isAiDesigning: boolean
  isExtracting: boolean
}

const SparklesIcon = ({ className }: { className?: string }) => (
  <AppIcon name="sparklesAlt" className={className} />
)

const PhotoIcon = ({ className }: { className?: string }) => (
  <AppIcon name="image" className={className} />
)

export default function CharacterCreationForm({
  mode,
  createMode,
  setCreateMode,
  name,
  setName,
  description,
  setDescription,
  aiInstruction,
  setAiInstruction,
  artStyle,
  setArtStyle,
  referenceImagesBase64,
  referenceSubMode,
  setReferenceSubMode,
  isSubAppearance,
  setIsSubAppearance,
  selectedCharacterId,
  setSelectedCharacterId,
  changeReason,
  setChangeReason,
  availableCharacters,
  fileInputRef,
  handleDrop,
  handleFileSelect,
  handleClearReference,
  handleExtractDescription,
  handleCreateWithReference,
  handleAiDesign,
  handleSubmit,
  isSubmitting,
  isAiDesigning,
  isExtracting,
}: CharacterCreationFormProps) {
  const t = useTranslations('assetModal')

  return (
    <div className="space-y-5">
      <div className="mb-5">
        {(() => {
          const tabs = ['description', 'reference'] as const
          const activeIdx = tabs.indexOf(createMode)
          return (
            <div className="rounded-lg p-0.5" style={{ background: 'rgba(0,0,0,0.04)' }}>
              <div className="relative grid gap-1" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                <div
                  className="absolute bottom-0.5 top-0.5 rounded-md bg-white transition-transform duration-200"
                  style={{
                    boxShadow: '0 1px 4px rgba(0,0,0,0.15), 0 0 0 0.5px rgba(0,0,0,0.06)',
                    width: 'calc(100% / 2)',
                    transform: `translateX(${activeIdx * 100}%)`,
                  }}
                />
                <button
                  onClick={() => setCreateMode('description')}
                  className={`relative z-[1] flex items-center justify-center gap-2 rounded-md py-2 px-4 text-sm font-medium transition-colors cursor-pointer ${createMode === 'description' ? 'text-foreground' : 'text-muted-foreground hover:text-muted-foreground'}`}
                >
                  <SparklesIcon className="w-4 h-4" />
                  <span>{t('character.modeDescription')}</span>
                </button>
                <button
                  onClick={() => setCreateMode('reference')}
                  className={`relative z-[1] flex items-center justify-center gap-2 rounded-md py-2 px-4 text-sm font-medium transition-colors cursor-pointer ${createMode === 'reference' ? 'text-foreground' : 'text-muted-foreground hover:text-muted-foreground'}`}
                >
                  <PhotoIcon className="w-4 h-4" />
                  <span>{t('character.modeReference')}</span>
                </button>
              </div>
            </div>
          )
        })()}
      </div>

      {mode === 'project' && availableCharacters.length > 0 && (
        <div className="flex items-start gap-3 p-3 rounded-xl border border-border bg-muted/30 rounded-lg border border-border">
          <input
            type="checkbox"
            id="isSubAppearance"
            checked={isSubAppearance}
            onChange={(e) => setIsSubAppearance(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-border text-primary"
          />
          <label htmlFor="isSubAppearance" className="flex-1 text-sm cursor-pointer">
            <span className="font-medium text-foreground">{t('character.isSubAppearance')}</span>
            <p className="text-xs text-muted-foreground mt-0.5">{t('character.isSubAppearanceHint')}</p>
          </label>
        </div>
      )}

      {isSubAppearance && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground block">
            {t('character.selectMainCharacter')} <span className="text-destructive">*</span>
          </label>
          <select
            value={selectedCharacterId}
            onChange={(e) => setSelectedCharacterId(e.target.value)}
            className="w-full rounded-md border border-input bg-background w-full px-3 py-2 text-sm"
          >
            <option value="">{t('character.selectCharacterPlaceholder')}</option>
            {availableCharacters.map((char) => (
              <option key={char.id} value={char.id}>
                {char.name} ({t('character.appearancesCount', { count: char.appearances.length })})
              </option>
            ))}
          </select>
        </div>
      )}

      {isSubAppearance && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground block">
            {t('character.changeReason')} <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            value={changeReason}
            onChange={(e) => setChangeReason(e.target.value)}
            placeholder={t('character.changeReasonPlaceholder')}
            className="w-full rounded-md border border-input bg-background w-full px-3 py-2 text-sm"
          />
        </div>
      )}

      {!isSubAppearance && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground block">
            {t('character.name')} <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('character.namePlaceholder')}
            className="w-full rounded-md border border-input bg-background w-full px-3 py-2 text-sm"
          />
        </div>
      )}

      {!isSubAppearance && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground block">
            {t('artStyle.title')}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {ART_STYLES.map((style) => (
              <button
                key={style.value}
                type="button"
                onClick={() => setArtStyle(style.value)}
                className={`inline-flex items-center justify-center px-3 py-2 rounded-lg text-sm border transition-all justify-start ${artStyle === style.value
                  ? 'bg-primary/10 text-primary hover:bg-primary/15 border-primary/40'
                  : 'border border-border bg-muted/50 hover:bg-muted border-border text-muted-foreground'
                  }`}
              >
                <span>{style.preview}</span>
                <span>{style.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {createMode === 'reference' && (
        <div className="rounded-xl border border-border bg-muted/30 rounded-xl p-4 space-y-3 border border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <PhotoIcon className="w-4 h-4" />
              <span>{t('character.uploadReference')}</span>
            </div>
            <span className="text-xs text-muted-foreground">{t('character.pasteHint')}</span>
          </div>

          <div className="rounded-xl border border-border bg-card flex items-center gap-2 p-2 rounded-lg">
            <span className="text-xs text-muted-foreground shrink-0">{t('character.generationMode')}：</span>
            {(() => {
              const subTabs = ['direct', 'extract'] as const
              const subIdx = subTabs.indexOf(referenceSubMode)
              return (
                <div className="flex-1 rounded-md p-0.5" style={{ background: 'rgba(0,0,0,0.04)' }}>
                  <div className="relative grid gap-1" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                    <div
                      className="absolute bottom-0.5 top-0.5 rounded-sm bg-white transition-transform duration-200"
                      style={{
                        boxShadow: '0 1px 4px rgba(0,0,0,0.15), 0 0 0 0.5px rgba(0,0,0,0.06)',
                        width: 'calc(100% / 2)',
                        transform: `translateX(${subIdx * 100}%)`,
                      }}
                    />
                    <button
                      onClick={() => setReferenceSubMode('direct')}
                      className={`relative z-[1] px-3 py-1.5 text-xs rounded-sm transition-colors cursor-pointer ${referenceSubMode === 'direct' ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-muted-foreground'}`}
                    >
                      {t('character.directGenerate')}
                    </button>
                    <button
                      onClick={() => setReferenceSubMode('extract')}
                      className={`relative z-[1] px-3 py-1.5 text-xs rounded-sm transition-colors cursor-pointer ${referenceSubMode === 'extract' ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-muted-foreground'}`}
                    >
                      {t('character.extractPrompt')}
                    </button>
                  </div>
                </div>
              )
            })()}
          </div>

          {referenceSubMode === 'extract' && (
            <button
              onClick={handleExtractDescription}
              disabled={isExtracting || referenceImagesBase64.length === 0}
              className="inline-flex items-center justify-center bg-primary/10 text-primary hover:bg-primary/15 w-full px-3 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {isExtracting ? t('aiDesign.generating') : t('character.extractFirst')}
            </button>
          )}

          <CharacterCreationPreview
            referenceImagesBase64={referenceImagesBase64}
            fileInputRef={fileInputRef}
            onDrop={handleDrop}
            onFileSelect={handleFileSelect}
            onClearReference={handleClearReference}
          />

          <button
            onClick={handleCreateWithReference}
            disabled={isSubmitting || !name.trim() || referenceImagesBase64.length === 0}
            className={`inline-flex items-center justify-center w-full px-4 py-2.5 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm ${referenceSubMode === 'extract'
              ? 'bg-primary/10 text-primary hover:bg-primary/15'
              : 'bg-primary text-primary-foreground hover:bg-primary/90'
              }`}
          >
            {isSubmitting ? t('common.creating') : t('character.convertToSheet')}
          </button>
        </div>
      )}

      {createMode === 'description' && (
        <>
          {!isSubAppearance && (
            <div className="rounded-xl border border-border bg-muted/30 rounded-xl p-4 space-y-3 border border-border">
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <SparklesIcon className="w-4 h-4" />
                <span>{t('aiDesign.title')}</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={aiInstruction}
                  onChange={(e) => setAiInstruction(e.target.value)}
                  placeholder={t('aiDesign.placeholder')}
                  className="w-full rounded-md border border-input bg-background flex-1 px-3 py-2 text-sm"
                  disabled={isAiDesigning}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleAiDesign()
                    }
                  }}
                />
                <button
                  onClick={handleAiDesign}
                  disabled={isAiDesigning || !aiInstruction.trim()}
                  className="inline-flex items-center justify-center bg-primary/10 text-primary hover:bg-primary/15 px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm whitespace-nowrap"
                >
                  {isAiDesigning ? t('aiDesign.generating') : t('aiDesign.generate')}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground block">
              {isSubAppearance ? t('character.modifyDescription') : t('character.description')} <span className="text-destructive">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder={isSubAppearance
                ? t('character.modifyDescriptionPlaceholder')
                : t('character.descPlaceholder')}
              className="w-full rounded-md border border-input bg-background w-full px-3 py-2 text-sm resize-none"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={isSubmitting || (isSubAppearance
              ? !selectedCharacterId.trim() || !changeReason.trim() || !description.trim()
              : !name.trim() || !description.trim())}
            className="inline-flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 w-full px-4 py-2.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed text-sm"
          >
            {isSubmitting ? t('common.adding') : t('common.add')}
          </button>
        </>
      )}
    </div>
  )
}
