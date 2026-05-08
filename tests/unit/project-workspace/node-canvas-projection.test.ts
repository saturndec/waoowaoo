import { describe, expect, it } from 'vitest'
import type { ProjectClip, ProjectPanel, ProjectShot, ProjectStoryboard } from '@/types/project'
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

describe('workspace node canvas projection', () => {
  it('shows only the story input node when the episode has no story data', () => {
    const projection = buildWorkspaceNodeCanvasProjection({
      episodeId: 'episode-1',
      storyText: '',
      clips: [],
      storyboards: [],
      savedLayouts: [],
      translate: t,
    })

    expect(projection.nodes.map((node) => node.id)).toEqual(['story:episode-1'])
    expect(projection.edges).toEqual([])
    expect(projection.nodes[0].data.action).toBeUndefined()
  })

  it('projects real story, clips, shots, image nodes, video nodes, and final timeline without mock data', () => {
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
            }),
          ],
        }),
      ],
      savedLayouts: [],
      translate: t,
    })

    expect(projection.nodes.map((node) => node.id)).toEqual([
      'story:episode-1',
      'analysis:episode-1',
      'clip:clip-1',
      'clip:clip-2',
      'shot:panel-1',
      'shot:panel-2',
      'image:panel-1',
      'video:panel-2',
      'final:episode-1',
    ])
    expect(projection.edges.map((edge) => `${edge.source}->${edge.target}`)).toContain('story:episode-1->analysis:episode-1')
    expect(projection.edges.map((edge) => `${edge.source}->${edge.target}`)).toContain('clip:clip-1->shot:panel-1')
    expect(projection.edges.map((edge) => `${edge.source}->${edge.target}`)).toContain('video:panel-2->final:episode-1')

    const shotNode = projection.nodes.find((node) => node.id === 'shot:panel-1')
    const imageNode = projection.nodes.find((node) => node.id === 'image:panel-1')
    expect(shotNode?.data.action).toEqual({ type: 'generate_image', panelId: 'panel-1' })
    expect(imageNode?.data.action).toEqual({ type: 'generate_image', panelId: 'panel-1' })
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

    const imageNode = projection.nodes.find((node) => node.id === 'image:panel-rich')
    expect(imageNode?.data.imageDetails).toMatchObject({
      imagePrompt: 'rich image prompt',
      candidateImages: ['https://example.com/a.png', 'PENDING:1'],
      imageHistory: 'image history json',
      sketchImageUrl: 'https://example.com/sketch.png',
      previousImageUrl: 'https://example.com/previous.png',
      errorMessage: 'image failed',
    })

    const videoNode = projection.nodes.find((node) => node.id === 'video:panel-rich')
    expect(videoNode?.data.videoDetails).toMatchObject({
      videoPrompt: 'rich video prompt',
      firstLastFramePrompt: 'first last prompt',
      videoGenerationMode: 'firstlastframe',
      videoUrl: 'https://example.com/video.mp4',
      videoModel: 'video-model',
      linkedToNextPanel: true,
      errorMessage: 'video failed',
    })
    expect(videoNode?.data.videoDetails).not.toHaveProperty('lipSyncVideoUrl')
    expect(videoNode?.data.videoDetails).not.toHaveProperty('lipSyncErrorMessage')
    expect(videoNode?.data.videoDetails?.lastVideoGenerationOptions).toEqual([
      { kind: 'text', speaker: 'duration', text: '5' },
      { kind: 'text', speaker: 'enhance', text: 'true' },
    ])

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
            transition: 'hard cut',
          },
          {
            shotNumber: 2,
            durationSec: 30,
            visualAction: 'A red machine eye opens.',
            charactersAndScene: 'Pilot / AI Chamber',
            camera: 'slow push in',
            videoPrompt: 'A red machine eye opens in a chamber.',
            sound: 'sub bass pulse',
            transition: 'hard cut',
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
            description: 'A sterile white docking bay with red warning light.',
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
      'story:episode-1',
      'edit-script:edit-1',
      'edit-asset:req-character',
      'edit-asset:req-location',
    ])
    const editNode = projection.nodes.find((node) => node.id === 'edit-script:edit-1')
    expect(editNode?.data.kind).toBe('editScript')
    expect(editNode?.data.action).toEqual({ type: 'generate_edit_assets', editScriptId: 'edit-1' })
    expect(editNode?.data.editScriptDetails?.shots).toHaveLength(2)

    const assetNode = projection.nodes.find((node) => node.id === 'edit-asset:req-location')
    expect(assetNode?.data.kind).toBe('editRequiredAsset')
    expect(assetNode?.data.previewImageUrl).toBe('https://example.com/location.png')
    expect(assetNode?.data.editAssetDetails).toMatchObject({
      kind: 'location',
      targetId: 'location-1',
      shotNumbers: [1],
    })
  })
})
