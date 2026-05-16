import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WorkspaceAssistantPanelHeader } from '@/features/project-workspace/components/workspace-assistant/WorkspaceAssistantPanelHeader'
import { WorkspaceAssistantPanelRail } from '@/features/project-workspace/components/workspace-assistant/WorkspaceAssistantPanelRail'
import { WORKSPACE_ASSISTANT_USER_MESSAGE_CLASS } from '@/features/project-workspace/components/workspace-assistant/WorkspaceAssistantRenderers'
import {
  buildWorkspaceAssistantPanelLayout,
  clampWorkspaceAssistantPanelWidth,
  WORKSPACE_ASSISTANT_PANEL_MAX_WIDTH_PX,
  WORKSPACE_ASSISTANT_PANEL_MIN_WIDTH_PX,
  WORKSPACE_ASSISTANT_PANEL_WIDTH_PX,
  WORKSPACE_ASSISTANT_RAIL_WIDTH_PX,
} from '@/features/project-workspace/components/workspace-assistant/panel-layout'

describe('workspace assistant panel layout', () => {
  it('returns expanded width when panel is visible', () => {
    expect(buildWorkspaceAssistantPanelLayout(false)).toEqual({
      occupiedWidthPx: 0,
      panelWidthPx: WORKSPACE_ASSISTANT_PANEL_WIDTH_PX,
      railWidthPx: WORKSPACE_ASSISTANT_RAIL_WIDTH_PX,
      translateXPx: 0,
      state: 'expanded',
    })
  })

  it('clamps custom expanded width into the supported resize range', () => {
    expect(buildWorkspaceAssistantPanelLayout(false, 640)).toEqual({
      occupiedWidthPx: 0,
      panelWidthPx: 640,
      railWidthPx: WORKSPACE_ASSISTANT_RAIL_WIDTH_PX,
      translateXPx: 0,
      state: 'expanded',
    })
    expect(clampWorkspaceAssistantPanelWidth(200)).toBe(WORKSPACE_ASSISTANT_PANEL_MIN_WIDTH_PX)
    expect(clampWorkspaceAssistantPanelWidth(1200)).toBe(WORKSPACE_ASSISTANT_PANEL_MAX_WIDTH_PX)
  })

  it('keeps the right-side overlay out of canvas layout when collapsed', () => {
    expect(buildWorkspaceAssistantPanelLayout(true)).toEqual({
      occupiedWidthPx: 0,
      panelWidthPx: WORKSPACE_ASSISTANT_RAIL_WIDTH_PX,
      railWidthPx: WORKSPACE_ASSISTANT_RAIL_WIDTH_PX,
      translateXPx: 0,
      state: 'collapsed',
    })
  })

  it('renders explicit collapse and expand controls for the sidebar rail', () => {
    const headerHtml = renderToStaticMarkup(
      createElement(WorkspaceAssistantPanelHeader, {
        eyebrow: 'AI Assistant',
        title: 'Workspace Chat',
        rawContextLabel: 'View full raw context',
        downloadLabel: 'Download Log',
        downloadHref: '/api/projects/project-1/assistant/chat/log',
        collapseLabel: 'Collapse AI assistant sidebar',
        onOpenRawContext: () => undefined,
        onCollapse: () => undefined,
      }),
    )
    const railHtml = renderToStaticMarkup(
      createElement(WorkspaceAssistantPanelRail, {
        expandLabel: 'Expand AI assistant sidebar',
        onExpand: () => undefined,
      }),
    )

    expect(headerHtml).toContain('Collapse AI assistant sidebar')
    expect(headerHtml).toContain('View full raw context')
    expect(headerHtml).toContain('Download Log')
    expect(headerHtml).toContain('bg-transparent')
    expect(headerHtml).not.toContain('bg-white/70')
    expect(railHtml).toContain('Expand AI assistant sidebar')
    expect(railHtml).not.toContain('Workspace Chat')
  })

  it('keeps user messages as flat gray bubbles without border or shadow', () => {
    expect(WORKSPACE_ASSISTANT_USER_MESSAGE_CLASS).toContain('bg-neutral-100')
    expect(WORKSPACE_ASSISTANT_USER_MESSAGE_CLASS).not.toContain('border')
    expect(WORKSPACE_ASSISTANT_USER_MESSAGE_CLASS).not.toContain('shadow')
    expect(WORKSPACE_ASSISTANT_USER_MESSAGE_CLASS).not.toContain('backdrop-blur')
  })
})
