'use client'
import { useTranslations } from 'next-intl'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { useAnalyzeProjectShotVariants } from '@/lib/query/hooks'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import type { PanelInfo, ShotVariantSuggestion } from './PanelVariantModal.types'
import PanelVariantModalSuggestionList from './PanelVariantModalSuggestionList'
import PanelVariantModalCustomOptions from './PanelVariantModalCustomOptions'
import { AppIcon } from '@/components/ui/icons'

interface PanelVariantModalProps {
  isOpen: boolean
  onClose: () => void
  panel: PanelInfo
  projectId: string
  onVariant: (
    variant: Omit<ShotVariantSuggestion, 'id' | 'creative_score'>,
    options: { includeCharacterAssets: boolean; includeLocationAsset: boolean },
  ) => Promise<void>
  isSubmittingVariantTask: boolean
}

export default function PanelVariantModal({
  isOpen,
  onClose,
  panel,
  projectId,
  onVariant,
  isSubmittingVariantTask,
}: PanelVariantModalProps) {
  const t = useTranslations('storyboard')
  const [mounted, setMounted] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [suggestions, setSuggestions] = useState<ShotVariantSuggestion[]>([])
  const [error, setError] = useState<string | null>(null)
  const [customInput, setCustomInput] = useState('')
  const [includeCharacterAssets, setIncludeCharacterAssets] = useState(true)
  const [includeLocationAsset, setIncludeLocationAsset] = useState(true)
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null)
  const autoAnalyzeKeyRef = useRef<string | null>(null)
  const analyzingRef = useRef(false)
  const analyzeShotVariantsMutation = useAnalyzeProjectShotVariants(projectId)

  useEffect(() => {
    setMounted(true)
  }, [])

  const analyzeShotVariants = useCallback(async () => {
    if (analyzingRef.current) return
    analyzingRef.current = true
    setIsAnalyzing(true)
    setError(null)
    setSuggestions([])

    try {
      const data = await analyzeShotVariantsMutation.mutateAsync({ panelId: panel.id })
      setSuggestions(data.suggestions || [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('variant.analyzeFailed'))
    } finally {
      setIsAnalyzing(false)
      analyzingRef.current = false
    }
  }, [analyzeShotVariantsMutation, panel.id, t])

  useEffect(() => {
    if (!isOpen || !panel.imageUrl) return
    const autoAnalyzeKey = `${panel.id}:${panel.imageUrl}`
    if (autoAnalyzeKeyRef.current === autoAnalyzeKey) return
    autoAnalyzeKeyRef.current = autoAnalyzeKey
    void analyzeShotVariants()
  }, [analyzeShotVariants, isOpen, panel.id, panel.imageUrl])

  useEffect(() => {
    if (isOpen) return
    autoAnalyzeKeyRef.current = null
    analyzingRef.current = false
  }, [isOpen])

  const handleSelectVariant = async (suggestion: ShotVariantSuggestion) => {
    setSelectedVariantId(suggestion.id)
    await onVariant(
      {
        title: suggestion.title,
        description: suggestion.description,
        shot_type: suggestion.shot_type,
        camera_move: suggestion.camera_move,
        video_prompt: suggestion.video_prompt,
      },
      { includeCharacterAssets, includeLocationAsset },
    )
  }

  const handleCustomVariant = async () => {
    if (!customInput.trim()) return

    await onVariant(
      {
        title: t('variant.customVariant'),
        description: customInput,
        shot_type: t('variant.defaultShotType'),
        camera_move: t('variant.defaultCameraMove'),
        video_prompt: customInput,
      },
      { includeCharacterAssets, includeLocationAsset },
    )
  }

  const handleClose = () => {
    if (!isSubmittingVariantTask && !isAnalyzing) {
      setSuggestions([])
      setError(null)
      setCustomInput('')
      setSelectedVariantId(null)
      autoAnalyzeKeyRef.current = null
      analyzingRef.current = false
      onClose()
    }
  }

  const variantTaskRunningState = isSubmittingVariantTask
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: 'generate',
      resource: 'image',
      hasOutput: !!panel.imageUrl,
    })
    : null

  const analyzeTaskRunningState = isAnalyzing
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: 'analyze',
      resource: 'image',
      hasOutput: false,
    })
    : null

  if (!isOpen || !mounted) return null

  const modalContent = (
    <div
      className="fixed inset-0 bg-black/45 flex items-center justify-center p-4"
      style={{ zIndex: 9999 }}
      onClick={handleClose}
    >
      <div
        className="rounded-xl border border-border bg-card shadow-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <AppIcon name="videoWide" className="h-4 w-4 text-muted-foreground" />
            {t('variant.shotTitle', { number: panel.panelNumber ?? '' })}
          </h2>
          <button
            onClick={handleClose}
            disabled={isSubmittingVariantTask || isAnalyzing}
            className="inline-flex items-center justify-center rounded-md border border-border bg-muted/50 px-3 py-2 text-sm font-medium transition-colors hover:bg-muted p-1.5 disabled:opacity-50"
          >
            <AppIcon name="close" className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="flex gap-4 items-start">
            <div className="w-32 flex-shrink-0">
              {panel.imageUrl ? (
                <MediaImageWithLoading
                  src={panel.imageUrl}
                  alt={t('variant.shotNum', { number: panel.panelNumber ?? '' })}
                  containerClassName="w-full aspect-[9/16] rounded-lg shadow-sm"
                  className="w-full aspect-[9/16] object-cover rounded-lg shadow-sm"
                  width={256}
                  height={456}
                  sizes="128px"
                />
              ) : (
                <div className="w-full aspect-[9/16] bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-xs">
                  {t('variant.noImage')}
                </div>
              )}
              <div className="text-xs text-muted-foreground mt-1 text-center">#{panel.panelNumber}</div>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-foreground mb-1">{t('variant.originalDescription')}</h3>
              <p className="text-sm text-muted-foreground">{panel.description || t('variant.noDescription')}</p>
            </div>
          </div>

          <div className="border-t border-border my-3" />

          <PanelVariantModalSuggestionList
            isAnalyzing={isAnalyzing}
            suggestions={suggestions}
            error={error}
            selectedVariantId={selectedVariantId}
            isSubmittingVariantTask={isSubmittingVariantTask}
            analyzeTaskRunningState={analyzeTaskRunningState}
            variantTaskRunningState={variantTaskRunningState}
            onReanalyze={analyzeShotVariants}
            onSelectVariant={(suggestion) => {
              void handleSelectVariant(suggestion)
            }}
          />

          <div className="border-t border-border my-3" />

          <PanelVariantModalCustomOptions
            customInput={customInput}
            includeCharacterAssets={includeCharacterAssets}
            includeLocationAsset={includeLocationAsset}
            isSubmittingVariantTask={isSubmittingVariantTask}
            onCustomInputChange={setCustomInput}
            onIncludeCharacterAssetsChange={setIncludeCharacterAssets}
            onIncludeLocationAssetChange={setIncludeLocationAsset}
          />
        </div>

        <div className="px-5 py-3 border-t border-border flex justify-end gap-3">
          <button
            onClick={handleClose}
            disabled={isSubmittingVariantTask || isAnalyzing}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground px-4 py-2 text-sm disabled:opacity-50"
          >
            {t('candidate.cancel')}
          </button>
          <button
            onClick={() => {
              void handleCustomVariant()
            }}
            disabled={isSubmittingVariantTask || !customInput.trim()}
            className={`inline-flex items-center justify-center px-4 py-2 text-sm rounded-lg ${isSubmittingVariantTask || !customInput.trim() ? 'border border-border bg-muted/50 hover:bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary text-primary-foreground hover:bg-primary/90 text-white'}`}
          >
            {isSubmittingVariantTask ? (
              <TaskStatusInline
                state={variantTaskRunningState}
                className="text-muted-foreground [&>span]:text-muted-foreground [&_svg]:text-muted-foreground"
              />
            ) : t('variant.useCustomGenerate')}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}
