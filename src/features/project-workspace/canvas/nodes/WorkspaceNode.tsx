'use client'

import React, { useEffect, useState, type ReactNode } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useTranslations } from 'next-intl'
import { AppIcon, type AppIconName } from '@/components/ui/icons'
import { toDisplayImageUrl } from '@/lib/media/image-url'
import StoryDetail from '../details/StoryDetail'
import type {
  WorkspaceCanvasAssetRef,
  WorkspaceCanvasFlowNode,
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
    case 'editRequiredAsset':
      return 'package'
  }
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function renderSection(title: string, children: ReactNode) {
  return (
    <section className="space-y-1.5 rounded-[16px] bg-slate-50 p-3 ring-1 ring-slate-100">
      <p className="text-[10px] font-semibold uppercase text-[var(--glass-text-tertiary)]">{title}</p>
      {children}
    </section>
  )
}

function renderValue(label: string, value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="grid grid-cols-[4.5rem_1fr] gap-2 text-xs leading-5">
      <span className="text-[var(--glass-text-tertiary)]">{label}</span>
      <span className="min-w-0 break-words text-[var(--glass-text-secondary)]">{value}</span>
    </div>
  )
}

function renderTextBlock(value: string | null | undefined) {
  if (!hasText(value)) return null
  return <p className="whitespace-pre-wrap break-words text-xs leading-5 text-[var(--glass-text-secondary)]">{value}</p>
}

function renderTextSection(title: string, value: string | null | undefined) {
  const content = renderTextBlock(value)
  return content ? renderSection(title, content) : null
}

function renderSummaryText(value: string | null | undefined, lines = 3) {
  if (!hasText(value)) return null
  const lineClampClass = lines === 2 ? 'line-clamp-2' : lines === 4 ? 'line-clamp-4' : 'line-clamp-3'
  return <p className={`${lineClampClass} break-words text-xs leading-5 text-[var(--glass-text-secondary)]`}>{value}</p>
}

function renderChips(label: string, values: readonly string[]) {
  if (values.length === 0) return null
  return renderSection(label, (
    <div className="flex flex-wrap gap-1.5">
      {values.map((value) => (
        <span key={value} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-[var(--glass-text-secondary)]">
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
          <span key={key} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-[var(--glass-text-secondary)]">
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
          <div className="mb-0.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase text-[var(--glass-text-tertiary)]">
            <span>{labels(`lineKind.${line.kind}`)}</span>
            {line.speaker ? <span>{line.speaker}</span> : null}
          </div>
          <p className="whitespace-pre-wrap break-words text-[var(--glass-text-secondary)]">{line.text}</p>
        </div>
      ))}
    </div>
  )
}

function renderScene(scene: WorkspaceCanvasScriptScene, index: number, labels: ReturnType<typeof useTranslations>) {
  return (
    <section key={`${scene.sceneNumber ?? index}-${scene.heading ?? ''}`} className="space-y-2 rounded-[16px] bg-slate-50 p-3 ring-1 ring-slate-100">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase text-[var(--glass-text-tertiary)]">
          {labels('scene', { index: scene.sceneNumber ?? index + 1 })}
        </p>
        {scene.heading ? <span className="truncate text-[11px] text-[var(--glass-text-secondary)]">{scene.heading}</span> : null}
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
  return <p className="text-sm leading-6 text-[var(--glass-text-secondary)]">{data.body}</p>
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
  if (!details) return <p className="text-sm leading-6 text-[var(--glass-text-secondary)]">{data.body}</p>
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
  if (!details) return <p className="text-sm leading-6 text-[var(--glass-text-secondary)]">{data.body}</p>
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
      {renderTextSection(labels('imagePrompt'), details.imagePrompt)}
      {renderTextSection(labels('videoPrompt'), details.videoPrompt)}
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
  const aspectRatio = typeof data.previewAspectRatio === 'number' && Number.isFinite(data.previewAspectRatio) && data.previewAspectRatio > 0
    ? data.previewAspectRatio
    : null
  const previewHeight = isEditAsset
    ? 240
    : typeof data.previewDisplayHeight === 'number' && Number.isFinite(data.previewDisplayHeight) && data.previewDisplayHeight > 0
      ? data.previewDisplayHeight
      : 118
  const mediaStyle = aspectRatio ? { aspectRatio: String(aspectRatio) } : undefined
  const mediaClassName = aspectRatio
    ? 'h-full max-w-full rounded-[16px] object-contain'
    : 'h-full w-full object-cover'
  return (
    <div
      className="flex items-center justify-center overflow-hidden rounded-[18px] border border-slate-200 bg-slate-100"
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
          <span className="rounded-full border border-white/80 bg-white/80 px-3 py-1 text-xs font-semibold text-[var(--glass-text-secondary)] shadow-sm">
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
  const details = data.imageDetails
  return (
    <div className="space-y-2">
      <MediaPreview data={data} />
      {details ? (
        <>
          {renderSection(labels('imagePrompt'), expanded ? renderTextBlock(details.imagePrompt) : renderSummaryText(details.imagePrompt || details.description, 3))}
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
  const details = data.videoDetails
  return (
    <div className="space-y-2">
      <MediaPreview data={data} />
      {details ? (
        <>
          {renderSection(labels('videoPrompt'), expanded ? renderTextBlock(details.videoPrompt) : renderSummaryText(details.videoPrompt || data.body, 3))}
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
  if (!details) return <p className="text-sm leading-6 text-[var(--glass-text-secondary)]">{data.body}</p>
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
      <div className="whitespace-pre-wrap break-words">{children}</div>
    </td>
  )
}

function EditScriptContent({
  data,
  labels,
  expanded,
}: {
  readonly data: WorkspaceCanvasFlowNode['data']
  readonly labels: ReturnType<typeof useTranslations>
  readonly expanded: boolean
}) {
  const details = data.editScriptDetails
  if (!details) return <p className="text-sm leading-6 text-[var(--glass-text-secondary)]">{data.body}</p>
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
              {expanded ? (
                <>
                  <th className="w-[13%] border-l border-slate-100 px-3 py-2">{labels('cameraMove')}</th>
                  <th className="w-[28%] border-l border-slate-100 px-3 py-2">{labels('videoPrompt')}</th>
                  <th className="w-[14%] border-l border-slate-100 px-3 py-2">{labels('sound')}</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {details.shots.map((shot) => (
              <tr key={shot.shotNumber} className="border-t border-slate-100">
                {renderEditScriptCell(labels('shotIndexHeader'), shot.shotNumber, 'font-semibold text-[var(--glass-text-primary)]')}
                {renderEditScriptCell(labels('duration'), `${shot.durationSec}s`)}
                {renderEditScriptCell(labels('description'), expanded ? shot.visualAction : renderSummaryText(shot.visualAction, 2))}
                {renderEditScriptCell(labels('charactersAndScene'), shot.charactersAndScene)}
                {expanded ? (
                  <>
                    {renderEditScriptCell(labels('cameraMove'), shot.camera)}
                    {renderEditScriptCell(labels('videoPrompt'), shot.videoPrompt)}
                    {renderEditScriptCell(labels('sound'), shot.sound)}
                  </>
                ) : null}
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
  const details = data.editAssetDetails
  if (!details) return <p className="text-sm leading-6 text-[var(--glass-text-secondary)]">{data.body}</p>
  return (
    <div className="nodrag nowheel space-y-2">
      <MediaPreview data={data} />
      {renderChips(labels('linkedShots'), details.shotNumbers.map((shotNumber) => String(shotNumber)))}
      {expanded ? renderSection(labels('description'), renderTextBlock(details.description)) : null}
      {expanded && details.errorMessage ? renderSection(labels('error'), renderTextBlock(details.errorMessage)) : null}
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
      return <EditScriptContent data={data} labels={labels} expanded={expanded} />
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
  const canToggleDetails = data.kind !== 'storyInput' && data.kind !== 'analysis'
  const isEditRequiredAsset = data.kind === 'editRequiredAsset'
  const shouldShowFooter = canToggleDetails || !isEditRequiredAsset || Boolean(action && data.actionLabel)

  useEffect(() => {
    setStoryDraft(data.body)
  }, [data.body])

  return (
    <div className="relative h-full overflow-visible">
      {hasTarget ? <Handle type="target" position={Position.Left} className="!z-10 !h-3.5 !w-3.5 !border-2 !border-white !bg-slate-500 !shadow-sm" /> : null}
      {hasSource ? <Handle type="source" position={Position.Right} className="!z-10 !h-3.5 !w-3.5 !border-2 !border-white !bg-slate-500 !shadow-sm" /> : null}

      <article className="min-h-full overflow-visible rounded-[24px] border border-slate-200 bg-white/92 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur-xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[12px] font-semibold text-[var(--glass-text-tertiary)]">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-[11px] bg-slate-100 text-[var(--glass-text-secondary)]">
                <AppIcon name={nodeIconName(data.kind)} className="h-4 w-4" />
              </span>
              {data.indexLabel ? (
                <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-100 px-2 text-[11px] font-semibold text-[var(--glass-text-secondary)]">
                  {data.indexLabel}
                </span>
              ) : null}
              <p className="truncate">
                {data.eyebrow}
              </p>
            </div>
            <h2 className="mt-2 truncate text-xl font-semibold tracking-tight text-[var(--glass-text-primary)]">{data.title}</h2>
          </div>
          <span className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-[var(--glass-text-secondary)]">
            {data.statusLabel}
          </span>
        </header>

        <div className="space-y-4 px-5 py-5">
          <NodeContent data={data} draft={storyDraft} setDraft={setStoryDraft} labels={labels} expanded={expanded} />

          {shouldShowFooter ? (
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <p className="min-w-0 truncate text-xs text-[var(--glass-text-tertiary)]">
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
                    disabled={data.actionDisabled === true}
                    onClick={() => data.onAction?.(action)}
                  >
                    <AppIcon name="arrowRight" className="h-3.5 w-3.5" />
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
