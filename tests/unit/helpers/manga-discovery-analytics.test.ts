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
})
