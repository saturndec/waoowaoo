'use client'

import type { ReactNode } from 'react'
import type { ProviderCardProps, ProviderCardTranslator } from './types'
import type { UseProviderCardStateResult } from './hooks/useProviderCardState'
import { AppIcon } from '@/components/ui/icons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getProviderKey } from '../types'

interface ProviderCardShellProps {
  provider: ProviderCardProps['provider']
  onDeleteProvider: ProviderCardProps['onDeleteProvider']
  t: ProviderCardTranslator
  state: UseProviderCardStateResult
  children: ReactNode
}

export function getCompatibilityLayerBadgeLabel(
  providerId: string,
  t: ProviderCardTranslator,
): string | null {
  const providerKey = getProviderKey(providerId)
  if (providerKey === 'openai-compatible') return t('compatibilityLayerOpenAI')
  if (providerKey === 'gemini-compatible') return t('compatibilityLayerGemini')
  return null
}

export function ProviderCardShell({
  provider,
  onDeleteProvider,
  t,
  state,
  children,
}: ProviderCardShellProps) {
  const compatibilityLayerLabel = getCompatibilityLayerBadgeLabel(provider.id, t)

  return (
    <Card className="overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-xs font-bold text-muted-foreground">
            {provider.name.charAt(0)}
          </div>
          <h3 className="truncate text-[15px] font-bold text-foreground">{provider.name}</h3>
          {compatibilityLayerLabel && (
            <Badge variant="secondary" className="shrink-0 px-2 py-0.5 text-[10px]">
              {compatibilityLayerLabel}
            </Badge>
          )}
          {provider.hasApiKey ? (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" title={t('connected')}></span>
          ) : (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" title={t('notConfigured')}></span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {!state.isPresetProvider && onDeleteProvider && (
            <Button
              onClick={() => onDeleteProvider(provider.id)}
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              title={t('delete')}
            >
              <AppIcon name="trash" className="h-3.5 w-3.5" />
            </Button>
          )}
          {state.tutorial && (
            <Button
              onClick={() => state.setShowTutorial(true)}
              variant="outline"
              className="h-7 gap-1 px-2 text-[12px] font-medium"
            >
              <AppIcon name="bookOpen" className="h-3 w-3" />
              {t('tutorial.button')}
            </Button>
          )}
        </div>
      </div>

      {state.showTutorial && state.tutorial && (
        <Dialog open={state.showTutorial} onOpenChange={state.setShowTutorial}>
          <DialogContent className="max-w-lg overflow-hidden p-0">
            <DialogHeader className="border-b border-border px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <AppIcon name="bookOpen" className="h-4 w-4" />
                  </div>
                  <div>
                    <DialogTitle className="text-sm font-semibold">
                      {provider.name} {t('tutorial.title')}
                    </DialogTitle>
                    <p className="text-xs text-muted-foreground">{t('tutorial.subtitle')}</p>
                  </div>
                </div>
                <Button
                  onClick={() => state.setShowTutorial(false)}
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                >
                  <AppIcon name="close" className="h-4 w-4" />
                </Button>
              </div>
            </DialogHeader>
            <div className="space-y-4 p-5">
              {state.tutorial.steps.map((step, index) => (
                <div key={index} className="flex gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-bold text-muted-foreground">
                    {index + 1}
                  </div>
                  <div className="flex-1 pt-0.5">
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {t(`tutorial.steps.${step.text}`)}
                    </p>
                    {step.url && (
                      <a
                        href={step.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                      >
                        <AppIcon name="externalLink" className="h-3 w-3" />
                        {t('tutorial.openLink')}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end border-t border-border px-5 py-3">
              <Button
                onClick={() => state.setShowTutorial(false)}
                variant="secondary"
                className="h-8 px-4 text-sm font-medium"
              >
                {t('tutorial.close')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {children}
    </Card>
  )
}
