import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AssistantRuntimeContext } from '@/lib/assistant-platform'

const saveModelTemplateConfigurationMock = vi.hoisted(() =>
  vi.fn(async () => ({ modelKey: 'openai-compatible:oa-1::veo3.1' })),
)

vi.mock('@/lib/user-api/model-template/save', () => ({
  saveModelTemplateConfiguration: saveModelTemplateConfigurationMock,
}))

import { apiConfigTemplateSkill } from '@/lib/assistant-platform/skills/api-config-template'

function buildRuntimeContext(providerId = 'openai-compatible:oa-1'): AssistantRuntimeContext {
  return {
    userId: 'user-1',
    assistantId: 'api-config-template',
    context: {
      providerId,
    },
    analysisModelKey: 'openrouter::gpt-5-mini',
    resolvedModel: {
      providerId: 'openrouter',
      providerKey: 'openrouter',
      modelId: 'gpt-5-mini',
    },
  }
}

describe('assistant-platform api-config-template skill', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns invalid when template fails schema validation', async () => {
    const tools = apiConfigTemplateSkill.tools?.(buildRuntimeContext())
    expect(tools).toBeTruthy()
    const saveTool = tools?.saveModelTemplate
    expect(saveTool).toBeTruthy()
    if (!saveTool?.execute) {
      throw new Error('saveModelTemplate.execute is required for test')
    }

    const result = await saveTool.execute({
      modelId: 'veo3.1',
      name: 'Veo 3.1',
      type: 'video',
      compatMediaTemplate: {
        version: 1,
        mediaType: 'video',
        mode: 'async',
        create: {
          method: 'POST',
          path: '/v2/videos/generations',
        },
        response: {
          taskIdPath: '$.task_id',
        },
      },
    }, {} as never)

    expect(result.status).toBe('invalid')
    expect(result.code).toBe('MODEL_TEMPLATE_INVALID')
    expect(saveModelTemplateConfigurationMock).not.toHaveBeenCalled()
  })

  it('saves template when payload is valid', async () => {
    const tools = apiConfigTemplateSkill.tools?.(buildRuntimeContext())
    expect(tools).toBeTruthy()
    const saveTool = tools?.saveModelTemplate
    expect(saveTool).toBeTruthy()
    if (!saveTool?.execute) {
      throw new Error('saveModelTemplate.execute is required for test')
    }

    const result = await saveTool.execute({
      modelId: 'veo3.1',
      name: 'Veo 3.1',
      type: 'video',
      compatMediaTemplate: {
        version: 1,
        mediaType: 'video',
        mode: 'async',
        create: {
          method: 'POST',
          path: '/v2/videos/generations',
          contentType: 'application/json',
          bodyTemplate: {
            model: '{{model}}',
            prompt: '{{prompt}}',
          },
        },
        status: {
          method: 'GET',
          path: '/v2/videos/generations/{{task_id}}',
        },
        response: {
          taskIdPath: '$.task_id',
          statusPath: '$.status',
          outputUrlPath: '$.video_url',
        },
        polling: {
          intervalMs: 3000,
          timeoutMs: 180000,
          doneStates: ['done'],
          failStates: ['failed'],
        },
      },
    }, {} as never)

    expect(result.status).toBe('saved')
    expect(result.savedModelKey).toBe('openai-compatible:oa-1::veo3.1')
    expect(saveModelTemplateConfigurationMock).toHaveBeenCalledWith({
      userId: 'user-1',
      providerId: 'openai-compatible:oa-1',
      modelId: 'veo3.1',
      name: 'Veo 3.1',
      type: 'video',
      template: expect.objectContaining({
        mediaType: 'video',
      }),
      source: 'ai',
    })
  })

  it('saves multiple templates when batch payload is valid', async () => {
    const tools = apiConfigTemplateSkill.tools?.(buildRuntimeContext())
    expect(tools).toBeTruthy()
    const batchTool = tools?.saveModelTemplates
    expect(batchTool).toBeTruthy()
    if (!batchTool?.execute) {
      throw new Error('saveModelTemplates.execute is required for test')
    }

    const result = await batchTool.execute({
      models: [
        {
          modelId: 'veo3-fast',
          name: 'Veo 3 Fast',
          type: 'video',
          compatMediaTemplate: {
            version: 1,
            mediaType: 'video',
            mode: 'async',
            create: {
              method: 'POST',
              path: '/video/create',
              contentType: 'application/json',
              bodyTemplate: {
                model: '{{model}}',
                prompt: '{{prompt}}',
                images: ['{{image}}'],
              },
            },
            status: {
              method: 'GET',
              path: '/video/query?id={{task_id}}',
            },
            response: {
              taskIdPath: '$.id',
              statusPath: '$.status',
              outputUrlPath: '$.video_url',
            },
            polling: {
              intervalMs: 5000,
              timeoutMs: 600000,
              doneStates: ['completed'],
              failStates: ['failed'],
            },
          },
        },
        {
          modelId: 'veo3.1-fast',
          name: 'Veo 3.1 Fast',
          type: 'video',
          compatMediaTemplate: {
            version: 1,
            mediaType: 'video',
            mode: 'async',
            create: {
              method: 'POST',
              path: '/video/create',
              contentType: 'application/json',
              bodyTemplate: {
                model: '{{model}}',
                prompt: '{{prompt}}',
                images: ['{{image}}'],
              },
            },
            status: {
              method: 'GET',
              path: '/video/query?id={{task_id}}',
            },
            response: {
              taskIdPath: '$.id',
              statusPath: '$.status',
              outputUrlPath: '$.video_url',
            },
            polling: {
              intervalMs: 5000,
              timeoutMs: 600000,
              doneStates: ['completed'],
              failStates: ['failed'],
            },
          },
        },
      ],
    }, {} as never)

    expect(result.status).toBe('saved')
    expect(result.savedModelKeys).toHaveLength(2)
    expect(saveModelTemplateConfigurationMock).toHaveBeenCalledTimes(2)
    expect(saveModelTemplateConfigurationMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      modelId: 'veo3-fast',
      name: 'Veo 3 Fast',
      providerId: 'openai-compatible:oa-1',
      userId: 'user-1',
      type: 'video',
      source: 'ai',
    }))
    expect(saveModelTemplateConfigurationMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      modelId: 'veo3.1-fast',
      name: 'Veo 3.1 Fast',
      providerId: 'openai-compatible:oa-1',
      userId: 'user-1',
      type: 'video',
      source: 'ai',
    }))
  })

  it('allows grok-compatible provider context', async () => {
    const tools = apiConfigTemplateSkill.tools?.(buildRuntimeContext('grok-compatible:gk-1'))
    expect(tools).toBeTruthy()
    const saveTool = tools?.saveModelTemplate
    if (!saveTool?.execute) {
      throw new Error('saveModelTemplate.execute is required for test')
    }

    const result = await saveTool.execute({
      modelId: 'grok-video-1',
      name: 'Grok Video',
      type: 'video',
      compatMediaTemplate: {
        version: 1,
        mediaType: 'video',
        mode: 'async',
        create: {
          method: 'POST',
          path: '/v1/videos/generations',
          contentType: 'application/json',
          bodyTemplate: {
            model: '{{model}}',
            prompt: '{{prompt}}',
          },
        },
        status: {
          method: 'GET',
          path: '/v1/videos/{{task_id}}',
        },
        response: {
          taskIdPath: '$.id',
          statusPath: '$.status',
          outputUrlPath: '$.output[0].url',
        },
        polling: {
          intervalMs: 3000,
          timeoutMs: 180000,
          doneStates: ['done'],
          failStates: ['expired', 'failed'],
        },
      },
    }, {} as never)

    expect(result.status).toBe('saved')
    expect(saveModelTemplateConfigurationMock).toHaveBeenCalledWith(expect.objectContaining({
      providerId: 'grok-compatible:gk-1',
      modelId: 'grok-video-1',
    }))
  })
})
