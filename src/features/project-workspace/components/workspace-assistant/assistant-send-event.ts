'use client'

export const WORKSPACE_ASSISTANT_SEND_MESSAGE_EVENT = 'workspace-assistant:send-message' as const

export interface WorkspaceAssistantSendMessagePayload {
  readonly key: string
  readonly message: string
}

export function dispatchWorkspaceAssistantMessage(payload: WorkspaceAssistantSendMessagePayload) {
  window.dispatchEvent(new CustomEvent<WorkspaceAssistantSendMessagePayload>(
    WORKSPACE_ASSISTANT_SEND_MESSAGE_EVENT,
    { detail: payload },
  ))
}

export function isWorkspaceAssistantSendMessageEvent(
  event: Event,
): event is CustomEvent<WorkspaceAssistantSendMessagePayload> {
  if (!(event instanceof CustomEvent)) return false
  const detail = event.detail as unknown
  if (!detail || typeof detail !== 'object') return false
  const record = detail as Partial<Record<keyof WorkspaceAssistantSendMessagePayload, unknown>>
  return typeof record.key === 'string'
    && record.key.trim().length > 0
    && typeof record.message === 'string'
    && record.message.trim().length > 0
}
