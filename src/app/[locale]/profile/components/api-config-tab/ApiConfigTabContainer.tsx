'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import type { CapabilityValue } from '@/lib/model-config-contract'
import {
  encodeModelKey,
  getProviderDisplayName,
  parseModelKey,
  useProviders,
} from '../api-config'
import { ApiConfigToolbar } from './ApiConfigToolbar'
import { ApiConfigProviderList } from './ApiConfigProviderList'
import { useApiConfigFilters } from './hooks/useApiConfigFilters'
import { ModelCapabilityDropdown } from '@/components/ui/config-modals/ModelCapabilityDropdown'
import { AppIcon } from '@/components/ui/icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type CustomProviderType = 'gemini-compatible' | 'openai-compatible'
type DefaultModelField =
  | 'analysisModel'
  | 'characterModel'
  | 'locationModel'
  | 'storyboardModel'
  | 'editModel'
  | 'videoModel'
  | 'lipSyncModel'

const MONO_ICON_BADGE =
  'inline-flex items-center justify-center rounded-lg border border-border bg-muted p-1 text-muted-foreground'
const EMPTY_MODEL_VALUE = '__none__'

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
  lipsync: () => (
    <AppIcon name="audioWave" className="w-3.5 h-3.5" />
  ),
}

interface DefaultModelCardConfig {
  field: DefaultModelField
  modelType: 'llm' | 'image' | 'video' | 'lipsync'
  title: string
  icon: keyof Pick<typeof Icons, 'llm' | 'image' | 'video' | 'lipsync'>
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
    capabilityDefaults,
    loading,
    saveStatus,
    updateProviderApiKey,
    updateProviderBaseUrl,
    addProvider,
    deleteProvider,
    toggleModel,
    deleteModel,
    addModel,
    updateModel,
    updateDefaultModel,
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
    audioProviders,
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

  const handleAddGeminiProvider = () => {
    if (!newGeminiProvider.name || !newGeminiProvider.baseUrl) {
      alert(tp('fillRequired'))
      return
    }

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
      apiMode: newGeminiProvider.apiType === 'openai-compatible' ? 'openai-official' : 'gemini-sdk',
    })

    setNewGeminiProvider({
      name: '',
      baseUrl: '',
      apiKey: '',
      apiType: 'gemini-compatible',
    })
    setShowAddGeminiProvider(false)
  }

  const handleCancelAddGeminiProvider = () => {
    setNewGeminiProvider({
      name: '',
      baseUrl: '',
      apiKey: '',
      apiType: 'gemini-compatible',
    })
    setShowAddGeminiProvider(false)
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-muted-foreground">
        {tc('loading')}
      </div>
    )
  }

  const defaultModelCards: DefaultModelCardConfig[] = [
    { field: 'analysisModel', modelType: 'llm', title: t('textDefault'), icon: 'llm' },
    { field: 'characterModel', modelType: 'image', title: t('characterDefault'), icon: 'image' },
    { field: 'locationModel', modelType: 'image', title: t('locationDefault'), icon: 'image' },
    { field: 'storyboardModel', modelType: 'image', title: t('storyboardDefault'), icon: 'image' },
    { field: 'editModel', modelType: 'image', title: t('editDefault'), icon: 'image' },
    { field: 'videoModel', modelType: 'video', title: t('videoDefault'), icon: 'video' },
    { field: 'lipSyncModel', modelType: 'lipsync', title: t('lipsyncDefault'), icon: 'lipsync' },
  ]

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
        <div className="w-full space-y-6 p-6">
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-3">
              <div className="mb-1 flex items-center gap-2 px-1">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
                  <Icons.settings />
                </span>
                <h2 className="text-[15px] font-semibold text-foreground">{t('defaultModels')}</h2>
              </div>
              <p className="px-1 text-[12px] text-muted-foreground">
                {t('defaultModel.hint')}
              </p>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid justify-start gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,18.5rem),20rem))]">
              {defaultModelCards.map((card) => {
                const options = getEnabledModelsByType(card.modelType)
                const currentKey = defaultModels[card.field]
                const parsed = parseModelKey(currentKey)
                const normalizedKey = parsed ? encodeModelKey(parsed.provider, parsed.modelId) : ''
                const current = normalizedKey
                  ? options.find((option) => option.modelKey === normalizedKey)
                  : null
                const capabilityFields = (() => {
                  if (!current || !current.capabilities) return [] as Array<{ field: string; options: CapabilityValue[] }>
                  const namespace = current.capabilities[card.modelType]
                  if (!isRecord(namespace)) return [] as Array<{ field: string; options: CapabilityValue[] }>
                  return Object.entries(namespace)
                    .filter(([key, value]) => key.endsWith('Options') && Array.isArray(value) && value.every(isCapabilityValue) && value.length > 0)
                    .map(([key, value]) => ({
                      field: key.slice(0, -'Options'.length),
                      options: value as CapabilityValue[],
                    }))
                })()
                const ModelIcon = Icons[card.icon]

                return (
                  <Card
                    key={card.field}
                    className="w-full border-border bg-muted/30 shadow-none"
                  >
                    <CardContent className="space-y-2 p-2.5">
                      <div className="flex items-center gap-2">
                        <span className={MONO_ICON_BADGE}>
                          <ModelIcon />
                        </span>
                        <span className="text-[12px] font-semibold text-foreground">
                          {card.title}
                        </span>
                      </div>
                      {card.modelType === 'video' || card.modelType === 'image' || card.modelType === 'llm' ? (
                        <ModelCapabilityDropdown
                          compact
                          models={options.map((opt) => ({
                            value: opt.modelKey,
                            label: opt.name,
                            provider: opt.provider,
                            providerName: opt.providerName || getProviderDisplayName(opt.provider, locale),
                          }))}
                          value={normalizedKey || undefined}
                          onModelChange={(newModelKey) => {
                            const newModel = options.find((opt) => opt.modelKey === newModelKey)
                            const newCapFields = extractCapabilityFieldsFromModel(
                              newModel?.capabilities as Record<string, unknown> | undefined,
                              card.modelType,
                            )
                            updateDefaultModel(card.field, newModelKey, newCapFields)
                          }}
                          capabilityFields={capabilityFields.map((d) => ({
                            ...d,
                            label: toCapabilityFieldLabel(d.field),
                          }))}
                          capabilityOverrides={
                            current
                              ? Object.fromEntries(
                                capabilityFields
                                  .filter((d) => capabilityDefaults[current.modelKey]?.[d.field] !== undefined)
                                  .map((d) => [d.field, capabilityDefaults[current.modelKey][d.field]])
                              )
                              : {}
                          }
                          onCapabilityChange={(field, rawValue, sample) => {
                            if (!current) return
                            if (!rawValue) {
                              updateCapabilityDefault(current.modelKey, field, null)
                              return
                            }
                            updateCapabilityDefault(
                              current.modelKey,
                              field,
                              parseBySample(rawValue, sample),
                            )
                          }}
                          placeholder={t('selectDefault')}
                        />
                      ) : (
                        <>
                          <Select
                            value={normalizedKey || EMPTY_MODEL_VALUE}
                            onValueChange={(nextValue) =>
                              updateDefaultModel(
                                card.field,
                                nextValue === EMPTY_MODEL_VALUE ? '' : nextValue,
                              )}
                          >
                            <SelectTrigger className="h-8 text-[12px]">
                              <SelectValue placeholder={t('selectDefault')} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={EMPTY_MODEL_VALUE}>{t('selectDefault')}</SelectItem>
                              {options.map((option) => (
                                <SelectItem key={option.modelKey} value={option.modelKey}>
                                  {option.name} ({option.providerName || getProviderDisplayName(option.provider, locale)})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {current && card.modelType !== 'lipsync' && (
                            <div className="mt-1.5 flex items-center justify-between px-0.5">
                              <span className="text-[11px] text-muted-foreground">
                                {current.providerName}
                              </span>
                            </div>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
              </div>
            </CardContent>
          </Card>

          <ApiConfigProviderList
            modelProviders={modelProviders}
            allModels={models}
            defaultModels={defaultModels}
            audioProviders={audioProviders}
            getModelsForProvider={getModelsForProvider}
            onAddGeminiProvider={() => setShowAddGeminiProvider(true)}
            onToggleModel={toggleModel}
            onUpdateApiKey={updateProviderApiKey}
            onUpdateBaseUrl={updateProviderBaseUrl}
            onDeleteModel={deleteModel}
            onUpdateModel={updateModel}
            onDeleteProvider={deleteProvider}
            onAddModel={addModel}
            labels={{
              providerPool: t('providerPool'),
              builtinProviders: t('builtinProviders'),
              customProviders: t('customProviders'),
              addGeminiProvider: t('addGeminiProvider'),
              otherProviders: t('otherProviders'),
              audioCategory: t('audioCategory'),
              audioApiKey: t('sections.audioApiKey'),
            }}
          />
        </div>
      </div>

      <Dialog open={showAddGeminiProvider} onOpenChange={(open) => (open ? setShowAddGeminiProvider(true) : handleCancelAddGeminiProvider())}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('addGeminiProvider')}</DialogTitle>
            <DialogDescription>{t('providerPool')}</DialogDescription>
          </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              {t('apiType')}
            </label>
            <Select
              value={newGeminiProvider.apiType}
              onValueChange={(value) =>
                setNewGeminiProvider({
                  ...newGeminiProvider,
                  apiType: value as CustomProviderType,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gemini-compatible">{t('apiTypeGeminiCompatible')}</SelectItem>
                <SelectItem value="openai-compatible">{t('apiTypeOpenAICompatible')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              {tp('name')}
            </label>
            <Input
              type="text"
              value={newGeminiProvider.name}
              onChange={(event) =>
                setNewGeminiProvider({
                  ...newGeminiProvider,
                  name: event.target.value,
                })
              }
              placeholder={tp('name')}
              className="h-10"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              {t('baseUrl')}
            </label>
            <Input
              type="text"
              value={newGeminiProvider.baseUrl}
              onChange={(event) =>
                setNewGeminiProvider({
                  ...newGeminiProvider,
                  baseUrl: event.target.value,
                })
              }
              placeholder={t('baseUrl')}
              className="h-10 font-mono"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              {t('apiKeyLabel')}
            </label>
            <Input
              type="password"
              value={newGeminiProvider.apiKey}
              onChange={(event) =>
                setNewGeminiProvider({
                  ...newGeminiProvider,
                  apiKey: event.target.value,
                })
              }
              placeholder={t('apiKeyLabel')}
              className="h-10"
            />
          </div>
        </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelAddGeminiProvider}>
              {tc('cancel')}
            </Button>
            <Button onClick={handleAddGeminiProvider}>{tp('add')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
