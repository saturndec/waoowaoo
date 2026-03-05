'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import type {
  DirectorAgentState,
  AgentPhase,
  AgentToolLogEntry,
} from '../hooks/useDirectorAgent'

// =====================================================
// Types
// =====================================================

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  phase?: AgentPhase
  artifacts?: Record<string, unknown> | null
}

// =====================================================
// Phase display helpers
// =====================================================

const PHASE_ICONS: Record<AgentPhase, string> = {
  planning: '📋',
  analyzing: '🔍',
  scripting: '📝',
  storyboarding: '🎬',
  generating_assets: '🎨',
  generating_video: '🎥',
  generating_voice: '🎙️',
  reviewing: '✅',
  revising: '🔧',
  completed: '🏁',
  failed: '❌',
}

const TOOL_ICONS: Record<string, string> = {
  analyze_novel: '🔍',
  create_script: '📝',
  create_storyboard: '🎬',
  generate_character_image: '👤',
  generate_location_image: '🏞️',
  generate_panel_image: '🖼️',
  generate_video: '🎥',
  generate_voice: '🎙️',
  review_quality: '✅',
  revise_panel: '🔧',
  get_project_status: '📊',
}

// =====================================================
// Sub-components
// =====================================================

function PhaseIndicator({
  phase,
  t,
}: {
  phase: AgentPhase | null
  t: ReturnType<typeof useTranslations<'directorAgent'>>
}) {
  if (!phase) return null

  return (
    <div className="flex items-center gap-2">
      <span className="text-lg">{PHASE_ICONS[phase] || '⏳'}</span>
      <span className="text-sm font-medium text-[var(--glass-text-primary)]">
        {t(`phases.${phase}` as never)}
      </span>
    </div>
  )
}

function ChatMessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <span className="glass-chip glass-chip-neutral text-[11px]">
          {message.content}
        </span>
      </div>
    )
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-[var(--glass-accent-from)] text-white rounded-br-md'
            : 'glass-surface-soft border border-[var(--glass-stroke-base)] text-[var(--glass-text-primary)] rounded-bl-md'
        }`}
      >
        {message.phase && (
          <div className="flex items-center gap-1.5 mb-1.5 text-xs opacity-80">
            <span>{PHASE_ICONS[message.phase] || '⏳'}</span>
            <span className="font-medium">{message.phase}</span>
          </div>
        )}
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
        <div className={`text-[10px] mt-1.5 ${isUser ? 'text-white/60' : 'text-[var(--glass-text-tertiary)]'}`}>
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  )
}

function ThinkingStream({
  text,
  isRunning,
  t,
}: {
  text: string
  isRunning: boolean
  t: ReturnType<typeof useTranslations<'directorAgent'>>
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [text])

  if (!text && !isRunning) return null

  return (
    <div className="flex flex-col rounded-xl border border-[var(--glass-stroke-base)] glass-surface-soft">
      <div className="border-b border-[var(--glass-stroke-base)] px-4 py-2 text-xs font-medium text-[var(--glass-text-primary)] flex items-center gap-2">
        {t('panel.thinking')}
        {isRunning && <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--glass-accent-from)]" />}
      </div>
      <div
        ref={scrollRef}
        className="max-h-[200px] overflow-y-auto px-4 py-3"
      >
        <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-[var(--glass-text-tertiary)]">
          {text || t('panel.waitingThinking')}
          {isRunning && (
            <span className="animate-pulse text-[var(--glass-accent-from)]">▋</span>
          )}
        </pre>
      </div>
    </div>
  )
}

function ToolLog({
  entries,
  t,
}: {
  entries: AgentToolLogEntry[]
  t: ReturnType<typeof useTranslations<'directorAgent'>>
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries.length])

  return (
    <div className="flex flex-col rounded-xl border border-[var(--glass-stroke-base)] glass-surface-soft">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="border-b border-[var(--glass-stroke-base)] px-4 py-2 text-xs font-medium text-[var(--glass-text-primary)] flex items-center justify-between w-full hover:bg-[var(--glass-ghost-hover-bg)] transition-colors"
      >
        <span>{t('panel.toolLog')} ({entries.length})</span>
        <span className="text-[var(--glass-text-tertiary)]">{collapsed ? '▶' : '▼'}</span>
      </button>
      {!collapsed && (
        <div
          ref={scrollRef}
          className="max-h-[200px] overflow-y-auto"
        >
          {entries.length === 0 ? (
            <p className="px-4 py-3 text-xs text-[var(--glass-text-tertiary)]">
              {t('panel.noToolCalls')}
            </p>
          ) : (
            <ul className="divide-y divide-[var(--glass-stroke-base)]">
              {entries.map((entry) => (
                <li key={entry.id} className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{TOOL_ICONS[entry.name] || '🔧'}</span>
                    <span className="flex-1 truncate text-xs font-medium text-[var(--glass-text-primary)]">
                      {entry.name}
                    </span>
                    <ToolStatusBadge status={entry.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function ToolStatusBadge({ status }: { status: AgentToolLogEntry['status'] }) {
  if (status === 'calling') {
    return (
      <span className="glass-chip glass-chip-info text-[10px]">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      </span>
    )
  }
  if (status === 'success') {
    return <span className="glass-chip glass-chip-success text-[10px]">OK</span>
  }
  return <span className="glass-chip glass-chip-danger text-[10px]">ERR</span>
}

function ArtifactsPreview({ artifacts }: { artifacts: Record<string, unknown> | null }) {
  if (!artifacts || Object.keys(artifacts).length === 0) return null

  return (
    <div className="rounded-xl border border-[var(--glass-stroke-base)] glass-surface-soft">
      <div className="border-b border-[var(--glass-stroke-base)] px-4 py-2 text-xs font-medium text-[var(--glass-text-primary)]">
        Artifacts
      </div>
      <div className="p-4 max-h-[300px] overflow-y-auto">
        <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-[var(--glass-text-secondary)]">
          {JSON.stringify(artifacts, null, 2)}
        </pre>
      </div>
    </div>
  )
}

// =====================================================
// Chat Input
// =====================================================

function ChatInput({
  onSend,
  disabled,
  t,
}: {
  onSend: (message: string) => void
  disabled: boolean
  t: ReturnType<typeof useTranslations<'directorAgent'>>
}) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setInput('')
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }
  }, [input, disabled, onSend])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    // Auto-resize
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  return (
    <div className="border-t border-[var(--glass-stroke-base)] p-4">
      <div className="flex items-end gap-3">
        <textarea
          ref={inputRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={t('chat.inputPlaceholder' as never)}
          disabled={disabled}
          rows={1}
          className="glass-textarea-base flex-1 resize-none px-4 py-2.5 text-sm"
          style={{ minHeight: '40px', maxHeight: '120px' }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || !input.trim()}
          className="glass-btn-base glass-btn-primary rounded-xl px-5 py-2.5 text-sm shrink-0"
        >
          {t('chat.send' as never)}
        </button>
      </div>
    </div>
  )
}

// =====================================================
// Split View: Left Panel (Chat) + Right Panel (Details)
// =====================================================

function LeftChatPanel({
  messages,
  state,
  onSend,
  t,
}: {
  messages: ChatMessage[]
  state: DirectorAgentState & { isRunning: boolean }
  onSend: (message: string) => void
  t: ReturnType<typeof useTranslations<'directorAgent'>>
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length, state.thinkingText])

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-1">
        {messages.length === 0 && !state.isRunning && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <span className="text-4xl mb-3">🎬</span>
            <p className="text-sm text-[var(--glass-text-tertiary)] max-w-xs">
              {t('chat.emptyState' as never)}
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <ChatMessageBubble key={msg.id} message={msg} />
        ))}
        {/* Live thinking inline */}
        {state.isRunning && state.thinkingText && (
          <div className="flex justify-start mb-3">
            <div className="max-w-[85%] rounded-2xl rounded-bl-md glass-surface-soft border border-[var(--glass-stroke-base)] px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1.5 text-xs text-[var(--glass-tone-info-fg)]">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--glass-accent-from)]" />
                <span className="font-medium">{t('panel.thinking')}</span>
              </div>
              <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-[var(--glass-text-tertiary)]">
                {state.thinkingText.slice(-500)}
                <span className="animate-pulse text-[var(--glass-accent-from)]">▋</span>
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* Chat input */}
      <ChatInput onSend={onSend} disabled={state.isRunning} t={t} />
    </div>
  )
}

function RightDetailPanel({
  state,
  t,
}: {
  state: DirectorAgentState & { isRunning: boolean }
  t: ReturnType<typeof useTranslations<'directorAgent'>>
}) {
  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-4">
      {/* Phase & Progress */}
      <div className="glass-surface-soft rounded-xl border border-[var(--glass-stroke-base)] p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-[var(--glass-text-primary)] uppercase tracking-wider">
            Status
          </span>
          <span className={`glass-chip text-[10px] ${
            state.isRunning ? 'glass-chip-info' : state.status === 'completed' ? 'glass-chip-success' : state.status === 'failed' ? 'glass-chip-danger' : 'glass-chip-neutral'
          }`}>
            {state.status}
          </span>
        </div>
        <PhaseIndicator phase={state.phase} t={t} />
        <div className="mt-3 flex items-center gap-4 text-xs text-[var(--glass-text-tertiary)]">
          <span>{t('panel.iteration', { count: String(state.iterationCount) })}</span>
          {state.runId && (
            <span className="truncate">Run: {state.runId.slice(0, 16)}...</span>
          )}
        </div>
      </div>

      {/* Error */}
      {state.error && (
        <div className="flex items-center gap-2 rounded-xl bg-[var(--glass-tone-danger-bg)] border border-[var(--glass-stroke-danger)] px-4 py-3 text-[var(--glass-tone-danger-fg)]">
          <span className="text-sm font-medium">{state.error}</span>
        </div>
      )}

      {/* Tool Log */}
      <ToolLog entries={state.toolLog} t={t} />

      {/* Thinking Stream (collapsible) */}
      <ThinkingStream text={state.thinkingText} isRunning={state.isRunning} t={t} />

      {/* Artifacts */}
      <ArtifactsPreview artifacts={state.artifacts} />
    </div>
  )
}

// =====================================================
// Resizable Divider
// =====================================================

function ResizableDivider({ onResize }: { onResize: (deltaX: number) => void }) {
  const isDragging = useRef(false)
  const lastX = useRef(0)

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true
    lastX.current = e.clientX
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return
      const delta = ev.clientX - lastX.current
      lastX.current = ev.clientX
      onResize(delta)
    }

    const handleMouseUp = () => {
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  return (
    <div
      onMouseDown={handleMouseDown}
      className="w-1.5 shrink-0 cursor-col-resize flex items-center justify-center group hover:bg-[var(--glass-accent-from)] hover:bg-opacity-20 transition-colors rounded-full mx-0.5"
    >
      <div className="w-0.5 h-8 rounded-full bg-[var(--glass-stroke-strong)] group-hover:bg-[var(--glass-accent-from)] transition-colors" />
    </div>
  )
}

// =====================================================
// Main Panel Component
// =====================================================

interface DirectorAgentPanelProps {
  state: DirectorAgentState & {
    isRunning: boolean
    isVisible: boolean
    start: (request?: string, config?: Record<string, unknown>) => void
  }
  minimized: boolean
  onMinimize: () => void
  onMaximize: () => void
  onStop: () => void
  onReset: () => void
}

export default function DirectorAgentPanel({
  state,
  minimized,
  onMinimize,
  onMaximize,
  onStop,
  onReset,
}: DirectorAgentPanelProps) {
  const t = useTranslations('directorAgent')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [splitRatio, setSplitRatio] = useState(60) // left panel percentage
  const containerRef = useRef<HTMLDivElement>(null)
  const prevThinkingRef = useRef('')

  // Track phase changes as system messages
  const prevPhaseRef = useRef<AgentPhase | null>(null)
  useEffect(() => {
    if (state.phase && state.phase !== prevPhaseRef.current && state.phase !== 'completed' && state.phase !== 'failed') {
      prevPhaseRef.current = state.phase
      setMessages((prev) => [
        ...prev,
        {
          id: `system-${Date.now()}`,
          role: 'system',
          content: `${PHASE_ICONS[state.phase!] || '⏳'} Phase: ${state.phase}`,
          timestamp: Date.now(),
        },
      ])
    }
  }, [state.phase])

  // When agent completes, add summary message
  useEffect(() => {
    if (state.status === 'completed' && prevPhaseRef.current !== 'completed') {
      prevPhaseRef.current = 'completed'
      const summary = state.thinkingText.slice(-300) || 'Task completed successfully.'
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: summary,
          timestamp: Date.now(),
          phase: 'completed',
          artifacts: state.artifacts,
        },
      ])
    }
  }, [state.status, state.thinkingText, state.artifacts])

  // When agent fails, add error message
  useEffect(() => {
    if (state.status === 'failed' && state.error && prevPhaseRef.current !== 'failed') {
      prevPhaseRef.current = 'failed'
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          content: `Error: ${state.error}`,
          timestamp: Date.now(),
          phase: 'failed',
        },
      ])
    }
  }, [state.status, state.error])

  // Handle sending a user message
  const handleSend = useCallback(
    (text: string) => {
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, userMsg])

      // Reset refs for new run
      prevPhaseRef.current = null
      prevThinkingRef.current = ''

      // Start the agent with the user's request
      state.start(text)
    },
    [state],
  )

  // Handle resize
  const handleResize = useCallback((deltaX: number) => {
    if (!containerRef.current) return
    const containerWidth = containerRef.current.offsetWidth
    const deltaPercent = (deltaX / containerWidth) * 100
    setSplitRatio((prev) => Math.max(30, Math.min(80, prev + deltaPercent)))
  }, [])

  // Reset messages when panel is reset
  useEffect(() => {
    if (state.status === 'idle' && messages.length > 0 && !state.isRunning) {
      // Keep messages for history, don't auto-clear
    }
  }, [state.status, messages.length, state.isRunning])

  if (!state.isVisible && messages.length === 0) return null

  // Minimized pill
  if (minimized) {
    return (
      <button
        type="button"
        onClick={onMaximize}
        className="fixed right-6 bottom-6 z-[130] glass-surface-modal rounded-2xl px-4 py-3 text-sm font-medium text-[var(--glass-tone-info-fg)] shadow-lg"
      >
        {state.isRunning ? t('pill.running') : state.status === 'completed' ? t('pill.completed') : state.status === 'failed' ? t('pill.failed') : t('chat.title' as never)}
        {state.isRunning && (
          <span className="ml-2 inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--glass-accent-from)]" />
        )}
      </button>
    )
  }

  // Full split-view panel
  return (
    <div className="fixed inset-0 z-[130] glass-overlay backdrop-blur-sm animate-fade-in">
      <div
        ref={containerRef}
        className="mx-auto mt-4 flex h-[calc(100vh-2rem)] w-[min(96vw,1400px)] flex-col"
      >
        <article className="glass-surface-modal flex h-full flex-col overflow-hidden rounded-2xl text-[var(--glass-text-primary)]">
          {/* Header */}
          <header className="border-b border-[var(--glass-stroke-base)] px-5 py-3 md:px-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-semibold text-[var(--glass-text-primary)]">
                  {t('panel.title')}
                </h2>
                <PhaseIndicator phase={state.phase} t={t} />
              </div>
              <div className="flex items-center gap-2">
                {state.isRunning && (
                  <button
                    type="button"
                    onClick={onStop}
                    className="glass-btn-base glass-btn-tone-danger rounded-lg px-3 py-1.5 text-xs"
                  >
                    {t('panel.stop')}
                  </button>
                )}
                {!state.isRunning && state.status !== 'idle' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMessages([])
                      prevPhaseRef.current = null
                      prevThinkingRef.current = ''
                      onReset()
                    }}
                    className="glass-btn-base glass-btn-secondary rounded-lg px-3 py-1.5 text-xs"
                  >
                    {t('chat.clear' as never)}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onMinimize}
                  className="glass-btn-base glass-btn-ghost rounded-lg px-3 py-1.5 text-xs"
                >
                  {t('panel.minimize')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMessages([])
                    prevPhaseRef.current = null
                    prevThinkingRef.current = ''
                    onReset()
                  }}
                  className="glass-btn-base glass-btn-ghost rounded-lg px-2 py-1.5 text-xs"
                >
                  ✕
                </button>
              </div>
            </div>
          </header>

          {/* Body: Split View */}
          <div className="flex min-h-0 flex-1">
            {/* Left: Chat */}
            <div style={{ width: `${splitRatio}%` }} className="flex flex-col min-h-0 border-r border-[var(--glass-stroke-base)]">
              <LeftChatPanel
                messages={messages}
                state={state}
                onSend={handleSend}
                t={t}
              />
            </div>

            {/* Resizable divider */}
            <ResizableDivider onResize={handleResize} />

            {/* Right: Details */}
            <div style={{ width: `${100 - splitRatio}%` }} className="flex flex-col min-h-0">
              <RightDetailPanel state={state} t={t} />
            </div>
          </div>
        </article>
      </div>
    </div>
  )
}
