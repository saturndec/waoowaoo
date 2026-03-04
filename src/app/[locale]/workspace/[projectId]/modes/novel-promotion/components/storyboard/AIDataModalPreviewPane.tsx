'use client'

import { AppIcon } from '@/components/ui/icons'

interface AIDataModalPreviewPaneProps {
  t: (key: string) => string
  previewJson: Record<string, unknown>
}

export default function AIDataModalPreviewPane({
  t,
  previewJson,
}: AIDataModalPreviewPaneProps) {
  return (
    <div className="w-1/2 bg-foreground overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground">{t('aiData.jsonPreview')}</span>
        <button
          onClick={() => {
            const text = JSON.stringify(previewJson, null, 2)
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
              navigator.clipboard.writeText(text).catch(() => { })
            } else {
              // HTTP 环境 fallback
              const el = document.createElement('textarea')
              el.value = text
              el.style.position = 'fixed'
              el.style.opacity = '0'
              document.body.appendChild(el)
              el.select()
              document.execCommand('copy')
              document.body.removeChild(el)
            }
          }}
          className="text-xs text-primary hover:text-foreground flex items-center gap-1"
        >
          <AppIcon name="copy" className="w-3.5 h-3.5" />
          {t('common.copy')}
        </button>
      </div>
      <pre className="text-xs text-emerald-700 font-mono whitespace-pre-wrap break-all">
        {JSON.stringify(previewJson, null, 2)}
      </pre>
    </div>
  )
}
