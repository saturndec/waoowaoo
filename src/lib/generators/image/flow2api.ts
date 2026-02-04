/**
 * Flow2API 图片生成器
 * 
 * 使用 OpenAI 兼容的 Chat Completions API（流式响应）
 * 支持 gemini-3.0-pro-image-portrait 等模型
 */

import { BaseImageGenerator, ImageGenerateParams, GenerateResult } from '../base'
import { getFlow2ApiConfig } from '@/lib/api-config'
import { getImageBase64Cached } from '@/lib/image-cache'

export class Flow2ApiImageGenerator extends BaseImageGenerator {
    private modelId: string

    constructor(modelId: string = 'gemini-3.0-pro-image-portrait') {
        super()
        this.modelId = modelId
    }

    protected async doGenerate(params: ImageGenerateParams): Promise<GenerateResult> {
        const { userId, prompt, referenceImages = [] } = params

        // 获取用户配置的 Flow2API 地址和密钥
        const { baseUrl, apiKey } = await getFlow2ApiConfig(userId)

        // 构建 OpenAI Vision 格式的 content 数组
        const content: any[] = []

        // 添加文本提示
        content.push({ type: 'text', text: prompt })

        // 添加参考图片（转换为 base64 格式）
        for (const imageData of referenceImages) {
            let base64Url = imageData

            // 如果是 URL（包括本地相对路径 /api/files/...），下载并转换为 base64
            if (imageData.startsWith('http') || imageData.startsWith('/')) {
                try {
                    // 🔧 本地模式修复：相对路径需要补全完整 URL
                    let fullUrl = imageData
                    if (imageData.startsWith('/')) {
                        const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
                        fullUrl = `${baseUrl}${imageData}`
                    }
                    base64Url = await getImageBase64Cached(fullUrl)
                } catch (e) {
                    console.warn('[Flow2API] 下载参考图片失败:', e)
                    continue
                }
            }

            content.push({
                type: 'image_url',
                image_url: { url: base64Url }
            })
        }

        // 发送流式请求
        const response = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: this.modelId,
                messages: [{ role: 'user', content }],
                stream: true
            })
        })

        if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`Flow2API 请求失败 (${response.status}): ${errorText}`)
        }

        // 解析 SSE 流式响应
        const imageUrl = await this.parseSSEResponse(response)

        if (!imageUrl) {
            throw new Error('Flow2API 未返回图片')
        }

        return {
            success: true,
            imageUrl
        }
    }

    /**
     * 解析 SSE 流式响应，提取图片 URL
     */
    private async parseSSEResponse(response: Response): Promise<string | null> {
        const reader = response.body?.getReader()
        if (!reader) {
            throw new Error('无法读取响应流')
        }

        const decoder = new TextDecoder()
        let buffer = ''
        let fullContent = ''
        let rawChunks: string[] = []  // 保存原始数据块用于调试

        try {
            console.log('[Flow2API] 开始读取 SSE 流...')
            while (true) {
                const { done, value } = await reader.read()
                if (done) {
                    console.log('[Flow2API] SSE 流正常结束 (done=true)')
                    break
                }

                const chunk = decoder.decode(value, { stream: true })
                buffer += chunk
                rawChunks.push(chunk)

                // 处理 SSE 事件
                const lines = buffer.split('\n')
                buffer = lines.pop() || ''

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6).trim()
                        if (data === '[DONE]') continue

                        try {
                            const json = JSON.parse(data)

                            // 尝试多种格式提取内容
                            // 格式1: OpenAI 流式格式 (delta.content) - 最终图片在这里
                            const deltaContent = json.choices?.[0]?.delta?.content
                            if (deltaContent) {
                                console.log('[Flow2API] 收到 delta.content:', typeof deltaContent === 'string' ? deltaContent.slice(0, 100) : '(非字符串)')
                                if (typeof deltaContent === 'string') {
                                    fullContent += deltaContent
                                } else if (Array.isArray(deltaContent)) {
                                    // 可能是 multimodal 内容
                                    for (const part of deltaContent) {
                                        if (part.type === 'image_url' && part.image_url?.url) {
                                            console.log('[Flow2API] ✅ 找到图片URL (delta.content):', part.image_url.url.slice(0, 100))
                                            return part.image_url.url
                                        } else if (part.type === 'text' && part.text) {
                                            fullContent += part.text
                                        }
                                    }
                                }
                                continue
                            }

                            // 格式1.5: Flow2API 的进度信息 (delta.reasoning_content)
                            const reasoningContent = json.choices?.[0]?.delta?.reasoning_content
                            if (reasoningContent) {
                                const trimmed = reasoningContent.trim()
                                console.log('[Flow2API] 进度:', trimmed)

                                // 检测错误信息
                                if (trimmed.includes('❌') || trimmed.includes('生成失败') || trimmed.includes('Error') || trimmed.includes('failed')) {
                                    // 保存错误信息到 fullContent，以便后续抛出
                                    fullContent = `ERROR: ${trimmed}`
                                }
                                continue
                            }

                            // 格式2: 完整消息格式 (message.content)
                            const messageContent = json.choices?.[0]?.message?.content
                            if (messageContent) {
                                // 如果是数组格式（multimodal）
                                if (Array.isArray(messageContent)) {
                                    for (const part of messageContent) {
                                        if (part.type === 'text' && part.text) {
                                            fullContent += part.text
                                        } else if (part.type === 'image_url' && part.image_url?.url) {
                                            console.log('[Flow2API] 找到图片URL (message.content数组):', part.image_url.url.slice(0, 100))
                                            return part.image_url.url
                                        } else if (part.type === 'image' && part.image) {
                                            // 可能是 base64 图片
                                            console.log('[Flow2API] 找到图片 (message.content数组, base64)')
                                            return `data:image/png;base64,${part.image}`
                                        }
                                    }
                                } else if (typeof messageContent === 'string') {
                                    fullContent += messageContent
                                }
                                continue
                            }

                            // 格式3: 直接在 json 中的图片 URL
                            if (json.image_url) {
                                console.log('[Flow2API] 找到图片URL (json.image_url):', json.image_url.slice(0, 100))
                                return json.image_url
                            }
                            if (json.data?.[0]?.url) {
                                console.log('[Flow2API] 找到图片URL (json.data[0].url):', json.data[0].url.slice(0, 100))
                                return json.data[0].url
                            }
                            if (json.data?.[0]?.b64_json) {
                                console.log('[Flow2API] 找到图片 (json.data[0].b64_json, base64)')
                                return `data:image/png;base64,${json.data[0].b64_json}`
                            }

                        } catch (e) {
                            // JSON 解析失败，可能是纯文本
                            console.log('[Flow2API] JSON解析失败，原始数据:', data.slice(0, 100))
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock()
        }

        // 打印收到的原始数据用于调试
        console.log('[Flow2API] SSE 解析完成，收到 %d 个数据块', rawChunks.length)
        console.log('[Flow2API] fullContent 长度:', fullContent.length)
        if (fullContent.length > 0) {
            console.log('[Flow2API] fullContent 前500字符:', fullContent.slice(0, 500))
        } else {
            console.log('[Flow2API] 原始响应数据:', rawChunks.join('').slice(0, 1000))
        }

        // 检查是否有错误信息
        if (fullContent.startsWith('ERROR:')) {
            throw new Error(fullContent.replace('ERROR:', '').trim())
        }

        // 从累积的内容中提取图片 URL
        // Flow2API 通常返回 markdown 格式的图片: ![image](url) 或直接返回 URL
        const urlMatch = fullContent.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/)
        if (urlMatch) {
            console.log('[Flow2API] 从 markdown 格式提取到图片URL')
            return urlMatch[1]
        }

        // 尝试直接匹配 URL
        const directUrlMatch = fullContent.match(/(https?:\/\/[^\s"']+\.(png|jpg|jpeg|webp|gif)[^\s"']*)/i)
        if (directUrlMatch) {
            console.log('[Flow2API] 直接匹配到图片URL')
            return directUrlMatch[1]
        }

        // 如果是 base64 格式
        if (fullContent.includes('data:image')) {
            const base64Match = fullContent.match(/(data:image\/[^;]+;base64,[A-Za-z0-9+/=]+)/)
            if (base64Match) {
                console.log('[Flow2API] 匹配到 base64 图片')
                return base64Match[1]
            }
        }

        console.warn('[Flow2API] 无法从响应中提取图片 URL:', fullContent.slice(0, 200))
        return null
    }
}
