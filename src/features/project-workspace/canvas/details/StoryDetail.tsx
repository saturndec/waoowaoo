'use client'

import React from 'react'
import { useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import AiWriteModal from '@/components/home/AiWriteModal'
import LongTextDetectionPrompt from '@/components/story-input/LongTextDetectionPrompt'
import StoryInputComposer from '@/components/story-input/StoryInputComposer'
import { AppIcon } from '@/components/ui/icons'
import { apiFetch } from '@/lib/api-fetch'
import { expandHomeStory } from '@/lib/home/ai-story-expand'
import { ART_STYLES, VIDEO_RATIOS } from '@/lib/constants'
import { listSystemDirectorStylePresets, listSystemVisualStylePresets } from '@/lib/style-preset/system'
import { useSaveProjectEpisodesBatch, useSplitProjectEpisodes } from '@/lib/query/hooks'
import { useWorkspaceRuntime } from '../../WorkspaceRuntimeContext'
import { DetailSection } from './detail-shared'

const LONG_TEXT_THRESHOLD = 8000

interface StoryDetailProps {
  readonly projectId: string
  readonly storyText: string
  readonly episodeName?: string
}

function encodePresetValue(value: { readonly presetSource: 'system' | 'user'; readonly presetId: string }): string {
  return `${value.presetSource}:${value.presetId}`
}

function decodePresetValue(value: string): { readonly presetSource: 'system' | 'user'; readonly presetId: string } | null {
  const [presetSource, presetId] = value.split(':')
  if ((presetSource !== 'system' && presetSource !== 'user') || !presetId) return null
  return { presetSource, presetId }
}

export default function StoryDetail({ projectId, storyText, episodeName }: StoryDetailProps) {
  const t = useTranslations('projectWorkflow')
  const homeT = useTranslations('home.aiWrite')
  const locale = useLocale()
  const runtime = useWorkspaceRuntime()
  const [draft, setDraft] = useState(storyText)
  const [aiWriteOpen, setAiWriteOpen] = useState(false)
  const [aiWriteLoading, setAiWriteLoading] = useState(false)
  const [longTextPromptOpen, setLongTextPromptOpen] = useState(false)
  const splitProjectEpisodes = useSplitProjectEpisodes(projectId)
  const saveProjectEpisodesBatch = useSaveProjectEpisodesBatch(projectId)
  const isGeneratingScript = runtime.isStartingPlan || runtime.isTransitioning
  const visualStyleValue = encodePresetValue({
    presetSource: runtime.visualStylePresetSource === 'user' ? 'user' : 'system',
    presetId: runtime.visualStylePresetId || runtime.artStyle || ART_STYLES[0]?.value || '',
  })
  const directorStyleValue = runtime.directorStylePresetSource && runtime.directorStylePresetId
    ? encodePresetValue({
        presetSource: runtime.directorStylePresetSource === 'user' ? 'user' : 'system',
        presetId: runtime.directorStylePresetId,
      })
    : ''

  const ratioOptions = useMemo(
    () => VIDEO_RATIOS.map((ratio) => ({ ...ratio, recommended: ratio.value === '9:16' })),
    [],
  )
  const visualStyleOptions = useMemo(
    () => listSystemVisualStylePresets(locale === 'en' ? 'en' : 'zh').map((preset) => ({
      value: encodePresetValue(preset),
      label: preset.label,
      recommended: preset.presetId === runtime.artStyle,
    })),
    [locale, runtime.artStyle],
  )
  const directorStyleOptions = useMemo(
    () => listSystemDirectorStylePresets().map((preset) => ({
      value: encodePresetValue(preset),
      label: preset.label,
      description: preset.description,
    })),
    [],
  )

  const saveStory = async (value: string) => {
    setDraft(value)
    await runtime.onNovelTextChange(value)
  }

  const runScriptGeneration = async () => {
    if (!draft.trim()) return
    if (draft.trim().length >= LONG_TEXT_THRESHOLD) {
      setLongTextPromptOpen(true)
      return
    }
    await runtime.onRequestAssistantPlan()
  }

  const runAiWrite = async (prompt: string) => {
    setAiWriteLoading(true)
    try {
      const result = await expandHomeStory({ apiFetch, prompt })
      await saveStory(result.expandedText)
      setAiWriteOpen(false)
    } finally {
      setAiWriteLoading(false)
    }
  }

  const runSmartSplit = async () => {
    if (!draft.trim()) return
    if (!window.confirm(t('canvas.workspace.detail.confirm.smartSplit'))) return
    const result = await splitProjectEpisodes.mutateAsync({ content: draft, async: true })
    await saveProjectEpisodesBatch.mutateAsync({
      episodes: result.episodes.map((episode) => ({
        name: episode.title,
        description: episode.summary,
        novelText: episode.content,
      })),
      clearExisting: true,
      importStatus: 'completed',
      triggerGlobalAnalysis: true,
    })
  }

  return (
    <div className="space-y-4">
      <DetailSection title={t('canvas.workspace.detail.sections.storyInput')}>
        {episodeName ? (
          <p className="rounded-md bg-white px-3 py-2 text-xs text-[var(--glass-text-secondary)]">
            {t('storyInput.currentEditing', { name: episodeName })}
          </p>
        ) : null}
        <StoryInputComposer
          value={draft}
          onValueChange={(value) => { void saveStory(value) }}
          placeholder={t('canvas.workspace.detail.empty.storyPlaceholder')}
          minRows={8}
          maxHeightViewportRatio={0.42}
          disabled={isGeneratingScript}
          videoRatio={runtime.videoRatio || '16:9'}
          onVideoRatioChange={(value) => { void runtime.onVideoRatioChange(value) }}
          ratioOptions={ratioOptions}
          getRatioUsage={(ratio) => {
            const key = ratio.replace(':', '_')
            return t(`storyInput.ratioUsage.${key}`)
          }}
          artStyle={visualStyleValue}
          onArtStyleChange={(value) => {
            const ref = decodePresetValue(value)
            if (!ref) return
            void runtime.onVisualStylePresetChange(ref)
          }}
          styleOptions={visualStyleOptions}
          stylePresetValue={directorStyleValue}
          onStylePresetChange={(value) => {
            const ref = decodePresetValue(value)
            void runtime.onDirectorStylePresetRefChange(ref)
          }}
          stylePresetOptions={directorStyleOptions}
          secondaryActions={(
            <>
              <button
                type="button"
                onClick={() => setAiWriteOpen(true)}
                disabled={isGeneratingScript}
                className="glass-btn-base h-10 flex-shrink-0 px-3 text-sm"
              >
                <AppIcon name="sparkles" className="h-4 w-4 text-[#7c3aed]" />
                {t('canvas.workspace.detail.actions.aiWrite')}
              </button>
              <button
                type="button"
                onClick={() => { void runSmartSplit() }}
                disabled={isGeneratingScript || splitProjectEpisodes.isPending || saveProjectEpisodesBatch.isPending || !draft.trim()}
                className="glass-btn-base h-10 flex-shrink-0 px-3 text-sm disabled:opacity-50"
              >
                {t('canvas.workspace.detail.actions.smartSplit')}
              </button>
            </>
          )}
          primaryAction={(
            <button
              type="button"
              onClick={() => { void runScriptGeneration() }}
              disabled={!draft.trim() || isGeneratingScript}
              className="glass-btn-base glass-btn-primary h-10 flex-shrink-0 px-5 text-sm disabled:opacity-50"
            >
              {isGeneratingScript ? t('storyInput.creating') : t('canvas.workspace.actions.generateScript')}
              <AppIcon name="arrowRight" className="h-4 w-4" />
            </button>
          )}
          footer={(
            <p className="text-xs text-[var(--glass-text-tertiary)]">
              {t('storyInput.currentConfigSummary', {
                ratio: runtime.videoRatio || '16:9',
                style: runtime.artStyle || ART_STYLES[0]?.label || '',
              })}
            </p>
          )}
        />
      </DetailSection>
      <AiWriteModal
        open={aiWriteOpen}
        loading={aiWriteLoading}
        onClose={() => setAiWriteOpen(false)}
        onStart={(prompt) => { void runAiWrite(prompt) }}
        t={(key) => homeT(key)}
      />
      <LongTextDetectionPrompt
        open={longTextPromptOpen}
        onClose={() => setLongTextPromptOpen(false)}
        onSmartSplit={() => {
          setLongTextPromptOpen(false)
          void runSmartSplit()
        }}
        onContinue={() => {
          setLongTextPromptOpen(false)
          void runtime.onRequestAssistantPlan()
        }}
        copy={{
          title: t('storyInput.longTextDetection.title'),
          description: t('storyInput.longTextDetection.description', { count: draft.trim().length }),
          strongRecommend: t('storyInput.longTextDetection.strongRecommend'),
          smartSplitLabel: t('storyInput.longTextDetection.smartSplit'),
          smartSplitBadge: t('storyInput.longTextDetection.smartSplitRecommend'),
          continueLabel: t('storyInput.longTextDetection.continueAnyway'),
          continueHint: t('storyInput.longTextDetection.singleEpisodeWarning'),
        }}
      />
    </div>
  )
}
