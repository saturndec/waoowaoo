'use client'

import React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import InlineVideoGenerationControls from '../../components/video/InlineVideoGenerationControls'
import { usePanelVideoModel } from '../../components/video/panel-card/runtime/hooks/usePanelVideoModel'
import { useWorkspaceRuntime } from '../../WorkspaceRuntimeContext'
import { useUploadProjectTempMedia } from '@/lib/query/hooks'
import type { VideoGenerationOptions, VideoModelOption } from '../../components/video/types'
import type { WorkspaceCanvasFlowNode } from '../node-canvas-types'
import {
  ActionButton,
  DetailSection,
  Field,
  TextArea,
  findNextPanelContext,
  type PanelContext,
} from './detail-shared'

type BatchVideoMode = 'single' | 'auto' | 'asset-reference'

interface VideoDetailProps {
  readonly context: PanelContext
  readonly storyboards: readonly PanelContext['storyboard'][]
  readonly node: WorkspaceCanvasFlowNode
  readonly onUpdatePrompt: (storyboardId: string, panelIndex: number, value: string, field?: 'imagePrompt' | 'videoPrompt' | 'firstLastFramePrompt') => Promise<void>
  readonly onUpdateModel: (storyboardId: string, panelIndex: number, model: string) => Promise<void>
  readonly onToggleLink: (storyboardId: string, panelIndex: number, linked: boolean) => Promise<void>
  readonly onGenerateVideo: (
    storyboardId: string,
    panelIndex: number,
    panelId: string,
    model: string,
    generationOptions: VideoGenerationOptions,
    firstLastFrame?: {
      readonly lastFrameStoryboardId: string
      readonly lastFramePanelIndex: number
      readonly flModel: string
      readonly customPrompt?: string
    },
  ) => Promise<void>
  readonly onGenerateAllVideos: (
    model: string,
    generationOptions: VideoGenerationOptions,
    mode?: BatchVideoMode,
    gridMode?: '2x2' | '3x3',
    referenceImageUrls?: readonly string[],
  ) => Promise<void>
  readonly onDownloadVideos: () => Promise<void>
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('FILE_READ_FAILED'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('FILE_READ_FAILED'))
    reader.readAsDataURL(file)
  })
}

function splitReferenceImageUrls(value: string): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  value.split(/\r?\n|,/).forEach((item) => {
    const normalized = item.trim()
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    output.push(normalized)
  })
  return output
}

export default function VideoDetail(props: VideoDetailProps) {
  const t = useTranslations('projectWorkflow.canvas.workspace.detail')
  const runtime = useWorkspaceRuntime()
  const { panel, storyboard } = props.context
  const [videoPrompt, setVideoPrompt] = useState(panel.videoPrompt ?? '')
  const [firstLastPrompt, setFirstLastPrompt] = useState(panel.firstLastFramePrompt ?? '')
  const [flModel, setFlModel] = useState(panel.videoModel ?? runtime.singleShotVideoModel ?? runtime.videoModel ?? '')
  const [batchMode, setBatchMode] = useState<BatchVideoMode>('auto')
  const [referenceImageText, setReferenceImageText] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const uploadTempMedia = useUploadProjectTempMedia()
  const nextContext = useMemo(() => findNextPanelContext(props.storyboards, props.context), [props.context, props.storyboards])
  const referenceImageUrls = useMemo(() => splitReferenceImageUrls(referenceImageText), [referenceImageText])
  const videoModel = usePanelVideoModel({
    defaultVideoModel: panel.videoModel ?? runtime.singleShotVideoModel ?? runtime.videoModel ?? '',
    capabilityOverrides: runtime.capabilityOverrides,
    lastVideoGenerationOptions: panel.lastVideoGenerationOptions,
    userVideoModels: runtime.userVideoModels as VideoModelOption[],
  })
  const flVideoModel = usePanelVideoModel({
    defaultVideoModel: flModel,
    capabilityOverrides: runtime.capabilityOverrides,
    lastVideoGenerationOptions: panel.lastVideoGenerationOptions,
    userVideoModels: runtime.userVideoModels as VideoModelOption[],
  })
  const missingCapabilities = videoModel.missingCapabilityFields
  const flMissingCapabilities = flVideoModel.missingCapabilityFields
  const hasVideo = Boolean(panel.videoMedia?.url ?? panel.videoUrl)

  useEffect(() => {
    setVideoPrompt(panel.videoPrompt ?? '')
    setFirstLastPrompt(panel.firstLastFramePrompt ?? '')
    setFlModel(panel.videoModel ?? runtime.singleShotVideoModel ?? runtime.videoModel ?? '')
  }, [panel, runtime.singleShotVideoModel, runtime.videoModel])

  return (
    <div className="space-y-4">
      <DetailSection title={t('sections.videoPreview')}>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="overflow-hidden rounded-lg border border-black/10 bg-black">
            {panel.videoMedia?.url ?? panel.videoUrl ? (
              <video src={panel.videoMedia?.url ?? panel.videoUrl ?? undefined} controls className="max-h-[420px] w-full bg-black" />
            ) : props.node.data.previewImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={props.node.data.previewImageUrl} alt={props.node.data.title} className="max-h-[420px] w-full object-contain" />
            ) : (
              <div className="flex h-60 items-center justify-center bg-white text-sm text-[var(--glass-text-tertiary)]">{t('empty.noVideo')}</div>
            )}
          </div>
          <div className="space-y-3">
            <p className="rounded-md bg-white p-3 text-sm text-[var(--glass-text-secondary)]">
              {hasVideo ? t('status.videoReady') : t('status.videoMissing')}
            </p>
            {panel.videoTaskRunning ? <p className="rounded-md bg-[#fff7ed] p-3 text-sm text-[#9a3412]">{t('status.videoRunning')}</p> : null}
            {panel.videoErrorMessage ? <p className="rounded-md bg-[var(--glass-tone-danger-bg)] p-2 text-xs text-[var(--glass-tone-danger-fg)]">{panel.videoErrorMessage}</p> : null}
          </div>
        </div>
      </DetailSection>

      <DetailSection title={t('sections.videoControls')}>
        <Field label={t('fields.videoPrompt')}><TextArea value={videoPrompt} onChange={setVideoPrompt} rows={5} /></Field>
        <InlineVideoGenerationControls
          models={videoModel.videoModelOptions}
          modelValue={videoModel.selectedModel}
          onModelChange={videoModel.setSelectedModel}
          capabilityFields={videoModel.capabilityFields}
          capabilityOverrides={videoModel.generationOptions}
          onCapabilityChange={videoModel.setCapabilityValue}
          layout="stacked"
          disabled={panel.videoTaskRunning}
        />
        {missingCapabilities.length > 0 ? (
          <p className="text-xs text-[var(--glass-tone-danger-fg)]">{t('errors.missingCapability', { fields: missingCapabilities.join(', ') })}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <ActionButton onClick={() => props.onUpdatePrompt(storyboard.id, panel.panelIndex, videoPrompt, 'videoPrompt')} variant="primary">{t('actions.saveVideoPrompt')}</ActionButton>
          <ActionButton onClick={() => props.onUpdateModel(storyboard.id, panel.panelIndex, videoModel.selectedModel)} disabled={!videoModel.selectedModel}>{t('actions.saveVideoModel')}</ActionButton>
          <ActionButton
            onClick={() => props.onGenerateVideo(storyboard.id, panel.panelIndex, panel.id, videoModel.selectedModel, videoModel.generationOptions)}
            disabled={!videoModel.selectedModel || missingCapabilities.length > 0 || panel.videoTaskRunning || !props.node.data.previewImageUrl}
          >
            {t('actions.generateVideo')}
          </ActionButton>
        </div>
      </DetailSection>

      <DetailSection title={t('sections.firstLastFrame')}>
        <Field label={t('fields.firstLastFramePrompt')}><TextArea value={firstLastPrompt} onChange={setFirstLastPrompt} rows={3} /></Field>
        <label className="flex items-center gap-2 rounded-md bg-white p-3 text-sm">
          <input
            type="checkbox"
            checked={panel.linkedToNextPanel === true}
            onChange={(event) => { void props.onToggleLink(storyboard.id, panel.panelIndex, event.target.checked) }}
          />
          {t('fields.linkedToNextPanel')}
        </label>
        <InlineVideoGenerationControls
          models={flVideoModel.videoModelOptions}
          modelValue={flVideoModel.selectedModel}
          onModelChange={(value) => {
            setFlModel(value)
            flVideoModel.setSelectedModel(value)
          }}
          capabilityFields={flVideoModel.capabilityFields}
          capabilityOverrides={flVideoModel.generationOptions}
          onCapabilityChange={flVideoModel.setCapabilityValue}
          layout="stacked"
          disabled={panel.videoTaskRunning || !nextContext}
        />
        {flMissingCapabilities.length > 0 ? <p className="text-xs text-[var(--glass-tone-danger-fg)]">{t('errors.missingCapability', { fields: flMissingCapabilities.join(', ') })}</p> : null}
        {!nextContext ? <p className="text-xs text-[var(--glass-text-tertiary)]">{t('messages.noNextPanelForFirstLast')}</p> : null}
        <div className="flex flex-wrap gap-2">
          <ActionButton onClick={() => props.onUpdatePrompt(storyboard.id, panel.panelIndex, firstLastPrompt, 'firstLastFramePrompt')}>{t('actions.saveFirstLastPrompt')}</ActionButton>
          <ActionButton
            onClick={() => {
              if (!nextContext) return
              return props.onGenerateVideo(
                storyboard.id,
                panel.panelIndex,
                panel.id,
                videoModel.selectedModel,
                videoModel.generationOptions,
                {
                  lastFrameStoryboardId: nextContext.storyboard.id,
                  lastFramePanelIndex: nextContext.panel.panelIndex,
                  flModel: flVideoModel.selectedModel,
                  customPrompt: firstLastPrompt || undefined,
                },
              )
            }}
            disabled={!nextContext || !videoModel.selectedModel || !flVideoModel.selectedModel || missingCapabilities.length > 0 || flMissingCapabilities.length > 0 || panel.videoTaskRunning}
          >
            {t('actions.generateFirstLastVideo')}
          </ActionButton>
        </div>
      </DetailSection>

      <DetailSection title={t('sections.batchVideo')}>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setBatchMode('auto')}
              className={`rounded-md border px-3 py-2 text-sm ${batchMode === 'auto' ? 'border-black bg-black text-white' : 'border-black/10 bg-white text-[var(--glass-text-secondary)]'}`}
            >
              {t('fields.autoVideoMode')}
            </button>
            <button
              type="button"
              onClick={() => setBatchMode('single')}
              className={`rounded-md border px-3 py-2 text-sm ${batchMode === 'single' ? 'border-black bg-black text-white' : 'border-black/10 bg-white text-[var(--glass-text-secondary)]'}`}
            >
              {t('fields.singleVideoMode')}
            </button>
            <button
              type="button"
              onClick={() => setBatchMode('asset-reference')}
              className={`rounded-md border px-3 py-2 text-sm ${batchMode === 'asset-reference' ? 'border-black bg-black text-white' : 'border-black/10 bg-white text-[var(--glass-text-secondary)]'}`}
            >
              {t('fields.assetReferenceVideoMode')}
            </button>
          </div>
          {batchMode === 'asset-reference' ? (
            <div className="space-y-2">
              <Field label={t('fields.assetReferenceImages')}>
                <TextArea
                  value={referenceImageText}
                  onChange={setReferenceImageText}
                  rows={3}
                  placeholder={t('placeholders.assetReferenceImages')}
                />
              </Field>
              <div className="flex flex-wrap items-center gap-2">
                <ActionButton onClick={() => fileInputRef.current?.click()} disabled={uploadTempMedia.isPending}>
                  {uploadTempMedia.isPending ? t('actions.uploadingReference') : t('actions.uploadReferenceImage')}
                </ActionButton>
                <span className="text-xs text-[var(--glass-text-tertiary)]">
                  {t('messages.assetReferenceImageCount', { count: referenceImageUrls.length })}
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? [])
                    event.target.value = ''
                    void Promise.all(files.map(async (file) => {
                      const imageBase64 = await fileToBase64(file)
                      const uploaded = await uploadTempMedia.mutateAsync({
                        imageBase64,
                        extension: file.name.split('.').pop() || 'png',
                        type: file.type,
                      })
                      if (!uploaded.url) throw new Error('REFERENCE_IMAGE_UPLOAD_FAILED')
                      return uploaded.url
                    })).then((urls) => {
                      setReferenceImageText((current) => [...splitReferenceImageUrls(current), ...urls].join('\n'))
                    })
                  }}
                />
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
          <ActionButton
            onClick={() => props.onGenerateAllVideos(
              videoModel.selectedModel,
              videoModel.generationOptions,
              batchMode,
              undefined,
              batchMode === 'asset-reference' ? referenceImageUrls : undefined,
            )}
            disabled={!videoModel.selectedModel || missingCapabilities.length > 0 || (batchMode === 'asset-reference' && referenceImageUrls.length === 0)}
            variant="primary"
          >
            {batchMode === 'auto'
              ? t('actions.generateAutoVideos')
              : batchMode === 'asset-reference'
                ? t('actions.generateAssetReferenceVideos')
                : t('actions.generateAllVideos')}
          </ActionButton>
          <ActionButton onClick={props.onDownloadVideos}>{t('actions.downloadVideos')}</ActionButton>
          </div>
        </div>
      </DetailSection>
    </div>
  )
}
