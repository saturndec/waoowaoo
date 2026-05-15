import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  shouldShowWorkspaceAssistantThinkingIndicator,
  WorkspaceAssistantThinkingIndicator,
} from '@/features/project-workspace/components/workspace-assistant/WorkspaceAssistantThinkingIndicator'

describe('WorkspaceAssistantThinkingIndicator', () => {
  it('shows only while waiting for the first assistant response', () => {
    expect(shouldShowWorkspaceAssistantThinkingIndicator('submitted')).toBe(true)
    expect(shouldShowWorkspaceAssistantThinkingIndicator('streaming')).toBe(false)
    expect(shouldShowWorkspaceAssistantThinkingIndicator('ready')).toBe(false)
    expect(shouldShowWorkspaceAssistantThinkingIndicator('error')).toBe(false)

    const submittedHtml = renderToStaticMarkup(<WorkspaceAssistantThinkingIndicator status="submitted" />)
    expect(submittedHtml).toContain('role="status"')
    expect(submittedHtml).toContain('assistant-thinking-minimal')
    expect(submittedHtml).toContain('assistant-thinking-minimal-pulse')
    expect(submittedHtml).not.toContain('panel.thinking')
    expect(submittedHtml).not.toContain('panel.responding')
    expect(submittedHtml).not.toContain('AI ')
    expect(submittedHtml).not.toContain('data-icon="loader"')
  })

  it('renders nothing after the first response starts streaming or when idle or errored', () => {
    expect(renderToStaticMarkup(<WorkspaceAssistantThinkingIndicator status="streaming" />)).toBe('')
    expect(renderToStaticMarkup(<WorkspaceAssistantThinkingIndicator status="ready" />)).toBe('')
    expect(renderToStaticMarkup(<WorkspaceAssistantThinkingIndicator status="error" />)).toBe('')
  })
})
