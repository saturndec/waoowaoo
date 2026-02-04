import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

// 测试 LLM 提供商连通性
export const POST = apiHandler(async (req: NextRequest) => {
    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult

    const { baseUrl, apiKey, model } = await req.json()

    if (!baseUrl || !apiKey) {
        throw new ApiError('INVALID_PARAMS', { message: '缺少必要参数' })
    }

    // 使用 OpenAI SDK 测试连接
    const client = new OpenAI({
        baseURL: baseUrl,
        apiKey: apiKey,
        timeout: 30000, // 30秒超时
    })

    // 发送简单测试请求
    const testModel = model || 'gpt-3.5-turbo' // 默认模型
    const startTime = Date.now()

    const response = await client.chat.completions.create({
        model: testModel,
        messages: [
            { role: 'user', content: '1+1等于几？只回答数字' }
        ],
        max_tokens: 10,
        temperature: 0,
    })

    const latency = Date.now() - startTime
    const answer = response.choices[0]?.message?.content?.trim() || ''

    return NextResponse.json({
        success: true,
        answer,
        latency,
        model: response.model || testModel,
    })
})
