'use client'
import { useTranslations } from 'next-intl'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import type { TaskPresentationState } from '@/lib/task/presentation'
import type { ShotVariantSuggestion } from './PanelVariantModal.types'

interface PanelVariantModalSuggestionListProps {
  isAnalyzing: boolean
  suggestions: ShotVariantSuggestion[]
  error: string | null
  selectedVariantId: number | null
  isSubmittingVariantTask: boolean
  analyzeTaskRunningState: TaskPresentationState | null
  variantTaskRunningState: TaskPresentationState | null
  onReanalyze: () => void
  onSelectVariant: (suggestion: ShotVariantSuggestion) => void
}

export default function PanelVariantModalSuggestionList({
  isAnalyzing,
  suggestions,
  error,
  selectedVariantId,
  isSubmittingVariantTask,
  analyzeTaskRunningState,
  variantTaskRunningState,
  onReanalyze,
  onSelectVariant,
}: PanelVariantModalSuggestionListProps) {
  const t = useTranslations('storyboard')
  const renderScore = (score: number) => t('variant.creativeScore', { score })

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
          {t('variant.aiRecommend')}
          {isAnalyzing && (
            <TaskStatusInline
              state={analyzeTaskRunningState}
              className="text-primary [&>span]:text-primary [&_svg]:text-primary"
            />
          )}
        </h3>
        {!isAnalyzing && suggestions.length > 0 && (
          <button
            onClick={onReanalyze}
            className="text-xs text-primary hover:text-foreground flex items-center gap-1"
          >
            {t('variant.reanalyze')}
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg mb-3 border border-destructive/30">
          {error}
        </div>
      )}

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {suggestions.map((suggestion) => (
          <div
            key={suggestion.id}
            className={`p-3 border rounded-lg transition-colors cursor-pointer ${selectedVariantId === suggestion.id ? 'border-primary/40 bg-primary/10' : 'border-border hover:border-primary/40 hover:bg-muted'}`}
            onClick={() => !isSubmittingVariantTask && onSelectVariant(suggestion)}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-amber-700">{renderScore(suggestion.creative_score)}</span>
                  <h4 className="text-sm font-medium text-foreground">{suggestion.title}</h4>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{suggestion.description}</p>
                <div className="flex gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">{t('variant.shotType')} {suggestion.shot_type}</span>
                  <span className="text-xs text-muted-foreground">{t('variant.cameraMove')} {suggestion.camera_move}</span>
                </div>
              </div>
              <button
                disabled={isSubmittingVariantTask}
                className={`inline-flex items-center justify-center px-3 py-1 text-xs rounded-lg ${isSubmittingVariantTask && selectedVariantId === suggestion.id ? 'border border-border bg-muted/50 hover:bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground hover:bg-primary/90 text-white'}`}
              >
                {isSubmittingVariantTask && selectedVariantId === suggestion.id ? (
                  <TaskStatusInline
                    state={variantTaskRunningState}
                    className="text-muted-foreground [&>span]:text-muted-foreground [&_svg]:text-muted-foreground"
                  />
                ) : t('candidate.select')}
              </button>
            </div>
          </div>
        ))}

        {!isAnalyzing && suggestions.length === 0 && !error && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {t('variant.clickToAnalyze')}
          </div>
        )}
      </div>
    </div>
  )
}
