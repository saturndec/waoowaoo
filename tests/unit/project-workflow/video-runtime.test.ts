import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const {
  generateVideoMutateAsyncMock,
  batchGenerateVideosMutateAsyncMock,
  updateProjectPanelVideoPromptMutateAsyncMock,
  updateProjectClipMutateAsyncMock,
  updateProjectConfigMutateAsyncMock,
} = vi.hoisted(() => ({
  generateVideoMutateAsyncMock: vi.fn(),
  batchGenerateVideosMutateAsyncMock: vi.fn(),
  updateProjectPanelVideoPromptMutateAsyncMock: vi.fn(),
  updateProjectClipMutateAsyncMock: vi.fn(),
  updateProjectConfigMutateAsyncMock: vi.fn(),
}))

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useMemo: <T,>(factory: () => T) => factory(),
  }
})

vi.mock('@/components/task/TaskStatusInline', () => ({
  default: () => React.createElement('span', null, 'task-status'),
}))

vi.mock('@/components/ui/config-modals/ModelCapabilityDropdown', () => ({
  ModelCapabilityDropdown: () => React.createElement('div', null, 'model-dropdown'),
}))

vi.mock('@/components/ui/icons', () => ({
  AppIcon: ({ name }: { name: string }) => React.createElement('span', null, name),
}))

vi.mock('@/lib/query/hooks/useStoryboards', () => ({
  useGenerateVideo: () => ({
    mutateAsync: generateVideoMutateAsyncMock,
  }),
  useBatchGenerateVideos: () => ({
    mutateAsync: batchGenerateVideosMutateAsyncMock,
  }),
  useRenderFinalVideo: () => ({
    mutateAsync: vi.fn(),
  }),
}))

vi.mock('@/lib/query/hooks', () => ({
  useUpdateProjectPanelVideoPrompt: () => ({
    mutateAsync: updateProjectPanelVideoPromptMutateAsyncMock,
  }),
  useUpdateProjectClip: () => ({
    mutateAsync: updateProjectClipMutateAsyncMock,
  }),
  useUpdateProjectConfig: () => ({
    mutateAsync: updateProjectConfigMutateAsyncMock,
  }),
}))

import { filterNormalVideoModelOptions, isFirstLastFrameOnlyModel, supportsFirstLastFrame } from '@/lib/ai-registry/video-capabilities'
import type { VideoModelOption } from '@/features/project-workspace/components/video/types'
import { useWorkspaceVideoActions } from '@/features/project-workspace/hooks/useWorkspaceVideoActions'
import VideoPanelCardBody from '@/features/project-workspace/components/video/panel-card/VideoPanelCardBody'
import type { VideoPanelRuntime } from '@/features/project-workspace/components/video/panel-card/hooks/useVideoPanelActions'
import { resolvePanelVideoGenerationDefaults } from '@/features/project-workspace/components/video/panel-card/runtime/hooks/usePanelVideoModel'

function createRuntime(overrides: Partial<VideoPanelRuntime> = {}): VideoPanelRuntime {
  const translate = (key: string, values?: Record<string, unknown>) => {
    if (key === 'firstLastFrame.asLastFrameFor') {
      return `作为镜头 ${String(values?.number ?? '')} 的尾帧`
    }
    if (key === 'firstLastFrame.asFirstFrameFor') {
      return `作为镜头 ${String(values?.number ?? '')} 的首帧`
    }
    if (key === 'firstLastFrame.generate') return '生成首尾帧视频'
    if (key === 'firstLastFrame.generated') return '首尾帧视频已生成'
    if (key === 'promptModal.promptLabel') return '视频提示词'
    if (key === 'promptModal.placeholder') return '输入首尾帧视频提示词...'
    if (key === 'panelCard.clickToEditPrompt') return '点击编辑提示词...'
    if (key === 'panelCard.selectModel') return '选择模型'
    if (key === 'panelCard.generateVideo') return '生成视频'
    if (key === 'panelCard.unknownShotType') return '未知镜头'
    if (key === 'stage.hasSynced') return '已生成'
    if (key === 'promptModal.duration') return '秒'
    return key
  }

  const runtime = {
    t: translate,
    tCommon: (key: string) => key,
    panel: {
      storyboardId: 'sb-1',
      panelIndex: 2,
      panelId: 'panel-2',
      imageUrl: 'https://example.com/frame-2.jpg',
      videoUrl: null,
      videoGenerationMode: null,
      lipSyncVideoUrl: null,
      textPanel: {
        shot_type: '平视中景',
        description: '谢俞站在宴席中央',
        duration: 3,
      },
    },
    panelIndex: 2,
    panelKey: 'sb-1-2',
    media: {
      showLipSyncVideo: true,
      onToggleLipSyncVideo: () => undefined,
      onPreviewImage: () => undefined,
      baseVideoUrl: undefined,
      currentVideoUrl: undefined,
    },
    taskStatus: {
      isVideoTaskRunning: false,
      isLipSyncTaskRunning: false,
      taskRunningVideoLabel: '生成中',
      lipSyncInlineState: null,
    },
    videoModel: {
      selectedModel: 'veo-3.1',
      setSelectedModel: () => undefined,
      capabilityFields: [],
      generationOptions: {},
      setCapabilityValue: () => undefined,
      missingCapabilityFields: [],
      videoModelOptions: [],
    },
    player: {
      isPlaying: false,
    },
    promptEditor: {
      isEditing: false,
      editingPrompt: '',
      setEditingPrompt: () => undefined,
      handleStartEdit: () => undefined,
      handleSave: () => undefined,
      handleCancelEdit: () => undefined,
      isSavingPrompt: false,
      localPrompt: '人物从席间回身，接到下一镜头',
    },
    voiceManager: {
      hasMatchedAudio: false,
      hasMatchedVoiceLines: false,
      audioGenerateError: null,
      localVoiceLines: [],
      isVoiceLineTaskRunning: () => false,
      handlePlayVoiceLine: () => undefined,
      handleGenerateAudio: async () => undefined,
      playingVoiceLineId: null,
    },
    lipSync: {
      handleStartLipSync: () => undefined,
      executingLipSync: false,
    },
    layout: {
      isLinked: true,
      isLastFrame: true,
      nextPanel: {
        storyboardId: 'sb-1',
        panelIndex: 3,
        imageUrl: 'https://example.com/frame-3.jpg',
      },
      prevPanel: {
        storyboardId: 'sb-1',
        panelIndex: 1,
        imageUrl: 'https://example.com/frame-1.jpg',
      },
      hasNext: true,
      flModel: 'veo-3.1',
      flModelOptions: [],
      flGenerationOptions: {},
      flCapabilityFields: [],
      flMissingCapabilityFields: [],
      flCustomPrompt: '',
      defaultFlPrompt: '',
      videoRatio: '9:16',
    },
    actions: {
      onGenerateVideo: () => undefined,
      onUpdatePanelVideoModel: () => undefined,
      onToggleLink: () => undefined,
      onFlModelChange: () => undefined,
      onFlCapabilityChange: () => undefined,
      onFlCustomPromptChange: () => undefined,
      onResetFlPrompt: () => undefined,
      onGenerateFirstLastFrame: () => undefined,
    },
    computed: {
      showLipSyncSection: false,
      canLipSync: false,
      hasVisibleBaseVideo: false,
    },
  }

  return {
    ...runtime,
    ...overrides,
  } as unknown as VideoPanelRuntime
}

describe('video model options partition', () => {
  const models: VideoModelOption[] = [
    {
      value: 'p::normal',
      label: 'normal',
      capabilities: {
        video: {
          generationModeOptions: ['normal'],
          firstlastframe: false,
        },
      },
    },
    {
      value: 'p::firstlast-only',
      label: 'firstlast-only',
      capabilities: {
        video: {
          generationModeOptions: ['firstlastframe'],
          firstlastframe: true,
        },
      },
    },
    {
      value: 'p::both',
      label: 'both',
      capabilities: {
        video: {
          generationModeOptions: ['normal', 'firstlastframe'],
          firstlastframe: true,
        },
      },
    },
    {
      value: 'p::custom-no-capability',
      label: 'custom-no-capability',
    },
  ]

  it('detects firstlastframe support and firstlastframe-only capability', () => {
    expect(supportsFirstLastFrame(models[0])).toBe(false)
    expect(supportsFirstLastFrame(models[1])).toBe(true)
    expect(supportsFirstLastFrame(models[2])).toBe(true)
    expect(supportsFirstLastFrame(models[3])).toBe(false)

    expect(isFirstLastFrameOnlyModel(models[0])).toBe(false)
    expect(isFirstLastFrameOnlyModel(models[1])).toBe(true)
    expect(isFirstLastFrameOnlyModel(models[2])).toBe(false)
    expect(isFirstLastFrameOnlyModel(models[3])).toBe(false)
  })

  it('filters out firstlastframe-only models from normal video model list', () => {
    const normalModels = filterNormalVideoModelOptions(models)
    expect(normalModels.map((item) => item.value)).toEqual([
      'p::normal',
      'p::both',
      'p::custom-no-capability',
    ])
  })
})

describe('panel video generation defaults', () => {
  it('uses last successful panel options over project defaults while preserving fallback fields', () => {
    const result = resolvePanelVideoGenerationDefaults({
      modelKey: 'provider::video-model',
      capabilityOverrides: {
        'provider::video-model': {
          resolution: '480p',
          duration: 5,
          aspectRatio: '16:9',
        },
      },
      lastVideoGenerationOptions: {
        resolution: '720p',
      },
    })

    expect(result).toEqual({
      duration: 5,
      resolution: '720p',
    })
  })
})

describe('useWorkspaceVideoActions', () => {
  const originalAlert = globalThis.alert

  beforeEach(() => {
    generateVideoMutateAsyncMock.mockReset()
    batchGenerateVideosMutateAsyncMock.mockReset()
    updateProjectPanelVideoPromptMutateAsyncMock.mockReset()
    updateProjectClipMutateAsyncMock.mockReset()
    updateProjectConfigMutateAsyncMock.mockReset()
    globalThis.alert = vi.fn()
  })

  afterEach(() => {
    globalThis.alert = originalAlert
  })

  it('single video mutation fails -> rethrows error for immediate lock cleanup', async () => {
    generateVideoMutateAsyncMock.mockRejectedValueOnce(new Error('video submit failed'))

    const actions = useWorkspaceVideoActions({
      projectId: 'project-1',
      episodeId: 'episode-1',
      t: (key: string) => key,
    })

    await expect(
      actions.handleGenerateVideo('storyboard-1', 0, 'veo-3.1'),
    ).rejects.toThrow('video submit failed')

    expect(globalThis.alert).toHaveBeenCalledWith('execution.generationFailed: video submit failed')
  })
})

describe('VideoPanelCardBody', () => {
  it('renders incoming and outgoing first-last-frame UI for chained panel', () => {
    const markup = renderToStaticMarkup(
      React.createElement(VideoPanelCardBody, {
        runtime: createRuntime(),
      }),
    )

    expect(markup).toContain('作为镜头 2 的尾帧')
    expect(markup).toContain('作为镜头 4 的首帧')
    expect(markup).toContain('视频提示词')
    expect(markup).toContain('生成首尾帧视频')
  })
})
