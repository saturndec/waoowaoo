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
        <AppIcon name="alert" className="w-6 h-6 text-destructive" />
      ),
      confirmBg: 'bg-destructive/10 text-destructive hover:bg-destructive/20',
      iconBg: 'bg-destructive/10'
    },
    warning: {
      icon: (
        <AppIcon name="alert" className="w-6 h-6 text-amber-700" />
      ),
      confirmBg: 'bg-amber-100 text-amber-700 hover:bg-amber-200',
      iconBg: 'bg-amber-100'
    },
    info: {
      icon: (
        <AppIcon name="info" className="w-6 h-6 text-primary" />
      ),
      confirmBg: 'bg-primary/10 text-primary hover:bg-primary/15',
      iconBg: 'bg-primary/10'
    }
  }

  const currentStyle = typeStyles[type]

  return (
    <>
      {/* 背景遮罩 */}
      <div
        className="fixed inset-0 z-50 bg-black/45 animate-fade-in"
        onClick={onCancel}
      />

      {/* 对话框 */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="rounded-xl border border-border bg-card shadow-lg max-w-md w-full p-6 pointer-events-auto animate-scale-in"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 图标 */}
          <div className={`w-12 h-12 rounded-full ${currentStyle.iconBg} flex items-center justify-center mb-4`}>
            {currentStyle.icon}
          </div>

          {/* 标题 */}
          <h3 className="mb-2 text-xl font-semibold text-foreground">
            {title}
          </h3>

          {/* 消息 */}
          <p className="mb-6 text-muted-foreground">
            {message}
          </p>

          {/* 按钮 */}
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="inline-flex items-center justify-center border border-input bg-background hover:bg-accent hover:text-accent-foreground flex-1 px-4 py-2.5 font-medium rounded-xl"
            >
              {finalCancelText}
            </button>
            <button
              onClick={onConfirm}
              className={`inline-flex items-center justify-center flex-1 px-4 py-2.5 font-medium rounded-xl ${currentStyle.confirmBg}`}
            >
              {finalConfirmText}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
