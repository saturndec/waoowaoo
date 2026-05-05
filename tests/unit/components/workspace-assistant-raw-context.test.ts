import { describe, expect, it } from 'vitest'
import type { UIMessage } from 'ai'
import {
  buildWorkspaceAssistantRawContextStorageKey,
  extractWorkspaceAssistantRuntimeContexts,
  mergeWorkspaceAssistantRawMessages,
  serializeWorkspaceAssistantDialogue,
  serializeWorkspaceAssistantRawContext,
} from '@/features/project-workspace/components/workspace-assistant/assistant-raw-context'

function buildMessage(params: {
  id: string
  role: UIMessage['role']
  text: string
  summary?: boolean
}): UIMessage {
  return {
    id: params.id,
    role: params.role,
    ...(params.summary
      ? {
          metadata: {
            custom: {
              projectAgentConversationSummary: true,
            },
          },
        }
      : {}),
    parts: [{ type: 'text', text: params.text }],
  }
}

describe('workspace assistant raw context helpers', () => {
  it('uses a project and episode scoped local storage key', () => {
    expect(buildWorkspaceAssistantRawContextStorageKey({
      projectId: 'project-1',
      episodeId: 'episode-1',
    })).toBe('workspace-assistant:raw-context:project-1:episode-1')
    expect(buildWorkspaceAssistantRawContextStorageKey({
      projectId: 'project-1',
    })).toBe('workspace-assistant:raw-context:project-1:global')
  })

  it('keeps existing raw messages instead of replacing them with compressed summaries', () => {
    const current = [
      buildMessage({ id: 'user-1', role: 'user', text: 'first raw turn' }),
      buildMessage({ id: 'assistant-1', role: 'assistant', text: 'first raw answer' }),
    ]
    const incoming = [
      buildMessage({ id: 'summary-1', role: 'system', text: 'compressed old turns', summary: true }),
      buildMessage({ id: 'user-2', role: 'user', text: 'latest raw turn' }),
    ]

    const merged = mergeWorkspaceAssistantRawMessages({ current, incoming })

    expect(merged.map((message) => message.id)).toEqual(['user-1', 'assistant-1', 'user-2'])
  })

  it('serializes raw messages as readable JSON for the debug window', () => {
    const serialized = serializeWorkspaceAssistantRawContext([
      buildMessage({ id: 'user-1', role: 'user', text: '检查上下文' }),
    ])

    expect(serialized).toContain('"id": "user-1"')
    expect(serialized).toContain('"text": "检查上下文"')
  })

  it('serializes plain user and assistant dialogue text by turn', () => {
    const text = serializeWorkspaceAssistantDialogue([
      buildMessage({ id: 'user-1', role: 'user', text: '写第一幕' }),
      buildMessage({ id: 'assistant-1', role: 'assistant', text: '好的，这是第一幕。' }),
    ])

    expect(text).toContain('#1 USER')
    expect(text).toContain('写第一幕')
    expect(text).toContain('#2 ASSISTANT')
    expect(text).toContain('好的，这是第一幕。')
  })

  it('extracts actual model runtime context data parts from messages', () => {
    const messages: UIMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [
          {
            type: 'data-agent-runtime-context',
            data: {
              requestId: 'req-1',
              modelKey: 'llm::mock',
              locale: 'zh',
              projectId: 'project-1',
              interactionMode: 'auto',
              systemPrompt: 'system text',
              rawMessages: [],
              runtimeMessages: [],
              modelMessages: [{ role: 'user', content: 'hello' }],
              projectContext: {},
              projectPhase: {},
              route: {},
              selectedTools: [{ operationId: 'get_project_phase', description: 'Get phase' }],
            },
          },
        ],
      },
    ]

    expect(extractWorkspaceAssistantRuntimeContexts(messages)).toEqual([
      expect.objectContaining({
        requestId: 'req-1',
        systemPrompt: 'system text',
        selectedTools: [{ operationId: 'get_project_phase', description: 'Get phase' }],
      }),
    ])
  })
})
