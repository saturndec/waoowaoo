'use client'

import { useEffect, useMemo, useState } from 'react'
import { AppIcon } from '@/components/ui/icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { getProviderKey, isPresetComingSoonModel, type CustomModel } from '../types'
import type { UseProviderCardStateResult } from './hooks/useProviderCardState'
import type {
  ProviderCardModelType,
  ProviderCardProps,
  ProviderCardTranslator,
} from './types'

interface ProviderAdvancedFieldsProps {
  provider: ProviderCardProps['provider']
  onToggleModel: ProviderCardProps['onToggleModel']
  onDeleteModel: ProviderCardProps['onDeleteModel']
  onUpdateModel: ProviderCardProps['onUpdateModel']
  t: ProviderCardTranslator
  state: UseProviderCardStateResult
}

const TypeIcon = ({
  type,
  className = 'w-4 h-4',
}: {
  type: ProviderCardModelType
  className?: string
}) => {
  switch (type) {
    case 'llm':
      return (
        <AppIcon name="menu" className={className} />
      )
    case 'image':
      return (
        <AppIcon name="image" className={className} />
      )
    case 'video':
      return (
        <AppIcon name="video" className={className} />
      )
    case 'audio':
      return (
        <AppIcon name="audioWave" className={className} />
      )
  }
}

const typeLabel = (type: ProviderCardModelType, t: ProviderCardTranslator) => {
  switch (type) {
    case 'llm':
      return t('typeText')
    case 'image':
      return t('typeImage')
    case 'video':
      return t('typeVideo')
    case 'audio':
      return t('typeAudio')
  }
}

const MODEL_TYPES: readonly ProviderCardModelType[] = ['llm', 'image', 'video', 'audio']

export function getAddableModelTypesForProvider(providerId: string): ProviderCardModelType[] {
  const providerKey = getProviderKey(providerId)
  if (providerKey === 'openai-compatible') return ['llm', 'image', 'video']
  return ['llm', 'image', 'video', 'audio']
}

function shouldShowDefaultTabs(providerId: string): boolean {
  const providerKey = getProviderKey(providerId)
  return providerKey === 'openai-compatible' || providerKey === 'gemini-compatible'
}

export function getVisibleModelTypesForProvider(
  providerId: string,
  groupedModels: Partial<Record<ProviderCardModelType, CustomModel[]>>,
): ProviderCardModelType[] {
  const shouldShowAllTabs = shouldShowDefaultTabs(providerId)
  if (shouldShowAllTabs) {
    return getAddableModelTypesForProvider(providerId)
  }

  return MODEL_TYPES.filter((type) => {
    const modelsOfType = groupedModels[type]
    return Array.isArray(modelsOfType) && modelsOfType.length > 0
  })
}

function formatPriceAmount(amount: number): string {
  const fixed = amount.toFixed(4)
  const normalized = fixed.replace(/\.?0+$/, '')
  return normalized || '0'
}

function getModelPriceTexts(model: CustomModel, t: ProviderCardTranslator): string[] {
  if (
    model.type === 'llm'
    && typeof model.priceInput === 'number'
    && Number.isFinite(model.priceInput)
    && typeof model.priceOutput === 'number'
    && Number.isFinite(model.priceOutput)
  ) {
    return [
      t('priceInput', { amount: `¥${formatPriceAmount(model.priceInput)}` }),
      t('priceOutput', { amount: `¥${formatPriceAmount(model.priceOutput)}` }),
    ]
  }

  const label = typeof model.priceLabel === 'string' ? model.priceLabel.trim() : ''
  if (label) {
    return [label === '--' ? t('priceUnavailable') : `¥${label}`]
  }
  if (typeof model.price === 'number' && Number.isFinite(model.price) && model.price > 0) {
    return [`¥${formatPriceAmount(model.price)}`]
  }
  return [t('priceUnavailable')]
}

export function ProviderAdvancedFields({
  provider,
  onToggleModel,
  onDeleteModel,
  onUpdateModel,
  t,
  state,
}: ProviderAdvancedFieldsProps) {
  const providerKey = getProviderKey(provider.id)
  const addableModelTypes = new Set<ProviderCardModelType>(getAddableModelTypesForProvider(provider.id))
  const visibleTypes = useMemo(
    () => getVisibleModelTypesForProvider(provider.id, state.groupedModels),
    [provider.id, state.groupedModels],
  )
  const [activeType, setActiveType] = useState<ProviderCardModelType | null>(
    visibleTypes[0] ?? null,
  )
  const activeTypeSignature = visibleTypes.join('|')

  useEffect(() => {
    if (visibleTypes.length === 0) {
      setActiveType(null)
      return
    }
    if (!activeType || !visibleTypes.includes(activeType)) {
      setActiveType(visibleTypes[0])
    }
  }, [activeType, activeTypeSignature, visibleTypes])

  const currentType = activeType ?? visibleTypes[0] ?? null
  const currentModels = currentType ? (state.groupedModels[currentType] ?? []) : []
  const shouldShowAddButton =
    !!currentType
    && addableModelTypes.has(currentType)
    && state.showAddForm !== currentType
  const defaultAddType: ProviderCardModelType = providerKey === 'openrouter' ? 'llm' : 'image'
  const useTabbedLayout = state.hasModels || shouldShowDefaultTabs(provider.id)

  const renderCustomPricingEditor = (targetType: ProviderCardModelType | null) => {
    if (!state.needsCustomPricing || !targetType) return null

    const enabled = state.newModel.enableCustomPricing === true
    const renderInputs = () => {
      if (!enabled) return null

      if (targetType === 'llm') {
        return (
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={state.newModel.priceInput ?? ''}
              onChange={(event) =>
                state.setNewModel({ ...state.newModel, priceInput: event.target.value })
              }
              placeholder={t('pricingInputLabel')}
              className="h-8 px-3 py-1.5 font-mono text-[12px]"
            />
            <Input
              type="number"
              step="0.01"
              min="0"
              value={state.newModel.priceOutput ?? ''}
              onChange={(event) =>
                state.setNewModel({ ...state.newModel, priceOutput: event.target.value })
              }
              placeholder={t('pricingOutputLabel')}
              className="h-8 px-3 py-1.5 font-mono text-[12px]"
            />
            <span className="shrink-0 text-[11px] text-muted-foreground">¥/M tokens</span>
          </div>
        )
      }

      if (targetType === 'image' || targetType === 'video') {
        return (
          <div className="mt-2 space-y-2">
            <Input
              type="number"
              step="0.0001"
              min="0"
              value={state.newModel.basePrice ?? ''}
              onChange={(event) =>
                state.setNewModel({ ...state.newModel, basePrice: event.target.value })
              }
              placeholder={t('pricingBasePriceLabel')}
              className="h-8 w-full px-3 py-1.5 font-mono text-[12px]"
            />
            <Textarea
              value={state.newModel.optionPricesJson ?? ''}
              onChange={(event) =>
                state.setNewModel({ ...state.newModel, optionPricesJson: event.target.value })
              }
              placeholder={t('pricingOptionPricesPlaceholder')}
              className="min-h-[84px] w-full resize-y px-3 py-2 font-mono text-[12px]"
            />
          </div>
        )
      }

      return null
    }

    return (
      <div className="mt-2.5 rounded-lg border border-border bg-muted/40 px-2.5 py-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={enabled ? 'secondary' : 'outline'}
            onClick={() =>
              state.setNewModel({
                ...state.newModel,
                enableCustomPricing: !enabled,
              })
            }
            className="h-7 px-2 text-xs"
          >
            <AppIcon name={enabled ? 'check' : 'plus'} className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs font-medium text-muted-foreground">
            {t('pricingEnableCustom')}
          </span>
        </div>
        {renderInputs()}
      </div>
    )
  }

  return useTabbedLayout ? (
    <div className="space-y-2.5 p-3">
      <div
        className="grid gap-1 rounded-lg border border-border bg-muted p-1"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, visibleTypes.length)}, minmax(0, 1fr))` }}
      >
        {visibleTypes.map((type) => (
          <Button
            key={type}
            type="button"
            size="sm"
            variant={currentType === type ? 'secondary' : 'ghost'}
            onClick={() => setActiveType(type)}
            className="h-7 justify-center gap-1 text-[12px]"
          >
            <TypeIcon type={type} className="h-3 w-3" />
            <span>{typeLabel(type, t)}</span>
          </Button>
        ))}
      </div>

      {currentType && (
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-foreground">
            <TypeIcon type={currentType} className="h-3 w-3" />
            <span>{typeLabel(currentType, t)}</span>
            <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[11px] font-semibold text-secondary-foreground">
              {currentModels.length}
            </span>
          </div>
          {shouldShowAddButton && (
            <Button
              onClick={() => state.setShowAddForm(currentType)}
              variant="secondary"
              size="sm"
              className="h-7 px-2 text-[12px] font-medium"
            >
              <AppIcon name="plus" className="h-3.5 w-3.5" />
              {t('add')}
            </Button>
          )}
        </div>
      )}

      {currentType && state.showAddForm === currentType && addableModelTypes.has(currentType) && (
        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <div className="mb-2.5 flex items-center gap-2">
            <Input
              type="text"
              value={state.newModel.name}
              onChange={(event) =>
                state.setNewModel({ ...state.newModel, name: event.target.value })
              }
              placeholder={t('modelDisplayName')}
              className="h-8 px-3 py-1.5 text-[12px]"
              autoFocus
            />
            <Button onClick={state.handleCancelAdd} variant="ghost" size="icon" className="h-7 w-7">
              <AppIcon name="close" className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="text"
              value={state.newModel.modelId}
              onChange={(event) =>
                state.setNewModel({ ...state.newModel, modelId: event.target.value })
              }
              placeholder={t('modelActualId')}
              className={`h-8 flex-1 px-3 py-1.5 font-mono text-[12px] ${currentType === 'video' && state.batchMode && provider.id === 'ark' ? 'rounded-r-none' : ''}`}
            />
            {currentType === 'video' && state.batchMode && provider.id === 'ark' && (
              <span className="rounded-r-lg bg-muted px-2 py-1.5 font-mono text-[12px] text-muted-foreground">
                -batch
              </span>
            )}
            <Button
              onClick={() => state.handleAddModel(currentType)}
              size="sm"
              className="h-8 px-3 py-1.5 text-[12px] font-medium"
            >
              {t('save')}
            </Button>
          </div>
          {renderCustomPricingEditor(currentType)}
          {currentType === 'video' && provider.id === 'ark' && (
            <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-2">
              <Button
                type="button"
                size="sm"
                variant={state.batchMode ? 'secondary' : 'outline'}
                onClick={() => state.setBatchMode(!state.batchMode)}
                className="h-7 px-2 text-xs"
              >
                <AppIcon name={state.batchMode ? 'check' : 'plus'} className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs font-medium text-muted-foreground">
                {t('batchModeHalfPrice')}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-border bg-muted/20 p-2">
        <div
          className="h-[280px] overflow-y-auto pr-1"
          style={{ scrollbarGutter: 'stable' }}
        >
          <div className="space-y-2">
            {currentModels.map((model, index) => (
              <ModelRow
                key={`${model.modelKey}-${index}`}
                model={model}
                t={t}
                state={state}
                onToggleModel={onToggleModel}
                onDeleteModel={onDeleteModel}
                onUpdateModel={onUpdateModel}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  ) : (
    <div className="p-3">
      {state.showAddForm === null ? (
        <div className="text-center">
          <p className="mb-3 text-[12px] text-muted-foreground">{t('noModelsForProvider')}</p>
          <Button
            onClick={() => state.setShowAddForm(defaultAddType)}
            variant="secondary"
            className="mx-auto h-8 px-3 py-1.5 text-[12px]"
          >
            <AppIcon name="plus" className="h-3.5 w-3.5" />
            {t('addModel')}
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <div className="mb-2.5 flex items-center gap-2">
            <Input
              type="text"
              value={state.newModel.name}
              onChange={(event) =>
                state.setNewModel({ ...state.newModel, name: event.target.value })
              }
              placeholder={t('modelDisplayName')}
              className="h-8 px-3 py-1.5 text-[12px]"
              autoFocus
            />
            <Button onClick={state.handleCancelAdd} variant="ghost" size="icon" className="h-7 w-7">
              <AppIcon name="close" className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="text"
              value={state.newModel.modelId}
              onChange={(event) =>
                state.setNewModel({ ...state.newModel, modelId: event.target.value })
              }
              placeholder={t('modelActualId')}
              className="h-8 flex-1 px-3 py-1.5 font-mono text-[12px]"
            />
            <Button
              onClick={() => state.showAddForm && state.handleAddModel(state.showAddForm)}
              size="sm"
              className="h-8 px-3 py-1.5 text-[12px] font-medium"
            >
              {t('save')}
            </Button>
          </div>
          {renderCustomPricingEditor(state.showAddForm)}
        </div>
      )}
    </div>
  )
}

interface ModelRowProps {
  model: CustomModel
  t: ProviderCardTranslator
  state: UseProviderCardStateResult
  onToggleModel: ProviderCardProps['onToggleModel']
  onDeleteModel: ProviderCardProps['onDeleteModel']
  onUpdateModel: ProviderCardProps['onUpdateModel']
}

function ModelRow({
  model,
  t,
  state,
  onToggleModel,
  onDeleteModel,
  onUpdateModel,
}: ModelRowProps) {
  const priceTexts = getModelPriceTexts(model, t)
  const priceText = priceTexts.join(' / ')
  const isComingSoonModel = isPresetComingSoonModel(model.provider, model.modelId)
  const rowDisabledClass = model.enabled ? '' : 'opacity-70'

  return (
    <div className={`group flex items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2 transition-colors hover:bg-muted/40 ${rowDisabledClass}`}>
      {state.editingModelId === model.modelKey ? (
        <>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Input
              type="text"
              value={state.editModel.name}
              onChange={(event) =>
                state.setEditModel({ ...state.editModel, name: event.target.value })
              }
              className="h-8 w-full px-3 py-1.5 text-[12px]"
              placeholder={t('modelDisplayName')}
            />
            <Input
              type="text"
              value={state.editModel.modelId}
              onChange={(event) =>
                state.setEditModel({ ...state.editModel, modelId: event.target.value })
              }
              className="h-8 w-full px-3 py-1.5 font-mono text-[12px]"
              placeholder={t('modelActualId')}
            />
            <div className="text-xs text-muted-foreground">{priceText}</div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              onClick={() => state.handleSaveModel(model.modelKey)}
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title={t('save')}
            >
              <AppIcon name="check" className="h-4 w-4" />
            </Button>
            <Button
              onClick={state.handleCancelEditModel}
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title={t('cancel')}
            >
              <AppIcon name="close" className="w-3.5 h-3.5" />
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className={`min-w-0 flex-1 truncate text-[12px] font-semibold ${model.enabled ? 'text-foreground' : 'text-muted-foreground'}`}>
                {model.name}
              </span>
              {state.isDefaultModel(model) && model.enabled && (
                <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[10px] leading-none">
                  {t('default')}
                </Badge>
              )}
              <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground">{priceText}</span>
            </div>
            <span className="truncate text-[11px] text-muted-foreground" title={model.modelId}>
              {model.modelId}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {!state.isPresetModel(model.modelKey) && onUpdateModel && (
              <Button
                onClick={() => state.handleEditModel(model)}
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                title={t('configure')}
              >
                <AppIcon name="edit" className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              onClick={() => onDeleteModel(model.modelKey)}
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
            >
              <AppIcon name="trash" className="h-3.5 w-3.5" />
            </Button>

            <Switch
              checked={model.enabled}
              onCheckedChange={(nextEnabled) => {
                if (isComingSoonModel || nextEnabled === model.enabled) return
                onToggleModel(model.modelKey)
              }}
              disabled={isComingSoonModel}
              title={isComingSoonModel ? t('comingSoon') : undefined}
            />
          </div>
        </>
      )}
    </div>
  )
}
