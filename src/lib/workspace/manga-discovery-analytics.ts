import { logEvent } from '@/lib/logging/core'
import { mapEntryModeToJourneyType } from '@/lib/workspace/project-mode'

export type WorkspaceJourneyAnalyticsEvent =
  | 'workspace_journey_card_view'
  | 'workspace_journey_selected'
  | 'workspace_template_selected'
  | 'workspace_wizard_step_view'
  | 'workspace_wizard_step_next'
  | 'workspace_wizard_step_back'
  | 'workspace_create_started'
  | 'workspace_project_created'

export type WorkspaceMangaAnalyticsEvent =
  | 'workspace_manga_cta_view'
  | 'workspace_manga_cta_click'
  | 'workspace_project_mode_selected'
  | 'workspace_project_created'


export function trackWorkspaceJourneyEvent(
  event: WorkspaceJourneyAnalyticsEvent,
  details: Record<string, unknown> = {},
): void {
  logEvent({
    level: 'INFO',
    module: 'workspace',
    action: 'WORKSPACE_JOURNEY_FUNNEL',
    message: event,
    details: {
      event,
      ...details,
    },
  })
}

// Legacy bridge: keep VAT-94/VAT-96 event names while emitting neutral journey taxonomy.
export function trackWorkspaceMangaEvent(
  event: WorkspaceMangaAnalyticsEvent,
  details: Record<string, unknown> = {},
): void {
  const projectMode = details.projectMode === 'manga' || details.projectMode === 'story'
    ? details.projectMode
    : undefined

  if (event === 'workspace_manga_cta_view') {
    trackWorkspaceJourneyEvent('workspace_journey_card_view', {
      ...details,
      journeyType: 'manga_webtoon',
      lane: 'manga',
      legacyEvent: event,
    })
    return
  }

  if (event === 'workspace_manga_cta_click' || event === 'workspace_project_mode_selected') {
    trackWorkspaceJourneyEvent('workspace_journey_selected', {
      ...details,
      journeyType: projectMode ? mapEntryModeToJourneyType(projectMode) : 'manga_webtoon',
      lane: projectMode || 'manga',
      legacyEvent: event,
    })
    return
  }

  trackWorkspaceJourneyEvent('workspace_project_created', {
    ...details,
    journeyType: projectMode ? mapEntryModeToJourneyType(projectMode) : 'manga_webtoon',
    lane: projectMode || 'manga',
    legacyEvent: event,
  })
}
