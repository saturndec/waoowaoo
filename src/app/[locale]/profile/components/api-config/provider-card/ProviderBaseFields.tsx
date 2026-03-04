'use client'

import type { ProviderCardProps, ProviderCardTranslator } from './types'
import type { UseProviderCardStateResult } from './hooks/useProviderCardState'
import { AppIcon } from '@/components/ui/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface ProviderBaseFieldsProps {
  provider: ProviderCardProps['provider']
  t: ProviderCardTranslator
  state: UseProviderCardStateResult
}

export function ProviderBaseFields({ provider, t, state }: ProviderBaseFieldsProps) {
  const baseUrlPlaceholder = (() => {
    switch (state.providerKey) {
      case 'gemini-compatible':
        return 'https://your-api-domain.com'
      case 'openai-compatible':
        return 'https://api.openai.com/v1'
      default:
        return 'http://localhost:8000'
    }
  })()

  return (
    <>
      <div className="px-3.5 pt-2.5">
        <div className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/40 px-3 py-2">
          <span className="w-[64px] shrink-0 whitespace-nowrap text-[12px] font-semibold text-foreground">
            {t('apiKeyLabel')}
          </span>
          {state.isEditing ? (
            <div className="flex flex-1 items-center gap-2">
              <Input
                type="text"
                value={state.tempKey}
                onChange={(event) => state.setTempKey(event.target.value)}
                placeholder={t('enterApiKey')}
                className="h-8 flex-1 px-3 py-1.5 text-[12px]"
                autoFocus
              />
              <Button
                onClick={state.handleSaveKey}
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title={t('save')}
              >
                <AppIcon name="check" className="h-4 w-4" />
              </Button>
              <Button
                onClick={state.handleCancelEdit}
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title={t('cancel')}
              >
                <AppIcon name="close" className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {provider.hasApiKey ? (
                <>
                  <span className="min-w-0 max-w-[220px] flex-1 truncate rounded-lg border border-border bg-background px-3 py-1.5 font-mono text-[12px] text-muted-foreground">
                    {state.showKey ? provider.apiKey : state.maskedKey}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      onClick={() => state.setShowKey(!state.showKey)}
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title={state.showKey ? t('hide') : t('show')}
                    >
                      {state.showKey ? (
                        <AppIcon name="eye" className="h-4 w-4" />
                      ) : (
                        <AppIcon name="eyeOff" className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      onClick={state.startEditKey}
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title={t('configure')}
                    >
                      <AppIcon name="edit" className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              ) : (
                <Button
                  onClick={state.startEditKey}
                  variant="secondary"
                  className="h-7 px-2.5 text-[12px] font-semibold"
                >
                  <AppIcon name="plus" className="h-3.5 w-3.5" />
                  <span>{t('connect')}</span>
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {state.showBaseUrlEdit && (
        <div className="px-3.5 pb-2.5 pt-2">
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/40 px-3 py-2">
            <div className="flex w-full items-center gap-2">
              <span className="w-[64px] shrink-0 whitespace-nowrap text-[12px] font-semibold text-muted-foreground">
                {t('baseUrl')}
              </span>
              {state.isEditingUrl ? (
                <div className="flex flex-1 items-center gap-2">
                  <Input
                    type="text"
                    value={state.tempUrl}
                    onChange={(event) => state.setTempUrl(event.target.value)}
                    placeholder={baseUrlPlaceholder}
                    className="h-8 flex-1 px-3 py-1.5 font-mono text-[12px]"
                    autoFocus
                  />
                  <Button
                    onClick={state.handleSaveUrl}
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title={t('save')}
                  >
                    <AppIcon name="check" className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={state.handleCancelUrlEdit}
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title={t('cancel')}
                  >
                    <AppIcon name="close" className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {provider.baseUrl ? (
                    <span className="min-w-0 flex-1 truncate rounded-lg border border-border bg-background px-3 py-1.5 font-mono text-[12px] text-muted-foreground">
                      {provider.baseUrl}
                    </span>
                  ) : (
                    <Button
                      onClick={state.startEditUrl}
                      variant="secondary"
                      className="h-7 px-2.5 text-[12px] font-semibold"
                    >
                      <AppIcon name="plus" className="h-3.5 w-3.5" />
                      <span>{t('configureBaseUrl')}</span>
                    </Button>
                  )}
                  {provider.baseUrl && (
                    <Button
                      onClick={state.startEditUrl}
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      title={t('configure')}
                    >
                      <AppIcon name="edit" className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
