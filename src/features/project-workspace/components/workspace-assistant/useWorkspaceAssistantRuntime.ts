'use client'

import { useChat } from '@ai-sdk/react'
import { AssistantChatTransport, useAISDKRuntime } from '@assistant-ui/react-ai-sdk'
import type { AssistantRuntime } from '@assistant-ui/react'
import type { ChatStatus, UIMessage } from 'ai'
import { useLocale } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  useProjectAssistantThread,
  useProjectAssistantThreadSync,
} from '@/lib/query/hooks'
import type { ProjectAgentInteractionMode } from '@/lib/project-agent/types'
import { isPersistableUIMessages } from '@/lib/project-agent/ui-message-validation'
import {
  buildWorkspaceAssistantRawContextStorageKey,
  mergeWorkspaceAssistantRawMessages,
  serializeWorkspaceAssistantRawContext,
} from './assistant-raw-context'

interface UseWorkspaceAssistantRuntimeParams {
  projectId: string
  episodeId?: string
  currentStage?: string | null
  selectedScopeRef?: string | null
  selectedPanelId?: string | null
  selectedClipId?: string | null
  selectedAssetId?: string | null
  interactionMode: ProjectAgentInteractionMode
}

interface UseWorkspaceAssistantRuntimeResult {
  runtime: AssistantRuntime
  messages: UIMessage[]
  messageCount: number
  status: ChatStatus
  pending: boolean
  error: Error | undefined
  syncError: string | null
  rawContextStorageError: string | null
  storageError: string | null
  storageLoading: boolean
  rawContextMessages: UIMessage[]
  sendMessage: (text: string) => Promise<void>
  replaceMessages: (messages: UIMessage[]) => void
  appendMessages: (messages: UIMessage[]) => void
}

export function buildWorkspaceAssistantChatId(params: {
  projectId: string
  episodeId?: string
  interactionMode: ProjectAgentInteractionMode
}): string {
  return `workspace-command:${params.projectId}:${params.episodeId || 'global'}:${params.interactionMode}`
}

export function useWorkspaceAssistantRuntime({
  projectId,
  episodeId,
  currentStage,
  selectedScopeRef,
  selectedPanelId,
  selectedClipId,
  selectedAssetId,
  interactionMode,
}: UseWorkspaceAssistantRuntimeParams): UseWorkspaceAssistantRuntimeResult {
  const locale = useLocale()
  const chatId = buildWorkspaceAssistantChatId({
    projectId,
    episodeId,
    interactionMode,
  })
  const assistantThread = useProjectAssistantThread(projectId, episodeId)
  const { save: saveAssistantThread } = useProjectAssistantThreadSync(projectId, episodeId, locale)
  const contextPayload = useMemo(() => ({
    locale,
    projectId,
    episodeId,
    currentStage,
    selectedScopeRef,
    selectedPanelId,
    selectedClipId,
    selectedAssetId,
    interactionMode,
  }), [currentStage, episodeId, interactionMode, locale, projectId, selectedAssetId, selectedClipId, selectedPanelId, selectedScopeRef])
  const transport = useMemo(() => new AssistantChatTransport({
    api: `/api/projects/${projectId}/assistant/chat`,
    body: {
      context: contextPayload,
    },
  }), [contextPayload, projectId])
  const chat = useChat({
    id: chatId,
    transport,
  })
  const runtime = useAISDKRuntime(chat)
  const hydratedSessionKeyRef = useRef<string | null>(null)
  const lastPersistedSignatureRef = useRef('[]')
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve())
  const persistTimerRef = useRef<number | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [rawContextMessages, setRawContextMessages] = useState<UIMessage[]>([])
  const [rawContextStorageError, setRawContextStorageError] = useState<string | null>(null)
  const rawContextMessagesRef = useRef<UIMessage[]>([])
  const rawContextStorageKey = useMemo(() => buildWorkspaceAssistantRawContextStorageKey({
    projectId,
    episodeId,
  }), [episodeId, projectId])

  const replaceMessages = useCallback((messages: UIMessage[]) => {
    chat.setMessages(messages)
  }, [chat])

  const sendMessage = useCallback(async (text: string) => {
    chat.clearError()
    await chat.sendMessage({ text })
  }, [chat])

  const appendMessages = useCallback((messages: UIMessage[]) => {
    if (messages.length === 0) return
    chat.setMessages((current) => [...current, ...messages])
  }, [chat])

  useEffect(() => {
    if (assistantThread.isLoading) return
    if (hydratedSessionKeyRef.current === chatId) return
    const persistedMessages = assistantThread.data?.messages || []
    const mergedMessages = chat.messages.length > 0
      ? [...persistedMessages, ...chat.messages.filter((message) => !persistedMessages.some((item) => item.id === message.id))]
      : persistedMessages
    replaceMessages(mergedMessages)
    hydratedSessionKeyRef.current = chatId
    lastPersistedSignatureRef.current = JSON.stringify(persistedMessages)
  }, [assistantThread.data, assistantThread.isLoading, chat.messages, chatId, replaceMessages])

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(rawContextStorageKey)
      if (!stored) {
        rawContextMessagesRef.current = []
        setRawContextMessages([])
        setRawContextStorageError(null)
        return
      }
      const parsed = JSON.parse(stored) as unknown
      if (!isPersistableUIMessages(parsed)) {
        throw new Error('PROJECT_ASSISTANT_INVALID_RAW_CONTEXT_MESSAGES')
      }
      rawContextMessagesRef.current = parsed
      setRawContextMessages(parsed)
      setRawContextStorageError(null)
    } catch (error) {
      rawContextMessagesRef.current = []
      setRawContextMessages([])
      setRawContextStorageError(error instanceof Error ? error.message : String(error))
    }
  }, [rawContextStorageKey])

  useEffect(() => {
    if (hydratedSessionKeyRef.current !== chatId) return
    if (chat.messages.length === 0) return
    if (!isPersistableUIMessages(chat.messages)) return
    const nextMessages = mergeWorkspaceAssistantRawMessages({
      current: rawContextMessagesRef.current,
      incoming: chat.messages,
    })
    rawContextMessagesRef.current = nextMessages
    setRawContextMessages(nextMessages)
    try {
      window.localStorage.setItem(rawContextStorageKey, serializeWorkspaceAssistantRawContext(nextMessages))
      setRawContextStorageError(null)
    } catch (error) {
      setRawContextStorageError(error instanceof Error ? error.message : String(error))
    }
  }, [chat.messages, chatId, rawContextStorageKey])

  useEffect(() => {
    if (hydratedSessionKeyRef.current !== chatId) return
    if (chat.status === 'submitted' || chat.status === 'streaming') return
    if (!isPersistableUIMessages(chat.messages)) return
    const signature = JSON.stringify(chat.messages)
    if (signature === lastPersistedSignatureRef.current) return
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current)
    }
    persistTimerRef.current = window.setTimeout(() => {
      const nextMessages = chat.messages
      const nextSignature = JSON.stringify(nextMessages)
      persistQueueRef.current = persistQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          try {
            await saveAssistantThread(nextMessages)
            lastPersistedSignatureRef.current = nextSignature
            setSyncError(null)
          } catch (error) {
            setSyncError(error instanceof Error ? error.message : String(error))
          }
        })
    }, 400)

    return () => {
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current)
        persistTimerRef.current = null
      }
    }
  }, [chat.messages, chat.status, chatId, saveAssistantThread])

  useEffect(() => {
    return () => {
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current)
      }
    }
  }, [])

  return {
    runtime,
    messages: chat.messages,
    messageCount: chat.messages.length,
    status: chat.status,
    pending: chat.status === 'submitted' || chat.status === 'streaming',
    error: chat.error,
    syncError,
    rawContextStorageError,
    storageError: assistantThread.error?.message || null,
    storageLoading: assistantThread.isLoading,
    rawContextMessages,
    sendMessage,
    replaceMessages,
    appendMessages,
  }
}
