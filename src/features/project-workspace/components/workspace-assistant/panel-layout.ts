export const WORKSPACE_ASSISTANT_PANEL_WIDTH_PX = 360
export const WORKSPACE_ASSISTANT_RAIL_WIDTH_PX = 64
export const WORKSPACE_ASSISTANT_TOP_OFFSET = '10rem'

export interface WorkspaceAssistantPanelLayoutState {
  occupiedWidthPx: number
  panelWidthPx: number
  railWidthPx: number
  translateXPx: number
  state: 'collapsed' | 'expanded'
}

export function buildWorkspaceAssistantPanelLayout(isCollapsed: boolean): WorkspaceAssistantPanelLayoutState {
  return {
    occupiedWidthPx: 0,
    panelWidthPx: isCollapsed ? WORKSPACE_ASSISTANT_RAIL_WIDTH_PX : WORKSPACE_ASSISTANT_PANEL_WIDTH_PX,
    railWidthPx: WORKSPACE_ASSISTANT_RAIL_WIDTH_PX,
    translateXPx: 0,
    state: isCollapsed ? 'collapsed' : 'expanded',
  }
}
