export const WORKSPACE_ASSISTANT_PANEL_WIDTH_PX = 500
export const WORKSPACE_ASSISTANT_PANEL_MIN_WIDTH_PX = 380
export const WORKSPACE_ASSISTANT_PANEL_MAX_WIDTH_PX = 760
export const WORKSPACE_ASSISTANT_RAIL_WIDTH_PX = 64
export const WORKSPACE_ASSISTANT_TOP_OFFSET = '10rem'

export interface WorkspaceAssistantPanelLayoutState {
  occupiedWidthPx: number
  panelWidthPx: number
  railWidthPx: number
  translateXPx: number
  state: 'collapsed' | 'expanded'
}

export function clampWorkspaceAssistantPanelWidth(widthPx: number): number {
  return Math.min(
    WORKSPACE_ASSISTANT_PANEL_MAX_WIDTH_PX,
    Math.max(WORKSPACE_ASSISTANT_PANEL_MIN_WIDTH_PX, Math.round(widthPx)),
  )
}

export function buildWorkspaceAssistantPanelLayout(
  isCollapsed: boolean,
  expandedWidthPx: number = WORKSPACE_ASSISTANT_PANEL_WIDTH_PX,
): WorkspaceAssistantPanelLayoutState {
  const panelWidthPx = clampWorkspaceAssistantPanelWidth(expandedWidthPx)
  return {
    occupiedWidthPx: 0,
    panelWidthPx: isCollapsed ? WORKSPACE_ASSISTANT_RAIL_WIDTH_PX : panelWidthPx,
    railWidthPx: WORKSPACE_ASSISTANT_RAIL_WIDTH_PX,
    translateXPx: 0,
    state: isCollapsed ? 'collapsed' : 'expanded',
  }
}
