import { describe, expect, it } from 'vitest'
import { buildAssistantProjectContextSnapshot } from '@/lib/project-agent/presentation'
import type { ProjectContextSnapshot } from '@/lib/project-context/types'

describe('project agent presentation', () => {
  it('builds assistant project context snapshot from policy config', () => {
    const snapshot = buildAssistantProjectContextSnapshot({
      projectId: 'project-1',
      projectName: 'a',
      episodeId: 'episode-1',
      episodeName: '剧集 1',
      currentStage: 'config',
      selectedScopeRef: null,
      latestArtifacts: [],
      activePlanRuns: [],
      activeOperationTasks: [],
      recentOperationResults: [],
      policy: {
        projectId: 'project-1',
        episodeId: 'episode-1',
        videoRatio: '9:16',
        artStyle: 'realistic',
        analysisModel: 'google::gemini-3.1-flash-lite-preview',
        overrides: {},
      },
    } satisfies ProjectContextSnapshot)

    expect(snapshot.config).toEqual({
      analysisModel: 'google::gemini-3.1-flash-lite-preview',
      artStyle: 'realistic',
      videoRatio: '9:16',
    })
    expect('workflow' in snapshot).toBe(false)
  })

  it('does not pass workflow snapshot into assistant context', () => {
    const snapshot = buildAssistantProjectContextSnapshot({
      projectId: 'project-1',
      projectName: 'a',
      episodeId: 'episode-1',
      episodeName: '剧集 1',
      currentStage: 'storyboard',
      selectedScopeRef: 'clip:clip-1',
      latestArtifacts: [],
      activePlanRuns: [],
      activeOperationTasks: [],
      recentOperationResults: [
        {
          operationId: 'generate_project_music',
          taskId: 'task-1',
          taskType: 'music_generate',
          status: 'completed',
          targetType: 'Project',
          targetId: 'project-1',
          submittedAt: '2026-01-01T00:00:00.000Z',
          completedAt: '2026-01-01T00:01:00.000Z',
          media: {
            mediaType: 'music',
            mediaId: 'media-1',
            url: 'https://audio.example/music.mp3',
          },
        },
      ],
      policy: {
        projectId: 'project-1',
        episodeId: 'episode-1',
        videoRatio: '9:16',
        artStyle: 'realistic',
        analysisModel: 'google::gemini-3.1-flash-lite-preview',
        overrides: {},
      },
      episodeDetail: {
        episode: {
          novelText: 'text',
          clipCount: 2,
          screenplayClipCount: 2,
          storyboardCount: 1,
          panelCount: 3,
          voiceLineCount: 1,
        },
        clips: [
          {
            clipId: 'clip-1',
            summary: 'summary',
            screenplayReady: true,
            storyboardReady: true,
            panelCount: 3,
          },
        ],
        panels: [
          {
            panelId: 'panel-1',
            clipId: 'clip-1',
            storyboardId: 'storyboard-1',
            panelIndex: 0,
            description: 'panel',
            imagePrompt: null,
            imageUrl: null,
            imageMediaId: null,
            candidateImages: null,
            videoPrompt: null,
            videoUrl: null,
            videoMediaId: null,
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        approvals: [],
      },
    } satisfies ProjectContextSnapshot)

    expect('workflow' in snapshot).toBe(false)
    expect(snapshot.recentOperationResults[0]?.media?.url).toBe('https://audio.example/music.mp3')
  })

})
