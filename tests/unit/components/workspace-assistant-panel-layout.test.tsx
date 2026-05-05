import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WorkspaceAssistantPanelHeader } from '@/features/project-workspace/components/workspace-assistant/WorkspaceAssistantPanelHeader'
import { WorkspaceAssistantPanelRail } from '@/features/project-workspace/components/workspace-assistant/WorkspaceAssistantPanelRail'
import {
  buildWorkspaceAssistantPanelLayout,
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
        episodeLabel: 'Episode 1',
        workspaceLabel: 'Node Canvas',
        runLabel: '1 active runs',
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
    expect(railHtml).toContain('Expand AI assistant sidebar')
    expect(railHtml).not.toContain('Workspace Chat')
  })
})
