'use client'

import { createPortal } from 'react-dom'
import VoiceCreationForm from './VoiceCreationForm'
import VoicePreviewSection from './VoicePreviewSection'
import { useVoiceCreation, type VoiceCreationModalShellProps } from './hooks/useVoiceCreation'

export type { VoiceCreationModalShellProps }

export default function VoiceCreationModalLayout(props: VoiceCreationModalShellProps) {
  const runtime = useVoiceCreation(props)

  if (!runtime.isOpen) return null
  if (typeof document === 'undefined') return null

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9999] bg-black/45" onClick={runtime.handleClose} />
      <VoiceCreationForm runtime={runtime}>
        <VoicePreviewSection runtime={runtime} />
      </VoiceCreationForm>
    </>,
    document.body
  )
}
