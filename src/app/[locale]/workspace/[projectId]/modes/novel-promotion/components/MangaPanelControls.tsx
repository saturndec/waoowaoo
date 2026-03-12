'use client'

import { useMemo, useState } from 'react'
import type {
  QuickMangaColorMode,
  QuickMangaLayout,
  QuickMangaPreset,
} from '@/lib/novel-promotion/quick-manga'
import type {
  QuickMangaContinuityConflictPolicy,
  QuickMangaStyleLockProfile,
} from '@/lib/novel-promotion/quick-manga-contract'
import type { NovelPromotionPanel, NovelPromotionStoryboard } from '@/types/project'
import {
  useCreateProjectPanel,
  useDeleteProjectPanel,
} from '@/lib/query/hooks'
import { MANGA_PANEL_TEMPLATE_SPECS } from '@/lib/workspace/manga-webtoon-layout-map'
import {
  buildWebtoonScrollNarrativePreview,
  planWebtoonQuickActionMutation,
  WEBTOON_PANEL_QUICK_ACTIONS,
} from '@/lib/workspace/webtoon-panel-controls'

interface MangaPanelControlsProps {
  projectId: string
  storyboards?: NovelPromotionStoryboard[]
  onRefresh?: () => Promise<void> | void
  enabled: boolean
  preset: QuickMangaPreset
  layout: QuickMangaLayout
  colorMode: QuickMangaColorMode
  panelTemplateId: string | null
  styleLockEnabled: boolean
  styleLockProfile: QuickMangaStyleLockProfile
  styleLockStrength: number
  conflictPolicy: QuickMangaContinuityConflictPolicy
  onEnabledChange: (enabled: boolean) => Promise<void>
  onPresetChange: (value: QuickMangaPreset) => Promise<void>
  onLayoutChange: (value: QuickMangaLayout) => Promise<void>
  onColorModeChange: (value: QuickMangaColorMode) => Promise<void>
  onPanelTemplateChange: (templateId: string | null) => Promise<void>
  onStyleLockEnabledChange: (enabled: boolean) => Promise<void>
  onStyleLockProfileChange: (value: QuickMangaStyleLockProfile) => Promise<void>
  onStyleLockStrengthChange: (value: number) => Promise<void>
  onConflictPolicyChange: (value: QuickMangaContinuityConflictPolicy) => Promise<void>
  compact?: boolean
}

const PANEL_TEMPLATES = MANGA_PANEL_TEMPLATE_SPECS

const STORY_KIT_THUMBNAILS: Record<string, string> = {
  setup: '/assets/manga-webtoon/preset-templates/03_cat_cafe_jp.webp',
  continuity: '/assets/manga-webtoon/preset-templates/01_school_romance.webp',
  action: '/assets/manga-webtoon/preset-templates/02_superhero_food.webp',
  dialogue: '/assets/manga-webtoon/preset-templates/04_confession_summer.webp',
  transition: '/assets/manga-webtoon/preset-templates/05_busy_day_witch.webp',
  opening: '/assets/manga-webtoon/preset-templates/02_superhero_food.webp',
  conflict: '/assets/manga-webtoon/preset-templates/06_sexy_beauty_day.webp',
  payoff: '/assets/manga-webtoon/preset-templates/01_school_romance.webp',
  cliffhanger: '/assets/manga-webtoon/preset-templates/05_busy_day_witch.webp',
}

const STORY_KITS: Array<{
  id: string
  label: string
  helper: string
  values: {
    preset: QuickMangaPreset
    layout: QuickMangaLayout
    colorMode: QuickMangaColorMode
    styleLockEnabled: boolean
    styleLockProfile: QuickMangaStyleLockProfile
    styleLockStrength: number
    conflictPolicy: QuickMangaContinuityConflictPolicy
  }
}> = [
  {
    id: 'setup',
    label: 'Setup',
    helper: 'Thiết lập bối cảnh và nhịp đọc mở đầu dễ theo dõi.',
    values: {
      preset: 'slice-of-life',
      layout: 'vertical-scroll',
      colorMode: 'full-color',
      styleLockEnabled: true,
      styleLockProfile: 'soft-tones',
      styleLockStrength: 0.65,
      conflictPolicy: 'balanced',
    },
  },
  {
    id: 'continuity',
    label: 'Continuity',
    helper: 'Giữ nhân vật/đạo cụ ổn định giữa các panel liền nhau.',
    values: {
      preset: 'romance-drama',
      layout: 'vertical-scroll',
      colorMode: 'full-color',
      styleLockEnabled: true,
      styleLockProfile: 'line-consistent',
      styleLockStrength: 0.82,
      conflictPolicy: 'prefer-chapter-context',
    },
  },
  {
    id: 'action',
    label: 'Action',
    helper: 'Tăng lực chuyển động, giữ bố cục panel rõ hướng mắt đọc.',
    values: {
      preset: 'action-battle',
      layout: 'cinematic',
      colorMode: 'black-white',
      styleLockEnabled: true,
      styleLockProfile: 'ink-contrast',
      styleLockStrength: 0.78,
      conflictPolicy: 'balanced',
    },
  },
  {
    id: 'dialogue',
    label: 'Dialogue',
    helper: 'Ưu tiên biểu cảm và khoảng trống cho balloon hội thoại.',
    values: {
      preset: 'romance-drama',
      layout: 'four-koma',
      colorMode: 'full-color',
      styleLockEnabled: true,
      styleLockProfile: 'soft-tones',
      styleLockStrength: 0.7,
      conflictPolicy: 'prefer-style-lock',
    },
  },
  {
    id: 'transition',
    label: 'Transition',
    helper: 'Nối nhịp giữa cảnh trước/sau bằng panel chuyển mượt.',
    values: {
      preset: 'auto',
      layout: 'vertical-scroll',
      colorMode: 'limited-palette',
      styleLockEnabled: true,
      styleLockProfile: 'line-consistent',
      styleLockStrength: 0.68,
      conflictPolicy: 'balanced',
    },
  },
  {
    id: 'opening',
    label: 'Opening',
    helper: 'Mở tập bằng hook mạnh, ưu tiên nhận diện nhân vật chính.',
    values: {
      preset: 'action-battle',
      layout: 'splash-focus',
      colorMode: 'full-color',
      styleLockEnabled: true,
      styleLockProfile: 'line-consistent',
      styleLockStrength: 0.74,
      conflictPolicy: 'prefer-style-lock',
    },
  },
  {
    id: 'conflict',
    label: 'Conflict',
    helper: 'Đẩy đối kháng bằng tương phản hành động và biểu cảm.',
    values: {
      preset: 'action-battle',
      layout: 'cinematic',
      colorMode: 'black-white',
      styleLockEnabled: true,
      styleLockProfile: 'ink-contrast',
      styleLockStrength: 0.85,
      conflictPolicy: 'balanced',
    },
  },
  {
    id: 'payoff',
    label: 'Payoff',
    helper: 'Chốt cảm xúc/kết quả bằng nhịp panel rõ, dễ đọng lại.',
    values: {
      preset: 'slice-of-life',
      layout: 'splash-focus',
      colorMode: 'limited-palette',
      styleLockEnabled: true,
      styleLockProfile: 'soft-tones',
      styleLockStrength: 0.72,
      conflictPolicy: 'prefer-chapter-context',
    },
  },
  {
    id: 'cliffhanger',
    label: 'Cliffhanger',
    helper: 'Kết đoạn bằng panel treo, giữ tò mò cho chapter kế tiếp.',
    values: {
      preset: 'romance-drama',
      layout: 'vertical-scroll',
      colorMode: 'limited-palette',
      styleLockEnabled: true,
      styleLockProfile: 'line-consistent',
      styleLockStrength: 0.8,
      conflictPolicy: 'prefer-style-lock',
    },
  },
]

export default function MangaPanelControls({
  projectId,
  storyboards = [],
  onRefresh,
  enabled,
  preset,
  layout,
  colorMode,
  panelTemplateId,
  styleLockEnabled,
  styleLockProfile,
  styleLockStrength,
  conflictPolicy,
  onEnabledChange,
  onPresetChange,
  onLayoutChange,
  onColorModeChange,
  onPanelTemplateChange,
  onStyleLockEnabledChange,
  onStyleLockProfileChange,
  onStyleLockStrengthChange,
  onConflictPolicyChange,
  compact = false,
}: MangaPanelControlsProps) {
  const createPanelMutation = useCreateProjectPanel(projectId)
  const deletePanelMutation = useDeleteProjectPanel(projectId)
  const [quickActionBusy, setQuickActionBusy] = useState<string | null>(null)
  const [quickActionMessage, setQuickActionMessage] = useState<string | null>(null)

  const activeStoryboard = useMemo(() => {
    if (!storyboards.length) return null
    return [...storyboards].sort((a, b) => {
      const aPanels = (a.panels || []).length
      const bPanels = (b.panels || []).length
      return bPanels - aPanels
    })[0] || null
  }, [storyboards])

  const activePanels = useMemo(() => {
    const panels = [...(activeStoryboard?.panels || [])]
    return panels.sort((a, b) => a.panelIndex - b.panelIndex)
  }, [activeStoryboard])

  const selectedPanelForActions = useMemo(() => {
    if (!activePanels.length) return null
    return activePanels[activePanels.length - 1] || null
  }, [activePanels])

  const canRunQuickAction = (actionId: typeof WEBTOON_PANEL_QUICK_ACTIONS[number]['id']) => {
    if (quickActionBusy) return false
    if (!activeStoryboard) return false
    if (actionId === 'add') return true
    return !!selectedPanelForActions
  }

  const runQuickAction = async (label: string, operation: () => Promise<void>) => {
    if (quickActionBusy) return
    setQuickActionBusy(label)
    setQuickActionMessage(null)
    try {
      await operation()
      await onRefresh?.()
      setQuickActionMessage(`${label} applied`)
    } catch (error) {
      const message = error instanceof Error ? error.message : `${label} failed`
      setQuickActionMessage(message)
    } finally {
      setQuickActionBusy(null)
    }
  }

  const buildPanelLite = (panel: NovelPromotionPanel) => ({
    id: panel.id,
    storyboardId: panel.storyboardId,
    panelIndex: panel.panelIndex,
    panelNumber: panel.panelNumber,
    shotType: panel.shotType,
    cameraMove: panel.cameraMove,
    description: panel.description,
    location: panel.location,
    characters: panel.characters,
    srtStart: panel.srtStart,
    srtEnd: panel.srtEnd,
    duration: panel.duration,
    videoPrompt: panel.videoPrompt,
  })

  const recommendedTemplateId = useMemo(() => {
    let best: { id: string; score: number } | null = null

    for (const template of PANEL_TEMPLATES) {
      let score = 0
      if (template.values.preset === preset) score += 2
      if (template.values.layout === layout) score += 2
      if (template.values.colorMode === colorMode) score += 2
      if (template.metadata.suggestedStylePreset === preset) score += 1
      if (template.metadata.suggestedColorMode === colorMode) score += 1

      if (!best || score > best.score) {
        best = { id: template.id, score }
      }
    }

    return best?.score && best.score > 0 ? best.id : null
  }, [colorMode, layout, preset])

  const applyValues = (values: {
    preset: QuickMangaPreset
    layout: QuickMangaLayout
    colorMode: QuickMangaColorMode
    styleLockEnabled: boolean
    styleLockProfile: QuickMangaStyleLockProfile
    styleLockStrength: number
    conflictPolicy?: QuickMangaContinuityConflictPolicy
  }) => {
    void Promise.all([
      onEnabledChange(true),
      onPresetChange(values.preset),
      onLayoutChange(values.layout),
      onColorModeChange(values.colorMode),
      onStyleLockEnabledChange(values.styleLockEnabled),
      onStyleLockProfileChange(values.styleLockProfile),
      onStyleLockStrengthChange(values.styleLockStrength),
      ...(values.conflictPolicy ? [onConflictPolicyChange(values.conflictPolicy)] : []),
    ])
  }

  const applyTemplate = (template: (typeof PANEL_TEMPLATES)[number]) => {
    void onPanelTemplateChange(template.id)
    applyValues(template.values)
  }

  const applyStoryKit = (kit: (typeof STORY_KITS)[number]) => {
    void onPanelTemplateChange(null)
    applyValues(kit.values)
  }

  const isTemplateActive = (template: (typeof PANEL_TEMPLATES)[number]) => {
    if (panelTemplateId) return panelTemplateId === template.id
    return preset === template.values.preset
      && layout === template.values.layout
      && colorMode === template.values.colorMode
  }

  const isStoryKitActive = (kit: (typeof STORY_KITS)[number]) => {
    return !panelTemplateId
      && preset === kit.values.preset
      && layout === kit.values.layout
      && colorMode === kit.values.colorMode
      && conflictPolicy === kit.values.conflictPolicy
  }

  const handleImageLoadError = (imagePath: string, context: string) => () => {
    console.warn(`[MangaPanelControls] Missing real thumbnail: ${imagePath} (${context})`)
  }

  const activeTemplate = panelTemplateId
    ? PANEL_TEMPLATES.find((template) => template.id === panelTemplateId) ?? null
    : null

  const scrollPreview = buildWebtoonScrollNarrativePreview({
    panelSlotCount: activeTemplate?.metadata.panelSlotCount ?? 4,
    layoutFamily: activeTemplate?.metadata.layoutFamily,
  })

  return (
    <section className={`glass-surface ${compact ? 'p-4' : 'p-6'} space-y-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--glass-text-primary)]">Manga Storytelling Controls</h3>
          <p className="text-xs text-[var(--glass-text-tertiary)] mt-1">
            Panel-first controls cho lane Manga/Webtoon (P1) — ưu tiên ngôn ngữ kể chuyện theo panel, không dùng semantics video-like.
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

      <div className="space-y-2">
        <p className="text-xs font-semibold text-[var(--glass-text-secondary)] uppercase tracking-wide">Panel template</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {PANEL_TEMPLATES.map((template) => {
            const active = isTemplateActive(template)
            const recommended = !active && recommendedTemplateId === template.id

            return (
              <button
                key={template.id}
                type="button"
                onClick={() => applyTemplate(template)}
                className={`rounded-xl border p-3 text-left transition-all ${active
                  ? 'border-[var(--glass-accent-from)] bg-[var(--glass-tone-info-bg)] shadow-[0_0_0_1px_var(--glass-accent-from)]'
                  : 'border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-muted)]/15 hover:bg-[var(--glass-bg-muted)]/30'
                  }`}
              >
                <div className="relative h-24 rounded-lg overflow-hidden border border-[var(--glass-stroke-soft)] bg-gradient-to-br from-[#111827] via-[#1f2937] to-[#0f172a]">
                  <img
                    src={template.metadata.imagePath}
                    alt={template.title}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    onError={handleImageLoadError(template.metadata.imagePath, template.id)}
                  />
                  <div className="absolute inset-x-0 top-1.5 px-2 flex items-center justify-between gap-1">
                    <span className="px-1.5 py-0.5 rounded bg-black/40 text-[10px] text-white/95">{template.sourceLayoutId}</span>
                    {recommended && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-600/85 text-[10px] text-white font-medium">Recommended</span>
                    )}
                  </div>
                </div>

                <div className="mt-2.5 text-sm font-semibold text-[var(--glass-text-primary)]">{template.title}</div>
                <p className="text-xs text-[var(--glass-text-tertiary)] mt-1">{template.description}</p>
                <p className="text-[11px] text-[var(--glass-text-secondary)] mt-2">
                  {template.values.layout} · {template.values.colorMode}
                </p>
                {active && (
                  <p className="mt-1 text-[11px] font-medium text-[var(--glass-tone-info-fg)]">Đang active</p>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-[var(--glass-text-secondary)] uppercase tracking-wide">Storytelling prompt kit</p>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {STORY_KITS.map((kit) => {
            const active = isStoryKitActive(kit)
            const thumbnailPath = STORY_KIT_THUMBNAILS[kit.id]

            return (
              <button
                key={kit.id}
                type="button"
                onClick={() => applyStoryKit(kit)}
                className={`rounded-xl border p-3 text-left transition-all ${active
                  ? 'border-[var(--glass-accent-from)] bg-[var(--glass-tone-info-bg)] shadow-[0_0_0_1px_var(--glass-accent-from)]'
                  : 'border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-muted)]/10 hover:bg-[var(--glass-bg-muted)]/30'
                  }`}
              >
                <div className="relative h-20 rounded-lg overflow-hidden border border-[var(--glass-stroke-soft)] bg-gradient-to-br from-[#111827] via-[#1f2937] to-[#0f172a]">
                  {thumbnailPath && (
                    <img
                      src={thumbnailPath}
                      alt={kit.label}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      onError={handleImageLoadError(thumbnailPath, `story-kit:${kit.id}`)}
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
                  <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between text-[10px] text-white">
                    <span className="px-1.5 py-0.5 rounded bg-black/35">{kit.values.layout}</span>
                    <span className="px-1.5 py-0.5 rounded bg-black/35">{kit.values.colorMode}</span>
                  </div>
                </div>

                <div className="mt-2.5 text-sm font-semibold text-[var(--glass-text-primary)]">{kit.label}</div>
                <p className="text-xs text-[var(--glass-text-tertiary)] mt-1">{kit.helper}</p>
                <p className="text-[11px] text-[var(--glass-text-secondary)] mt-2">
                  {kit.values.preset} · {kit.values.layout} · {kit.values.colorMode}
                </p>
                {active && (
                  <p className="mt-1 text-[11px] font-medium text-[var(--glass-tone-info-fg)]">Đang active</p>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-[var(--glass-text-secondary)] uppercase tracking-wide">Webtoon panel quick actions (P1)</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {WEBTOON_PANEL_QUICK_ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              disabled={!canRunQuickAction(action.id)}
              onClick={() => {
                if (!activeStoryboard) return
                if (action.id !== 'add' && !selectedPanelForActions) return

                if (action.id === 'add' || action.id === 'duplicate' || action.id === 'split' || action.id === 'merge' || action.id === 'reorder') {
                  void runQuickAction(action.id, async () => {
                    const plan = planWebtoonQuickActionMutation({
                      action: action.id,
                      panels: activePanels.map(buildPanelLite),
                      selectedPanelId: selectedPanelForActions?.id ?? null,
                      fallbackStoryboardId: activeStoryboard.id,
                    })

                    for (const panelId of plan.deletePanelIds) {
                      await deletePanelMutation.mutateAsync({ panelId })
                    }

                    for (const payload of plan.createPayloads) {
                      await createPanelMutation.mutateAsync(payload)
                    }

                    if (typeof window !== 'undefined') {
                      console.info('[VAT-133][quick-action-plan]', {
                        action: plan.action,
                        beforeOrder: plan.beforeOrder,
                        expectedAfterOrder: plan.expectedAfterOrder,
                        deletePanelIds: plan.deletePanelIds,
                        createCount: plan.createPayloads.length,
                      })
                    }
                  })
                }
              }}
              className="rounded-lg border border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-muted)]/15 px-3 py-2 text-left hover:bg-[var(--glass-bg-muted)]/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label={`quick-action-${action.id}`}
            >
              <div className="text-xs font-semibold text-[var(--glass-text-primary)]">{action.label}</div>
              <div className="mt-1 text-[11px] text-[var(--glass-text-tertiary)]">{action.helper}</div>
            </button>
          ))}
        </div>
        <div className="text-[11px] text-[var(--glass-text-tertiary)]">
          {activeStoryboard
            ? `Target storyboard: ${activeStoryboard.id} · panels=${activePanels.length} · anchor=#${(selectedPanelForActions?.panelIndex ?? 0) + 1}`
            : 'Chưa có storyboard/panel để thao tác quick actions.'}
        </div>
        {quickActionMessage ? (
          <div className="text-[11px] text-[var(--glass-tone-info-fg)]">{quickActionMessage}</div>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-[var(--glass-text-secondary)] uppercase tracking-wide">Scroll narrative preview (P0)</p>
        <div className="rounded-xl border border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-muted)]/10 p-3 space-y-2">
          <div className="text-[11px] text-[var(--glass-text-tertiary)]">
            {activeTemplate
              ? `Template ${activeTemplate.sourceLayoutId} · ${activeTemplate.metadata.layoutFamily} · ${activeTemplate.metadata.panelSlotCount} panel slots`
              : 'Chọn template để preview vertical flow theo panel rhythm.'}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {scrollPreview.map((item) => (
              <div key={item.id} className="rounded-lg border border-[var(--glass-stroke-soft)] p-2 bg-[var(--glass-bg-muted)]/20">
                <div className="flex items-center justify-between text-[11px] text-[var(--glass-text-secondary)]">
                  <span>Panel {item.panelIndex}</span>
                  <span>{item.emphasis}</span>
                </div>
                <div className="mt-1 h-2 rounded bg-[var(--glass-bg-muted)]/40 overflow-hidden">
                  <div
                    className="h-full rounded bg-[var(--glass-accent-from)]"
                    style={{ width: `${Math.max(8, Math.round(item.relativeHeight * 100))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-muted)]/10 p-3 space-y-3">
        <div className="text-xs text-[var(--glass-text-tertiary)]">
          Active: <span className="text-[var(--glass-text-primary)] font-medium">{preset}</span> ·{' '}
          <span className="text-[var(--glass-text-primary)] font-medium">{layout}</span> ·{' '}
          <span className="text-[var(--glass-text-primary)] font-medium">{colorMode}</span>
          {panelTemplateId ? (
            <>
              {' '}· template: <span className="text-[var(--glass-text-primary)] font-medium">{panelTemplateId}</span>
            </>
          ) : null}
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
