'use client'

import type { CustomModel, Provider } from '../api-config'
import { PRESET_PROVIDERS, ProviderCard, ProviderSection, getProviderKey } from '../api-config'
import { AppIcon } from '@/components/ui/icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface DefaultModels {
  analysisModel?: string
  characterModel?: string
  locationModel?: string
  storyboardModel?: string
  editModel?: string
  videoModel?: string
  lipSyncModel?: string
}

interface ApiConfigProviderListProps {
  modelProviders: Provider[]
  allModels: CustomModel[]
  defaultModels: DefaultModels
  audioProviders: Provider[]
  getModelsForProvider: (providerId: string) => CustomModel[]
  onAddGeminiProvider: () => void
  onToggleModel: (modelKey: string, providerId: string) => void
  onUpdateApiKey: (providerId: string, apiKey: string) => void
  onUpdateBaseUrl: (providerId: string, baseUrl: string) => void
  onDeleteModel: (modelKey: string, providerId: string) => void
  onUpdateModel: (modelKey: string, updates: Partial<CustomModel>, providerId: string) => void
  onDeleteProvider: (providerId: string) => void
  onAddModel: (model: Omit<CustomModel, 'enabled'>) => void
  labels: {
    providerPool: string
    builtinProviders: string
    customProviders: string
    addGeminiProvider: string
    otherProviders: string
    audioCategory: string
    audioApiKey: string
  }
}

const AUDIO_ICON = (
  <AppIcon name="cube" className="h-4 w-4 text-muted-foreground" />
)

export function ApiConfigProviderList({
  modelProviders,
  allModels,
  defaultModels,
  audioProviders,
  getModelsForProvider,
  onAddGeminiProvider,
  onToggleModel,
  onUpdateApiKey,
  onUpdateBaseUrl,
  onDeleteModel,
  onUpdateModel,
  onDeleteProvider,
  onAddModel,
  labels,
}: ApiConfigProviderListProps) {
  const providerGridClassName =
    'grid justify-start gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,20rem),22rem))]'
  const presetProviderKeys = new Set(PRESET_PROVIDERS.map((provider) => provider.id))
  const builtinProviders = modelProviders.filter((provider) => (
    !provider.id.includes(':') && presetProviderKeys.has(getProviderKey(provider.id))
  ))
  const customProviders = modelProviders.filter((provider) => (
    provider.id.includes(':') || !presetProviderKeys.has(getProviderKey(provider.id))
  ))
  const hasAudioProviders = audioProviders.length > 0
  const hasOtherProviders = hasAudioProviders

  return (
    <>
      <div className="space-y-5">
        <div className="px-1">
          <h2 className="text-base font-bold text-foreground">{labels.providerPool}</h2>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              {labels.builtinProviders}
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {builtinProviders.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {builtinProviders.length > 0 ? (
              <div className={providerGridClassName}>
                {builtinProviders.map((provider) => (
                  <ProviderCard
                    key={provider.id}
                    provider={provider}
                    models={getModelsForProvider(provider.id)}
                    allModels={allModels}
                    defaultModels={defaultModels}
                    onToggleModel={(modelKey) => onToggleModel(modelKey, provider.id)}
                    onUpdateApiKey={onUpdateApiKey}
                    onUpdateBaseUrl={onUpdateBaseUrl}
                    onDeleteModel={(modelKey) => onDeleteModel(modelKey, provider.id)}
                    onUpdateModel={(modelKey, updates) => onUpdateModel(modelKey, updates, provider.id)}
                    onDeleteProvider={onDeleteProvider}
                    onAddModel={onAddModel}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-8 text-center text-sm text-muted-foreground">
                {labels.builtinProviders}（0）
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                {labels.customProviders}
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  {customProviders.length}
                </Badge>
              </CardTitle>
              <Button
                onClick={onAddGeminiProvider}
                className="h-8 cursor-pointer px-3 text-sm font-semibold"
              >
                {labels.addGeminiProvider}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {customProviders.length > 0 ? (
              <div className={providerGridClassName}>
                {customProviders.map((provider) => (
                  <ProviderCard
                    key={provider.id}
                    provider={provider}
                    models={getModelsForProvider(provider.id)}
                    allModels={allModels}
                    defaultModels={defaultModels}
                    onToggleModel={(modelKey) => onToggleModel(modelKey, provider.id)}
                    onUpdateApiKey={onUpdateApiKey}
                    onUpdateBaseUrl={onUpdateBaseUrl}
                    onDeleteModel={(modelKey) => onDeleteModel(modelKey, provider.id)}
                    onUpdateModel={(modelKey, updates) => onUpdateModel(modelKey, updates, provider.id)}
                    onDeleteProvider={onDeleteProvider}
                    onAddModel={onAddModel}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-8 text-center text-sm text-muted-foreground">
                {labels.customProviders}（0）
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {hasOtherProviders && (
        <div className="pt-4">
          <h2 className="mb-4 px-1 text-base font-bold text-foreground">
            {labels.otherProviders}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({labels.audioCategory})
            </span>
          </h2>
          <div className="space-y-4">
            {hasAudioProviders && (
              <ProviderSection
                title={labels.audioApiKey}
                icon={AUDIO_ICON}
                type="audio"
                providers={audioProviders}
                onUpdateApiKey={onUpdateApiKey}
              />
            )}
          </div>
        </div>
      )}
    </>
  )
}
