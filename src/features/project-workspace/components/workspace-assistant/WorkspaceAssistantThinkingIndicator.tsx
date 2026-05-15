'use client'

import React from 'react'
import type { ChatStatus } from 'ai'

interface WorkspaceAssistantThinkingIndicatorProps {
  readonly status: ChatStatus
}

export function shouldShowWorkspaceAssistantThinkingIndicator(status: ChatStatus): boolean {
  return status === 'submitted'
}

export function WorkspaceAssistantThinkingIndicator({
  status,
}: WorkspaceAssistantThinkingIndicatorProps) {
  if (!shouldShowWorkspaceAssistantThinkingIndicator(status)) return null

  return (
    <div
      className="assistant-thinking-indicator flex items-center text-[var(--glass-text-secondary)]"
      role="status"
      aria-live="polite"
    >
      <span className="assistant-thinking-minimal" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>

      <style>{`
        .assistant-thinking-indicator {
          min-height: 24px;
        }

        .assistant-thinking-minimal {
          display: inline-flex;
          flex-shrink: 0;
          align-items: center;
          justify-content: center;
          gap: 5px;
          width: 25px;
        }

        .assistant-thinking-minimal span {
          width: 5px;
          height: 5px;
          border-radius: 999px;
          background: currentColor;
          animation: assistant-thinking-minimal-pulse 1.2s ease-in-out infinite;
        }

        .assistant-thinking-minimal span:nth-child(2) {
          animation-delay: 160ms;
        }

        .assistant-thinking-minimal span:nth-child(3) {
          animation-delay: 320ms;
        }

        @keyframes assistant-thinking-minimal-pulse {
          0%, 72%, 100% {
            opacity: 0.32;
            transform: scale(0.82);
          }
          36% {
            opacity: 1;
            transform: scale(1.2);
          }
        }
      `}</style>
    </div>
  )
}
