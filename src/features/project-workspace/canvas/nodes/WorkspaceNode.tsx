'use client'

import React, { useEffect, useRef, useState, type ReactNode } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useTranslations } from 'next-intl'
import { AppIcon, type AppIconName } from '@/components/ui/icons'
import { toDisplayImageUrl } from '@/lib/media/image-url'
import StoryDetail from '../details/StoryDetail'
import type {
  WorkspaceCanvasAssetRef,
  WorkspaceCanvasFlowNode,
  WorkspaceCanvasNodeAction,
  WorkspaceCanvasScriptScene,
  WorkspaceCanvasTextLine,
} from '../node-canvas-types'

function nodeIconName(kind: WorkspaceCanvasFlowNode['data']['kind']): AppIconName {
  switch (kind) {
    case 'storyInput':
      return 'fileText'
    case 'analysis':
      return 'chart'
    case 'scriptClip':
      return 'bookOpen'
    case 'shot':
      return 'clapperboard'
    case 'imageAsset':
      return 'image'
    case 'videoClip':
      return 'video'
    case 'finalTimeline':
      return 'film'
    case 'editScript':
      return 'clipboardCheck'
    case 'videoPlan':
      return 'clapperboard'
    case 'editRequiredAsset':
      return 'package'
  }
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

const SELECTABLE_TEXT_CLASS = 'select-none'

function renderSection(title: string, children: ReactNode) {
  return (
    <section className="space-y-1.5 rounded-[16px] bg-slate-50 p-3 ring-1 ring-slate-100">
      <p className={`${SELECTABLE_TEXT_CLASS} text-[10px] font-semibold uppercase text-[var(--glass-text-tertiary)]`}>{title}</p>
      {children}
    </section>
  )
}

function renderValue(label: string, value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="grid grid-cols-[4.5rem_1fr] gap-2 text-xs leading-5">
      <span className={`${SELECTABLE_TEXT_CLASS} text-[var(--glass-text-tertiary)]`}>{label}</span>
      <span className={`${SELECTABLE_TEXT_CLASS} min-w-0 break-words text-[var(--glass-text-secondary)]`}>{value}</span>
    </div>
  )
}

function renderTextBlock(value: string | null | undefined) {
  if (!hasText(value)) return null
  return <p className={`${SELECTABLE_TEXT_CLASS} whitespace-pre-wrap break-words text-xs leading-5 text-[var(--glass-text-secondary)]`}>{value}</p>
}

function renderTextSection(title: string, value: string | null | undefined) {
  const content = renderTextBlock(value)
  return content ? renderSection(title, content) : null
}

function renderSummaryText(value: string | null | undefined, lines = 3) {
  if (!hasText(value)) return null
  const lineClampClass = lines === 2 ? 'line-clamp-2' : lines === 4 ? 'line-clamp-4' : 'line-clamp-3'
  return <p className={`${SELECTABLE_TEXT_CLASS} ${lineClampClass} break-words text-xs leading-5 text-[var(--glass-text-secondary)]`}>{value}</p>
}

type PromptSaveStatus = 'idle' | 'saving' | 'saved' | 'failed'

function estimatePromptRows(value: string): number {
  const charactersPerLine = 92
  return Math.max(10, value.split(/\r?\n/).reduce((total, line) => (
    total + Math.max(1, Math.ceil(line.length / charactersPerLine))
  ), 0) + 2)
}

function EditablePromptSection({
  title,
  value,
  summaryValue,
  expanded,
  labels,
  onSave,
}: {
  readonly title: string
  readonly value: string | null | undefined
  readonly summaryValue?: string | null
  readonly expanded: boolean
  readonly labels: ReturnType<typeof useTranslations>
  readonly onSave?: (nextValue: string) => Promise<void>
}) {
  const sectionRef = useRef<HTMLElement | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [status, setStatus] = useState<PromptSaveStatus>('idle')

  useEffect(() => {
    if (!editing) setDraft(value ?? '')
  }, [editing, value])

  useEffect(() => {
    if (!editing) return undefined
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (sectionRef.current?.contains(target)) return
      setDraft(value ?? '')
      setStatus('idle')
      setEditing(false)
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [editing, value])

  const displayed = value ?? summaryValue ?? null
  const content = expanded ? renderTextBlock(value) : renderSummaryText(displayed, 3)
  if (!content && !onSave) return null

  const normalizedDraft = draft.trim()
  const normalizedValue = (value ?? '').trim()
  const canSave = normalizedDraft.length > 0 && normalizedDraft !== normalizedValue
  const editRows = estimatePromptRows(draft)

  const handleSave = async () => {
    if (!onSave || !canSave) {
      setEditing(false)
      return
    }
    setStatus('saving')
    try {
      await onSave(normalizedDraft)
      setStatus('saved')
      setEditing(false)
    } catch {
      setStatus('failed')
    }
  }

  return (
    <section
      ref={sectionRef}
      className={editing
        ? 'nodrag nowheel relative z-50 -mx-2 w-[min(980px,calc(100vw-96px))] space-y-2 rounded-[16px] bg-white p-4 shadow-[0_20px_70px_rgba(15,23,42,0.18)] ring-1 ring-slate-200'
        : 'space-y-1.5 rounded-[16px] bg-slate-50 p-3 ring-1 ring-slate-100'}
      onPointerDownCapture={editing ? (event) => event.stopPropagation() : undefined}
      onWheelCapture={editing ? (event) => {
        event.preventDefault()
        event.stopPropagation()
      } : undefined}
      onKeyDownCapture={editing ? (event) => event.stopPropagation() : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <p className={`${SELECTABLE_TEXT_CLASS} text-[10px] font-semibold uppercase text-[var(--glass-text-tertiary)]`}>{title}</p>
        {onSave ? (
          <button
            type="button"
            className="nodrag inline-flex h-6 w-6 items-center justify-center text-[var(--glass-text-secondary)] transition hover:text-[var(--glass-text-primary)]"
            aria-label={labels('editPrompt')}
            title={labels('editPrompt')}
            onClick={() => {
              setStatus('idle')
              setEditing(true)
            }}
          >
            <AppIcon name="edit" className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea
            className="nodrag nowheel min-h-[280px] w-full resize-none overflow-hidden rounded-[12px] border border-slate-200 bg-white px-3 pb-5 pt-2 text-xs leading-5 text-[var(--glass-text-secondary)] outline-none transition focus:border-slate-400"
            value={draft}
            rows={editRows}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="flex items-center justify-between gap-2">
            <span className={`${SELECTABLE_TEXT_CLASS} text-[10px] text-[var(--glass-text-tertiary)]`}>
              {status === 'saving'
                ? labels('promptSaving')
                : status === 'failed'
                  ? labels('promptSaveFailed')
                  : ''}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="nodrag rounded-[10px] border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-[var(--glass-text-secondary)] transition hover:bg-slate-50"
                disabled={status === 'saving'}
                onClick={() => {
                  setDraft(value ?? '')
                  setStatus('idle')
                  setEditing(false)
                }}
              >
                {labels('cancelEdit')}
              </button>
              <button
                type="button"
                className="nodrag rounded-[10px] bg-slate-950 px-2.5 py-1.5 text-[10px] font-semibold text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-400"
                disabled={!canSave || status === 'saving'}
                onClick={() => void handleSave()}
              >
                {labels('savePrompt')}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {content}
          {status === 'saved' ? (
            <p className={`${SELECTABLE_TEXT_CLASS} text-[10px] font-medium text-emerald-600`}>{labels('promptSaved')}</p>
          ) : status === 'failed' ? (
            <p className={`${SELECTABLE_TEXT_CLASS} text-[10px] font-medium text-red-600`}>{labels('promptSaveFailed')}</p>
          ) : null}
        </>
      )}
    </section>
  )
}

function nodeIsRunning(data: WorkspaceCanvasFlowNode['data']): boolean {
  return data.isRunning === true
}

function nodeCanToggleDetails(kind: WorkspaceCanvasFlowNode['data']['kind']): boolean {
  return kind !== 'storyInput' && kind !== 'analysis' && kind !== 'editScript'
}

function nodeShowsMetaFooter(kind: WorkspaceCanvasFlowNode['data']['kind']): boolean {
  return kind !== 'editRequiredAsset' && kind !== 'editScript'
}

async function dispatchNodeAction(data: WorkspaceCanvasFlowNode['data'], action: WorkspaceCanvasNodeAction) {
  await Promise.resolve(data.onAction?.(action))
}

function panelPromptSaveHandler(
  data: WorkspaceCanvasFlowNode['data'],
  field: 'imagePrompt' | 'videoPrompt' | 'firstLastFramePrompt',
): ((nextValue: string) => Promise<void>) | undefined {
  if (!data.onAction) return undefined
  if (typeof data.storyboardId !== 'string' || typeof data.panelIndex !== 'number') return undefined
  const storyboardId = data.storyboardId
  const panelIndex = data.panelIndex
  return async (nextValue) => {
    await dispatchNodeAction(data, {
      type: 'update_video_prompt',
      storyboardId,
      panelIndex,
      value: nextValue,
      field,
    })
  }
}

function videoPlanPromptSaveHandler(data: WorkspaceCanvasFlowNode['data']): ((nextValue: string) => Promise<void>) | undefined {
  if (!data.onAction) return undefined
  const details = data.videoPlanDetails
  if (!details) return undefined
  return async (nextValue) => {
    await dispatchNodeAction(data, {
      type: 'update_video_plan_prompt',
      editScriptId: details.editScriptId,
      blockIndex: details.blockIndex,
      prompt: nextValue,
    })
  }
}

function videoPlanGenerationOptions(data: WorkspaceCanvasFlowNode['data']): Record<string, string | number | boolean> | undefined {
  const action = data.action
  if (!action) return undefined
  if (action.type === 'generate_video_group' || action.type === 'generate_video') {
    return action.generationOptions
  }
  return undefined
}

function videoPlanModel(data: WorkspaceCanvasFlowNode['data']): string {
  const assetReferenceVideoModel = data.videoPlanDetails?.assetReferenceVideoModel
  if (typeof assetReferenceVideoModel === 'string' && assetReferenceVideoModel.trim()) {
    return assetReferenceVideoModel.trim()
  }
  const action = data.action
  if (!action) return ''
  if (action.type === 'generate_video_group') return action.videoModel.trim()
  if (action.type === 'generate_video') return typeof action.videoModel === 'string' ? action.videoModel.trim() : ''
  return ''
}

function LoadingSpinner() {
  return <AppIcon name="loader" className="h-4 w-4 animate-spin" />
}

function MediaSkeleton({ height }: { readonly height: number }) {
  return (
    <div
      className="workspace-node-loading-surface overflow-hidden rounded-[18px] border border-slate-200 bg-slate-100"
      style={{ height }}
    />
  )
}

function renderChips(label: string, values: readonly string[]) {
  if (values.length === 0) return null
  return renderSection(label, (
    <div className="flex flex-wrap gap-1.5">
      {values.map((value) => (
        <span key={value} className={`${SELECTABLE_TEXT_CLASS} rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-[var(--glass-text-secondary)]`}>
          {value}
        </span>
      ))}
    </div>
  ))
}

function renderAssetChips(label: string, values: readonly WorkspaceCanvasAssetRef[]) {
  if (values.length === 0) return null
  return renderSection(label, (
    <div className="flex flex-wrap gap-1.5">
      {values.map((value) => {
        const key = `${value.name}:${value.appearance ?? ''}`
        return (
          <span key={key} className={`${SELECTABLE_TEXT_CLASS} rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-[var(--glass-text-secondary)]`}>
            {value.appearance ? `${value.name} / ${value.appearance}` : value.name}
          </span>
        )
      })}
    </div>
  ))
}

function renderLines(lines: readonly WorkspaceCanvasTextLine[], labels: ReturnType<typeof useTranslations>) {
  if (lines.length === 0) return null
  return (
    <div className="space-y-1.5">
      {lines.map((line, index) => (
        <div key={`${line.kind}-${index}`} className="rounded-[12px] bg-white px-2.5 py-2 text-xs leading-5 ring-1 ring-slate-100">
          <div className={`${SELECTABLE_TEXT_CLASS} mb-0.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase text-[var(--glass-text-tertiary)]`}>
            <span>{labels(`lineKind.${line.kind}`)}</span>
            {line.speaker ? <span>{line.speaker}</span> : null}
          </div>
          <p className={`${SELECTABLE_TEXT_CLASS} whitespace-pre-wrap break-words text-[var(--glass-text-secondary)]`}>{line.text}</p>
        </div>
      ))}
    </div>
  )
}

function renderScene(scene: WorkspaceCanvasScriptScene, index: number, labels: ReturnType<typeof useTranslations>) {
  return (
    <section key={`${scene.sceneNumber ?? index}-${scene.heading ?? ''}`} className="space-y-2 rounded-[16px] bg-slate-50 p-3 ring-1 ring-slate-100">
      <div className="flex items-center justify-between gap-2">
        <p className={`${SELECTABLE_TEXT_CLASS} text-[10px] font-semibold uppercase text-[var(--glass-text-tertiary)]`}>
          {labels('scene', { index: scene.sceneNumber ?? index + 1 })}
        </p>
        {scene.heading ? <span className={`${SELECTABLE_TEXT_CLASS} truncate text-[11px] text-[var(--glass-text-secondary)]`}>{scene.heading}</span> : null}
      </div>
      {renderTextBlock(scene.description)}
      {renderChips(labels('characters'), scene.characters)}
      {renderLines(scene.lines, labels)}
    </section>
  )
}

function StoryContent({
  data,
  onDraftChange,
  draft,
}: {
  readonly data: WorkspaceCanvasFlowNode['data']
  readonly draft: string
  readonly onDraftChange: (value: string) => void
}) {
  if (data.projectId) {
    return (
      <StoryDetail
        projectId={data.projectId}
        storyText={data.body}
        episodeName={data.episodeName}
        variant="node"
      />
    )
  }

  return (
    <textarea
      className="nodrag nowheel h-[116px] w-full resize-none rounded-[18px] border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm leading-6 text-[var(--glass-text-secondary)] outline-none transition focus:border-slate-400"
      value={draft}
      placeholder={data.body || data.title}
      onChange={(event) => onDraftChange(event.target.value)}
      onBlur={() => {
        if (draft !== data.body) {
          data.onAction?.({ type: 'update_story', value: draft })
        }
      }}
    />
  )
}

function AnalysisContent({ data }: { readonly data: WorkspaceCanvasFlowNode['data'] }) {
  return <p className={`${SELECTABLE_TEXT_CLASS} text-sm leading-6 text-[var(--glass-text-secondary)]`}>{data.body}</p>
}

function ScriptClipContent({
  data,
  labels,
  expanded,
}: {
  readonly data: WorkspaceCanvasFlowNode['data']
  readonly labels: ReturnType<typeof useTranslations>
  readonly expanded: boolean
}) {
  const details = data.scriptDetails
  if (!details) return <p className={`${SELECTABLE_TEXT_CLASS} text-sm leading-6 text-[var(--glass-text-secondary)]`}>{data.body}</p>
  if (!expanded) {
    return (
      <div className="space-y-2">
        {renderAssetChips(labels('characters'), details.characters)}
        {renderChips(labels('locations'), details.locations)}
        {renderSection(labels('description'), renderSummaryText(details.screenplayText || data.body, 4))}
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {renderAssetChips(labels('characters'), details.characters)}
      {renderChips(labels('locations'), details.locations)}
      {renderChips(labels('props'), details.props)}
      {renderSection(labels('clipMeta'), (
        <div className="space-y-1">
          {renderValue(labels('timeRange'), details.timeRange)}
          {renderValue(labels('duration'), details.duration)}
          {renderValue(labels('shotCount'), details.shotCount)}
        </div>
      ))}
      {details.scenes.length > 0
        ? details.scenes.map((scene, index) => renderScene(scene, index, labels))
        : renderSection(labels('screenplay'), renderTextBlock(details.screenplayText) ?? renderTextBlock(data.body))}
      {renderSection(labels('originalClip'), renderTextBlock(details.originalText))}
    </div>
  )
}

function ShotContent({
  data,
  labels,
  expanded,
}: {
  readonly data: WorkspaceCanvasFlowNode['data']
  readonly labels: ReturnType<typeof useTranslations>
  readonly expanded: boolean
}) {
  const details = data.shotDetails
  if (!details) return <p className={`${SELECTABLE_TEXT_CLASS} text-sm leading-6 text-[var(--glass-text-secondary)]`}>{data.body}</p>
  const promptShot = details.promptShot
  const shouldShowPreview = hasText(data.previewImageUrl)
  if (!expanded) {
    return (
      <div className="space-y-2">
        {shouldShowPreview ? <MediaPreview data={data} /> : null}
        {renderSection(labels('shotCore'), (
          <div className="space-y-1">
            {renderValue(labels('location'), details.location)}
            {renderValue(labels('duration'), details.duration)}
          </div>
        ))}
        {renderAssetChips(labels('characters'), details.characters)}
        {renderSection(labels('description'), renderSummaryText(data.body, 4))}
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {shouldShowPreview ? <MediaPreview data={data} /> : null}
      {renderSection(labels('shotCore'), (
        <div className="space-y-1">
          {renderValue(labels('shotType'), details.shotType)}
          {renderValue(labels('cameraMove'), details.cameraMove)}
          {renderValue(labels('location'), details.location)}
          {renderValue(labels('timeRange'), details.timeRange)}
          {renderValue(labels('duration'), details.duration)}
        </div>
      ))}
      {renderAssetChips(labels('characters'), details.characters)}
      {renderChips(labels('props'), details.props)}
      {renderTextSection(labels('description'), data.body)}
      {renderTextSection(labels('srtSegment'), details.srtSegment)}
      <EditablePromptSection
        title={labels('imagePrompt')}
        value={details.imagePrompt}
        expanded={expanded}
        labels={labels}
        onSave={panelPromptSaveHandler(data, 'imagePrompt')}
      />
      <EditablePromptSection
        title={labels('videoPrompt')}
        value={details.videoPrompt}
        expanded={expanded}
        labels={labels}
        onSave={panelPromptSaveHandler(data, 'videoPrompt')}
      />
      {renderTextSection(labels('photographyRules'), details.photographyRules)}
      {renderTextSection(labels('actingNotes'), details.actingNotes)}
      {promptShot ? renderSection(labels('promptShot'), (
        <div className="space-y-1">
          {renderValue(labels('sequence'), promptShot.sequence)}
          {renderValue(labels('locations'), promptShot.locations)}
          {renderValue(labels('characters'), promptShot.characters)}
          {renderValue(labels('plot'), promptShot.plot)}
          {renderValue(labels('pov'), promptShot.pov)}
          {renderValue(labels('scale'), promptShot.scale)}
          {renderValue(labels('module'), promptShot.module)}
          {renderValue(labels('focus'), promptShot.focus)}
          {renderValue(labels('summary'), promptShot.zhSummarize)}
        </div>
      )) : null}
      {renderTextSection(labels('error'), details.errorMessage)}
    </div>
  )
}

function MediaPreview({ data }: { readonly data: WorkspaceCanvasFlowNode['data'] }) {
  const displayVideoUrl = data.kind === 'videoClip' ? toDisplayImageUrl(data.videoDetails?.videoUrl) : null
  const displayImageUrl = toDisplayImageUrl(data.previewImageUrl)
  const isEditAsset = data.kind === 'editRequiredAsset'
  const isShotPreview = data.kind === 'shot'
  const aspectRatio = typeof data.previewAspectRatio === 'number' && Number.isFinite(data.previewAspectRatio) && data.previewAspectRatio > 0
    ? data.previewAspectRatio
    : null
  const previewHeight = isEditAsset
    ? 240
    : typeof data.previewDisplayHeight === 'number' && Number.isFinite(data.previewDisplayHeight) && data.previewDisplayHeight > 0
      ? data.previewDisplayHeight
      : 118
  const running = data.__running === true
  if (running && !displayVideoUrl && !displayImageUrl) {
    return <MediaSkeleton height={previewHeight} />
  }
  if (isShotPreview && displayImageUrl) {
    return (
      <div className={`relative overflow-hidden bg-transparent ${running ? 'workspace-node-loading-surface' : ''}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={displayImageUrl}
          alt={data.title}
          className="block h-auto w-full object-contain"
        />
      </div>
    )
  }
  const mediaStyle = aspectRatio && !isShotPreview ? { aspectRatio: String(aspectRatio) } : undefined
  const mediaClassName = aspectRatio
    ? 'h-full max-w-full rounded-[16px] object-contain'
    : 'h-full w-full object-contain'
  const frameClassName = `relative flex items-center justify-center overflow-hidden rounded-[18px] border border-slate-200 bg-slate-100 ${running ? 'workspace-node-loading-surface' : ''}`
  return (
    <div
      className={frameClassName}
      style={{ height: previewHeight }}
    >
      {displayVideoUrl ? (
        <video
          src={displayVideoUrl}
          aria-label={data.title}
          controls
          style={mediaStyle}
          className={`${aspectRatio ? mediaClassName : 'h-full w-full object-contain'} bg-black`}
        />
      ) : displayImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={displayImageUrl}
          alt={data.title}
          style={mediaStyle}
          className={isEditAsset ? 'h-full w-full object-contain' : mediaClassName}
        />
      ) : (
        <div className="flex h-full items-center justify-center bg-[linear-gradient(135deg,#f8fafc_0%,#e2e8f0_48%,#cbd5e1_100%)]">
          <span className={`${SELECTABLE_TEXT_CLASS} rounded-full border border-white/80 bg-white/80 px-3 py-1 text-xs font-semibold text-[var(--glass-text-secondary)] shadow-sm`}>
            {data.body}
          </span>
        </div>
      )}
    </div>
  )
}

function ImageContent({
  data,
  labels,
  expanded,
}: {
  readonly data: WorkspaceCanvasFlowNode['data']
  readonly labels: ReturnType<typeof useTranslations>
  readonly expanded: boolean
}) {
  if (data.__running === true) return <MediaPreview data={data} />
  const details = data.imageDetails
  return (
    <div className="space-y-2">
      <MediaPreview data={data} />
      {details ? (
        <>
          <EditablePromptSection
            title={labels('imagePrompt')}
            value={details.imagePrompt}
            summaryValue={details.description}
            expanded={expanded}
            labels={labels}
            onSave={panelPromptSaveHandler(data, 'imagePrompt')}
          />
          {expanded ? (
            <>
              {renderTextSection(labels('description'), details.description)}
              {details.candidateImages.length > 0 ? renderSection(labels('candidateImages'), (
                <div className="grid grid-cols-3 gap-1.5">
                  {details.candidateImages.map((url, index) => (
                    <div key={url} className="overflow-hidden rounded-[10px] bg-white ring-1 ring-slate-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={toDisplayImageUrl(url) ?? url} alt={labels('candidateImageAlt', { index: index + 1 })} className="h-12 w-full object-cover" />
                    </div>
                  ))}
                </div>
              )) : null}
              {renderTextSection(labels('imageHistory'), details.imageHistory)}
              {renderValue(labels('sketchImage'), details.sketchImageUrl)}
              {renderValue(labels('previousImage'), details.previousImageUrl)}
              {renderTextSection(labels('error'), details.errorMessage)}
            </>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function VideoContent({
  data,
  labels,
  expanded,
}: {
  readonly data: WorkspaceCanvasFlowNode['data']
  readonly labels: ReturnType<typeof useTranslations>
  readonly expanded: boolean
}) {
  if (data.__running === true) return <MediaPreview data={data} />
  const details = data.videoDetails
  return (
    <div className="space-y-2">
      <MediaPreview data={data} />
      {details ? (
        <>
          <EditablePromptSection
            title={labels('videoPrompt')}
            value={details.videoPrompt}
            summaryValue={data.body}
            expanded={expanded}
            labels={labels}
            onSave={panelPromptSaveHandler(data, 'videoPrompt')}
          />
          {expanded ? (
            <>
              {renderTextSection(labels('firstLastFramePrompt'), details.firstLastFramePrompt)}
              {renderSection(labels('videoMeta'), (
                <div className="space-y-1">
                  {renderValue(labels('generationMode'), details.videoGenerationMode)}
                  {renderValue(labels('videoModel'), details.videoModel)}
                  {renderValue(labels('linkedToNextPanel'), details.linkedToNextPanel === true ? labels('yes') : null)}
                  {renderValue(labels('baseVideo'), details.videoUrl)}
                </div>
              ))}
              {details.lastVideoGenerationOptions && details.lastVideoGenerationOptions.length > 0
                ? renderSection(labels('lastOptions'), renderLines(details.lastVideoGenerationOptions, labels))
                : null}
              {renderTextSection(labels('error'), details.errorMessage)}
            </>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function FinalContent({
  data,
  labels,
  expanded,
}: {
  readonly data: WorkspaceCanvasFlowNode['data']
  readonly labels: ReturnType<typeof useTranslations>
  readonly expanded: boolean
}) {
  const details = data.finalDetails
  if (!details) return <p className={`${SELECTABLE_TEXT_CLASS} text-sm leading-6 text-[var(--glass-text-secondary)]`}>{data.body}</p>
  const displayOutputUrl = details.renderStatus === 'completed'
    ? toDisplayImageUrl(details.outputUrl) ?? details.outputUrl
    : null
  return (
    <div className="space-y-2">
      {displayOutputUrl ? (
        <div className="overflow-hidden rounded-[18px] border border-slate-200 bg-slate-100">
          <video
            src={displayOutputUrl}
            aria-label={data.title}
            controls
            className="h-[156px] w-full bg-black object-contain"
          />
        </div>
      ) : null}
      {renderSection(labels('finalStats'), (
        <div className="space-y-1">
          {renderValue(labels('totalShots'), details.totalShots)}
          {renderValue(labels('totalImages'), details.totalImages)}
          {renderValue(labels('totalVideos'), details.totalVideos)}
          {renderValue(labels('totalDuration'), details.totalDuration)}
        </div>
      ))}
      {expanded ? renderChips(labels('videoOrder'), details.orderedVideoLabels) : null}
    </div>
  )
}

function renderEditScriptCell(label: string, children: ReactNode, className = '') {
  return (
    <td aria-label={label} className={`border-l border-slate-100 px-3 py-3 align-top text-xs leading-5 text-[var(--glass-text-secondary)] first:border-l-0 ${className}`}>
      <div className={`${SELECTABLE_TEXT_CLASS} whitespace-pre-wrap break-words`}>{children}</div>
    </td>
  )
}

function EditScriptContent({
  data,
  labels,
}: {
  readonly data: WorkspaceCanvasFlowNode['data']
  readonly labels: ReturnType<typeof useTranslations>
}) {
  const details = data.editScriptDetails
  if (data.__running === true && !details) {
    return (
      <div className="space-y-4">
        <p className={`${SELECTABLE_TEXT_CLASS} text-sm leading-6 text-[var(--glass-text-secondary)]`}>{data.body}</p>
        <div className="workspace-node-loading-surface h-[320px] rounded-[18px] border border-slate-200 bg-slate-100" />
      </div>
    )
  }
  if (!details) return <p className={`${SELECTABLE_TEXT_CLASS} text-sm leading-6 text-[var(--glass-text-secondary)]`}>{data.body}</p>
  return (
    <div className="nodrag nowheel space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {renderSection(labels('editScriptMeta'), (
          <div className="space-y-1">
            {renderValue(labels('totalDuration'), details.durationSec)}
            {renderValue(labels('shotCount'), details.shotCount)}
          </div>
        ))}
        {renderSection(labels('description'), renderTextBlock(data.body))}
      </div>
      <div className="overflow-hidden rounded-[16px] border border-slate-200 bg-white">
        <table className="w-full border-collapse text-left">
          <thead className="bg-slate-50">
            <tr className="text-[10px] font-semibold uppercase tracking-normal text-[var(--glass-text-tertiary)]">
              <th className="w-16 px-3 py-2">{labels('shotIndexHeader')}</th>
              <th className="w-16 border-l border-slate-100 px-3 py-2">{labels('duration')}</th>
              <th className="w-[22%] border-l border-slate-100 px-3 py-2">{labels('description')}</th>
              <th className="w-[14%] border-l border-slate-100 px-3 py-2">{labels('charactersAndScene')}</th>
              <th className="w-[13%] border-l border-slate-100 px-3 py-2">{labels('cameraMove')}</th>
              <th className="w-[28%] border-l border-slate-100 px-3 py-2">{labels('videoPrompt')}</th>
              <th className="w-[14%] border-l border-slate-100 px-3 py-2">{labels('sound')}</th>
            </tr>
          </thead>
          <tbody>
            {details.shots.map((shot) => (
              <tr key={shot.shotNumber} className="border-t border-slate-100">
                {renderEditScriptCell(labels('shotIndexHeader'), shot.shotNumber, 'font-semibold text-[var(--glass-text-primary)]')}
                {renderEditScriptCell(labels('duration'), `${shot.durationSec}s`)}
                {renderEditScriptCell(labels('description'), shot.visualAction)}
                {renderEditScriptCell(labels('charactersAndScene'), shot.charactersAndScene)}
                {renderEditScriptCell(labels('cameraMove'), shot.camera)}
                {renderEditScriptCell(labels('videoPrompt'), shot.videoPrompt)}
                {renderEditScriptCell(labels('sound'), shot.sound)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function EditAssetContent({
  data,
  labels,
  expanded,
}: {
  readonly data: WorkspaceCanvasFlowNode['data']
  readonly labels: ReturnType<typeof useTranslations>
  readonly expanded: boolean
}) {
  if (data.__running === true) return <MediaPreview data={data} />
  const details = data.editAssetDetails
  if (!details) return <p className={`${SELECTABLE_TEXT_CLASS} text-sm leading-6 text-[var(--glass-text-secondary)]`}>{data.body}</p>
  return (
    <div className="nodrag nowheel space-y-2">
      <MediaPreview data={data} />
      {renderChips(labels('linkedShots'), details.shotNumbers.map((shotNumber) => String(shotNumber)))}
      {expanded ? renderSection(labels('description'), renderTextBlock(details.description)) : null}
      {expanded && details.errorMessage ? renderSection(labels('error'), renderTextBlock(details.errorMessage)) : null}
    </div>
  )
}

function VideoPlanContent({
  data,
  labels,
  expanded,
}: {
  readonly data: WorkspaceCanvasFlowNode['data']
  readonly labels: ReturnType<typeof useTranslations>
  readonly expanded: boolean
}) {
  const details = data.videoPlanDetails
  const displayOutputUrl = toDisplayImageUrl(details?.outputUrl) ?? details?.outputUrl ?? null
  const [previewMode, setPreviewMode] = useState<'reference' | 'video'>(displayOutputUrl ? 'video' : 'reference')
  useEffect(() => {
    setPreviewMode(displayOutputUrl ? 'video' : 'reference')
  }, [displayOutputUrl])
  if (!details) return <p className={`${SELECTABLE_TEXT_CLASS} text-sm leading-6 text-[var(--glass-text-secondary)]`}>{data.body}</p>
  const referenceCells = details.sourceImages
  const running = data.__running === true
  const referenceAspectRatio = referenceCells.find((cell) => (
    typeof cell?.aspectRatio === 'number' && Number.isFinite(cell.aspectRatio) && cell.aspectRatio > 0
  ))?.aspectRatio ?? 16 / 9
  const outputAspectRatio = typeof details.outputAspectRatio === 'number' && Number.isFinite(details.outputAspectRatio) && details.outputAspectRatio > 0
    ? details.outputAspectRatio
    : referenceAspectRatio
  const outputStyle = { aspectRatio: String(outputAspectRatio) }
  const shouldShowVideo = Boolean(displayOutputUrl && previewMode === 'video')
  const assetReferences = details.assetReferences ?? []
  const assetReferenceImageUrls = assetReferences.map((asset) => asset.imageUrl)
  const assetReferenceVideoModel = videoPlanModel(data)
  const canGenerateAssetReference = assetReferenceImageUrls.length > 0 && assetReferenceVideoModel.length > 0 && !running
  const shouldShowVideoModelHint = assetReferenceImageUrls.length > 0 && assetReferenceVideoModel.length === 0
  return (
    <div className="nodrag nowheel space-y-3">
      {displayOutputUrl ? (
        <div className="inline-flex w-full rounded-full bg-slate-100 p-1 ring-1 ring-slate-200">
          <button
            type="button"
            className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition ${previewMode === 'reference' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            onClick={() => setPreviewMode('reference')}
          >
            {labels('videoPlanReference')}
          </button>
          <button
            type="button"
            className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition ${previewMode === 'video' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            onClick={() => setPreviewMode('video')}
          >
            {labels('videoPlanOutput')}
          </button>
        </div>
      ) : null}
      {shouldShowVideo && displayOutputUrl ? (
        <div className="relative flex w-full items-center justify-center overflow-hidden rounded-[16px] bg-black" style={outputStyle}>
          <video
            src={displayOutputUrl}
            aria-label={data.title}
            controls
            className="h-full w-full object-contain"
          />
        </div>
      ) : (
        <div className={`space-y-2 rounded-[18px] bg-white p-3 ring-1 ring-slate-200 ${running ? 'workspace-node-loading-surface' : ''}`}>
          <div className="flex w-full items-center justify-center rounded-[14px] bg-white text-slate-400 ring-1 ring-slate-200" style={outputStyle}>
            <div className="flex flex-col items-center gap-1 py-8">
              <AppIcon name="video" className="h-5 w-5" />
              <span className="text-[10px] font-semibold">{labels('videoPlanPendingVideo')}</span>
            </div>
          </div>
          {referenceCells.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {referenceCells.map((cell) => {
                const imageUrl = cell.imageUrl ? toDisplayImageUrl(cell.imageUrl) ?? cell.imageUrl : null
                return (
                  <div
                    key={cell.shotNumber}
                    className="relative overflow-hidden rounded-[10px] bg-slate-50 ring-1 ring-slate-200"
                    style={{ aspectRatio: '16 / 9' }}
                  >
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl} alt={labels('videoPlanShotAlt', { shot: cell.shotNumber })} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full bg-slate-50" />
                    )}
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200">
                      {cell.shotNumber}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>
      )}
      {renderSection(labels('videoPlanMeta'), (
        <div className="space-y-1">
          {renderValue(labels('generationMode'), details.kind === 'group' ? labels('videoPlanGroup') : labels('videoPlanSingle'))}
          {renderValue(labels('duration'), `${details.durationSec}s`)}
        </div>
      ))}
      {assetReferences.length > 0 ? renderSection(labels('assetReferenceImages'), (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-1.5">
            {assetReferences.map((asset) => (
              <div key={asset.id} className="overflow-hidden rounded-[10px] bg-white ring-1 ring-slate-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={toDisplayImageUrl(asset.imageUrl) ?? asset.imageUrl} alt={asset.name} className="h-14 w-full object-contain" />
              </div>
            ))}
          </div>
          <button
            type="button"
            disabled={!canGenerateAssetReference}
            onClick={() => {
              if (!canGenerateAssetReference) return
              void dispatchNodeAction(data, {
                type: 'generate_asset_reference_video',
                videoModel: assetReferenceVideoModel,
                blockIndex: details.blockIndex,
                referenceImageUrls: assetReferenceImageUrls,
                generationOptions: videoPlanGenerationOptions(data),
              })
            }}
            className="w-full rounded-md bg-slate-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {labels('generateAssetReferenceVideo')}
          </button>
          {shouldShowVideoModelHint ? (
            <p className="text-xs leading-5 text-[var(--glass-tone-danger-fg)]">{labels('videoPlanModelMissing')}</p>
          ) : null}
        </div>
      )) : null}
      {details.prompt ? (
        <EditablePromptSection
          title={labels('videoPlanPrompt')}
          value={details.prompt}
          expanded={expanded}
          labels={labels}
          onSave={videoPlanPromptSaveHandler(data)}
        />
      ) : null}
      {expanded ? renderSection(labels('reason'), renderTextBlock(details.reason)) : null}
      {details.errorMessage ? renderSection(labels('error'), renderTextBlock(details.errorMessage)) : null}
      {details.validationMessage ? renderSection(labels('error'), renderTextBlock(details.validationMessage)) : null}
    </div>
  )
}

function NodeContent({
  data,
  draft,
  setDraft,
  labels,
  expanded,
}: {
  readonly data: WorkspaceCanvasFlowNode['data']
  readonly draft: string
  readonly setDraft: (value: string) => void
  readonly labels: ReturnType<typeof useTranslations>
  readonly expanded: boolean
}) {
  if (data.__running === true) {
    if (
      data.kind === 'shot' ||
      data.kind === 'imageAsset' ||
      data.kind === 'videoClip' ||
      data.kind === 'editRequiredAsset'
    ) {
      return <MediaPreview data={data} />
    }
  }

  switch (data.kind) {
    case 'storyInput':
      return <StoryContent data={data} draft={draft} onDraftChange={setDraft} />
    case 'analysis':
      return <AnalysisContent data={data} />
    case 'scriptClip':
      return <ScriptClipContent data={data} labels={labels} expanded={expanded} />
    case 'shot':
      return <ShotContent data={data} labels={labels} expanded={expanded} />
    case 'imageAsset':
      return <ImageContent data={data} labels={labels} expanded={expanded} />
    case 'videoClip':
      return <VideoContent data={data} labels={labels} expanded={expanded} />
    case 'finalTimeline':
      return <FinalContent data={data} labels={labels} expanded={expanded} />
    case 'editScript':
      return <EditScriptContent data={data} labels={labels} />
    case 'videoPlan':
      return <VideoPlanContent data={data} labels={labels} expanded={expanded} />
    case 'editRequiredAsset':
      return <EditAssetContent data={data} labels={labels} expanded={expanded} />
  }
}

export default function WorkspaceNode({ data }: NodeProps<WorkspaceCanvasFlowNode>) {
  const labels = useTranslations('projectWorkflow.canvas.workspace.nodeFields')
  const [storyDraft, setStoryDraft] = useState(data.body)
  const expanded = data.expanded === true
  const hasTarget = data.kind !== 'storyInput'
  const hasSource = data.kind !== 'finalTimeline'
  const action = data.action
  const canToggleDetails = nodeCanToggleDetails(data.kind)
  const isRunning = nodeIsRunning(data)
  const shouldShowFooter = !isRunning && (canToggleDetails || Boolean(action && data.actionLabel) || nodeShowsMetaFooter(data.kind))
  const runningData = isRunning ? { ...data, __running: true } : data

  useEffect(() => {
    setStoryDraft(data.body)
  }, [data.body])

  return (
    <div className={`relative overflow-visible ${data.kind === 'editScript' ? 'h-auto' : 'h-full'}`}>
      {hasTarget ? <Handle type="target" position={Position.Left} className="!z-10 !h-3.5 !w-3.5 !border-2 !border-white !bg-slate-500 !shadow-sm" /> : null}
      {hasSource ? <Handle type="source" position={Position.Right} className="!z-10 !h-3.5 !w-3.5 !border-2 !border-white !bg-slate-500 !shadow-sm" /> : null}

      <article className={`relative ${data.kind === 'editScript' ? 'overflow-hidden' : 'min-h-full overflow-visible'} rounded-[24px] border bg-white/92 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur-xl ${isRunning ? 'border-sky-200 ring-2 ring-sky-100' : 'border-slate-200'}`}>
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[12px] font-semibold text-[var(--glass-text-tertiary)]">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-[11px] bg-slate-100 text-[var(--glass-text-secondary)]">
                <AppIcon name={nodeIconName(data.kind)} className="h-4 w-4" />
              </span>
              {data.indexLabel ? (
                <span className={`${SELECTABLE_TEXT_CLASS} inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-100 px-2 text-[11px] font-semibold text-[var(--glass-text-secondary)]`}>
                  {data.indexLabel}
                </span>
              ) : null}
              <p className={`${SELECTABLE_TEXT_CLASS} truncate`}>
                {data.eyebrow}
              </p>
            </div>
            <h2 className={`${SELECTABLE_TEXT_CLASS} mt-2 truncate text-xl font-semibold tracking-tight text-[var(--glass-text-primary)]`}>{data.title}</h2>
          </div>
          <span className={`${SELECTABLE_TEXT_CLASS} inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium ${isRunning ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-[var(--glass-text-secondary)]'}`}>
            {isRunning ? <LoadingSpinner /> : null}
            {data.statusLabel}
          </span>
        </header>

        <div className={`space-y-4 px-5 py-5 ${isRunning ? 'opacity-90' : ''}`}>
          <NodeContent data={runningData} draft={storyDraft} setDraft={setStoryDraft} labels={labels} expanded={expanded} />

          {shouldShowFooter ? (
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <p className={`${SELECTABLE_TEXT_CLASS} min-w-0 truncate text-xs text-[var(--glass-text-tertiary)]`}>
                {data.kind === 'editRequiredAsset' ? '' : data.meta}
              </p>
              <div className="flex shrink-0 items-center gap-1.5">
                {canToggleDetails ? (
                  <button
                    type="button"
                    className="nodrag inline-flex items-center gap-1.5 rounded-[14px] border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-[var(--glass-text-secondary)] transition hover:bg-slate-50"
                    onClick={() => data.nodeId ? data.onToggleExpanded?.(data.nodeId) : undefined}
                  >
                    {expanded ? labels('collapseDetails') : labels('expandDetails')}
                  </button>
                ) : null}
                {action && data.actionLabel ? (
                  <button
                    type="button"
                    className="nodrag inline-flex items-center gap-1.5 rounded-[14px] bg-slate-950 px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-400"
                    disabled={data.actionDisabled === true || isRunning}
                    onClick={() => {
                      if (!isRunning) data.onAction?.(action, data.nodeId)
                    }}
                  >
                    {isRunning ? <LoadingSpinner /> : <AppIcon name="arrowRight" className="h-3.5 w-3.5" />}
                    {data.actionLabel}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </article>
    </div>
  )
}
