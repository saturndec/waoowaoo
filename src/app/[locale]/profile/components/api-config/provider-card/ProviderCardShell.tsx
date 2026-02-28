'use client'

import type { ReactNode } from 'react'
import type { ProviderCardProps, ProviderCardTranslator } from './types'
import type { UseProviderCardStateResult } from './hooks/useProviderCardState'
import { AppIcon } from '@/components/ui/icons'
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
    <div className="glass-surface overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <div className="glass-surface-soft flex h-6 w-6 items-center justify-center rounded-lg text-xs font-bold text-[var(--glass-text-secondary)]">
            {provider.name.charAt(0)}
          </div>
          <h3 className="text-[15px] font-bold text-[var(--glass-text-primary)]">{provider.name}</h3>
          {compatibilityLayerLabel && (
            <span className="rounded-full border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] px-2 py-0.5 text-[10px] font-semibold text-[var(--glass-text-secondary)]">
              {compatibilityLayerLabel}
            </span>
          )}
          {provider.hasApiKey ? (
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--glass-tone-success-fg)]" title={t('connected')}></span>
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--glass-tone-warning-fg)]" title={t('notConfigured')}></span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {!state.isPresetProvider && onDeleteProvider && (
            <button
              onClick={() => onDeleteProvider(provider.id)}
              className="rounded p-1 text-[var(--glass-text-tertiary)] transition-colors hover:bg-[var(--glass-bg-muted)] hover:text-[var(--glass-tone-danger-fg)]"
              title={t('delete')}
            >
              <AppIcon name="trash" className="w-3.5 h-3.5" />
            </button>
          )}
          {state.tutorial && (
            <button
              onClick={() => state.setShowTutorial(true)}
              className="glass-btn-base cursor-pointer flex items-center gap-1 rounded-lg border border-[var(--glass-stroke-base)] bg-transparent px-2 py-1 text-[12px] font-medium text-[var(--glass-text-primary)] hover:border-[var(--glass-stroke-strong)] hover:bg-[var(--glass-bg-muted)] hover:text-[var(--glass-text-primary)]"
            >
              <AppIcon name="bookOpen" className="h-3 w-3" />
              {t('tutorial.button')}
            </button>
          )}
        </div>
      </div>

      {state.showTutorial && state.tutorial && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center glass-overlay"
          onClick={() => state.setShowTutorial(false)}
        >
          <div
            className="glass-surface-modal mx-4 w-full max-w-lg overflow-hidden rounded-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--glass-stroke-base)] px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="glass-btn-base glass-btn-primary flex h-8 w-8 items-center justify-center rounded-lg text-white">
                  <AppIcon name="bookOpen" className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--glass-text-primary)]">
                    {provider.name} {t('tutorial.title')}
                  </h3>
                  <p className="text-xs text-[var(--glass-text-secondary)]">{t('tutorial.subtitle')}</p>
                </div>
              </div>
              <button
                onClick={() => state.setShowTutorial(false)}
                className="glass-btn-base glass-btn-soft rounded-lg p-1.5"
              >
                <AppIcon name="close" className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              {state.tutorial.steps.map((step, index) => (
                <div key={index} className="flex gap-3">
                  <div className="glass-surface-soft flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--glass-stroke-base)] text-xs font-bold text-[var(--glass-text-secondary)]">
                    {index + 1}
                  </div>
                  <div className="flex-1 pt-0.5">
                    <p className="text-sm leading-relaxed text-[var(--glass-text-secondary)]">
                      {t(`tutorial.steps.${step.text}`)}
                    </p>
                    {step.url && (
                      <a
                        href={step.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] hover:underline"
                      >
                        <AppIcon name="externalLink" className="w-3 h-3" />
                        {t('tutorial.openLink')}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end border-t border-[var(--glass-stroke-base)] px-5 py-3">
              <button
                onClick={() => state.setShowTutorial(false)}
                className="glass-btn-base glass-btn-secondary rounded-lg px-4 py-2 text-sm font-medium"
              >
                {t('tutorial.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {children}
    </div>
  )
}
