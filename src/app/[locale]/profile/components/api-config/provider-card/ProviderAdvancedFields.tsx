'use client'

import { useEffect, useMemo, useState } from 'react'
import { AppIcon } from '@/components/ui/icons'
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
            <input
              type="number"
              step="0.01"
              min="0"
              value={state.newModel.priceInput ?? ''}
              onChange={(event) =>
                state.setNewModel({ ...state.newModel, priceInput: event.target.value })
              }
              placeholder={t('pricingInputLabel')}
              className="glass-input-base px-3 py-1.5 text-[12px] font-mono"
            />
            <input
              type="number"
              step="0.01"
              min="0"
              value={state.newModel.priceOutput ?? ''}
              onChange={(event) =>
                state.setNewModel({ ...state.newModel, priceOutput: event.target.value })
              }
              placeholder={t('pricingOutputLabel')}
              className="glass-input-base px-3 py-1.5 text-[12px] font-mono"
            />
            <span className="shrink-0 text-[11px] text-[var(--glass-text-tertiary)]">¥/M tokens</span>
          </div>
        )
      }

      if (targetType === 'image' || targetType === 'video') {
        return (
          <div className="mt-2 space-y-2">
            <input
              type="number"
              step="0.0001"
              min="0"
              value={state.newModel.basePrice ?? ''}
              onChange={(event) =>
                state.setNewModel({ ...state.newModel, basePrice: event.target.value })
              }
              placeholder={t('pricingBasePriceLabel')}
              className="glass-input-base w-full px-3 py-1.5 text-[12px] font-mono"
            />
            <textarea
              value={state.newModel.optionPricesJson ?? ''}
              onChange={(event) =>
                state.setNewModel({ ...state.newModel, optionPricesJson: event.target.value })
              }
              placeholder={t('pricingOptionPricesPlaceholder')}
              className="glass-input-base min-h-[84px] w-full resize-y px-3 py-2 text-[12px] font-mono"
            />
          </div>
        )
      }

      return null
    }

    return (
      <div className="mt-2.5 rounded-lg bg-[var(--glass-bg-muted)] px-2 py-2">
        <label className="flex items-center gap-2">
          <button
            onClick={() =>
              state.setNewModel({
                ...state.newModel,
                enableCustomPricing: !enabled,
              })
            }
            className="glass-check-mini"
            data-active={enabled}
            type="button"
          >
            {enabled && (
              <AppIcon name="checkSm" className="h-2.5 w-2.5 text-white" />
            )}
          </button>
          <span className="text-xs font-medium text-[var(--glass-text-secondary)]">
            {t('pricingEnableCustom')}
          </span>
        </label>
        {renderInputs()}
      </div>
    )
  }

  return useTabbedLayout ? (
    <div className="space-y-2.5 p-3">
      <div className="rounded-lg p-0.5" style={{ background: 'rgba(0,0,0,0.04)' }}>
        <div
          className="relative grid gap-1"
          style={{ gridTemplateColumns: `repeat(${Math.max(1, visibleTypes.length)}, minmax(0, 1fr))` }}
        >
          {visibleTypes.length > 0 && currentType && (
            <div
              className="absolute bottom-0.5 top-0.5 rounded-md bg-white transition-transform duration-200"
              style={{
                boxShadow: '0 1px 4px rgba(0,0,0,0.15), 0 0 0 0.5px rgba(0,0,0,0.06)',
                width: `calc(100% / ${visibleTypes.length})`,
                transform: `translateX(${Math.max(0, visibleTypes.indexOf(currentType)) * 100}%)`,
              }}
            />
          )}
          {visibleTypes.map((type) => (
            <button
              key={type}
              onClick={() => setActiveType(type)}
              className={`relative z-[1] flex items-center justify-center gap-1 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${currentType === type
                ? 'text-[var(--glass-text-primary)]'
                : 'text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-secondary)]'
                }`}
            >
              <TypeIcon type={type} className="h-3 w-3" />
              <span>{typeLabel(type, t)}</span>
            </button>
          ))}
        </div>
      </div>

      {currentType && (
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-[var(--glass-text-primary)]">
            <TypeIcon type={currentType} className="h-3 w-3" />
            <span>{typeLabel(currentType, t)}</span>
            <span className="rounded-full bg-[var(--glass-tone-neutral-bg)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--glass-tone-neutral-fg)]">
              {currentModels.length}
            </span>
          </div>
          {shouldShowAddButton && (
            <button
              onClick={() => state.setShowAddForm(currentType)}
              className="glass-btn-base glass-btn-soft px-2 py-1 text-[12px] font-medium"
            >
              <AppIcon name="plus" className="h-3.5 w-3.5" />
              {t('add')}
            </button>
          )}
        </div>
      )}

      {currentType && state.showAddForm === currentType && addableModelTypes.has(currentType) && (
        <div className="glass-surface-soft rounded-xl p-3">
          <div className="mb-2.5 flex items-center gap-2">
            <input
              type="text"
              value={state.newModel.name}
              onChange={(event) =>
                state.setNewModel({ ...state.newModel, name: event.target.value })
              }
              placeholder={t('modelDisplayName')}
              className="glass-input-base px-3 py-1.5 text-[12px]"
              autoFocus
            />
            <button onClick={state.handleCancelAdd} className="glass-icon-btn-sm">
              <AppIcon name="close" className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={state.newModel.modelId}
              onChange={(event) =>
                state.setNewModel({ ...state.newModel, modelId: event.target.value })
              }
              placeholder={t('modelActualId')}
              className={`glass-input-base flex-1 px-3 py-1.5 text-[12px] font-mono ${currentType === 'video' && state.batchMode && provider.id === 'ark' ? 'rounded-r-none' : ''}`}
            />
            {currentType === 'video' && state.batchMode && provider.id === 'ark' && (
              <span className="rounded-r-lg bg-[var(--glass-bg-muted)] px-2 py-1.5 font-mono text-[12px] text-[var(--glass-text-secondary)]">
                -batch
              </span>
            )}
            <button
              onClick={() => state.handleAddModel(currentType)}
              className="glass-btn-base glass-btn-primary px-3 py-1.5 text-[12px] font-medium"
            >
              {t('save')}
            </button>
          </div>
          {renderCustomPricingEditor(currentType)}
          {currentType === 'video' && provider.id === 'ark' && (
            <div className="mt-2.5 flex items-center gap-2 rounded-lg bg-[var(--glass-bg-muted)] px-2 py-2">
              <button
                onClick={() => state.setBatchMode(!state.batchMode)}
                className="glass-check-mini"
                data-active={state.batchMode}
              >
                {state.batchMode && (
                  <AppIcon name="checkSm" className="h-2.5 w-2.5 text-white" />
                )}
              </button>
              <span className="text-xs font-medium text-[var(--glass-text-secondary)]">
                {t('batchModeHalfPrice')}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="glass-surface-soft rounded-xl p-2">
        <div
          className="glass-provider-model-scroll h-[280px] overflow-y-auto pr-1"
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
          <p className="mb-3 text-[12px] text-[var(--glass-text-tertiary)]">{t('noModelsForProvider')}</p>
          <button
            onClick={() => state.setShowAddForm(defaultAddType)}
            className="glass-btn-base glass-btn-soft mx-auto px-3 py-1.5 text-[12px]"
          >
            <AppIcon name="plus" className="h-3.5 w-3.5" />
            {t('addModel')}
          </button>
        </div>
      ) : (
        <div className="glass-surface-soft rounded-xl p-3">
          <div className="mb-2.5 flex items-center gap-2">
            <input
              type="text"
              value={state.newModel.name}
              onChange={(event) =>
                state.setNewModel({ ...state.newModel, name: event.target.value })
              }
              placeholder={t('modelDisplayName')}
              className="glass-input-base px-3 py-1.5 text-[12px]"
              autoFocus
            />
            <button onClick={state.handleCancelAdd} className="glass-icon-btn-sm">
              <AppIcon name="close" className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={state.newModel.modelId}
              onChange={(event) =>
                state.setNewModel({ ...state.newModel, modelId: event.target.value })
              }
              placeholder={t('modelActualId')}
              className="glass-input-base flex-1 px-3 py-1.5 text-[12px] font-mono"
            />
            <button
              onClick={() => state.showAddForm && state.handleAddModel(state.showAddForm)}
              className="glass-btn-base glass-btn-primary px-3 py-1.5 text-[12px] font-medium"
            >
              {t('save')}
            </button>
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
  const rowDisabledClass = model.enabled ? '' : 'opacity-50'

  return (
    <div className={`group flex items-center justify-between gap-2 rounded-xl bg-[var(--glass-bg-surface)] px-3 py-2 transition-colors hover:bg-[var(--glass-bg-surface-strong)] ${rowDisabledClass}`}>
      {state.editingModelId === model.modelKey ? (
        <>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <input
              type="text"
              value={state.editModel.name}
              onChange={(event) =>
                state.setEditModel({ ...state.editModel, name: event.target.value })
              }
              className="glass-input-base w-full px-3 py-1.5 text-[12px]"
              placeholder={t('modelDisplayName')}
            />
            <input
              type="text"
              value={state.editModel.modelId}
              onChange={(event) =>
                state.setEditModel({ ...state.editModel, modelId: event.target.value })
              }
              className="glass-input-base w-full px-3 py-1.5 text-[12px] font-mono"
              placeholder={t('modelActualId')}
            />
            <div className="text-xs text-[var(--glass-text-tertiary)]">{priceText}</div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => state.handleSaveModel(model.modelKey)}
              className="glass-icon-btn-sm"
              title={t('save')}
            >
              <AppIcon name="check" className="h-4 w-4" />
            </button>
            <button
              onClick={state.handleCancelEditModel}
              className="glass-icon-btn-sm"
              title={t('cancel')}
            >
              <AppIcon name="close" className="w-3.5 h-3.5" />
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-[12px] font-semibold ${model.enabled ? 'text-[var(--glass-text-primary)]' : 'text-[var(--glass-text-secondary)]'}`}>
                {model.name}
              </span>
              {state.isDefaultModel(model) && model.enabled && (
                <span className="shrink-0 rounded-md bg-[var(--glass-text-primary)] px-1.5 py-0.5 text-[10px] leading-none text-white">
                  {t('default')}
                </span>
              )}
              <span className="shrink-0 text-[11px] text-[var(--glass-text-tertiary)]">{priceText}</span>
            </div>
            <span className="break-all text-[11px] text-[var(--glass-text-tertiary)]">{model.modelId}</span>
          </div>

          <div className="flex items-center gap-1.5">
            {!state.isPresetModel(model.modelKey) && onUpdateModel && (
              <button
                onClick={() => state.handleEditModel(model)}
                className="glass-icon-btn-sm opacity-0 transition-opacity group-hover:opacity-100"
                title={t('configure')}
              >
                <AppIcon name="edit" className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => onDeleteModel(model.modelKey)}
              className="glass-icon-btn-sm opacity-0 transition-opacity hover:text-[var(--glass-tone-danger-fg)] group-hover:opacity-100"
            >
              <AppIcon name="trash" className="h-3.5 w-3.5" />
            </button>

            <button
              onClick={() => {
                if (isComingSoonModel) return
                onToggleModel(model.modelKey)
              }}
              className={`glass-toggle ${isComingSoonModel ? 'cursor-not-allowed opacity-60' : ''}`}
              data-active={model.enabled}
              disabled={isComingSoonModel}
              title={isComingSoonModel ? t('comingSoon') : undefined}
            >
              <div className="glass-toggle-thumb"></div>
            </button>
          </div>
        </>
      )}
    </div>
  )
}
