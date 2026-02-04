/**
 * LLM 客户端（极简版）
 * 
 * 从用户配置读取 API Key，支持任意 OpenAI 兼容 API
 */

import OpenAI from 'openai'
import { getLLMConfig, resolveModelId } from './api-config'
import { recordText } from './pricing'

/**
 * Chat Completion 选项
 */
export interface ChatCompletionOptions {
    temperature?: number
    reasoning?: boolean
    reasoningEffort?: 'low' | 'medium' | 'high'
    maxRetries?: number
    // 💰 计费相关
    projectId?: string   // 用于计费（如果不传，使用 'system' 作为默认值）
    action?: string      // 计费操作名称
    skipBilling?: boolean // 跳过计费（极少场景）
}

/**
 * 判断错误是否可重试
 */
function isRetryableError(error: any): boolean {
    if (!error) return false
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') return true
    if (error.status === 429 || (error.status >= 500 && error.status < 600)) return true
    return false
}

/**
 * Chat Completion
 * 
 * @param userId 用户 ID
 * @param model 模型名称
 * @param messages 消息数组
 * @param options 可选配置
 */
export async function chatCompletion(
    userId: string,
    model: string | null | undefined,
    messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
    options: ChatCompletionOptions = {}
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    // 🚨 统一检查：模型未配置时抛出友好错误
    if (!model) {
        console.error('[LLM] 模型未配置，调用栈:', new Error().stack)
        throw new Error('ANALYSIS_MODEL_NOT_CONFIGURED: 请先在设置页面配置分析模型')
    }

    const config = await getLLMConfig(userId)

    // 🔥 解析模型 ID：将内部 ID（如 llm-gemini3flash）转换为实际 API modelId（如 google/gemini-3-flash-preview）
    const resolvedModelId = await resolveModelId(userId, model)

    const client = new OpenAI({
        baseURL: config.baseUrl,
        apiKey: config.apiKey
    })

    const {
        temperature = 0.7,
        reasoning = true,
        reasoningEffort = 'high',
        maxRetries = 2,
        projectId,
        action = 'chat_completion',
        skipBilling = false
    } = options

    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
            const extraParams: any = {}

            // OpenRouter reasoning 参数
            if (config.baseUrl.includes('openrouter') && reasoning) {
                extraParams.reasoning = { effort: reasoningEffort }
            }

            const completion = await client.chat.completions.create({
                model: resolvedModelId,
                messages: messages as any,
                temperature,
                ...extraParams
            })

            // 💰 自动计费（成功时记录）
            if (!skipBilling && completion.usage) {
                // 🔥 调试：如果 projectId 无效，打印调用栈
                if (!projectId) {
                    console.error('[LLM计费] ⚠️ 缺少 projectId，跳过计费。调用栈:', new Error().stack)
                } else {
                    recordText({
                        projectId,
                        userId,
                        model: resolvedModelId,
                        action,
                        inputTokens: completion.usage.prompt_tokens || 0,
                        outputTokens: completion.usage.completion_tokens || 0
                    }).catch(err => console.error('[LLM计费失败]', err.message, 'projectId:', projectId))
                }
            }

            return completion
        } catch (error: any) {
            lastError = error

            // 🔥 检测内容安全策略错误
            const errorBody = error.error || error
            if (errorBody?.message === 'PROHIBITED_CONTENT' || errorBody?.code === 502) {
                console.error('[LLM] ❌ 内容安全检测失败 - Google AI Studio 拒绝处理此内容')
                throw new Error('SENSITIVE_CONTENT: 内容包含敏感信息,无法处理。请修改内容后重试')
            }

            console.warn(`[LLM] 调用失败 (${attempt}/${maxRetries + 1}): ${error.message}`)

            if (!isRetryableError(error) || attempt > maxRetries) break

            const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
            await new Promise(resolve => setTimeout(resolve, delayMs))
        }
    }

    throw lastError || new Error('LLM 调用失败')
}

/**
 * Chat Completion with Vision
 */
export async function chatCompletionWithVision(
    userId: string,
    model: string | null | undefined,
    textPrompt: string,
    imageUrls: string[] = [],
    options: ChatCompletionOptions = {}
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    // 🚨 统一检查：模型未配置时抛出友好错误
    if (!model) {
        console.error('[LLM Vision] 模型未配置，调用栈:', new Error().stack)
        throw new Error('ANALYSIS_MODEL_NOT_CONFIGURED: 请先在设置页面配置分析模型')
    }

    const config = await getLLMConfig(userId)

    // 🔥 解析模型 ID：将内部 ID（如 llm-gemini3flash）转换为实际 API modelId（如 google/gemini-3-flash-preview）
    const resolvedModelId = await resolveModelId(userId, model)

    const client = new OpenAI({
        baseURL: config.baseUrl,
        apiKey: config.apiKey
    })

    const { temperature = 0.7, maxRetries = 2 } = options

    // 构建 Vision 消息
    const content: any[] = []
    if (textPrompt) content.push({ type: 'text', text: textPrompt })

    // 🔧 本地模式修复：将本地图片 URL 转换为 Base64
    for (const url of imageUrls) {
        let finalUrl = url

        // 如果是本地相对路径，转换为 Base64
        if (url.startsWith('/api/files/') || url.startsWith('/')) {
            try {
                const { imageUrlToBase64 } = await import('./cos')
                finalUrl = await imageUrlToBase64(url)
                console.log('[LLM Vision] 转换本地图片为 Base64')
            } catch (e) {
                console.error('[LLM Vision] 转换本地图片失败:', e)
                // 尝试使用完整 URL
                const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
                finalUrl = `${baseUrl}${url}`
            }
        }

        content.push({ type: 'image_url', image_url: { url: finalUrl } })
    }

    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
            const completion = await client.chat.completions.create({
                model: resolvedModelId,
                messages: [{ role: 'user', content }],
                temperature
            })
            return completion
        } catch (error: any) {
            lastError = error

            // 🔥 检测内容安全策略错误
            const errorBody = error.error || error
            if (errorBody?.message === 'PROHIBITED_CONTENT' || errorBody?.code === 502) {
                console.error('[LLM Vision] ❌ 内容安全检测失败 - Google AI Studio 拒绝处理此内容')
                throw new Error('SENSITIVE_CONTENT: 图片或提示词包含敏感信息,无法处理')
            }

            console.warn(`[LLM Vision] 调用失败 (${attempt}/${maxRetries + 1}): ${error.message}`)
            if (!isRetryableError(error) || attempt > maxRetries) break
            const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
            await new Promise(resolve => setTimeout(resolve, delayMs))
        }
    }

    throw lastError || new Error('LLM Vision 调用失败')
}

/**
 * 获取 completion 文本内容
 * 
 * 自动处理 OpenRouter 的 reasoning 响应格式：
 * - 标准格式: choices[0].message.content (字符串)
 * - Reasoning 格式: choices[0].message.content (数组，包含 type: "reasoning" 和 type: "text")
 */
export function getCompletionContent(completion: OpenAI.Chat.Completions.ChatCompletion): string {
    if (!completion || !completion.choices || completion.choices.length === 0) {
        console.error('[LLM] ❌ 返回无效响应 - 完整对象:',
            JSON.stringify(completion, null, 2).substring(0, 2000) // 限制长度避免日志过大
        )
        throw new Error('LLM 返回无效响应')
    }

    const message = completion.choices[0]?.message as any
    if (!message) {
        console.error('[LLM] ❌ 响应中没有消息内容 - choices[0]:',
            JSON.stringify(completion.choices[0], null, 2).substring(0, 1000)
        )
        throw new Error('LLM 响应中没有消息内容')
    }

    const content = message.content

    // 情况1: content 是字符串（标准格式）
    if (typeof content === 'string') {
        return content
    }

    // 情况2: content 是数组（OpenRouter reasoning 格式）
    if (Array.isArray(content)) {
        // 只提取 type === 'text' 的内容，忽略 type === 'reasoning'
        const textParts = content
            .filter((part: any) => part.type === 'text')
            .map((part: any) => part.text)
            .filter(Boolean)

        if (textParts.length > 0) {
            return textParts.join('')
        }

        // 某些格式可能使用 type: 'message'
        const messageParts = content
            .filter((part: any) => part.type === 'message')
            .map((part: any) => part.content || part.text)
            .filter(Boolean)

        if (messageParts.length > 0) {
            return messageParts.join('')
        }

        // 最后尝试：提取任何有 text 字段的内容
        const anyText = content
            .filter((part: any) => part.text && part.type !== 'reasoning')
            .map((part: any) => part.text)
            .join('')

        if (anyText) {
            return anyText
        }
    }

    return content || ''
}

