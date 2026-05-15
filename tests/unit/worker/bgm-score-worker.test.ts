import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GenerateResult } from '@/lib/ai-providers/runtime-types'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const execFileMock = vi.hoisted(() => vi.fn())
const readFileMock = vi.hoisted(() => vi.fn())
const prismaMock = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(),
  },
  projectEpisode: {
    findFirst: vi.fn(),
  },
  projectEditScript: {
    findUnique: vi.fn(),
  },
  projectPanel: {
    findMany: vi.fn(),
  },
  projectVideoGroup: {
    findMany: vi.fn(),
  },
  videoEditorProject: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}))

const executeAiTextStepMock = vi.hoisted(() => vi.fn())
const generateMusicMock = vi.hoisted(() => vi.fn())
const reportTaskProgressMock = vi.hoisted(() => vi.fn())
const mediaServiceMock = vi.hoisted(() => ({
  ensureMediaObjectFromStorageKey: vi.fn(),
}))
const storageMock = vi.hoisted(() => ({
  generateUniqueKey: vi.fn((prefix: string, ext: string) => `${prefix}/asset.${ext}`),
  toFetchableUrl: vi.fn((url: string) => url),
  uploadObject: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    readFile: readFileMock,
  }
})

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('@/lib/ai-exec/engine', () => ({
  executeAiTextStep: executeAiTextStepMock,
  generateMusic: generateMusicMock,
}))

vi.mock('@/lib/workers/shared', () => ({
  reportTaskProgress: reportTaskProgressMock,
}))

vi.mock('@/lib/media/service', () => ({
  ensureMediaObjectFromStorageKey: mediaServiceMock.ensureMediaObjectFromStorageKey,
}))

vi.mock('@/lib/storage', () => ({
  generateUniqueKey: storageMock.generateUniqueKey,
  toFetchableUrl: storageMock.toFetchableUrl,
  uploadObject: storageMock.uploadObject,
}))

function buildJob(payload: Record<string, unknown>): Job<TaskJobData> {
  return {
    queueName: 'waoowaoo-music',
    data: {
      taskId: 'task-bgm-1',
      type: TASK_TYPE.BGM_SCORE_GENERATE,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'ProjectEpisode',
      targetId: 'episode-1',
      payload,
      userId: 'user-1',
    } satisfies TaskJobData,
  } as unknown as Job<TaskJobData>
}

function mockReadyProject(): void {
  prismaMock.project.findUnique.mockResolvedValue({
    analysisModel: 'openai::gpt-4.1',
    videoRatio: '16:9',
    artStyle: null,
    artStylePrompt: null,
    visualStylePresetSource: null,
    visualStylePresetId: null,
    directorStylePresetSource: null,
    directorStylePresetId: null,
    directorStyleDoc: null,
  })
  prismaMock.projectEpisode.findFirst.mockResolvedValue({ id: 'episode-1' })
  prismaMock.projectEditScript.findUnique.mockResolvedValue({
    id: 'edit-script-1',
    userPrompt: 'test',
    title: 'Test',
    logline: 'Test logline',
    durationSec: 3,
    shotsJson: [{
      shotNumber: 1,
      durationSec: 3,
      visualAction: 'A shot',
      charactersAndScene: 'A room',
      camera: 'Static',
      videoPrompt: 'A shot',
      sound: 'native video sound only',
    }],
    videoBlocksJson: [],
  })
}

function mockCompleteTimeline(): void {
  prismaMock.projectPanel.findMany.mockResolvedValue([
    {
      id: 'panel-1',
      panelIndex: 0,
      panelNumber: 1,
      duration: 3,
      description: 'panel 1',
      videoUrl: 'https://example.com/panel-1.mp4',
      videoMedia: null,
      lipSyncVideoUrl: null,
      lipSyncVideoMedia: null,
      photographyRules: JSON.stringify({ editScriptId: 'edit-script-1' }),
      storyboard: {
        id: 'storyboard-1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        storyboardTextJson: JSON.stringify({ editScriptId: 'edit-script-1' }),
        clip: { createdAt: new Date('2026-01-01T00:00:00.000Z') },
      },
    },
  ])
  prismaMock.projectVideoGroup.findMany.mockResolvedValue([])
}

function buildValidPlanText(): string {
  return JSON.stringify({
    durationSeconds: 3,
    global: {
      mood: 'tense',
      genre: 'cinematic minimal',
      bpm: 96,
      key: 'D minor',
      intensityCurve: [
        { timeSec: 0, intensity: 30 },
        { timeSec: 3, intensity: 55 },
      ],
    },
    blueprint: {
      tempoMap: [{
        startSec: 0,
        endSec: 3,
        bpm: 96,
        timeSignature: '4/4',
        barStart: 1,
        barEnd: 2,
        downbeatSec: 0,
        feel: 'steady restrained underscore',
      }],
      keyMap: [{
        startSec: 0,
        endSec: 3,
        key: 'D minor',
        mode: 'minor',
        function: 'single tonal center',
      }],
      chordMap: [{
        startSec: 0,
        endSec: 3,
        bars: '1-2',
        chords: ['Dm'],
        harmonicRhythm: 'static pedal harmony',
      }],
      hitPoints: [{
        timeSec: 2,
        label: 'shot resolves',
        musicalAction: 'small swell without impact sound',
      }],
      motif: null,
      orchestrationMap: [{
        startSec: 0,
        endSec: 3,
        registerPlan: 'atmosphere high, low_end below 120 Hz',
        instrumentation: 'dark pad and sub string support',
        frequencyFocus: 'separate low and high bands',
        density: 35,
      }],
      stemRules: [
        {
          role: 'atmosphere',
          allowedMaterial: 'sustained chord tones only',
          forbiddenMaterial: 'melody, bass movement, percussion, independent harmony',
          register: 'mid-high',
          rhythmicRule: 'no rhythmic pulse',
          chordRule: 'follow chordMap exactly',
        },
        {
          role: 'low_end',
          allowedMaterial: 'root pedal and soft sub swell only',
          forbiddenMaterial: 'chords, melody, percussion, independent rhythm',
          register: 'sub and low strings',
          rhythmicRule: 'slow pressure movement only',
          chordRule: 'root of chordMap only',
        },
      ],
    },
    stems: [
      {
        role: 'atmosphere',
        reason: 'Supports continuity across the shot without replacing source ambience.',
        startSec: 0,
        durationSec: 3,
        gainDb: -9,
        fadeInSec: 0.2,
        fadeOutSec: 0.4,
        density: 30,
        tension: 50,
        brightness: 20,
        motion: 10,
        prompt: 'Sparse dark atmospheric pad, isolated stem only.',
        negativePrompt: 'melody, drums, vocals',
      },
      {
        role: 'low_end',
        reason: 'Adds restrained low-frequency weight without independent rhythm.',
        startSec: 0,
        durationSec: 3,
        gainDb: -12,
        fadeInSec: 0.1,
        fadeOutSec: 0.3,
        density: 45,
        tension: 65,
        brightness: 25,
        motion: 55,
        prompt: 'Muted low-end root pedal, isolated stem only.',
        negativePrompt: 'full drums, vocals, independent rhythm',
      },
    ],
  })
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function waitForCondition(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error('condition was not met')
}

describe('bgm score worker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    execFileMock.mockImplementation((
      _command: string,
      _args: readonly string[],
      optionsOrCallback: unknown,
      maybeCallback?: unknown,
    ) => {
      const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback
      if (typeof callback !== 'function') throw new Error('execFile callback missing')
      callback(null, { stdout: '', stderr: '' })
    })
    readFileMock.mockImplementation(async (filePath: string) => {
      if (filePath.endsWith('bgm-score.m4a')) return Buffer.from('mixed-bgm')
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      return actual.readFile(filePath)
    })
    storageMock.uploadObject.mockImplementation(async (_buffer: Buffer, key: string) => key)
    mediaServiceMock.ensureMediaObjectFromStorageKey.mockImplementation(async (storageKey: string) => ({
      id: storageKey.includes('music/bgm-score') ? 'media-mix' : `media-${storageKey}`,
      url: storageKey.includes('music/bgm-score') ? '/m/bgm-mix' : `/m/${storageKey}`,
    }))
    prismaMock.videoEditorProject.findUnique.mockResolvedValue({ projectData: null })
  })

  it('fails explicitly when the video timeline is incomplete', async () => {
    mockReadyProject()
    prismaMock.projectPanel.findMany.mockResolvedValue([
      {
        id: 'panel-1',
        panelIndex: 0,
        panelNumber: 1,
        duration: 3,
        description: 'panel 1',
        videoUrl: null,
        videoMedia: null,
        lipSyncVideoUrl: null,
        lipSyncVideoMedia: null,
        photographyRules: JSON.stringify({ editScriptId: 'edit-script-1' }),
        storyboard: {
          id: 'storyboard-1',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          storyboardTextJson: JSON.stringify({ editScriptId: 'edit-script-1' }),
          clip: { createdAt: new Date('2026-01-01T00:00:00.000Z') },
        },
      },
    ])
    prismaMock.projectVideoGroup.findMany.mockResolvedValue([])

    const { handleBgmScoreGenerateTask } = await import('@/lib/bgm-score/generate')
    await expect(handleBgmScoreGenerateTask(buildJob({
      episodeId: 'episode-1',
      musicModel: 'google::lyria-3-pro-preview',
    }))).rejects.toThrow('BGM_SCORE_VIDEO_TIMELINE_INCOMPLETE:panel-1')

    expect(executeAiTextStepMock).not.toHaveBeenCalled()
    expect(generateMusicMock).not.toHaveBeenCalled()
  })

  it('writes completed BGM only after every stem is generated and mixed', async () => {
    mockReadyProject()
    mockCompleteTimeline()
    executeAiTextStepMock.mockResolvedValue({ text: buildValidPlanText() })
    generateMusicMock
      .mockResolvedValueOnce({
        success: true,
        audioBase64: Buffer.from('atmosphere').toString('base64'),
        audioMimeType: 'audio/mpeg',
      })
      .mockResolvedValueOnce({
        success: true,
        audioBase64: Buffer.from('low_end').toString('base64'),
        audioMimeType: 'audio/mpeg',
      })

    const { handleBgmScoreGenerateTask } = await import('@/lib/bgm-score/generate')
    const result = await handleBgmScoreGenerateTask(buildJob({
      episodeId: 'episode-1',
      musicModel: 'google::lyria-3-pro-preview',
    }))

    expect(result).toMatchObject({
      episodeId: 'episode-1',
      mediaId: 'media-mix',
      audioUrl: '/m/bgm-mix',
      stemCount: 2,
    })
    expect(generateMusicMock).toHaveBeenCalledTimes(2)
    expect(String(generateMusicMock.mock.calls[0]?.[2])).toContain('isolated atmosphere BGM stem only')
    expect(execFileMock).toHaveBeenCalledWith(
      'ffmpeg',
      expect.arrayContaining(['-filter_complex']),
      expect.objectContaining({ maxBuffer: expect.any(Number) }),
      expect.any(Function),
    )
    expect(storageMock.uploadObject).toHaveBeenCalledTimes(3)
    const completedCall = prismaMock.videoEditorProject.upsert.mock.calls.find((call) => {
      const arg = call[0] as { update?: { projectData?: string } }
      const projectData = JSON.parse(arg.update?.projectData ?? '{}') as { bgmScore?: { status?: string } }
      return projectData.bgmScore?.status === 'completed'
    })
    expect(completedCall).toBeTruthy()
  })

  it('submits all stem generation requests in parallel before waiting for any stem result', async () => {
    mockReadyProject()
    mockCompleteTimeline()
    executeAiTextStepMock.mockResolvedValue({ text: buildValidPlanText() })
    const atmosphere = createDeferred<GenerateResult>()
    const lowEnd = createDeferred<GenerateResult>()
    generateMusicMock
      .mockImplementationOnce(() => atmosphere.promise)
      .mockImplementationOnce(() => lowEnd.promise)

    const { handleBgmScoreGenerateTask } = await import('@/lib/bgm-score/generate')
    const resultPromise = handleBgmScoreGenerateTask(buildJob({
      episodeId: 'episode-1',
      musicModel: 'google::lyria-3-pro-preview',
    }))

    await waitForCondition(() => generateMusicMock.mock.calls.length === 2)

    expect(generateMusicMock).toHaveBeenCalledTimes(2)
    const initialStemProgressCall = reportTaskProgressMock.mock.calls.find((call) => {
      const payload = call[2] as { stage?: string; stemCount?: number; completedStemCount?: number; generationMode?: string }
      return payload.stage === 'bgm_score_generate_stem'
        && payload.stemCount === 2
        && payload.completedStemCount === 0
        && payload.generationMode === 'parallel'
    })
    expect(initialStemProgressCall).toBeTruthy()

    atmosphere.resolve({
      success: true,
      audioBase64: Buffer.from('atmosphere').toString('base64'),
      audioMimeType: 'audio/mpeg',
    })
    lowEnd.resolve({
      success: true,
      audioBase64: Buffer.from('low_end').toString('base64'),
      audioMimeType: 'audio/mpeg',
    })

    await expect(resultPromise).resolves.toMatchObject({
      episodeId: 'episode-1',
      stemCount: 2,
    })
  })

  it('fails the task and does not upload a mix when any stem generation fails', async () => {
    mockReadyProject()
    mockCompleteTimeline()
    executeAiTextStepMock.mockResolvedValue({ text: buildValidPlanText() })
    generateMusicMock
      .mockResolvedValueOnce({
        success: true,
        audioBase64: Buffer.from('atmosphere').toString('base64'),
        audioMimeType: 'audio/mpeg',
      })
      .mockResolvedValueOnce({
        success: false,
        error: 'provider rejected low_end stem',
      })

    const { handleBgmScoreGenerateTask } = await import('@/lib/bgm-score/generate')
    await expect(handleBgmScoreGenerateTask(buildJob({
      episodeId: 'episode-1',
      musicModel: 'google::lyria-3-pro-preview',
    }))).rejects.toThrow('provider rejected low_end stem')

    expect(storageMock.uploadObject).not.toHaveBeenCalled()
    const failedCall = prismaMock.videoEditorProject.upsert.mock.calls.find((call) => {
      const arg = call[0] as { update?: { projectData?: string } }
      const projectData = JSON.parse(arg.update?.projectData ?? '{}') as { bgmScore?: { status?: string; errorMessage?: string } }
      return projectData.bgmScore?.status === 'failed'
        && projectData.bgmScore.errorMessage === 'provider rejected low_end stem'
    })
    expect(failedCall).toBeTruthy()
  })
})
