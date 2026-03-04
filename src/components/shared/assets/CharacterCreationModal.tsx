'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, MouseEvent } from 'react'
import { useTranslations } from 'next-intl'
import { useProjectAssets } from '@/lib/query/hooks'
import CharacterCreationForm from './character-creation/CharacterCreationForm'
import { useCharacterCreationSubmit } from './character-creation/hooks/useCharacterCreationSubmit'
import { AppIcon } from '@/components/ui/icons'

export interface CharacterCreationModalProps {
  mode: 'asset-hub' | 'project'
  folderId?: string | null
  projectId?: string
  onClose: () => void
  onSuccess: () => void
}

const XMarkIcon = ({ className }: { className?: string }) => (
  <AppIcon name="close" className={className} />
)

export function CharacterCreationModal({
  mode,
  folderId,
  projectId,
  onClose,
  onSuccess,
}: CharacterCreationModalProps) {
  const t = useTranslations('assetModal')

  const [createMode, setCreateMode] = useState<'reference' | 'description'>('description')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [aiInstruction, setAiInstruction] = useState('')
  const [artStyle, setArtStyle] = useState('american-comic')
  const [referenceImagesBase64, setReferenceImagesBase64] = useState<string[]>([])
  const [referenceSubMode, setReferenceSubMode] = useState<'direct' | 'extract'>('direct')
  const [isSubAppearance, setIsSubAppearance] = useState(false)
  const [selectedCharacterId, setSelectedCharacterId] = useState('')
  const [changeReason, setChangeReason] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  const projectAssets = useProjectAssets(mode === 'project' ? (projectId ?? null) : null)
  const availableCharacters = useMemo(() => {
    if (mode !== 'project') return []
    const items = projectAssets.data?.characters || []
    return items.map((c) => ({
      id: c.id,
      name: c.name,
      appearances: c.appearances || [],
    }))
  }, [mode, projectAssets.data?.characters])

  const {
    isSubmitting,
    isAiDesigning,
    isExtracting,
    handleExtractDescription,
    handleCreateWithReference,
    handleAiDesign,
    handleSubmit,
  } = useCharacterCreationSubmit({
    mode,
    folderId,
    projectId,
    name,
    description,
    aiInstruction,
    artStyle,
    referenceImagesBase64,
    referenceSubMode,
    isSubAppearance,
    selectedCharacterId,
    changeReason,
    setDescription,
    setAiInstruction,
    onSuccess,
    onClose,
  })

  const handleFileSelect = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (fileArray.length === 0) return

    const remaining = 5 - referenceImagesBase64.length
    const toAdd = fileArray.slice(0, remaining)

    for (const file of toAdd) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const base64 = e.target?.result as string
        setReferenceImagesBase64((prev) => {
          if (prev.length >= 5) return prev
          if (prev.includes(base64)) return prev
          return [...prev, base64]
        })
      }
      reader.readAsDataURL(file)
    }
  }, [referenceImagesBase64.length])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting && !isAiDesigning) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isAiDesigning, isSubmitting, onClose])

  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      if (createMode !== 'reference') return

      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      const items = e.clipboardData?.items
      if (!items) return

      for (let i = 0; i < items.length; i++) {
        if (!items[i].type.startsWith('image/')) continue
        const file = items[i].getAsFile()
        if (!file) continue
        e.preventDefault()
        void handleFileSelect([file])
        break
      }
    }

    document.addEventListener('paste', handleGlobalPaste)
    return () => document.removeEventListener('paste', handleGlobalPaste)
  }, [createMode, handleFileSelect])

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.files.length > 0) {
      void handleFileSelect(e.dataTransfer.files)
    }
  }

  const handleClearReference = (index?: number) => {
    if (typeof index === 'number') {
      setReferenceImagesBase64((prev) => prev.filter((_, i) => i !== index))
      return
    }
    setReferenceImagesBase64([])
  }

  const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !isSubmitting && !isAiDesigning) {
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="rounded-xl border border-border bg-card shadow-lg max-w-lg w-full max-h-[85vh] flex flex-col">
        <div className="p-6 overflow-y-auto flex-1">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-foreground">
              {t('character.title')}
            </h3>
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center border border-border bg-muted/50 hover:bg-muted w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          <CharacterCreationForm
            mode={mode}
            createMode={createMode}
            setCreateMode={(value) => setCreateMode(value)}
            name={name}
            setName={(value) => setName(value)}
            description={description}
            setDescription={(value) => setDescription(value)}
            aiInstruction={aiInstruction}
            setAiInstruction={(value) => setAiInstruction(value)}
            artStyle={artStyle}
            setArtStyle={(value) => setArtStyle(value)}
            referenceImagesBase64={referenceImagesBase64}
            referenceSubMode={referenceSubMode}
            setReferenceSubMode={(value) => setReferenceSubMode(value)}
            isSubAppearance={isSubAppearance}
            setIsSubAppearance={(value) => setIsSubAppearance(value)}
            selectedCharacterId={selectedCharacterId}
            setSelectedCharacterId={(value) => setSelectedCharacterId(value)}
            changeReason={changeReason}
            setChangeReason={(value) => setChangeReason(value)}
            availableCharacters={availableCharacters}
            fileInputRef={fileInputRef}
            handleDrop={handleDrop}
            handleFileSelect={(files) => void handleFileSelect(files)}
            handleClearReference={handleClearReference}
            handleExtractDescription={() => { void handleExtractDescription() }}
            handleCreateWithReference={() => { void handleCreateWithReference() }}
            handleAiDesign={() => { void handleAiDesign() }}
            handleSubmit={() => { void handleSubmit() }}
            isSubmitting={isSubmitting}
            isAiDesigning={isAiDesigning}
            isExtracting={isExtracting}
          />
        </div>

        <div className="flex justify-end p-4 border-t border-border bg-muted/40 rounded-b-xl flex-shrink-0">
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center border border-input bg-background hover:bg-accent hover:text-accent-foreground px-4 py-2 rounded-lg text-sm"
            disabled={isSubmitting}
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
