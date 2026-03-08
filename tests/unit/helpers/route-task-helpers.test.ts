import { describe, expect, it, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import {
  maybeSubmitLLMTask,
  parseSyncFlag,
  resolveDisplayMode,
  resolvePositiveInteger,
  shouldRunSyncTask,
} from '@/lib/llm-observe/route-task'
import { TASK_TYPE } from '@/lib/task/types'

const submitTaskMock = vi.hoisted(() => vi.fn())
const getProjectModelConfigMock = vi.hoisted(() => vi.fn())
const getUserModelConfigMock = vi.hoisted(() => vi.fn())
const resolveAnalysisModelMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/task/submitter', () => ({
  submitTask: submitTaskMock,
}))

vi.mock('@/lib/config-service', () => ({
  getProjectModelConfig: getProjectModelConfigMock,
  getUserModelConfig: getUserModelConfigMock,
}))

vi.mock('@/lib/workers/handlers/resolve-analysis-model', () => ({
  resolveAnalysisModel: resolveAnalysisModelMock,
}))

function buildRequest(path: string, headers?: Record<string, string>) {
  return new NextRequest(new URL(path, 'http://localhost'), {
    method: 'POST',
    headers: headers || {},
  })
}

describe('route-task helpers', () => {
  beforeEach(() => {
    submitTaskMock.mockReset()
    getProjectModelConfigMock.mockReset()
    getUserModelConfigMock.mockReset()
    resolveAnalysisModelMock.mockReset()

    submitTaskMock.mockResolvedValue({
      success: true,
      async: true,
      taskId: 'task_1',
      runId: 'run_1',
      status: 'PENDING',
      deduped: false,
    })
    getProjectModelConfigMock.mockResolvedValue({ analysisModel: null })
    getUserModelConfigMock.mockResolvedValue({ analysisModel: null })
    resolveAnalysisModelMock.mockResolvedValue(null)
  })

  it('parseSyncFlag supports boolean-like values', () => {
    expect(parseSyncFlag(true)).toBe(true)
    expect(parseSyncFlag(1)).toBe(true)
    expect(parseSyncFlag('1')).toBe(true)
    expect(parseSyncFlag('true')).toBe(true)
    expect(parseSyncFlag('yes')).toBe(true)
    expect(parseSyncFlag('on')).toBe(true)
    expect(parseSyncFlag('false')).toBe(false)
    expect(parseSyncFlag(0)).toBe(false)
  })

  it('shouldRunSyncTask true when internal task header exists', () => {
    const req = buildRequest('/api/test', { 'x-internal-task-id': 'task-1' })
    expect(shouldRunSyncTask(req, {})).toBe(true)
  })

  it('shouldRunSyncTask true when body sync flag exists', () => {
    const req = buildRequest('/api/test')
    expect(shouldRunSyncTask(req, { sync: 'true' })).toBe(true)
  })

  it('shouldRunSyncTask true when query sync flag exists', () => {
    const req = buildRequest('/api/test?sync=1')
    expect(shouldRunSyncTask(req, {})).toBe(true)
  })

  it('resolveDisplayMode falls back to default on invalid value', () => {
    expect(resolveDisplayMode('detail', 'loading')).toBe('detail')
    expect(resolveDisplayMode('loading', 'detail')).toBe('loading')
    expect(resolveDisplayMode('invalid', 'loading')).toBe('loading')
  })

  it('resolvePositiveInteger returns safe integer fallback', () => {
    expect(resolvePositiveInteger(2.9, 1)).toBe(2)
    expect(resolvePositiveInteger('9', 1)).toBe(9)
    expect(resolvePositiveInteger('0', 7)).toBe(7)
    expect(resolvePositiveInteger('abc', 7)).toBe(7)
  })

  it('injects resolved analysisModel for story_to_script_run billable async task', async () => {
    getProjectModelConfigMock.mockResolvedValue({ analysisModel: null })
    resolveAnalysisModelMock.mockResolvedValue('openai-compatible::gpt-4.1-mini')

    const request = buildRequest('/api/novel-promotion/project_1/story-to-script-stream?async=1')
    await maybeSubmitLLMTask({
      request,
      userId: 'user_1',
      projectId: 'project_1',
      episodeId: 'episode_1',
      type: TASK_TYPE.STORY_TO_SCRIPT_RUN,
      targetType: 'NovelPromotionEpisode',
      targetId: 'episode_1',
      routePath: '/api/novel-promotion/project_1/story-to-script-stream',
      body: {
        content: 'story content',
        displayMode: 'detail',
        meta: {
          locale: 'en',
        },
      },
      dedupeKey: 'story_to_script_run:episode_1',
      priority: 2,
    })

    expect(resolveAnalysisModelMock).toHaveBeenCalledWith({
      userId: 'user_1',
      projectAnalysisModel: null,
    })
    expect(submitTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      type: TASK_TYPE.STORY_TO_SCRIPT_RUN,
      payload: expect.objectContaining({
        analysisModel: 'openai-compatible::gpt-4.1-mini',
      }),
      billingInfo: expect.objectContaining({
        billable: true,
        taskType: TASK_TYPE.STORY_TO_SCRIPT_RUN,
        apiType: 'text',
        model: 'openai-compatible::gpt-4.1-mini',
      }),
    }))
  })

  it('keeps user-level model injection behavior for reference_to_character', async () => {
    getUserModelConfigMock.mockResolvedValue({ analysisModel: 'openai-compatible::gpt-4.1-mini' })

    const request = buildRequest('/api/novel-promotion/project_1/reference-to-character?async=1')
    await maybeSubmitLLMTask({
      request,
      userId: 'user_1',
      projectId: 'project_1',
      type: TASK_TYPE.REFERENCE_TO_CHARACTER,
      targetType: 'Asset',
      targetId: 'asset_1',
      routePath: '/api/novel-promotion/project_1/reference-to-character',
      body: {
        meta: {
          locale: 'en',
        },
      },
    })

    expect(resolveAnalysisModelMock).not.toHaveBeenCalled()
    expect(submitTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      type: TASK_TYPE.REFERENCE_TO_CHARACTER,
      payload: expect.objectContaining({
        analysisModel: 'openai-compatible::gpt-4.1-mini',
      }),
      billingInfo: expect.objectContaining({
        model: 'openai-compatible::gpt-4.1-mini',
      }),
    }))
  })
})
