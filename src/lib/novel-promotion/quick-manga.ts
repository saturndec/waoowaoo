import {
  evaluateLayoutIntelligence,
  type LayoutIntelligenceDecision,
} from '@/lib/novel-promotion/layout-intelligence'
import {
  getMangaPanelTemplateSpecById,
  type MangaPanelTemplateSpec,
} from '@/lib/workspace/manga-webtoon-layout-map'

export type QuickMangaPreset = 'auto' | 'action-battle' | 'romance-drama' | 'slice-of-life' | 'comedy-4koma'

export type QuickMangaLayout = 'auto' | 'cinematic' | 'four-koma' | 'vertical-scroll' | 'splash-focus'

export type QuickMangaColorMode = 'auto' | 'full-color' | 'black-white' | 'limited-palette'

export interface QuickMangaOptions {
  enabled: boolean
  preset: QuickMangaPreset
  layout: QuickMangaLayout
  colorMode: QuickMangaColorMode
  panelTemplateId?: string | null
}

const PRESET_DIRECTIVE_LABEL: Record<QuickMangaPreset, string> = {
  auto: 'Auto',
  'action-battle': 'Action / Battle',
  'romance-drama': 'Romance / Drama',
  'slice-of-life': 'Slice of Life',
  'comedy-4koma': 'Comedy 4-koma',
}

const LAYOUT_DIRECTIVE_LABEL: Record<Exclude<QuickMangaLayout, 'auto'>, string> = {
  cinematic: 'Dynamic Panel Flow',
  'four-koma': '4-koma Rhythm',
  'vertical-scroll': 'Vertical Scroll',
  'splash-focus': 'Splash Focus',
}

const COLOR_MODE_DIRECTIVE_LABEL: Record<QuickMangaColorMode, string> = {
  auto: 'Auto',
  'full-color': 'Full Color',
  'black-white': 'Black & White',
  'limited-palette': 'Limited Palette',
}

function resolveLayoutLabel(layout: QuickMangaLayout | Exclude<QuickMangaLayout, 'auto'>): string {
  if (layout === 'auto') return 'Auto'
  return LAYOUT_DIRECTIVE_LABEL[layout]
}

function buildLayoutIntelligenceBlock(decision: LayoutIntelligenceDecision) {
  return [
    '[LAYOUT_INTELLIGENCE_V1]',
    `Recommended Profile: ${decision.recommendedProfile}`,
    `Recommended Layout: ${resolveLayoutLabel(decision.recommendedLayout)}`,
    `Chosen Profile: ${decision.chosenProfile}`,
    `Chosen Layout: ${resolveLayoutLabel(decision.chosenLayout)}`,
    `Decision Source: ${decision.decisionSource}`,
    `Confidence: ${decision.confidence}`,
    `Reasons: ${decision.reasons.length ? decision.reasons.join(' | ') : 'n/a'}`,
    `Debug Trace: ${JSON.stringify(decision.debugTrace)}`,
  ].join('\n')
}

function buildPanelTemplateDirectiveBlock(spec: MangaPanelTemplateSpec | null): string[] {
  if (!spec) return []

  return [
    '[PANEL_TEMPLATE_V1]',
    `Template Id: ${spec.id}`,
    `Panel Layout Id: ${spec.metadata.panelLayoutId}`,
    `Layout Family: ${spec.metadata.layoutFamily}`,
    `Panel Slot Count: ${spec.metadata.panelSlotCount}`,
    `Narrative Intent: ${spec.metadata.narrativeIntent}`,
    `Reading Flow: ${spec.metadata.readingFlow}`,
    `Suggested Color Mode: ${spec.metadata.suggestedColorMode}`,
    `Suggested Style Preset: ${spec.metadata.suggestedStylePreset}`,
    `Prompt Hint: ${spec.metadata.promptHint}`,
    `Negative Prompt Hint: ${spec.metadata.negativePromptHint}`,
    `Transition Style: ${spec.metadata.transitionStyle}`,
    `Dialogue Density: ${spec.metadata.dialogueDensity}`,
    `Use Case: ${spec.metadata.useCase}`,
    `Template Image Path: ${spec.metadata.imagePath}`,
    `Traceability: ${spec.traceability.layoutMapPath} :: ${spec.traceability.sourceTemplateFile}`,
  ]
}

function buildQuickMangaDirective(params: {
  content: string
  options: QuickMangaOptions
  artStyle?: string | null
  phase: 'story-input' | 'storyboard-refine'
}) {
  const styleLabel = params.artStyle?.trim() ? params.artStyle.trim() : 'auto'

  const panelTemplateSpec = getMangaPanelTemplateSpecById(params.options.panelTemplateId)
  const effectivePreset = panelTemplateSpec?.values.preset || params.options.preset
  const effectiveLayout = panelTemplateSpec?.values.layout || params.options.layout
  const effectiveColorMode = panelTemplateSpec?.values.colorMode || params.options.colorMode

  const layoutDecision = evaluateLayoutIntelligence({
    content: params.content,
    preset: effectivePreset,
    manualLayout: effectiveLayout,
  })

  const phaseGuideline = params.phase === 'storyboard-refine'
    ? 'Guideline: enforce panel rhythm and panel readability while preserving narrative continuity.'
    : 'Guideline: keep plot intact, optimize for panel-ready beats and concise story transitions.'

  return [
    '[QUICK_MANGA_ENTRY]',
    `Preset Input: ${PRESET_DIRECTIVE_LABEL[params.options.preset]}`,
    `Preset Effective: ${PRESET_DIRECTIVE_LABEL[effectivePreset]}`,
    `Panel Layout Input: ${resolveLayoutLabel(params.options.layout)}`,
    `Panel Layout Effective: ${resolveLayoutLabel(effectiveLayout)}`,
    `Panel Layout Resolved: ${resolveLayoutLabel(layoutDecision.chosenLayout)}`,
    `Color Mode Input: ${COLOR_MODE_DIRECTIVE_LABEL[params.options.colorMode]}`,
    `Color Mode Effective: ${COLOR_MODE_DIRECTIVE_LABEL[effectiveColorMode]}`,
    `Visual Style: ${styleLabel}`,
    phaseGuideline,
    'Guideline: preserve dialogue intent and character continuity across panels.',
    ...buildPanelTemplateDirectiveBlock(panelTemplateSpec),
    buildLayoutIntelligenceBlock(layoutDecision),
  ].join('\n')
}

export function buildQuickMangaStoryInput({
  storyContent,
  options,
  artStyle,
}: {
  storyContent: string
  options: QuickMangaOptions
  artStyle?: string | null
}) {
  const baseContent = storyContent.trim()
  if (!options.enabled || !baseContent) {
    return baseContent
  }

  const directive = buildQuickMangaDirective({
    content: baseContent,
    options,
    artStyle,
    phase: 'story-input',
  })

  return `${directive}\n\n${baseContent}`
}

export function buildQuickMangaStoryboardInput({
  clipContent,
  options,
  artStyle,
}: {
  clipContent: string
  options: QuickMangaOptions
  artStyle?: string | null
}) {
  const baseContent = clipContent.trim()
  if (!options.enabled || !baseContent) {
    return baseContent
  }

  const directive = buildQuickMangaDirective({
    content: baseContent,
    options,
    artStyle,
    phase: 'storyboard-refine',
  })

  return `${directive}\n\n${baseContent}`
}
