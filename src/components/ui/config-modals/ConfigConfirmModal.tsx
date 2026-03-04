'use client'

import { useTranslations } from 'next-intl'

interface ConfigConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  confirmDisabled?: boolean
}

export function ConfigConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText,
  cancelText,
  danger = false,
  confirmDisabled = false,
}: ConfigConfirmModalProps) {
  const t = useTranslations('configModal')
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 animate-fadeIn"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="rounded-xl border border-border bg-card shadow-lg w-full max-w-md p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          {description && (
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="inline-flex items-center justify-center border border-input bg-background hover:bg-accent hover:text-accent-foreground px-3 py-1.5 text-sm">
            {cancelText || t('cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={confirmDisabled}
            className={`inline-flex items-center justify-center px-3 py-1.5 text-sm ${danger ? 'bg-destructive/10 text-destructive hover:bg-destructive/20' : 'bg-primary text-primary-foreground hover:bg-primary/90'} disabled:pointer-events-none disabled:opacity-50`}
          >
            {confirmText || t('confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
