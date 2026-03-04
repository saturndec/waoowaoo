import type { ReactNode } from 'react'
import type { VoiceCreationRuntime } from './hooks/useVoiceCreation'
import { AppIcon } from '@/components/ui/icons'

interface VoiceCreationFormProps {
  runtime: VoiceCreationRuntime
  children: ReactNode
}

export default function VoiceCreationForm({ runtime, children }: VoiceCreationFormProps) {
  const {
    mode,
    voiceName,
    tHub,
    tvCreate,
    setVoiceName,
    handleClose,
    handleModeChange,
  } = runtime

  return (
    <div
      className="fixed z-[10000] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card shadow-lg w-full max-w-xl overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/40">
        <div className="flex items-center gap-2">
          <AppIcon name="mic" className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-foreground">{tHub('addVoice')}</h2>
        </div>
        <button onClick={handleClose} className="inline-flex items-center justify-center border border-border bg-muted/50 hover:bg-muted p-1 text-muted-foreground">
          <AppIcon name="close" className="w-5 h-5" />
        </button>
      </div>

      <div className="flex border-b border-border">
        {(() => {
          const tabs = [
            { id: 'design' as const, label: tvCreate('aiDesignMode') },
            { id: 'upload' as const, label: tvCreate('uploadMode') },
          ]
          const activeIdx = tabs.findIndex(t => t.id === mode)
          return (
            <div className="flex-1 px-5 py-2.5">
              <div className="rounded-lg p-0.5" style={{ background: 'rgba(0,0,0,0.04)' }}>
                <div className="relative grid grid-cols-2 gap-1">
                  <div
                    className="absolute bottom-0.5 top-0.5 rounded-md bg-white transition-transform duration-200"
                    style={{
                      boxShadow: '0 1px 4px rgba(0,0,0,0.15), 0 0 0 0.5px rgba(0,0,0,0.06)',
                      width: '50%',
                      transform: `translateX(${Math.max(0, activeIdx) * 100}%)`,
                    }}
                  />
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => handleModeChange(tab.id)}
                      className={`relative z-[1] px-4 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${mode === tab.id
                        ? 'text-foreground font-medium'
                        : 'text-muted-foreground hover:text-muted-foreground'
                        }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )
        })()}
      </div>

      <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1 block">{tHub('voiceName')}</label>
          <input
            type="text"
            value={voiceName}
            onChange={(e) => setVoiceName(e.target.value)}
            placeholder={tHub('voiceNamePlaceholder')}
            className="w-full rounded-md border border-input bg-background w-full px-3 py-2 text-sm"
          />
        </div>

        {children}
      </div>
    </div>
  )
}
