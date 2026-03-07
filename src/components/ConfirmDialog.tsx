'use client'

import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'

interface ConfirmDialogProps {
  show: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel: () => void
  type?: 'danger' | 'warning' | 'info'
}

export default function ConfirmDialog({
  show,
  title,
  message,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
  type = 'danger'
}: ConfirmDialogProps) {
  const t = useTranslations('common')

  const finalConfirmText = confirmText || t('confirm')
  const finalCancelText = cancelText || t('cancel')
  if (!show) return null

  const typeStyles = {
    danger: {
      icon: (
        <AppIcon name="alert" className="w-6 h-6 text-[var(--glass-tone-danger-fg)]" />
      ),
      confirmBg: 'glass-btn-tone-danger',
      iconBg: 'bg-[var(--glass-tone-danger-bg)]'
    },
    warning: {
      icon: (
        <AppIcon name="alert" className="w-6 h-6 text-[var(--glass-tone-warning-fg)]" />
      ),
      confirmBg: 'glass-btn-tone-warning',
      iconBg: 'bg-[var(--glass-tone-warning-bg)]'
    },
    info: {
      icon: (
        <AppIcon name="info" className="w-6 h-6 text-[var(--glass-tone-info-fg)]" />
      ),
      confirmBg: 'glass-btn-tone-info',
      iconBg: 'bg-[var(--glass-tone-info-bg)]'
    }
  }

  const currentStyle = typeStyles[type]

  return (
    <>
      {/* 背景遮罩 */}
      <div
        className="fixed inset-0 z-50 glass-overlay animate-fade-in"
        onClick={onCancel}
      />

      {/* 对话框 */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 pointer-events-none">
        <div
          className="glass-surface-modal max-w-md w-full max-h-[85vh] overflow-y-auto p-5 sm:p-6 pointer-events-auto animate-scale-in"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 图标 */}
          <div className={`w-12 h-12 rounded-full ${currentStyle.iconBg} flex items-center justify-center mb-4`}>
            {currentStyle.icon}
          </div>

          {/* 标题 */}
          <h3 className="mb-2 text-xl font-semibold text-[var(--glass-text-primary)]">
            {title}
          </h3>

          {/* 消息 */}
          <p className="mb-6 text-[var(--glass-text-secondary)]">
            {message}
          </p>

          {/* 按钮 */}
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="glass-btn-base glass-btn-secondary flex-1 px-4 py-2.5 font-medium rounded-xl"
            >
              {finalCancelText}
            </button>
            <button
              onClick={onConfirm}
              className={`glass-btn-base flex-1 px-4 py-2.5 font-medium rounded-xl ${currentStyle.confirmBg}`}
            >
              {finalConfirmText}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
