'use client'

import type {
  QuickMangaColorMode,
  QuickMangaLayout,
  QuickMangaPreset,
} from '@/lib/novel-promotion/quick-manga'
import type {
  QuickMangaContinuityConflictPolicy,
  QuickMangaStyleLockProfile,
} from '@/lib/novel-promotion/quick-manga-contract'
import { MANGA_PANEL_TEMPLATE_SPECS } from '@/lib/workspace/manga-webtoon-layout-map'

interface MangaPanelControlsProps {
  enabled: boolean
  preset: QuickMangaPreset
  layout: QuickMangaLayout
  colorMode: QuickMangaColorMode
  styleLockEnabled: boolean
  styleLockProfile: QuickMangaStyleLockProfile
  styleLockStrength: number
  conflictPolicy: QuickMangaContinuityConflictPolicy
  onEnabledChange: (enabled: boolean) => Promise<void>
  onPresetChange: (value: QuickMangaPreset) => Promise<void>
  onLayoutChange: (value: QuickMangaLayout) => Promise<void>
  onColorModeChange: (value: QuickMangaColorMode) => Promise<void>
  onStyleLockEnabledChange: (enabled: boolean) => Promise<void>
  onStyleLockProfileChange: (value: QuickMangaStyleLockProfile) => Promise<void>
  onStyleLockStrengthChange: (value: number) => Promise<void>
  onConflictPolicyChange: (value: QuickMangaContinuityConflictPolicy) => Promise<void>
  compact?: boolean
}

const PANEL_TEMPLATES = MANGA_PANEL_TEMPLATE_SPECS

export default function MangaPanelControls({
  enabled,
  preset,
  layout,
  colorMode,
  styleLockEnabled,
  styleLockProfile,
  styleLockStrength,
  conflictPolicy,
  onEnabledChange,
  onPresetChange,
  onLayoutChange,
  onColorModeChange,
  onStyleLockEnabledChange,
  onStyleLockProfileChange,
  onStyleLockStrengthChange,
  onConflictPolicyChange,
  compact = false,
}: MangaPanelControlsProps) {
  const applyTemplate = (template: (typeof PANEL_TEMPLATES)[number]) => {
    void Promise.all([
      onEnabledChange(true),
      onPresetChange(template.values.preset),
      onLayoutChange(template.values.layout),
      onColorModeChange(template.values.colorMode),
      onStyleLockEnabledChange(template.values.styleLockEnabled),
      onStyleLockProfileChange(template.values.styleLockProfile),
      onStyleLockStrengthChange(template.values.styleLockStrength),
    ])
  }

  return (
    <section className={`glass-surface ${compact ? 'p-4' : 'p-6'} space-y-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--glass-text-primary)]">Webtoon Panel Controls</h3>
          <p className="text-xs text-[var(--glass-text-tertiary)] mt-1">
            Panel-first controls cho lane Manga/Webtoon (P0) — tách semantics khỏi video-like flow.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void onEnabledChange(!enabled)}
          className={`glass-btn-base px-3 py-1.5 text-xs font-medium ${enabled ? 'glass-btn-tone-info' : 'glass-btn-secondary'}`}
        >
          {enabled ? 'Manga lane: ON' : 'Bật Manga lane'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {PANEL_TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => applyTemplate(template)}
            className="rounded-xl border border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-muted)]/15 hover:bg-[var(--glass-bg-muted)]/30 transition-colors p-3 text-left"
          >
            <div className="text-sm font-semibold text-[var(--glass-text-primary)]">{template.title}</div>
            <p className="text-xs text-[var(--glass-text-tertiary)] mt-1">{template.description}</p>
            <p className="text-[11px] text-[var(--glass-text-secondary)] mt-2">
              {template.values.layout} · {template.values.colorMode}
            </p>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-muted)]/10 p-3 space-y-3">
        <div className="text-xs text-[var(--glass-text-tertiary)]">
          Active: <span className="text-[var(--glass-text-primary)] font-medium">{preset}</span> ·{' '}
          <span className="text-[var(--glass-text-primary)] font-medium">{layout}</span> ·{' '}
          <span className="text-[var(--glass-text-primary)] font-medium">{colorMode}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--glass-text-tertiary)]">Style lock:</span>
          <button
            type="button"
            onClick={() => void onStyleLockEnabledChange(!styleLockEnabled)}
            className={`glass-btn-base px-2.5 py-1 text-xs ${styleLockEnabled ? 'glass-btn-tone-info' : 'glass-btn-secondary'}`}
          >
            {styleLockEnabled ? 'Enabled' : 'Disabled'}
          </button>
          <span className="text-xs text-[var(--glass-text-secondary)]">profile: {styleLockProfile}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--glass-text-tertiary)]">Strength:</span>
          {[0.55, 0.7, 0.85].map((value) => {
            const active = Math.abs(styleLockStrength - value) < 0.01
            return (
              <button
                key={value}
                type="button"
                onClick={() => void onStyleLockStrengthChange(value)}
                className={`glass-btn-base px-2.5 py-1 text-xs ${active ? 'glass-btn-tone-info' : 'glass-btn-secondary'}`}
              >
                {Math.round(value * 100)}%
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--glass-text-tertiary)]">Conflict policy:</span>
          {(['balanced', 'prefer-style-lock', 'prefer-chapter-context'] as const).map((policy) => (
            <button
              key={policy}
              type="button"
              onClick={() => void onConflictPolicyChange(policy)}
              className={`glass-btn-base px-2.5 py-1 text-xs ${conflictPolicy === policy ? 'glass-btn-tone-info' : 'glass-btn-secondary'}`}
            >
              {policy}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
