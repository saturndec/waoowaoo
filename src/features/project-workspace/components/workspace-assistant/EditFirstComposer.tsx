'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useCreateProjectEditScript } from '@/lib/query/hooks'
import { createAssistantMessage, createUserMessage } from './assistant-messages'

interface EditFirstComposerProps {
  readonly projectId: string
  readonly episodeId?: string
  readonly appendMessages: (messages: ReturnType<typeof createAssistantMessage>[]) => void
}

export function EditFirstComposer({
  projectId,
  episodeId,
  appendMessages,
}: EditFirstComposerProps) {
  const t = useTranslations('assistantAgent')
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const createEditScript = useCreateProjectEditScript(projectId)

  const handleCreateEditScript = useCallback(async () => {
    const normalizedPrompt = prompt.trim()
    if (!normalizedPrompt || !episodeId) return
    setError(null)
    appendMessages([createUserMessage(normalizedPrompt)])
    try {
      const editScript = await createEditScript.mutateAsync({ episodeId, prompt: normalizedPrompt })
      appendMessages([
        createAssistantMessage([
          {
            type: 'text',
            text: t('panel.editFirstComplete', {
              shots: editScript.shotCount,
              duration: editScript.durationSec,
              assets: editScript.requirements.length,
            }),
          },
        ]),
      ])
      setPrompt('')
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught)
      setError(message)
      appendMessages([createAssistantMessage([{ type: 'text', text: message }])])
    }
  }, [appendMessages, createEditScript, episodeId, prompt, t])

  return (
    <div className="mb-2 rounded-[18px] border border-slate-200 bg-slate-50/80 p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-[var(--glass-text-secondary)]">{t('panel.editFirstTitle')}</p>
        <span className="rounded-full bg-white px-2 py-1 text-[10px] font-medium text-[var(--glass-text-tertiary)]">
          {t('panel.editFirstBadge')}
        </span>
      </div>
      <textarea
        rows={2}
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder={t('panel.editFirstPlaceholder')}
        className="max-h-[4.5rem] min-h-12 w-full resize-none overflow-y-auto rounded-[14px] bg-white px-3 py-2 text-sm leading-5 text-[var(--glass-text-primary)] outline-none ring-1 ring-slate-200 placeholder:text-[var(--glass-text-tertiary)] focus:ring-slate-400"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs text-[var(--glass-text-tertiary)]">
          {error || t('panel.editFirstHint')}
        </p>
        <button
          type="button"
          disabled={!episodeId || !prompt.trim() || createEditScript.isPending}
          onClick={handleCreateEditScript}
          className="inline-flex h-9 shrink-0 items-center rounded-[14px] bg-slate-950 px-3 text-xs font-semibold text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-55"
        >
          {createEditScript.isPending ? t('panel.editFirstGenerating') : t('panel.editFirstGenerate')}
        </button>
      </div>
    </div>
  )
}
