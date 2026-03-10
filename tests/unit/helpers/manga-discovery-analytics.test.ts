import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  trackWorkspaceJourneyEvent,
  trackWorkspaceMangaEvent,
} from '@/lib/workspace/manga-discovery-analytics'
import { logEvent } from '@/lib/logging/core'

vi.mock('@/lib/logging/core', () => ({
  logEvent: vi.fn(),
}))

describe('manga discovery analytics helper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('emits neutral journey taxonomy directly for comparative funnel analytics', () => {
    trackWorkspaceJourneyEvent('workspace_journey_selected', {
      surface: 'workspace_card',
      locale: 'vi',
      journeyType: 'film_video',
      lane: 'story',
    })

    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({
      level: 'INFO',
      module: 'workspace',
      action: 'WORKSPACE_JOURNEY_FUNNEL',
      message: 'workspace_journey_selected',
      details: expect.objectContaining({
        event: 'workspace_journey_selected',
        surface: 'workspace_card',
        locale: 'vi',
        journeyType: 'film_video',
        lane: 'story',
      }),
    }))
  })

  it('bridges legacy manga click into neutral journey selection taxonomy', () => {
    trackWorkspaceMangaEvent('workspace_manga_cta_click', {
      surface: 'workspace_card',
      locale: 'vi',
    })

    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({
      level: 'INFO',
      module: 'workspace',
      action: 'WORKSPACE_JOURNEY_FUNNEL',
      message: 'workspace_journey_selected',
      details: expect.objectContaining({
        event: 'workspace_journey_selected',
        surface: 'workspace_card',
        locale: 'vi',
        journeyType: 'manga_webtoon',
        lane: 'manga',
        legacyEvent: 'workspace_manga_cta_click',
      }),
    }))
  })

  it('bridges project created telemetry with selected journey context', () => {
    trackWorkspaceMangaEvent('workspace_project_created', {
      surface: 'create_project_modal',
      locale: 'vi',
      projectMode: 'manga',
      projectId: 'project-123',
      entryIntent: 'manga_quickstart',
    })

    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({
      level: 'INFO',
      module: 'workspace',
      action: 'WORKSPACE_JOURNEY_FUNNEL',
      message: 'workspace_project_created',
      details: expect.objectContaining({
        event: 'workspace_project_created',
        surface: 'create_project_modal',
        locale: 'vi',
        projectMode: 'manga',
        projectId: 'project-123',
        journeyType: 'manga_webtoon',
        lane: 'manga',
        entryIntent: 'manga_quickstart',
        legacyEvent: 'workspace_project_created',
      }),
    }))
  })

  it('keeps telemetry dimensions intact for journey template selection assertions', () => {
    trackWorkspaceJourneyEvent('workspace_template_selected', {
      journeyType: 'manga_webtoon',
      entryIntent: 'manga_quickstart',
      templateId: 'starter-action-battle',
      locale: 'vi',
      projectId: 'project-telemetry-1',
      sourceScreen: 'workspace_create_modal',
    })

    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({
      level: 'INFO',
      module: 'workspace',
      action: 'WORKSPACE_JOURNEY_FUNNEL',
      message: 'workspace_template_selected',
      details: expect.objectContaining({
        event: 'workspace_template_selected',
        journeyType: 'manga_webtoon',
        entryIntent: 'manga_quickstart',
        templateId: 'starter-action-battle',
        locale: 'vi',
        projectId: 'project-telemetry-1',
      }),
    }))
  })

  it('emits deep wizard telemetry events for view/next/back steps', () => {
    trackWorkspaceJourneyEvent('workspace_wizard_step_view', {
      wizardStep: 1,
      journeyType: 'manga_webtoon',
      locale: 'vi',
    })
    trackWorkspaceJourneyEvent('workspace_wizard_step_next', {
      fromStep: 1,
      toStep: 2,
      journeyType: 'manga_webtoon',
      entryIntent: 'manga_quickstart',
      locale: 'vi',
    })
    trackWorkspaceJourneyEvent('workspace_wizard_step_back', {
      fromStep: 2,
      toStep: 1,
      journeyType: 'manga_webtoon',
      entryIntent: 'manga_quickstart',
      locale: 'vi',
    })

    expect(logEvent).toHaveBeenNthCalledWith(1, expect.objectContaining({
      message: 'workspace_wizard_step_view',
      details: expect.objectContaining({
        event: 'workspace_wizard_step_view',
        wizardStep: 1,
      }),
    }))
    expect(logEvent).toHaveBeenNthCalledWith(2, expect.objectContaining({
      message: 'workspace_wizard_step_next',
      details: expect.objectContaining({
        event: 'workspace_wizard_step_next',
        fromStep: 1,
        toStep: 2,
      }),
    }))
    expect(logEvent).toHaveBeenNthCalledWith(3, expect.objectContaining({
      message: 'workspace_wizard_step_back',
      details: expect.objectContaining({
        event: 'workspace_wizard_step_back',
        fromStep: 2,
        toStep: 1,
      }),
    }))
  })
})
