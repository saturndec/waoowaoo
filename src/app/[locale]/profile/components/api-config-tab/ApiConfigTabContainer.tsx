'use client'

import { useState, useCallback } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { GlassModalShell } from '@/components/ui/primitives'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import type { CapabilityValue } from '@/lib/model-config-contract'
import { apiFetch } from '@/lib/api-fetch'
import {
  encodeModelKey,
  getProviderDisplayName,
  parseModelKey,
  useProviders,
} from '../api-config'
import { ApiConfigToolbar } from './ApiConfigToolbar'
import { ApiConfigProviderList } from './ApiConfigProviderList'
import { DefaultModelCards } from './DefaultModelCards'
import { useApiConfigFilters } from './hooks/useApiConfigFilters'
import { AppIcon } from '@/components/ui/icons'

type TestStepStatus = 'pass' | 'fail' | 'skip'
interface TestStep {
  name: string
  status: TestStepStatus
  message: string
  model?: string
  detail?: string
}
type TestStatus = 'idle' | 'testing' | 'passed' | 'failed'

type CustomProviderType = 'gemini-compatible' | 'openai-compatible' | 'grok-compatible'

const Icons = {
  settings: () => (
    <AppIcon name="settingsHex" className="w-3.5 h-3.5" />
  ),
  llm: () => (
    <AppIcon name="menu" className="w-3.5 h-3.5" />
  ),
  image: () => (
    <AppIcon name="image" className="w-3.5 h-3.5" />
  ),
  video: () => (
    <AppIcon name="video" className="w-3.5 h-3.5" />
  ),
  audio: () => (
    <AppIcon name="audioWave" className="w-3.5 h-3.5" />
  ),
  lipsync: () => (
    <AppIcon name="audioWave" className="w-3.5 h-3.5" />
  ),
  chevronDown: () => (
    <AppIcon name="chevronDown" className="w-3 h-3" />
  ),
}



function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isCapabilityValue(value: unknown): value is CapabilityValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function extractCapabilityFieldsFromModel(
  capabilities: Record<string, unknown> | undefined,
  modelType: string,
): Array<{ field: string; options: CapabilityValue[] }> {
  if (!capabilities) return []
  const namespace = capabilities[modelType]
  if (!isRecord(namespace)) return []
  return Object.entries(namespace)
    .filter(([key, value]) => key.endsWith('Options') && Array.isArray(value) && value.every(isCapabilityValue) && value.length > 0)
    .map(([key, value]) => ({
      field: key.slice(0, -'Options'.length),
      options: value as CapabilityValue[],
    }))
}

function parseBySample(input: string, sample: CapabilityValue): CapabilityValue {
  if (typeof sample === 'number') return Number(input)
  if (typeof sample === 'boolean') return input === 'true'
  return input
}

function toCapabilityFieldLabel(field: string): string {
  return field.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase())
}

export function ApiConfigTabContainer() {
  const locale = useLocale()
  const {
    providers,
    models,
    defaultModels,
    workflowConcurrency,
    capabilityDefaults,
    loading,
    saveStatus,
    flushConfig,
    updateProviderHidden,
    updateProviderApiKey,
    updateProviderBaseUrl,
    reorderProviders,
    addProvider,
    deleteProvider,
    toggleModel,
    deleteModel,
    addModel,
    updateModel,
    updateDefaultModel,
    batchUpdateDefaultModels,
    updateWorkflowConcurrency,
    updateCapabilityDefault,
  } = useProviders()

  const t = useTranslations('apiConfig')
  const tc = useTranslations('common')
  const tp = useTranslations('providerSection')

  const savingState =
    saveStatus === 'saving'
      ? resolveTaskPresentationState({
        phase: 'processing',
        intent: 'modify',
        resource: 'text',
        hasOutput: true,
      })
      : null

  const {
    modelProviders,
    getModelsForProvider,
    getEnabledModelsByType,
  } = useApiConfigFilters({
    providers,
    models,
  })

  const [showAddGeminiProvider, setShowAddGeminiProvider] = useState(false)
  const [newGeminiProvider, setNewGeminiProvider] = useState<{
    name: string
    baseUrl: string
    apiKey: string
    apiType: CustomProviderType
  }>({
    name: '',
    baseUrl: '',
    apiKey: '',
    apiType: 'gemini-compatible',
  })
  const [testStatus, setTestStatus] = useState<TestStatus>('idle')
  const [testSteps, setTestSteps] = useState<TestStep[]>([])

  const doAddProvider = useCallback(() => {
    const uuid = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    const providerId = `${newGeminiProvider.apiType}:${uuid}`
    const name = newGeminiProvider.name.trim()
    const baseUrl = newGeminiProvider.baseUrl.trim()
    const apiKey = newGeminiProvider.apiKey.trim()

    addProvider({
      id: providerId,
      name,
      baseUrl,
      apiKey,
      apiMode: newGeminiProvider.apiType === 'gemini-compatible' ? 'gemini-sdk' : 'openai-official',
    })

    setNewGeminiProvider({ name: '', baseUrl: '', apiKey: '', apiType: 'gemini-compatible' })
    setTestStatus('idle')
    setTestSteps([])
    setShowAddGeminiProvider(false)
  }, [newGeminiProvider, addProvider])

  const handleAddGeminiProvider = useCallback(async () => {
    if (!newGeminiProvider.name || !newGeminiProvider.baseUrl) {
      alert(tp('fillRequired'))
      return
    }

    setTestStatus('testing')
    setTestSteps([])

    try {
      const res = await apiFetch('/api/user/api-config/test-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiType: newGeminiProvider.apiType,
          baseUrl: newGeminiProvider.baseUrl.trim(),
          apiKey: newGeminiProvider.apiKey.trim(),
        }),
      })

      const data = await res.json()
      const steps: TestStep[] = data.steps || []
      setTestSteps(steps)

      if (data.success) {
        setTestStatus('passed')
        // Auto-add on success
        doAddProvider()
      } else {
        setTestStatus('failed')
      }
    } catch {
      setTestSteps([{ name: 'models', status: 'fail', message: 'Network error' }])
      setTestStatus('failed')
    }
  }, [newGeminiProvider, tp, doAddProvider])

  const handleForceAdd = useCallback(() => {
    doAddProvider()
  }, [doAddProvider])

  const handleCancelAddGeminiProvider = () => {
    setNewGeminiProvider({ name: '', baseUrl: '', apiKey: '', apiType: 'gemini-compatible' })
    setTestStatus('idle')
    setTestSteps([])
    setShowAddGeminiProvider(false)
  }

  const handleWorkflowConcurrencyChange = useCallback(
    (field: 'analysis' | 'image' | 'video', rawValue: string) => {
      const parsed = Number.parseInt(rawValue, 10)
      if (!Number.isFinite(parsed) || parsed <= 0) return
      updateWorkflowConcurrency(field, parsed)
    },
    [updateWorkflowConcurrency],
  )

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-[var(--glass-text-tertiary)]">
        {tc('loading')}
      </div>
    )
  }



  return (
    <div className="flex h-full flex-col">
      <ApiConfigToolbar
        title={t('title')}
        saveStatus={saveStatus}
        savingState={savingState}
        savingLabel={t('saving')}
        savedLabel={t('saved')}
        saveFailedLabel={t('saveFailed')}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="space-y-6 p-6">
          <DefaultModelCards
            t={t}
            defaultModels={defaultModels}
            getEnabledModelsByType={getEnabledModelsByType}
            parseModelKey={parseModelKey}
            encodeModelKey={encodeModelKey}
            getProviderDisplayName={getProviderDisplayName}
            locale={locale}
            updateDefaultModel={updateDefaultModel}
            batchUpdateDefaultModels={batchUpdateDefaultModels}
            extractCapabilityFieldsFromModel={extractCapabilityFieldsFromModel}
            toCapabilityFieldLabel={toCapabilityFieldLabel}
            capabilityDefaults={capabilityDefaults}
            updateCapabilityDefault={updateCapabilityDefault}
            parseBySample={parseBySample}
            workflowConcurrency={workflowConcurrency}
            handleWorkflowConcurrencyChange={handleWorkflowConcurrencyChange}
          />

          <ApiConfigProviderList
            modelProviders={modelProviders}
            allModels={models}
            defaultModels={defaultModels}
            getModelsForProvider={getModelsForProvider}
            onAddGeminiProvider={() => setShowAddGeminiProvider(true)}
            onToggleModel={toggleModel}
            onUpdateApiKey={updateProviderApiKey}
            onUpdateBaseUrl={updateProviderBaseUrl}
            onReorderProviders={reorderProviders}
            onDeleteModel={deleteModel}
            onUpdateModel={updateModel}
            onDeleteProvider={deleteProvider}
            onAddModel={addModel}
            onFlushConfig={flushConfig}
            onToggleProviderHidden={updateProviderHidden}
            labels={{
              providerPool: t('providerPool'),
              providerPoolDesc: t('providerPoolDesc'),
              dragToSort: t('dragToSort'),
              dragToSortHint: t('dragToSortHint'),
              hideProvider: t('hideProvider'),
              showProvider: t('showProvider'),
              showHiddenProviders: t('showHiddenProviders'),
              hideHiddenProviders: t('hideHiddenProviders'),
              hiddenProvidersPrefix: t('hiddenProvidersPrefix'),
              addGeminiProvider: t('addGeminiProvider'),
            }}
          />
        </div>
      </div>

      <GlassModalShell
        open={showAddGeminiProvider}
        onClose={handleCancelAddGeminiProvider}
        title={t('addGeminiProvider')}
        description={t('providerPool')}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={handleCancelAddGeminiProvider}
              className="glass-btn-base glass-btn-secondary px-3 py-1.5 text-sm"
            >
              {tc('cancel')}
            </button>
            {testStatus === 'failed' && (
              <button
                onClick={handleForceAdd}
                className="glass-btn-base glass-btn-secondary px-3 py-1.5 text-sm"
              >
                {t('addAnyway')}
              </button>
            )}
            {testStatus === 'failed' ? (
              <button
                onClick={handleAddGeminiProvider}
                className="glass-btn-base glass-btn-primary px-3 py-1.5 text-sm"
              >
                {t('testRetry')}
              </button>
            ) : (
              <button
                onClick={handleAddGeminiProvider}
                disabled={testStatus === 'testing'}
                className="glass-btn-base glass-btn-primary px-3 py-1.5 text-sm disabled:opacity-50"
              >
                {testStatus === 'testing' ? t('testing') : tp('add')}
              </button>
            )}
          </div>
        }
      >
        <div className="space-y-3">
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400">
            <AppIcon name="alert" className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="text-[12px] leading-relaxed">{t('customProviderTip')}</span>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--glass-text-primary)]">
              {t('apiType')}
            </label>
            <div className="relative">
              <select
                value={newGeminiProvider.apiType}
                onChange={(event) =>
                  setNewGeminiProvider({
                    ...newGeminiProvider,
                    apiType: event.target.value as CustomProviderType,
                  })
                }
                disabled={testStatus === 'testing'}
                className="glass-select-base w-full cursor-pointer appearance-none px-3 py-2.5 pr-8 text-sm"
              >
                <option value="gemini-compatible">{t('apiTypeGeminiCompatible')}</option>
                <option value="openai-compatible">{t('apiTypeOpenAICompatible')}</option>
                <option value="grok-compatible">{t('apiTypeGrokCompatible')}</option>
              </select>
              <div className="pointer-events-none absolute right-3 top-3 text-[var(--glass-text-tertiary)]">
                <Icons.chevronDown />
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--glass-text-primary)]">
              {tp('name')}
            </label>
            <input
              type="text"
              value={newGeminiProvider.name}
              onChange={(event) =>
                setNewGeminiProvider({
                  ...newGeminiProvider,
                  name: event.target.value,
                })
              }
              disabled={testStatus === 'testing'}
              placeholder={tp('name')}
              className="glass-input-base w-full px-3 py-2.5 text-sm"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--glass-text-primary)]">
              {t('baseUrl')}
            </label>
            <input
              type="text"
              value={newGeminiProvider.baseUrl}
              onChange={(event) =>
                setNewGeminiProvider({
                  ...newGeminiProvider,
                  baseUrl: event.target.value,
                })
              }
              disabled={testStatus === 'testing'}
              placeholder={t('baseUrl')}
              className="glass-input-base w-full px-3 py-2.5 text-sm font-mono"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--glass-text-primary)]">
              {t('apiKeyLabel')}
            </label>
            <input
              type="password"
              value={newGeminiProvider.apiKey}
              onChange={(event) =>
                setNewGeminiProvider({
                  ...newGeminiProvider,
                  apiKey: event.target.value,
                })
              }
              disabled={testStatus === 'testing'}
              placeholder={t('apiKeyLabel')}
              className="glass-input-base w-full px-3 py-2.5 text-sm"
            />
          </div>

          {/* Test Results */}
          {testStatus !== 'idle' && (
            <div className="space-y-2 rounded-xl border border-[var(--glass-border)] p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--glass-text-primary)]">
                <AppIcon name="settingsHex" className="h-3.5 w-3.5" />
                {t('testConnection')}
              </div>

              {testStatus === 'testing' && testSteps.length === 0 && (
                <div className="flex items-center gap-2 text-xs text-[var(--glass-text-secondary)]">
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  {t('testing')}
                </div>
              )}

              {testSteps.map((step) => {
                const stepLabel = t(`testStep.${step.name}` as Parameters<typeof t>[0])
                return (
                  <div key={step.name} className="space-y-0.5">
                    <div className="flex items-center gap-2 text-xs">
                      {step.status === 'pass' && (
                        <span className="text-green-500">
                          <AppIcon name="check" className="h-3.5 w-3.5" />
                        </span>
                      )}
                      {step.status === 'fail' && (
                        <span className="text-red-500">
                          <AppIcon name="close" className="h-3.5 w-3.5" />
                        </span>
                      )}
                      {step.status === 'skip' && (
                        <span className="text-[var(--glass-text-tertiary)]">–</span>
                      )}
                      <span className="font-medium text-[var(--glass-text-primary)]">
                        {stepLabel}
                      </span>
                      {step.model && (
                        <span className="rounded bg-[var(--glass-bg-surface)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--glass-text-secondary)]">
                          {step.model}
                        </span>
                      )}
                    </div>
                    <p className={`pl-5 text-[11px] ${step.status === 'fail' ? 'text-red-400' : 'text-[var(--glass-text-secondary)]'}`}>
                      {step.message}
                    </p>
                    {step.detail && (
                      <p className="pl-5 text-[10px] text-[var(--glass-text-tertiary)] break-all line-clamp-3">
                        {step.detail}
                      </p>
                    )}
                  </div>
                )
              })}

              {testStatus === 'failed' && (
                <div className="flex items-start gap-2 rounded-lg bg-yellow-500/10 px-2.5 py-2 text-[11px] text-yellow-600 dark:text-yellow-400">
                  <span className="mt-0.5 shrink-0">⚠</span>
                  <span>{t('testWarning')}</span>
                </div>
              )}

              {testStatus === 'passed' && (
                <div className="flex items-center gap-2 rounded-lg bg-green-500/10 px-2.5 py-2 text-[11px] text-green-600 dark:text-green-400">
                  <AppIcon name="check" className="h-3.5 w-3.5" />
                  {t('testPassed')}
                </div>
              )}
            </div>
          )}
        </div>
      </GlassModalShell>
    </div>
  )
}
