'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

export type LLMStageViewStatus =
  | 'pending'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'

export type LLMStageViewItem = {
  id: string
  title: string
  subtitle?: string
  status: LLMStageViewStatus
  progress?: number
}

export type LLMStageStreamCardProps = {
  title: string
  subtitle?: string
  stages: LLMStageViewItem[]
  activeStageId: string
  selectedStageId?: string
  onSelectStage?: (stageId: string) => void
  outputText: string
  placeholderText?: string
  activeMessage?: string
  overallProgress?: number
  showCursor?: boolean
  autoScroll?: boolean
  smoothStreaming?: boolean
  errorMessage?: string
  topRightAction?: ReactNode
}

const PROGRESS_KEY_PREFIX = 'progress.'
const REASONING_HEADER = '【思考过程】'
const FINAL_HEADER = '【最终结果】'

function statusClass(status: LLMStageViewStatus): string {
  if (status === 'completed') return 'inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700'
  if (status === 'failed') return 'inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700'
  if (status === 'processing') return 'inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700'
  if (status === 'queued') return 'inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700'
  return 'inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground'
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

function splitStructuredOutput(raw: string): {
  hasStructured: boolean
  showReasoning: boolean
  showFinal: boolean
  reasoning: string
  finalText: string
} {
  const normalized = typeof raw === 'string' ? raw : ''
  if (!normalized.startsWith(REASONING_HEADER) && !normalized.startsWith(FINAL_HEADER)) {
    return {
      hasStructured: false,
      showReasoning: false,
      showFinal: false,
      reasoning: '',
      finalText: '',
    }
  }

  const finalIndex = normalized.indexOf(FINAL_HEADER)
  if (normalized.startsWith(REASONING_HEADER) && finalIndex >= 0) {
    const reasoning = normalized
      .slice(REASONING_HEADER.length, finalIndex)
      .trim()
    const finalText = normalized
      .slice(finalIndex + FINAL_HEADER.length)
      .trim()
    return {
      hasStructured: true,
      showReasoning: true,
      showFinal: true,
      reasoning,
      finalText,
    }
  }

  if (normalized.startsWith(REASONING_HEADER)) {
    return {
      hasStructured: true,
      showReasoning: true,
      showFinal: true,
      reasoning: normalized.slice(REASONING_HEADER.length).trim(),
      finalText: '',
    }
  }

  return {
    hasStructured: true,
    showReasoning: true,
    showFinal: true,
    reasoning: '',
    finalText: normalized.slice(FINAL_HEADER.length).trim(),
  }
}

export default function LLMStageStreamCard({
  title,
  subtitle,
  stages,
  activeStageId,
  selectedStageId,
  onSelectStage,
  outputText,
  placeholderText,
  activeMessage,
  overallProgress,
  showCursor = false,
  autoScroll = true,
  smoothStreaming = true,
  errorMessage,
  topRightAction,
}: LLMStageStreamCardProps) {
  const t = useTranslations('progress')

  const resolveProgressText = useCallback((value: string | undefined, fallbackKey: string): string => {
    const raw = typeof value === 'string' ? value.trim() : ''
    if (!raw) return t(fallbackKey as never)
    if (!raw.startsWith(PROGRESS_KEY_PREFIX)) return raw
    const key = raw.slice(PROGRESS_KEY_PREFIX.length)
    try {
      return t(key as never)
    } catch {
      return raw
    }
  }, [t])

  const statusLabel = useCallback((status: LLMStageViewStatus): string => {
    if (status === 'completed') return t('status.completed')
    if (status === 'failed') return t('status.failed')
    if (status === 'processing') return t('status.processing')
    if (status === 'queued') return t('status.queued')
    return t('status.pending')
  }, [t])

  const resolvedPlaceholderText = resolveProgressText(placeholderText, 'stageCard.waitingModelOutput')

  const outputStageId = selectedStageId || activeStageId
  const outputRef = useRef<HTMLDivElement | null>(null)
  const renderFrameRef = useRef<number | null>(null)
  const renderTargetRef = useRef(outputText)
  const renderCurrentRef = useRef(outputText)
  const latestOutputRef = useRef(outputText)
  const [renderedOutputText, setRenderedOutputText] = useState(outputText)
  const activeIndex = Math.max(
    0,
    stages.findIndex((stage) => stage.id === activeStageId),
  )
  const activeStage = stages[activeIndex] || stages[0]
  const outputStage = stages.find((stage) => stage.id === outputStageId) || activeStage
  const stageCount = stages.length
  const currentStep = Math.min(stageCount, activeIndex + 1)
  const normalizedOverallProgress =
    typeof overallProgress === 'number'
      ? clampProgress(overallProgress)
      : clampProgress(
        stageCount === 0
          ? 0
          : ((stages.filter((item) => item.status === 'completed').length +
            (activeStage?.status === 'processing' ? (activeStage.progress || 0) / 100 : 0)) /
            stageCount) *
          100,
      )
  const structuredOutput = splitStructuredOutput(renderedOutputText)

  const stopRenderLoop = useCallback(() => {
    if (renderFrameRef.current == null) return
    cancelAnimationFrame(renderFrameRef.current)
    renderFrameRef.current = null
  }, [])

  const renderNextFrame = useCallback(() => {
    const current = renderCurrentRef.current
    const target = renderTargetRef.current
    if (current === target) {
      renderFrameRef.current = null
      return
    }

    if (!target.startsWith(current)) {
      renderCurrentRef.current = target
      setRenderedOutputText(target)
      renderFrameRef.current = null
      return
    }

    const remaining = target.length - current.length
    const frameStep =
      remaining > 1200
        ? 18
        : remaining > 700
          ? 12
          : remaining > 300
            ? 8
            : remaining > 120
              ? 5
              : 2
    const next = target.slice(0, current.length + frameStep)
    renderCurrentRef.current = next
    setRenderedOutputText(next)
    renderFrameRef.current = requestAnimationFrame(renderNextFrame)
  }, [])

  useEffect(() => {
    latestOutputRef.current = outputText
    renderTargetRef.current = outputText
    const shouldSmooth = smoothStreaming && showCursor && outputStageId === activeStageId
    if (!shouldSmooth) {
      stopRenderLoop()
      if (renderCurrentRef.current !== outputText) {
        renderCurrentRef.current = outputText
        setRenderedOutputText(outputText)
      }
      return
    }

    if (
      outputText.length < renderCurrentRef.current.length ||
      !outputText.startsWith(renderCurrentRef.current)
    ) {
      stopRenderLoop()
      renderCurrentRef.current = outputText
      setRenderedOutputText(outputText)
      return
    }

    if (outputText.length === renderCurrentRef.current.length) return
    if (renderFrameRef.current != null) return
    renderFrameRef.current = requestAnimationFrame(renderNextFrame)
  }, [
    outputText,
    showCursor,
    outputStageId,
    activeStageId,
    smoothStreaming,
    renderNextFrame,
    stopRenderLoop,
  ])

  useEffect(() => {
    stopRenderLoop()
    const output = latestOutputRef.current
    renderTargetRef.current = output
    renderCurrentRef.current = output
    setRenderedOutputText(output)
  }, [outputStageId, stopRenderLoop])

  useEffect(() => {
    if (!activeStage || !autoScroll || !outputRef.current) return
    const node = outputRef.current
    node.scrollTop = node.scrollHeight
  }, [activeStage, renderedOutputText, showCursor, autoScroll])

  useEffect(() => {
    return () => {
      stopRenderLoop()
    }
  }, [stopRenderLoop])

  if (!activeStage) return null

  return (
    <article className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-lg">
      <header className="border-b border-border px-5 py-5 md:px-6">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[15rem_minmax(0,1fr)_auto] md:items-center">
          <div className="rounded-xl border border-border bg-muted/40 p-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              {t('stageCard.stage')}
            </p>
            <p className="mt-1 text-2xl font-semibold text-foreground">
              {currentStep}/{stageCount}
            </p>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {resolveProgressText(activeStage.title, 'stageCard.currentStage')}
            </p>
          </div>

          <div className="min-w-0 text-center">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              {resolveProgressText(subtitle, 'stageCard.realtimeStream')}
            </p>
            <h2 className="mt-1 text-xl font-semibold text-foreground md:text-2xl">
              {resolveProgressText(title, 'stageCard.currentStage')}
            </h2>
            <p className="mt-2 truncate text-sm text-muted-foreground">
              {resolveProgressText(activeMessage || activeStage.subtitle, 'runtime.llm.processing')}
            </p>
          </div>

          <div className="flex shrink-0 items-center justify-start whitespace-nowrap md:justify-end">{topRightAction || null}</div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200"
            style={{ width: `${Math.max(normalizedOverallProgress, 2)}%` }}
          />
        </div>

        {errorMessage && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-destructive">
            <span className="text-base">⚠️</span>
            <span className="text-sm font-medium">{errorMessage}</span>
          </div>
        )}
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-5 md:grid-cols-[17rem_1fr] md:gap-5 md:p-6">
        <aside className="min-h-0 rounded-xl border border-border bg-muted/30 p-3">
          <ul className="max-h-[40vh] space-y-2 overflow-y-auto pr-1 md:h-full md:max-h-none">
            {stages.map((stage) => {
              const isActive = stage.id === outputStageId
              const progress = clampProgress(stage.progress || 0)
              return (
                <li key={stage.id}>
                  <button
                    type="button"
                    onClick={() => onSelectStage?.(stage.id)}
                    className={`w-full rounded-lg border p-2.5 text-left ${isActive
                        ? 'border-primary/40 bg-primary/10'
                        : 'border-border bg-card'
                      } ${onSelectStage ? 'cursor-pointer hover:border-primary/40' : 'cursor-default'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-foreground">
                        {resolveProgressText(stage.title, 'stageCard.currentStage')}
                      </p>
                      <span className={statusClass(stage.status)}>{statusLabel(stage.status)}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-[width] duration-200"
                        style={{ width: `${Math.max(progress, stage.status === 'completed' ? 100 : 2)}%` }}
                      />
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </aside>

        <section className="min-h-[320px] rounded-xl border border-border bg-muted/20">
          <div className="border-b border-border px-4 py-3 text-sm font-medium text-foreground">
            {t('stageCard.outputTitle', {
              stage: resolveProgressText(outputStage?.title, 'stageCard.currentStage'),
            })}
          </div>
          <div
            ref={outputRef}
            className="h-[52vh] overflow-y-auto px-4 py-4"
          >
            {structuredOutput.hasStructured ? (
              <div className="space-y-4">
                {structuredOutput.showReasoning ? (
                  <div className="rounded-lg border border-border bg-card">
                    <div className="border-b border-border px-3 py-2 text-xs font-semibold text-foreground">
                      {REASONING_HEADER}
                    </div>
                    <pre className="min-h-[110px] whitespace-pre-wrap break-words px-3 py-3 font-mono text-[14px] leading-7 text-muted-foreground">
                      {structuredOutput.reasoning || (structuredOutput.finalText ? t('stageCard.reasoningNotProvided') : t('stageCard.waitingModelOutput'))}
                      {showCursor && !structuredOutput.finalText ? <span className="animate-pulse text-primary">▋</span> : null}
                    </pre>
                  </div>
                ) : null}
                {structuredOutput.showFinal ? (
                  <div className="rounded-lg border border-border bg-card">
                    <div className="border-b border-border px-3 py-2 text-xs font-semibold text-foreground">
                      {FINAL_HEADER}
                    </div>
                    <pre className="min-h-[110px] whitespace-pre-wrap break-words px-3 py-3 font-mono text-[14px] leading-7 text-muted-foreground">
                      {structuredOutput.finalText || t('stageCard.waitingModelOutput')}
                      {showCursor && !!structuredOutput.finalText ? <span className="animate-pulse text-primary">▋</span> : null}
                    </pre>
                  </div>
                ) : null}
              </div>
            ) : (
              <pre className="whitespace-pre-wrap break-words font-mono text-[14px] leading-7 text-muted-foreground">
                {renderedOutputText || resolvedPlaceholderText}
                {showCursor ? <span className="animate-pulse text-primary">▋</span> : null}
              </pre>
            )}
          </div>
        </section>
      </div>
    </article>
  )
}
