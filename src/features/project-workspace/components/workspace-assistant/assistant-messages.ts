'use client'

import type { UIMessage } from 'ai'

function createLocalMessage(role: UIMessage['role'], parts: UIMessage['parts']): UIMessage {
  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    role,
    parts,
  }
}

export function createAssistantMessage(parts: UIMessage['parts']): UIMessage {
  return createLocalMessage('assistant', parts)
}

export function createUserMessage(text: string): UIMessage {
  return createLocalMessage('user', [{ type: 'text', text }])
}
