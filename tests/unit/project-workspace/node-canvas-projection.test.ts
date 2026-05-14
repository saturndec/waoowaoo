import { describe, expect, it } from 'vitest'
import type { ProjectClip, ProjectEditScript, ProjectPanel, ProjectShot, ProjectStoryboard } from '@/types/project'
import {
  buildWorkspaceNodeCanvasProjection,
} from '@/features/project-workspace/canvas/hooks/useWorkspaceNodeCanvasProjection'

function t(key: string, values?: Record<string, string | number>): string {
  if (!values) return key
  return `${key}:${JSON.stringify(values)}`
}

function createClip(id: string, content: string): ProjectClip {
  return {
    id,
    summary: `${id} summary`,
    location: null,
    characters: null,
    props: null,
    content,
    screenplay: null,
  }
}

function createShot(id: string, shotId: string): ProjectShot {
  return {
    id,
    shotId,
    srtStart: 1,
    srtEnd: 3,
    srtDuration: 2,
    sequence: 'prompt sequence',
    locations: 'prompt location',
    characters: 'prompt character',
    plot: 'prompt plot',
    pov: 'prompt pov',
    imagePrompt: 'prompt image text',
    scale: 'medium',
    module: 'module-a',
    focus: 'robot light',
    zhSummarize: 'prompt summary',
    imageUrl: null,
    media: null,
  }
}

function createPanel(input: Partial<ProjectPanel> & Pick<ProjectPanel, 'id' | 'panelIndex'>): ProjectPanel {
  return {
    id: input.id,
    storyboardId: input.storyboardId ?? 'storyboard-1',
    panelIndex: input.panelIndex,
    panelNumber: input.panelNumber ?? input.panelIndex + 1,
    shotType: input.shotType ?? null,
    cameraMove: input.cameraMove ?? null,
    description: input.description ?? null,
    location: input.location ?? null,
    characters: input.characters ?? null,
    props: input.props ?? null,
    srtSegment: input.srtSegment ?? null,
    srtStart: input.srtStart ?? null,
    srtEnd: input.srtEnd ?? null,
    duration: input.duration ?? null,
    imagePrompt: input.imagePrompt ?? null,
    imageUrl: input.imageUrl ?? null,
    candidateImages: input.candidateImages ?? null,
    media: input.media ?? null,
    imageHistory: input.imageHistory ?? null,
    videoPrompt: input.videoPrompt ?? null,
    firstLastFramePrompt: input.firstLastFramePrompt ?? null,
    videoUrl: input.videoUrl ?? null,
    videoModel: input.videoModel ?? null,
    videoErrorCode: input.videoErrorCode ?? null,
    videoErrorMessage: input.videoErrorMessage ?? null,
    videoGenerationMode: input.videoGenerationMode ?? null,
    lastVideoGenerationOptions: input.lastVideoGenerationOptions ?? null,
    videoMedia: input.videoMedia ?? null,
    lipSyncVideoUrl: input.lipSyncVideoUrl ?? null,
    lipSyncVideoMedia: input.lipSyncVideoMedia ?? null,
    lipSyncErrorCode: input.lipSyncErrorCode ?? null,
    lipSyncErrorMessage: input.lipSyncErrorMessage ?? null,
    linkedToNextPanel: input.linkedToNextPanel ?? null,
    sketchImageUrl: input.sketchImageUrl ?? null,
    sketchImageMedia: input.sketchImageMedia ?? null,
    previousImageUrl: input.previousImageUrl ?? null,
    previousImageMedia: input.previousImageMedia ?? null,
    photographyRules: input.photographyRules ?? null,
    actingNotes: input.actingNotes ?? null,
    imageTaskRunning: input.imageTaskRunning ?? false,
    videoTaskRunning: input.videoTaskRunning ?? false,
    imageErrorMessage: input.imageErrorMessage ?? null,
  }
}

function createStoryboard(input: {
  readonly id: string
  readonly clipId: string
  readonly panels: ProjectPanel[]
}): ProjectStoryboard {
  return {
    id: input.id,
    episodeId: 'episode-1',
    clipId: input.clipId,
    storyboardTextJson: null,
    panelCount: input.panels.length,
    storyboardImageUrl: null,
    candidateImages: null,
    lastError: null,
    photographyPlan: null,
    panels: input.panels,
  }
}

function createSingleVideoEditScript(input?: Partial<ProjectEditScript>): ProjectEditScript {
  return {
    id: input?.id ?? 'edit-video',
    projectId: input?.projectId ?? 'project-1',
    episodeId: input?.episodeId ?? 'episode-1',
    userPrompt: input?.userPrompt ?? 'single video',
    title: input?.title ?? 'Single Video',
    logline: input?.logline ?? null,
    durationSec: input?.durationSec ?? 2,
    shotCount: input?.shotCount ?? 1,
    status: input?.status ?? 'ready',
    shots: input?.shots ?? [
      {
        shotNumber: 1,
        durationSec: 2,
        visualAction: 'A camera watches the room.',
        charactersAndScene: 'Empty room',
        camera: 'locked wide shot',
        videoPrompt: 'A quiet room.',
        sound: 'low room tone',
      },
    ],
    videoBlocks: input?.videoBlocks ?? [
      {
        kind: 'single',
        shotNumbers: [1],
        reason: 'One isolated beat.',
        prompt: 'Edit-first single video prompt.',
      },
    ],
    requirements: input?.requirements ?? [],
  }
}

describe('workspace node canvas projection', () => {
  it('keeps the canvas empty when the episode has no generated data', () => {
    const projection = buildWorkspaceNodeCanvasProjection({
      episodeId: 'episode-1',
      storyText: '',
      clips: [],
      storyboards: [],
      savedLayouts: [],
      translate: t,
    })

    expect(projection.nodes.map((node) => node.id)).toEqual([])
    expect(projection.edges).toEqual([])
  })

  it('projects real story, clips, and shots without old video fallback nodes', () => {
    const projection = buildWorkspaceNodeCanvasProjection({
      episodeId: 'episode-1',
      storyText: 'A real story',
      clips: [
        createClip('clip-1', 'first clip content'),
        createClip('clip-2', 'second clip content'),
      ],
      storyboards: [
        createStoryboard({
          id: 'storyboard-1',
          clipId: 'clip-1',
          panels: [
            createPanel({
              id: 'panel-2',
              panelIndex: 1,
              description: 'second panel',
              videoUrl: 'https://example.com/panel-2.mp4',
            }),
            createPanel({
              id: 'panel-1',
              panelIndex: 0,
              description: 'first panel',
              imageUrl: 'https://example.com/panel-1.png',
              media: {
                id: 'media-panel-1',
                publicId: 'media-panel-1',
                url: 'https://example.com/panel-1.png',
                mimeType: 'image/png',
                sizeBytes: null,
                width: 1080,
                height: 1920,
                durationMs: null,
              },
            }),
          ],
        }),
      ],
      savedLayouts: [],
      defaultVideoModel: 'project-video-model',
      translate: t,
    })

    expect(projection.nodes.map((node) => node.id)).toEqual([
      'analysis:episode-1',
      'clip:clip-1',
      'clip:clip-2',
      'shot:panel-1',
      'shot:panel-2',
    ])
    expect(projection.edges.map((edge) => `${edge.source}->${edge.target}`)).toContain('analysis:episode-1->clip:clip-1')
    expect(projection.edges.map((edge) => `${edge.source}->${edge.target}`)).toContain('clip:clip-1->shot:panel-1')

    const shotNode = projection.nodes.find((node) => node.id === 'shot:panel-1')
    expect(shotNode?.data.action).toEqual({ type: 'generate_image', panelId: 'panel-1' })
    expect(shotNode?.data.previewImageUrl).toBe('https://example.com/panel-1.png')
    expect(shotNode?.data.previewAspectRatio).toBeCloseTo(1080 / 1920)
    expect(shotNode?.data.previewDisplayHeight).toBeGreaterThan(118)
    expect(projection.nodes.some((node) => node.id === 'image:panel-1')).toBe(false)
    expect(projection.nodes.some((node) => node.data.kind === 'videoClip')).toBe(false)
    expect(projection.nodes.some((node) => node.data.kind === 'finalTimeline')).toBe(false)
  })

  it('marks final timeline as AI editing while final render task is running', () => {
    const projection = buildWorkspaceNodeCanvasProjection({
      episodeId: 'episode-1',
      storyText: 'A real story',
      clips: [createClip('clip-1', 'clip content')],
      storyboards: [
        createStoryboard({
          id: 'storyboard-1',
          clipId: 'clip-1',
          panels: [
            createPanel({
              id: 'panel-1',
              panelIndex: 0,
              imageUrl: 'https://example.com/panel-1.png',
              videoUrl: 'https://example.com/panel-1.mp4',
            }),
          ],
        }),
      ],
      editScript: createSingleVideoEditScript(),
      savedLayouts: [],
      finalRenderPhase: 'processing',
      translate: t,
    })

    const finalNode = projection.nodes.find((node) => node.id === 'final:episode-1')
    expect(finalNode?.data.statusLabel).toBe('status.aiEditing')
    expect(finalNode?.data.isRunning).toBe(true)
    expect(finalNode?.data.actionLabel).toBe('actions.aiEditing')
    expect(finalNode?.data.actionDisabled).toBe(true)
  })

  it('shows a running edit table placeholder while the assistant is generating it', () => {
    const projection = buildWorkspaceNodeCanvasProjection({
      episodeId: 'episode-1',
      storyText: 'A real story',
      clips: [],
      storyboards: [],
      editScriptPending: true,
      savedLayouts: [],
      translate: t,
    })

    expect(projection.nodes.map((node) => node.id)).toEqual([
      'analysis:episode-1',
      'edit-script:pending:episode-1',
    ])

    const pendingNode = projection.nodes.find((node) => node.id === 'edit-script:pending:episode-1')
    expect(pendingNode?.data.kind).toBe('editScript')
    expect(pendingNode?.data.statusLabel).toBe('status.processing')
    expect(pendingNode?.data.isRunning).toBe(true)
    expect(pendingNode?.data.title).toBe('nodes.editScript.pendingTitle')
    expect(projection.edges.map((edge) => `${edge.source}->${edge.target}`)).toContain(
      'analysis:episode-1->edit-script:pending:episode-1',
    )
  })

  it('keeps a persisted generating edit table visible after refresh', () => {
    const projection = buildWorkspaceNodeCanvasProjection({
      episodeId: 'episode-1',
      storyText: '',
      clips: [],
      storyboards: [],
      savedLayouts: [],
      translate: t,
      editScript: {
        id: 'edit-generating',
        projectId: 'project-1',
        episodeId: 'episode-1',
        userPrompt: '做一个科幻短片',
        title: 'Generating edit table',
        logline: null,
        durationSec: 60,
        shotCount: 0,
        status: 'generating',
        shots: [],
        videoBlocks: [],
        requirements: [],
      },
    })

    const node = projection.nodes.find((item) => item.id === 'edit-script:edit-generating')

    expect(node?.data.kind).toBe('editScript')
    expect(node?.data.title).toBe('nodes.editScript.pendingTitle')
    expect(node?.data.body).toBe('nodes.editScript.pendingBody')
    expect(node?.data.statusLabel).toBe('status.processing')
    expect(node?.data.isRunning).toBe(true)
    expect(node?.data.actionLabel).toBeUndefined()
    expect(node?.data.editScriptDetails).toBeUndefined()
  })

  it('shows final render failures on the final timeline node', () => {
    const projection = buildWorkspaceNodeCanvasProjection({
      episodeId: 'episode-1',
      storyText: 'A real story',
      clips: [createClip('clip-1', 'clip content')],
      storyboards: [
        createStoryboard({
          id: 'storyboard-1',
          clipId: 'clip-1',
          panels: [
            createPanel({
              id: 'panel-1',
              panelIndex: 0,
              imageUrl: 'https://example.com/panel-1.png',
              videoUrl: 'https://example.com/panel-1.mp4',
            }),
          ],
        }),
      ],
      editScript: createSingleVideoEditScript(),
      savedLayouts: [],
      finalRenderPhase: 'failed',
      finalRenderErrorMessage: 'Google music network failed',
      translate: t,
    })

    const finalNode = projection.nodes.find((node) => node.id === 'final:episode-1')
    expect(finalNode?.data.statusLabel).toBe('status.failed')
    expect(finalNode?.data.meta).toBe('Google music network failed')
    expect(finalNode?.data.actionLabel).toBe('actions.renderFinalVideo')
    expect(finalNode?.data.actionDisabled).toBe(false)
  })

  it('shows completed final render output on the final timeline node', () => {
    const projection = buildWorkspaceNodeCanvasProjection({
      episodeId: 'episode-1',
      storyText: 'A real story',
      clips: [createClip('clip-1', 'clip content')],
      storyboards: [
        createStoryboard({
          id: 'storyboard-1',
          clipId: 'clip-1',
          panels: [
            createPanel({
              id: 'panel-1',
              panelIndex: 0,
              imageUrl: 'https://example.com/panel-1.png',
              videoUrl: 'https://example.com/panel-1.mp4',
            }),
          ],
        }),
      ],
      editScript: createSingleVideoEditScript(),
      finalVideo: {
        id: 'editor-1',
        episodeId: 'episode-1',
        renderStatus: 'completed',
        renderTaskId: 'task-1',
        outputUrl: '/m/final-video.mp4',
        updatedAt: '2026-05-11T04:50:59.342Z',
      },
      savedLayouts: [],
      translate: t,
    })

    const finalNode = projection.nodes.find((node) => node.id === 'final:episode-1')
    expect(finalNode?.data.statusLabel).toBe('status.finalReady')
    expect(finalNode?.data.meta).toBe('nodes.final.outputReady')
    expect(finalNode?.data.finalDetails?.outputUrl).toBe('/m/final-video.mp4')
    expect(finalNode?.data.finalDetails?.renderStatus).toBe('completed')
  })

  it('uses saved layout only for node position and preserves business ordering', () => {
    const projection = buildWorkspaceNodeCanvasProjection({
      episodeId: 'episode-1',
      storyText: 'A real story',
      clips: [createClip('clip-1', 'clip content')],
      storyboards: [
        createStoryboard({
          id: 'storyboard-1',
          clipId: 'clip-1',
          panels: [
            createPanel({ id: 'panel-late', panelIndex: 9, panelNumber: 9 }),
            createPanel({ id: 'panel-early', panelIndex: 0, panelNumber: 1 }),
          ],
        }),
      ],
      savedLayouts: [
        {
          nodeKey: 'shot:panel-early',
          x: 999,
          y: 888,
          width: 320,
          height: 214,
          zIndex: 0,
          locked: false,
          collapsed: false,
        },
      ],
      translate: t,
    })

    const shotNodes = projection.nodes.filter((node) => node.data.kind === 'shot')
    expect(shotNodes.map((node) => node.id)).toEqual(['shot:panel-early', 'shot:panel-late'])
    expect(shotNodes[0].position).toEqual({ x: 999, y: 888 })
  })

  it('places panel-derived nodes in a five-column default grid', () => {
    const panels = Array.from({ length: 6 }, (_item, index) => createPanel({
      id: `panel-${index + 1}`,
      panelIndex: index,
      imageUrl: `https://example.com/panel-${index + 1}.png`,
    }))

    const projection = buildWorkspaceNodeCanvasProjection({
      episodeId: 'episode-1',
      storyText: 'A real story',
      clips: [createClip('clip-1', 'clip content')],
      storyboards: [
        createStoryboard({
          id: 'storyboard-1',
          clipId: 'clip-1',
          panels,
        }),
      ],
      savedLayouts: [],
      translate: t,
    })

    const shotNodes = projection.nodes.filter((node) => node.data.kind === 'shot')
    expect(shotNodes).toHaveLength(6)
    expect(projection.nodes.filter((node) => node.data.kind === 'imageAsset')).toHaveLength(0)
    expect(shotNodes[1].position.x).toBeGreaterThan(shotNodes[0].position.x)
    expect(shotNodes[1].position.y).toBe(shotNodes[0].position.y)
    expect(shotNodes[5].position.x).toBe(shotNodes[0].position.x)
    expect(shotNodes[5].position.y).toBeGreaterThan(shotNodes[0].position.y)
  })

  it('projects full non-voice business details into typed node data', () => {
    const screenplay = JSON.stringify({
      scenes: [
        {
          scene_number: 1,
          heading: { int_ext: 'EXT', location: '城市街道_雨夜', time: '夜晚' },
          description: '雨夜街道',
          characters: ['小机器人', '小女孩'],
          content: [
            { type: 'action', text: '小机器人举起发光路灯。' },
            { type: 'dialogue', character: '小女孩', text: '我们到家了吗？' },
          ],
        },
      ],
    })
    const clip: ProjectClip = {
      ...createClip('clip-rich', 'original clip text'),
      summary: 'rich summary',
      location: '["城市街道_雨夜"]',
      characters: JSON.stringify([{ name: '小机器人', appearance: '初始形象' }]),
      props: '["发光路灯"]',
      screenplay,
      start: 2,
      end: 8,
      duration: 6,
      shotCount: 5,
    }
    const panel = createPanel({
      id: 'panel-rich',
      panelIndex: 0,
      shotType: '全景',
      cameraMove: '缓慢推进',
      description: 'rich panel description',
      location: '城市街道_雨夜',
      characters: JSON.stringify([{ name: '小女孩', appearance: '初始形象' }]),
      props: '["发光路灯"]',
      srtSegment: '小女孩说话',
      srtStart: 2,
      srtEnd: 4,
      duration: 2,
      imagePrompt: 'rich image prompt',
      videoPrompt: 'rich video prompt',
      candidateImages: JSON.stringify(['https://example.com/a.png', 'PENDING:1']),
      imageHistory: 'image history json',
      sketchImageUrl: 'https://example.com/sketch.png',
      previousImageUrl: 'https://example.com/previous.png',
      firstLastFramePrompt: 'first last prompt',
      videoUrl: 'https://example.com/video.mp4',
      videoGenerationMode: 'firstlastframe',
      lastVideoGenerationOptions: { duration: 5, enhance: true },
      lipSyncVideoUrl: 'https://example.com/lip.mp4',
      videoModel: 'video-model',
      linkedToNextPanel: true,
      photographyRules: 'photo rules',
      actingNotes: 'acting notes',
      imageErrorMessage: 'image failed',
      videoErrorMessage: 'video failed',
      lipSyncErrorMessage: 'lip failed',
    })

    const projection = buildWorkspaceNodeCanvasProjection({
      episodeId: 'episode-1',
      storyText: 'story',
      clips: [clip],
      storyboards: [{
        ...createStoryboard({ id: 'storyboard-rich', clipId: 'clip-rich', panels: [panel] }),
        storyboardTextJson: 'storyboard json',
        photographyPlan: 'photography plan',
        lastError: 'storyboard failed',
      }],
      shots: [createShot('shot-rich', '01')],
      editScript: createSingleVideoEditScript({
        id: 'edit-rich',
        title: 'Rich Detail Script',
        videoBlocks: [
          {
            kind: 'single',
            shotNumbers: [1],
            reason: 'The shot should remain isolated.',
            prompt: 'Edit-first rich video prompt.',
          },
        ],
      }),
      savedLayouts: [],
      translate: t,
    })

    const clipNode = projection.nodes.find((node) => node.id === 'clip:clip-rich')
    expect(clipNode?.data.body).toContain('"scenes"')
    expect(clipNode?.data.scriptDetails?.screenplayText).toBe(screenplay)
    expect(clipNode?.data.scriptDetails?.originalText).toBe('original clip text')
    expect(clipNode?.data.scriptDetails?.characters).toEqual([{ name: '小机器人', appearance: '初始形象' }])
    expect(clipNode?.data.scriptDetails?.locations).toEqual(['城市街道_雨夜'])
    expect(clipNode?.data.scriptDetails?.props).toEqual(['发光路灯'])
    expect(clipNode?.data.scriptDetails?.scenes[0]?.lines).toEqual([
      { kind: 'action', speaker: null, text: '小机器人举起发光路灯。' },
      { kind: 'dialogue', speaker: '小女孩', text: '我们到家了吗？' },
    ])

    const shotNode = projection.nodes.find((node) => node.id === 'shot:panel-rich')
    expect(shotNode?.data.shotDetails).toMatchObject({
      shotType: '全景',
      cameraMove: '缓慢推进',
      location: '城市街道_雨夜',
      srtSegment: '小女孩说话',
      imagePrompt: 'rich image prompt',
      videoPrompt: 'rich video prompt',
      photographyRules: 'photo rules',
      actingNotes: 'acting notes',
      storyboardTextJson: 'storyboard json',
      photographyPlan: 'photography plan',
      errorMessage: 'image failed',
    })
    expect(shotNode?.data.shotDetails?.characters).toEqual([{ name: '小女孩', appearance: '初始形象' }])
    expect(shotNode?.data.shotDetails?.promptShot?.plot).toBe('prompt plot')

    expect(shotNode?.data.previewImageUrl).toBe('https://example.com/a.png')
    expect(shotNode?.data.imageDetails).toMatchObject({
      imagePrompt: 'rich image prompt',
      candidateImages: ['https://example.com/a.png', 'PENDING:1'],
      imageHistory: 'image history json',
      sketchImageUrl: 'https://example.com/sketch.png',
      previousImageUrl: 'https://example.com/previous.png',
      errorMessage: 'image failed',
    })

    const videoPlanNode = projection.nodes.find((node) => node.id === 'video-plan:edit-rich:1')
    expect(videoPlanNode?.data.kind).toBe('videoPlan')
    expect(videoPlanNode?.data.videoPlanDetails).toMatchObject({
      kind: 'single',
      shotNumbers: [1],
      prompt: 'Edit-first rich video prompt.',
      outputUrl: 'https://example.com/video.mp4',
    })
    expect(projection.nodes.some((node) => node.data.kind === 'videoClip')).toBe(false)

    const finalNode = projection.nodes.find((node) => node.id === 'final:episode-1')
    expect(finalNode?.data.finalDetails).toMatchObject({
      totalShots: 1,
      totalImages: 1,
      totalVideos: 1,
      totalDuration: 2,
    })
    expect(projection.nodes.some((node) => node.data.kind === 'finalTimeline')).toBe(true)
    expect(projection.nodes.some((node) => String(node.id).startsWith('voice:'))).toBe(false)
  })

  it('projects edit-first table and required asset nodes on the canvas', () => {
    const projection = buildWorkspaceNodeCanvasProjection({
      episodeId: 'episode-1',
      storyText: '',
      clips: [],
      storyboards: [],
      savedLayouts: [],
      translate: t,
      editScript: {
        id: 'edit-1',
        projectId: 'project-1',
        episodeId: 'episode-1',
        userPrompt: 'one minute sci-fi',
        title: 'Orbital Silence',
        logline: 'A pilot meets a machine intelligence.',
        durationSec: 60,
        shotCount: 2,
        status: 'ready',
        shots: [
          {
            shotNumber: 1,
            durationSec: 30,
            visualAction: 'Pilot crosses the docking bay.',
            charactersAndScene: 'Pilot / Docking Bay',
            camera: 'locked wide shot',
            videoPrompt: 'Pilot crosses a sterile docking bay.',
            sound: 'air hum',
          },
          {
            shotNumber: 2,
            durationSec: 30,
            visualAction: 'A red machine eye opens.',
            charactersAndScene: 'Pilot / AI Chamber',
            camera: 'slow push in',
            videoPrompt: 'A red machine eye opens in a chamber.',
            sound: 'sub bass pulse',
          },
        ],
        videoBlocks: [
          {
            kind: 'group',
            shotNumbers: [1, 2],
            gridMode: '2x2',
            reason: 'Shared corridor motion should be generated as one segment.',
            prompt: 'Edit-first continuous corridor prompt.',
          },
        ],
        requirements: [
          {
            id: 'req-character',
            kind: 'character',
            name: 'Pilot',
            description: 'A quiet astronaut in a minimal suit.',
            shotNumbers: [1, 2],
            status: 'pending',
            targetId: null,
            errorMessage: null,
          },
          {
            id: 'req-location',
            kind: 'location',
            name: 'Docking Bay',
            description: 'A sterile white docking bay with red warning light.\nPossible positions:\n- wide entrance angle\n- central axis view\n- distant observation point near the airlock',
            shotNumbers: [1],
            status: 'completed',
            targetId: 'location-1',
            errorMessage: null,
            previewImageUrl: 'https://example.com/location.png',
          },
        ],
      },
    })

    expect(projection.nodes.map((node) => node.id)).toEqual([
      'edit-script:edit-1',
      'edit-asset:req-character',
      'edit-asset:req-location',
      'video-plan:edit-1:1',
      'final:episode-1',
    ])
    const editNode = projection.nodes.find((node) => node.id === 'edit-script:edit-1')
    expect(editNode?.data.kind).toBe('editScript')
    expect(editNode?.data.action).toEqual({ type: 'generate_edit_assets', editScriptId: 'edit-1' })
    expect(editNode?.data.editScriptDetails?.shots).toHaveLength(2)
    expect(editNode?.data.width).toBeGreaterThan(1000)
    expect(editNode?.data.height).toBeGreaterThan(400)

    const videoPlanNode = projection.nodes.find((node) => node.id === 'video-plan:edit-1:1')
    expect(videoPlanNode?.data.kind).toBe('videoPlan')
    expect(videoPlanNode?.data.action).toBeUndefined()
    expect(videoPlanNode?.data.videoPlanDetails?.prompt).toBe('Edit-first continuous corridor prompt.')
    expect(videoPlanNode?.data.videoPlanDetails?.sourceImages).toEqual([
      { shotNumber: 1, imageUrl: null, aspectRatio: null },
      { shotNumber: 2, imageUrl: null, aspectRatio: null },
    ])
    expect(videoPlanNode?.data.videoPlanDetails?.assetReferences).toEqual([
      {
        id: 'req-location',
        name: 'Docking Bay',
        kind: 'location',
        imageUrl: 'https://example.com/location.png',
        shotNumbers: [1],
      },
    ])

    const pendingAssetNode = projection.nodes.find((node) => node.id === 'edit-asset:req-character')
    expect(pendingAssetNode?.data.action).toEqual({
      type: 'generate_edit_asset',
      editScriptId: 'edit-1',
      requirementId: 'req-character',
    })

    const assetNode = projection.nodes.find((node) => node.id === 'edit-asset:req-location')
    expect(assetNode?.data.kind).toBe('editRequiredAsset')
    expect(assetNode?.data.width).toBeGreaterThan(300)
    expect(assetNode?.data.height).toBe(520)
    expect(assetNode?.position.y).toBe(pendingAssetNode?.position.y)
    expect(assetNode?.position.x ?? 0).toBeGreaterThan(pendingAssetNode?.position.x ?? 0)
    expect(assetNode?.position.y ?? 0).toBeGreaterThanOrEqual((editNode?.position.y ?? 0) + (editNode?.data.height ?? 0) + 240)
    expect(assetNode?.data.action).toBeUndefined()
    expect(assetNode?.data.previewImageUrl).toBe('https://example.com/location.png')
    expect(assetNode?.data.editAssetDetails).toMatchObject({
      kind: 'location',
      targetId: 'location-1',
      shotNumbers: [1],
    })
  })

  it('projects video arrangement nodes only after storyboard images exist', () => {
    const projection = buildWorkspaceNodeCanvasProjection({
      episodeId: 'episode-1',
      storyText: '',
      clips: [],
      storyboards: [
        createStoryboard({
          id: 'storyboard-1',
          clipId: 'clip-1',
          panels: [
            createPanel({
              id: 'panel-1',
              panelIndex: 0,
              panelNumber: 1,
              imageUrl: 'https://example.com/shot-1.png',
              media: {
                id: 'media-shot-1',
                publicId: 'media-shot-1',
                url: 'https://example.com/shot-1.png',
                mimeType: 'image/png',
                sizeBytes: null,
                width: 1920,
                height: 1080,
                durationMs: null,
              },
            }),
            createPanel({
              id: 'panel-2',
              panelIndex: 1,
              panelNumber: 2,
              imageUrl: 'https://example.com/shot-2.png',
              media: {
                id: 'media-shot-2',
                publicId: 'media-shot-2',
                url: 'https://example.com/shot-2.png',
                mimeType: 'image/png',
                sizeBytes: null,
                width: 1920,
                height: 1080,
                durationMs: null,
              },
            }),
          ],
        }),
      ],
      savedLayouts: [],
      translate: t,
      defaultSequenceVideoModel: 'ark::sequence-project-model',
      editScript: {
        id: 'edit-2',
        projectId: 'project-1',
        episodeId: 'episode-1',
        userPrompt: 'short sci-fi',
        title: 'Orbital Silence',
        logline: 'A pilot meets a machine intelligence.',
        durationSec: 9,
        shotCount: 2,
        status: 'ready',
        shots: [
          {
            shotNumber: 1,
            durationSec: 5,
            visualAction: 'Pilot crosses the docking bay.',
            charactersAndScene: 'Pilot / Docking Bay',
            camera: 'locked wide shot',
            videoPrompt: 'Pilot crosses a sterile docking bay.',
            sound: 'air hum',
          },
          {
            shotNumber: 2,
            durationSec: 4,
            visualAction: 'A red machine eye opens.',
            charactersAndScene: 'Pilot / AI Chamber',
            camera: 'slow push in',
            videoPrompt: 'A red machine eye opens in a chamber.',
            sound: 'sub bass pulse',
          },
        ],
        videoBlocks: [
          {
            kind: 'group',
            shotNumbers: [1, 2],
            gridMode: '2x2',
            reason: 'Shared camera movement should be generated as one segment.',
            prompt: 'Edit-first combined prompt.',
          },
        ],
        requirements: [],
      },
      videoGroups: [
        {
          id: 'group-1',
          projectId: 'project-1',
          episodeId: 'episode-1',
          gridMode: '2x2',
          shotNumbers: [1, 2],
          durationSec: 9,
          prompt: 'Combined continuous prompt.',
          status: 'completed',
          taskId: null,
          errorCode: null,
          errorMessage: null,
          referenceImageUrl: null,
          referenceImageMedia: null,
          videoUrl: 'https://example.com/group.mp4',
          videoMedia: null,
        },
      ],
    })

    const videoPlanNode = projection.nodes.find((node) => node.id === 'video-plan:edit-2:1')
    expect(videoPlanNode?.data.kind).toBe('videoPlan')
    expect(videoPlanNode?.data.width).toBe(420)
    expect(videoPlanNode?.data.height).toBe(560)
    expect(videoPlanNode?.data.action).toEqual({
      type: 'generate_video_group',
      videoModel: 'ark::sequence-project-model',
      gridMode: '2x2',
      shotNumbers: [1, 2],
    })
    expect(videoPlanNode?.data.videoPlanDetails).toMatchObject({
      kind: 'group',
      shotNumbers: [1, 2],
      durationSec: 9,
      prompt: 'Edit-first combined prompt.',
      outputUrl: 'https://example.com/group.mp4',
      validationMessage: null,
      sourceImages: [
        { shotNumber: 1, imageUrl: 'https://example.com/shot-1.png', aspectRatio: 1920 / 1080 },
        { shotNumber: 2, imageUrl: 'https://example.com/shot-2.png', aspectRatio: 1920 / 1080 },
      ],
    })
    expect(projection.nodes.some((node) => node.id.startsWith('video:'))).toBe(false)
    expect(projection.nodes.some((node) => node.id.startsWith('video-group:'))).toBe(false)
    expect(projection.edges.some((edge) => edge.id === 'edge:shot-video-plan:video-plan:edit-2:1')).toBe(true)
  })

  it('does not fall back to the default video model when the video segment model is missing', () => {
    const projection = buildWorkspaceNodeCanvasProjection({
      episodeId: 'episode-1',
      storyText: '',
      clips: [],
      storyboards: [
        createStoryboard({
          id: 'storyboard-1',
          clipId: 'clip-1',
          panels: [
            createPanel({
              id: 'panel-1',
              panelIndex: 0,
              panelNumber: 1,
              imageUrl: 'https://example.com/shot-1.png',
            }),
            createPanel({
              id: 'panel-2',
              panelIndex: 1,
              panelNumber: 2,
              imageUrl: 'https://example.com/shot-2.png',
            }),
          ],
        }),
      ],
      savedLayouts: [],
      translate: t,
      defaultVideoModel: 'ark::default-panel-model',
      defaultSequenceVideoModel: null,
      editScript: {
        id: 'edit-3',
        projectId: 'project-1',
        episodeId: 'episode-1',
        userPrompt: 'short sci-fi',
        title: 'Orbital Silence',
        logline: 'A pilot meets a machine intelligence.',
        durationSec: 9,
        shotCount: 2,
        status: 'ready',
        shots: [
          {
            shotNumber: 1,
            durationSec: 5,
            visualAction: 'Pilot crosses the docking bay.',
            charactersAndScene: 'Pilot / Docking Bay',
            camera: 'locked wide shot',
            videoPrompt: 'Pilot crosses a sterile docking bay.',
            sound: 'air hum',
          },
          {
            shotNumber: 2,
            durationSec: 4,
            visualAction: 'A red machine eye opens.',
            charactersAndScene: 'Pilot / AI Chamber',
            camera: 'slow push in',
            videoPrompt: 'A red machine eye opens in a chamber.',
            sound: 'sub bass pulse',
          },
        ],
        videoBlocks: [
          {
            kind: 'group',
            shotNumbers: [1, 2],
            gridMode: '2x2',
            reason: 'Shared camera movement should be generated as one segment.',
            prompt: 'Edit-first combined prompt.',
          },
        ],
        requirements: [],
      },
    })

    const videoPlanNode = projection.nodes.find((node) => node.id === 'video-plan:edit-3:1')
    expect(videoPlanNode?.data.action).toBeUndefined()
    expect(videoPlanNode?.data.statusLabel).toBe('status.failed')
    expect(videoPlanNode?.data.videoPlanDetails?.assetReferenceVideoModel).toBe('')
    expect(videoPlanNode?.data.videoPlanDetails?.errorMessage).toBe('errors.sequenceVideoModelMissing')
  })

  it('projects one-shot video segment blocks without separate video nodes', () => {
    const projection = buildWorkspaceNodeCanvasProjection({
      episodeId: 'episode-1',
      storyText: '',
      clips: [],
      storyboards: [
        createStoryboard({
          id: 'storyboard-1',
          clipId: 'clip-1',
          panels: [
            createPanel({ id: 'panel-1', panelIndex: 0, panelNumber: 1, imageUrl: 'https://example.com/shot-1.png' }),
          ],
        }),
      ],
      savedLayouts: [],
      translate: t,
      defaultVideoModel: 'google::default-panel-model',
      defaultSequenceVideoModel: 'google::veo-test',
      editScript: {
        id: 'edit-single',
        projectId: 'project-1',
        episodeId: 'episode-1',
        userPrompt: 'single beat',
        title: 'Quiet Door',
        logline: null,
        durationSec: 4,
        shotCount: 1,
        status: 'ready',
        shots: [
          {
            shotNumber: 1,
            durationSec: 4,
            visualAction: 'A door opens slowly.',
            charactersAndScene: 'Empty corridor',
            camera: 'locked off',
            videoPrompt: 'A quiet door opens slowly.',
            sound: 'soft hinge',
          },
        ],
        videoBlocks: [
          {
            kind: 'single',
            shotNumbers: [1],
            reason: 'This beat should stay isolated.',
            prompt: 'Edit-first single shot prompt.',
          },
        ],
        requirements: [],
      },
    })

    const videoPlanNode = projection.nodes.find((node) => node.id === 'video-plan:edit-single:1')
    expect(videoPlanNode?.data.kind).toBe('videoPlan')
    expect(videoPlanNode?.data.action).toEqual({
      type: 'generate_video',
      storyboardId: 'storyboard-1',
      panelIndex: 0,
      panelId: 'panel-1',
      videoModel: 'google::veo-test',
    })
    expect(videoPlanNode?.data.videoPlanDetails?.prompt).toBe('Edit-first single shot prompt.')
    expect(projection.nodes.some((node) => node.id.startsWith('video:'))).toBe(false)
  })

  it('offers edit-first storyboard generation after all required assets are ready', () => {
    const projection = buildWorkspaceNodeCanvasProjection({
      episodeId: 'episode-1',
      storyText: '',
      clips: [],
      storyboards: [],
      savedLayouts: [],
      translate: t,
      editScript: {
        id: 'edit-ready',
        projectId: 'project-1',
        episodeId: 'episode-1',
        userPrompt: 'one minute sci-fi',
        title: 'Orbital Silence',
        logline: 'A pilot meets a machine intelligence.',
        durationSec: 60,
        shotCount: 1,
        status: 'ready',
        shots: [
          {
            shotNumber: 1,
            durationSec: 60,
            visualAction: 'Pilot watches the station rotate.',
            charactersAndScene: 'Pilot / Station',
            camera: 'locked symmetrical wide shot',
            videoPrompt: 'A pilot watches a rotating space station.',
            sound: 'low air hum',
          },
        ],
        videoBlocks: [
          {
            kind: 'single',
            shotNumbers: [1],
            reason: 'Standalone station shot.',
            prompt: 'Edit-first station prompt.',
          },
        ],
        requirements: [
          {
            id: 'req-character',
            kind: 'character',
            name: 'Pilot',
            description: 'A quiet astronaut in a minimal suit.',
            shotNumbers: [1],
            status: 'completed',
            targetId: 'character-1',
            errorMessage: null,
          },
        ],
      },
    })

    const editNode = projection.nodes.find((node) => node.id === 'edit-script:edit-ready')
    expect(editNode?.data.action).toEqual({
      type: 'generate_edit_storyboard',
      editScriptId: 'edit-ready',
    })
  })
})
