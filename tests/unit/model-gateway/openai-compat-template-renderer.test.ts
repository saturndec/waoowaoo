import { describe, expect, it } from 'vitest'
import {
  buildRenderedTemplateRequest,
  buildTemplateVariables,
  extractTemplateError,
  readJsonPath,
  renderTemplateString,
  renderTemplateValue,
  resolveTemplateEndpointUrl,
} from '@/lib/openai-compat-template-runtime'

describe('model-gateway openai-compat template renderer', () => {
  it('renders placeholders in strings and nested body values', () => {
    const variables = buildTemplateVariables({
      model: 'veo3.1',
      prompt: 'a cat running',
      image: 'https://a.test/cat.png',
      taskId: 'task_1',
    })

    expect(renderTemplateString('/videos/{{task_id}}', variables)).toBe('/videos/task_1')
    expect(renderTemplateValue({
      model: '{{model}}',
      prompt: '{{prompt}}',
      images: '{{images}}',
      nested: [{ value: '{{task_id}}' }],
    }, variables)).toEqual({
      model: 'veo3.1',
      prompt: 'a cat running',
      images: [],
      nested: [{ value: 'task_1' }],
    })
  })

  it('resolves relative path against base url and injects auth header', async () => {
    const request = await buildRenderedTemplateRequest({
      baseUrl: 'https://compat.example.com/v1/',
      endpoint: {
        method: 'POST',
        path: '/v2/videos/generations',
        contentType: 'application/json',
        bodyTemplate: {
          model: '{{model}}',
          prompt: '{{prompt}}',
        },
      },
      variables: buildTemplateVariables({
        model: 'veo3.1',
        prompt: 'hello',
      }),
      defaultAuthHeader: 'Bearer sk-test',
    })

    expect(resolveTemplateEndpointUrl('https://compat.example.com/v1/', '/v2/videos/generations'))
      .toBe('https://compat.example.com/v1/v2/videos/generations')
    expect(request.endpointUrl).toBe('https://compat.example.com/v1/v2/videos/generations')
    expect(request.headers.Authorization).toBe('Bearer sk-test')
    expect(request.headers['Content-Type']).toBe('application/json')
    expect(request.body).toBe(JSON.stringify({
      model: 'veo3.1',
      prompt: 'hello',
    }))
  })

  it('deduplicates /v1 prefix when base url already ends with /v1', async () => {
    const request = await buildRenderedTemplateRequest({
      baseUrl: 'https://yunwu.ai/v1',
      endpoint: {
        method: 'GET',
        path: '/v1/video/query?id={{task_id}}',
      },
      variables: buildTemplateVariables({
        model: 'veo_3_1-fast-4K',
        prompt: '',
        taskId: 'task_abc',
      }),
      defaultAuthHeader: 'Bearer sk-test',
    })

    expect(resolveTemplateEndpointUrl('https://yunwu.ai/v1', '/v1/video/create'))
      .toBe('https://yunwu.ai/v1/video/create')
    expect(request.endpointUrl).toBe('https://yunwu.ai/v1/video/query?id=task_abc')
    expect(request.headers.Authorization).toBe('Bearer sk-test')
  })

  it('builds multipart form data and omits explicit content-type header', async () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO0p6s8AAAAASUVORK5CYII='
    const request = await buildRenderedTemplateRequest({
      baseUrl: 'https://compat.example.com/v1',
      endpoint: {
        method: 'POST',
        path: '/videos',
        contentType: 'multipart/form-data',
        multipartFileFields: ['input_reference'],
        bodyTemplate: {
          model: '{{model}}',
          prompt: '{{prompt}}',
          input_reference: '{{image}}',
        },
      },
      variables: buildTemplateVariables({
        model: 'veo3.1',
        prompt: 'hello',
        image: dataUrl,
      }),
      defaultAuthHeader: 'Bearer sk-test',
    })

    expect(request.endpointUrl).toBe('https://compat.example.com/v1/videos')
    expect(request.headers.Authorization).toBe('Bearer sk-test')
    expect(request.headers['Content-Type']).toBeUndefined()
    expect(request.body).toBeInstanceOf(FormData)

    const formData = request.body as FormData
    expect(formData.get('model')).toBe('veo3.1')
    expect(formData.get('prompt')).toBe('hello')
    const fileValue = formData.get('input_reference')
    expect(fileValue).toBeInstanceOf(File)
    expect((fileValue as File).name).toBe('reference-0.png')
  })

  it('builds application/x-www-form-urlencoded bodies', async () => {
    const request = await buildRenderedTemplateRequest({
      baseUrl: 'https://compat.example.com/v1',
      endpoint: {
        method: 'POST',
        path: '/videos/query',
        contentType: 'application/x-www-form-urlencoded',
        bodyTemplate: {
          model: '{{model}}',
          task_id: '{{task_id}}',
        },
      },
      variables: buildTemplateVariables({
        model: 'veo3.1',
        prompt: 'hello',
        taskId: 'task_1',
      }),
    })

    expect(request.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(request.body).toBeInstanceOf(URLSearchParams)
    expect((request.body as URLSearchParams).toString()).toBe('model=veo3.1&task_id=task_1')
  })

  it('omits unresolved exact-placeholder fields from json body', async () => {
    const request = await buildRenderedTemplateRequest({
      baseUrl: 'https://compat.example.com/v1',
      endpoint: {
        method: 'POST',
        path: '/videos/generations',
        contentType: 'application/json',
        bodyTemplate: {
          model: '{{model}}',
          prompt: '{{prompt}}',
          resolution: '{{resolution}}',
          aspect_ratio: '{{aspect_ratio}}',
        },
      },
      variables: buildTemplateVariables({
        model: 'grok-video-1',
        prompt: 'animate',
      }),
    })

    expect(request.body).toBe(JSON.stringify({
      model: 'grok-video-1',
      prompt: 'animate',
    }))
  })

  it('reads json path for array/object outputs', () => {
    const payload = {
      data: [{ url: 'https://cdn.test/1.png' }],
      task: {
        status: 'succeeded',
      },
    }
    expect(readJsonPath(payload, '$.data[0].url')).toBe('https://cdn.test/1.png')
    expect(readJsonPath(payload, '$.task.status')).toBe('succeeded')
  })

  it('extracts upstream error message from common payload shape', () => {
    const message = extractTemplateError({
      version: 1,
      mediaType: 'video',
      mode: 'async',
      create: {
        method: 'POST',
        path: '/video/create',
      },
      status: {
        method: 'GET',
        path: '/video/query?id={{task_id}}',
      },
      response: {
        taskIdPath: '$.id',
        statusPath: '$.status',
      },
      polling: {
        intervalMs: 5000,
        timeoutMs: 600000,
        doneStates: ['completed'],
        failStates: ['failed'],
      },
    }, {
      error: {
        message_zh: '当前分组上游负载已饱和，请稍后再试',
      },
    }, 500)

    expect(message).toContain('status 500')
    expect(message).toContain('当前分组上游负载已饱和，请稍后再试')
  })
})
