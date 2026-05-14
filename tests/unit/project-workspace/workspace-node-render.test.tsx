import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { NodeProps } from '@xyflow/react'
import WorkspaceNode from '@/features/project-workspace/canvas/nodes/WorkspaceNode'
import type { WorkspaceCanvasFlowNode, WorkspaceCanvasNodeData } from '@/features/project-workspace/canvas/node-canvas-types'

vi.mock('@xyflow/react', () => ({
  Handle: () => <span data-testid="handle" />,
  Position: { Left: 'left', Right: 'right' },
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (!values) return key
    return `${key}:${JSON.stringify(values)}`
  },
}))

vi.mock('@/components/ui/icons', () => ({
  AppIcon: ({ name }: { readonly name: string }) => <span data-icon={name} />,
}))

vi.mock('@/features/project-workspace/canvas/details/StoryDetail', () => ({
  default: ({
    projectId,
    storyText,
    episodeName,
    variant,
  }: {
    readonly projectId: string
    readonly storyText: string
    readonly episodeName?: string
    readonly variant?: 'panel' | 'node'
  }) => (
    <div data-testid="story-detail" data-variant={variant}>
      {projectId}:{episodeName}:{storyText}
    </div>
  ),
}))

function renderNode(data: WorkspaceCanvasNodeData): string {
  const props = { data } as NodeProps<WorkspaceCanvasFlowNode>
  return renderToStaticMarkup(<WorkspaceNode {...props} />)
}

describe('workspace node rendering', () => {
  it('renders story input controls inline without opening a detail action', () => {
    const html = renderNode({
      kind: 'storyInput',
      projectId: 'project-1',
      episodeName: 'Episode 1',
      layoutNodeType: 'story',
      targetType: 'episode',
      targetId: 'episode-1',
      title: 'Story node',
      eyebrow: 'Story',
      body: 'inline story body',
      meta: '12 chars',
      statusLabel: 'Ready',
      width: 960,
      height: 600,
      nodeId: 'story:episode-1',
    })

    expect(html).toContain('data-testid="story-detail"')
    expect(html).toContain('data-variant="node"')
    expect(html).toContain('project-1:Episode 1:inline story body')
    expect(html).toContain('rounded-[24px]')
    expect(html).toContain('border-slate-200')
    expect(html).not.toContain('nodeFields.openDetails')
  })

  it('renders storage keys through the signed storage display route', () => {
    const html = renderNode({
      kind: 'editRequiredAsset',
      layoutNodeType: 'editRequiredAsset',
      targetType: 'editAssetRequirement',
      targetId: 'req-1',
      title: 'Asset node',
      eyebrow: 'Asset',
      body: 'asset description',
      meta: 'shots 1',
      statusLabel: 'Ready',
      width: 360,
      height: 380,
      previewImageUrl: 'images/character-1.jpg',
      editAssetDetails: {
        kind: 'character',
        description: 'asset description',
        shotNumbers: [1],
        targetId: 'asset-target-id',
        errorMessage: null,
      },
    })

    expect(html).toContain('/api/storage/sign?key=images%2Fcharacter-1.jpg')
    expect(html).toContain('object-contain')
    expect(html).toContain('style="height:240px"')
    expect(html).not.toContain('Asset ID')
    expect(html).not.toContain('asset-target-id')
    expect(html).not.toContain('shots 1')
    expect(html).not.toContain('src="images/character-1.jpg"')
  })

  it('renders script clip summary by default without internal scroll', () => {
    const html = renderNode({
      kind: 'scriptClip',
      layoutNodeType: 'scriptClip',
      targetType: 'clip',
      targetId: 'clip-1',
      title: 'Script node',
      eyebrow: 'Script',
      body: 'screenplay raw',
      meta: 'clip #1',
      statusLabel: 'Ready',
      width: 320,
      height: 360,
      indexLabel: 'C1',
      scriptDetails: {
        originalText: 'original source text',
        screenplayText: 'screenplay raw',
        scenes: [{
          sceneNumber: 1,
          heading: 'EXT · Street · Night',
          description: 'rain street',
          characters: ['Robot'],
          lines: [{ kind: 'dialogue', speaker: 'Girl', text: 'hello' }],
        }],
        characters: [{ name: 'Robot', appearance: 'Default' }],
        locations: ['Street'],
        props: ['Lamp'],
        timeRange: '1s - 3s',
        duration: 2,
        shotCount: 1,
      },
    })

    expect(html).toContain('Robot / Default')
    expect(html).toContain('Street')
    expect(html).toContain('screenplay raw')
    expect(html).toContain('expandDetails')
    expect(html).not.toContain('EXT · Street · Night')
    expect(html).not.toContain('original source text')
    expect(html).not.toContain('hello')
    expect(html).not.toContain('overflow-y-auto')
  })

  it('renders shot, image, video, and final summaries without internal scroll', () => {
    const shotHtml = renderNode({
      kind: 'shot',
      layoutNodeType: 'shot',
      targetType: 'panel',
      targetId: 'panel-1',
      title: 'Shot node',
      eyebrow: 'Shot',
      body: 'shot description',
      meta: 'location',
      statusLabel: 'Ready',
      width: 320,
      height: 380,
      shotDetails: {
        shotType: 'wide',
        cameraMove: 'push in',
        characters: [{ name: 'Girl' }],
        location: 'Street',
        props: ['Lamp'],
        srtSegment: 'dialogue text',
        imagePrompt: 'image prompt',
        videoPrompt: 'video prompt',
        photographyRules: 'photo rules',
        actingNotes: 'acting notes',
        promptShot: {
          plot: 'prompt plot',
        },
      },
    })
    const imageHtml = renderNode({
      kind: 'imageAsset',
      layoutNodeType: 'imageAsset',
      targetType: 'panel',
      targetId: 'panel-1',
      title: 'Image node',
      eyebrow: 'Image',
      body: 'image body',
      meta: 'bound',
      statusLabel: 'Ready',
      width: 300,
      height: 390,
      imageDetails: {
        imagePrompt: 'image prompt',
        candidateImages: ['https://example.com/a.png'],
        imageHistory: 'history',
        sketchImageUrl: 'https://example.com/sketch.png',
        previousImageUrl: 'https://example.com/previous.png',
      },
    })
    const videoHtml = renderNode({
      kind: 'videoClip',
      layoutNodeType: 'videoClip',
      targetType: 'panel',
      targetId: 'panel-1',
      title: 'Video node',
      eyebrow: 'Video',
      body: 'video body',
      meta: 'bound',
      statusLabel: 'Ready',
      width: 300,
      height: 410,
      videoDetails: {
        videoPrompt: 'video prompt',
        firstLastFramePrompt: 'first last prompt',
        videoGenerationMode: 'firstlastframe',
        videoUrl: 'https://example.com/video.mp4',
      },
    })
    const finalHtml = renderNode({
      kind: 'finalTimeline',
      layoutNodeType: 'finalTimeline',
      targetType: 'episode',
      targetId: 'episode-1',
      title: 'Final node',
      eyebrow: 'Final',
      body: 'final body',
      meta: 'order',
      statusLabel: 'Ready',
      width: 340,
      height: 280,
      finalDetails: {
        totalShots: 1,
        totalImages: 1,
        totalVideos: 1,
        totalDuration: 2,
        orderedVideoLabels: ['panel-1'],
      },
    })

    expect(shotHtml).toContain('Street')
    expect(shotHtml).toContain('Girl')
    expect(shotHtml).toContain('shot description')
    expect(shotHtml).not.toContain('photo rules')
    expect(shotHtml).not.toContain('acting notes')
    expect(imageHtml).toContain('image prompt')
    expect(imageHtml).not.toContain('history')
    expect(imageHtml).not.toContain('https://example.com/sketch.png')
    expect(videoHtml).toContain('video prompt')
    expect(videoHtml).toContain('<video')
    expect(videoHtml).toContain('src="https://example.com/video.mp4"')
    expect(videoHtml).not.toContain('alt="Video node"')
    expect(videoHtml).not.toContain('first last prompt')
    expect(videoHtml).not.toContain('lip.mp4')
    expect(finalHtml).not.toContain('panel-1')
    expect(`${shotHtml}${imageHtml}${videoHtml}${finalHtml}`).not.toContain('StoryboardStage')
    expect(`${shotHtml}${imageHtml}${videoHtml}${finalHtml}`).not.toContain('overflow-y-auto')
  })

  it('keeps canvas node text non-selectable so drag gestures stay reliable', () => {
    const html = renderNode({
      kind: 'shot',
      layoutNodeType: 'shot',
      targetType: 'panel',
      targetId: 'panel-1',
      title: 'Selectable shot title',
      eyebrow: 'Shot',
      body: 'selectable shot description',
      meta: 'selectable meta',
      statusLabel: 'Ready',
      width: 320,
      height: 380,
      shotDetails: {
        shotType: 'wide',
        cameraMove: 'push in',
        characters: [{ name: 'Selectable character' }],
        location: 'Selectable street',
        props: ['Selectable lamp'],
        imagePrompt: 'selectable image prompt',
        videoPrompt: 'selectable video prompt',
      },
    })

    expect(html).toContain('select-none')
    expect(html).not.toContain('select-text')
    expect(html).toMatch(/select-none[^"]*">Selectable shot title<\/h2>/)
    expect(html).toMatch(/select-none[^"]*">selectable shot description<\/p>/)
    expect(html).toMatch(/select-none[^"]*">Selectable character<\/span>/)
  })

  it('renders edit actions for image, video, and arrangement prompts only when save targets exist', () => {
    const onAction = vi.fn()
    const shotHtml = renderNode({
      kind: 'shot',
      layoutNodeType: 'shot',
      targetType: 'panel',
      targetId: 'panel-1',
      storyboardId: 'storyboard-1',
      panelIndex: 0,
      title: 'Editable shot',
      eyebrow: 'Shot',
      body: 'shot description',
      meta: 'location',
      statusLabel: 'Ready',
      width: 320,
      height: 520,
      expanded: true,
      onAction,
      shotDetails: {
        shotType: 'wide',
        cameraMove: 'push in',
        characters: [],
        location: 'Street',
        props: [],
        imagePrompt: 'editable image prompt',
        videoPrompt: 'editable video prompt',
      },
    })
    const videoPlanHtml = renderNode({
      kind: 'videoPlan',
      layoutNodeType: 'videoPlan',
      targetType: 'editScript',
      targetId: 'edit-1:video-block:1',
      title: 'Video plan',
      eyebrow: 'Plan',
      body: 'reason',
      meta: 'shots',
      statusLabel: 'Ready',
      width: 420,
      height: 560,
      expanded: true,
      onAction,
      videoPlanDetails: {
        editScriptId: 'edit-1',
        blockIndex: 0,
        kind: 'group',
        shotNumbers: [1, 2],
        durationSec: 8,
        gridMode: '2x2',
        reason: 'motion continuity',
        prompt: 'editable arrangement prompt',
        sourceImages: [
          { shotNumber: 1, imageUrl: 'https://example.com/shot-1.png', aspectRatio: 16 / 9 },
          { shotNumber: 2, imageUrl: 'https://example.com/shot-2.png', aspectRatio: 16 / 9 },
        ],
        assetReferences: [
          {
            id: 'asset-1',
            name: 'Pilot',
            kind: 'character',
            imageUrl: 'https://example.com/pilot.png',
            shotNumbers: [1, 2],
          },
        ],
      },
    })

    expect(shotHtml.match(/aria-label="editPrompt"/g)).toHaveLength(2)
    expect(videoPlanHtml.match(/aria-label="editPrompt"/g)).toHaveLength(1)
    expect(`${shotHtml}${videoPlanHtml}`).toContain('data-icon="edit"')
    expect(`${shotHtml}${videoPlanHtml}`).not.toContain('<textarea')
    expect(videoPlanHtml).not.toContain('gridMode')
    expect(videoPlanHtml).toContain('videoPlanModelMissing')
    expect(videoPlanHtml).toContain('videoPlanPendingVideo')
    expect(videoPlanHtml).toContain('grid grid-cols-2')
    expect(videoPlanHtml).not.toContain('overflow-x-auto')
  })

  it('does not render empty expanded detail sections as blank cards', () => {
    const emptyShotHtml = renderNode({
      kind: 'shot',
      layoutNodeType: 'shot',
      targetType: 'panel',
      targetId: 'panel-empty',
      title: 'Empty shot',
      eyebrow: 'Shot',
      body: 'shot description',
      meta: 'location',
      statusLabel: 'Ready',
      width: 320,
      height: 520,
      expanded: true,
      shotDetails: {
        shotType: 'wide',
        cameraMove: 'push in',
        characters: [],
        location: 'Street',
        props: [],
        srtSegment: 'shot description',
        imagePrompt: 'image prompt',
        videoPrompt: 'video prompt',
        photographyRules: '',
        actingNotes: null,
        errorMessage: null,
      },
    })
    const errorShotHtml = renderNode({
      kind: 'shot',
      layoutNodeType: 'shot',
      targetType: 'panel',
      targetId: 'panel-error',
      title: 'Error shot',
      eyebrow: 'Shot',
      body: 'shot description',
      meta: 'location',
      statusLabel: 'Ready',
      width: 320,
      height: 520,
      expanded: true,
      shotDetails: {
        shotType: 'wide',
        cameraMove: 'push in',
        characters: [],
        location: 'Street',
        props: [],
        srtSegment: 'shot description',
        imagePrompt: 'image prompt',
        videoPrompt: 'video prompt',
        photographyRules: '',
        actingNotes: null,
        errorMessage: 'image generation failed',
      },
    })
    const emptyImageHtml = renderNode({
      kind: 'imageAsset',
      layoutNodeType: 'imageAsset',
      targetType: 'panel',
      targetId: 'panel-image-empty',
      title: 'Image node',
      eyebrow: 'Image',
      body: 'image body',
      meta: 'bound',
      statusLabel: 'Ready',
      width: 300,
      height: 390,
      expanded: true,
      imageDetails: {
        imagePrompt: 'image prompt',
        candidateImages: [],
        imageHistory: null,
        errorMessage: null,
      },
    })
    const emptyVideoHtml = renderNode({
      kind: 'videoClip',
      layoutNodeType: 'videoClip',
      targetType: 'panel',
      targetId: 'panel-video-empty',
      title: 'Video node',
      eyebrow: 'Video',
      body: 'video body',
      meta: 'bound',
      statusLabel: 'Ready',
      width: 300,
      height: 410,
      expanded: true,
      videoDetails: {
        videoPrompt: 'video prompt',
        firstLastFramePrompt: null,
        errorMessage: null,
      },
    })

    expect(emptyShotHtml).not.toContain('>error<')
    expect(emptyShotHtml).not.toContain('>actingNotes<')
    expect(emptyShotHtml).not.toContain('>photographyRules<')
    expect(errorShotHtml).toContain('>error<')
    expect(errorShotHtml).toContain('image generation failed')
    expect(emptyImageHtml).not.toContain('>error<')
    expect(emptyImageHtml).not.toContain('>imageHistory<')
    expect(emptyVideoHtml).not.toContain('>error<')
    expect(emptyVideoHtml).not.toContain('>firstLastFramePrompt<')
  })
})
