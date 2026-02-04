/**
 * 测试 API Key 连通性
 * 
 * POST - 验证指定 API 渠道的 Key 是否有效
 */

import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * POST - 测试 API 连接性
 */
export const POST = apiHandler(async (request: NextRequest) => {
    const body = await request.json()
    const { provider, apiKey, baseUrl, region } = body

    if (!provider || !apiKey) {
        throw new ApiError('INVALID_PARAMS', { message: '缺少必要参数' })
    }

    // 根据不同渠道测试连接
    switch (provider) {
        case 'openrouter':
            await testOpenRouter(apiKey)
            break

        case 'google':
            await testGoogleAI(apiKey)
            break

        case 'anthropic':
            await testAnthropic(apiKey)
            break

        case 'openai':
            await testOpenAI(apiKey)
            break

        case 'custom':
            if (!baseUrl) {
                throw new ApiError('INVALID_PARAMS', { message: '自定义渠道需要提供 baseUrl' })
            }
            await testCustomLLM(apiKey, baseUrl)
            break

        case 'azure':
            if (!region) {
                throw new ApiError('INVALID_PARAMS', { message: 'Azure TTS 需要提供 region' })
            }
            await testAzureTTS(apiKey, region)
            break

        default:
            throw new ApiError('INVALID_PARAMS', { message: `不支持的渠道: ${provider}` })
    }

    return NextResponse.json({
        success: true,
        message: `${provider} 连接成功`
    })
})

/**
 * 测试 OpenRouter
 */
async function testOpenRouter(apiKey: string) {
    const client = new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey
    })

    // 尝试列出模型
    await client.models.list()
}

/**
 * 测试 Google AI
 */
async function testGoogleAI(apiKey: string) {
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        { method: 'GET' }
    )

    if (!response.ok) {
        const error = await response.text()
        throw new Error(`Google AI 认证失败: ${error}`)
    }
}

/**
 * 测试 Anthropic
 */
async function testAnthropic(apiKey: string) {
    const client = new OpenAI({
        baseURL: 'https://api.anthropic.com/v1',
        apiKey,
        defaultHeaders: {
            'anthropic-version': '2023-06-01'
        }
    })

    // 尝试列出模型或发送测试请求
    await client.chat.completions.create({
        model: 'claude-3-haiku-20240307',
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1
    })
}

/**
 * 测试 OpenAI
 */
async function testOpenAI(apiKey: string) {
    const client = new OpenAI({
        apiKey
    })

    await client.models.list()
}

/**
 * 测试自定义 OpenAI 兼容 API
 */
async function testCustomLLM(apiKey: string, baseUrl: string) {
    const client = new OpenAI({
        baseURL: baseUrl,
        apiKey
    })

    // 尝试列出模型
    await client.models.list()
}

/**
 * 测试 Azure TTS
 */
async function testAzureTTS(key: string, region: string) {
    // 简单测试：获取 token
    const response = await fetch(
        `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
        {
            method: 'POST',
            headers: {
                'Ocp-Apim-Subscription-Key': key
            }
        }
    )

    if (!response.ok) {
        const error = await response.text()
        throw new Error(`Azure TTS 认证失败: ${error}`)
    }
}
