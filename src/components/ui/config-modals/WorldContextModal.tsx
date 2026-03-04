'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'

interface WorldContextModalProps {
  isOpen: boolean
  onClose: () => void
  text: string
  onChange: (value: string) => void
}

export function WorldContextModal({ isOpen, onClose, text, onChange }: WorldContextModalProps) {
  const t = useTranslations('worldContextModal')
  const tc = useTranslations('common')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle')
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handleTextChange = (value: string) => {
    onChange(value)
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    saveTimeoutRef.current = setTimeout(() => {
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    }, 500)
  }

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 animate-fadeIn"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="rounded-xl border border-border bg-card shadow-lg p-7 w-full max-w-3xl transform transition-all scale-100 h-[80vh] flex flex-col">
        <div className="flex justify-between items-center mb-6 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-2xl font-bold text-foreground">{t('title')}</h2>
              <p className="text-muted-foreground text-sm">{t('description')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div
              className={`inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium text-xs transition-all duration-300 ${
                saveStatus === 'saved' ? 'inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium-success' : 'inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium-neutral'
              }`}
            >
              {saveStatus === 'saved' ? (
                <>
                  <AppIcon name="check" className="w-3.5 h-3.5" />
                  {tc('saved')}
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 bg-[#15803d] rounded-full"></span>
                  {tc('autoSave')}
                </>
              )}
            </div>
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center border border-border bg-muted/50 hover:bg-muted rounded-full p-2 text-muted-foreground hover:text-muted-foreground"
            >
              <AppIcon name="close" className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="flex-1 rounded-xl border border-border bg-muted/30 p-4 overflow-hidden flex flex-col">
          <textarea
            value={text}
            onChange={(event) => handleTextChange(event.target.value)}
            placeholder={t('placeholder')}
            className="w-full rounded-md border border-input bg-background flex-1 text-base resize-none leading-relaxed placeholder:text-muted-foreground/70 custom-scrollbar p-4"
          />
        </div>

        <div className="mt-6 pt-0 flex justify-start items-center flex-shrink-0">
          <span className="text-xs text-muted-foreground">{t('hint')}</span>
        </div>
      </div>
    </div>
  )
}
