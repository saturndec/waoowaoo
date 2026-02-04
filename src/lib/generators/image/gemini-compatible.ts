/**
 * Gemini 兼容层图片生成器
 * 
 * 支持使用 Google Gemini API 格式的第三方服务（如 GRSAI/Nano Banana）
 * 通过自定义 baseUrl 和 API Key 连接兼容服务
 */

import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai'
import { BaseImageGenerator, ImageGenerateParams, GenerateResult } from '../base'
import { getGeminiCompatibleConfig } from '@/lib/api-config'
import { getImageBase64Cached } from '@/lib/image-cache'

export class GeminiCompatibleImageGenerator extends BaseImageGenerator {
    private modelId: string

    constructor(modelId?: string) {
        super()
        // 默认使用 nano-banana-fast 模型
        this.modelId = modelId || 'nano-banana-fast'
    }

    protected async doGenerate(params: ImageGenerateParams): Promise<GenerateResult> {
        const { userId, prompt, referenceImages = [], options = {} } = params

        // 获取用户配置的 baseUrl 和 apiKey
        const config = await getGeminiCompatibleConfig(userId)
        const {
            aspectRatio = '3:4',
            resolution = '2K'  // Nano Banana 默认 1K/2K
        } = options

        // 🔥 使用自定义 baseUrl 初始化 SDK
        // @google/genai SDK 通过 httpOptions.baseUrl 支持自定义端点
        const ai = new GoogleGenAI({
            apiKey: config.apiKey,
            httpOptions: {
                baseUrl: config.baseUrl
            }
        })

        // 构建内容数组
        const contentParts: any[] = []

        // 添加参考图片（最多 14 张）
        for (let i = 0; i < Math.min(referenceImages.length, 14); i++) {
            const imageData = referenceImages[i]

            if (imageData.startsWith('data:')) {
                // Base64 格式
                const base64Start = imageData.indexOf(';base64,')
                if (base64Start !== -1) {
                    const mimeType = imageData.substring(5, base64Start)
                    const data = imageData.substring(base64Start + 8)
                    contentParts.push({ inlineData: { mimeType, data } })
                }
            } else if (imageData.startsWith('http') || imageData.startsWith('/')) {
                // URL 格式（包括本地相对路径 /api/files/...）：下载转 base64
                try {
                    // 🔧 本地模式修复：相对路径需要补全完整 URL
                    let fullUrl = imageData
                    if (imageData.startsWith('/')) {
                        const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
                        fullUrl = `${baseUrl}${imageData}`
                    }
                    const base64DataUrl = await getImageBase64Cached(fullUrl)
                    const base64Start = base64DataUrl.indexOf(';base64,')
                    if (base64Start !== -1) {
                        const mimeType = base64DataUrl.substring(5, base64Start)
                        const data = base64DataUrl.substring(base64Start + 8)
                        contentParts.push({ inlineData: { mimeType, data } })
                    }
                } catch (e) {
                    console.warn(`下载参考图片 ${i + 1} 失败:`, e)
                }
            } else {
                // 纯 base64
                contentParts.push({
                    inlineData: { mimeType: 'image/png', data: imageData }
                })
            }
        }

        // 添加文本提示
        contentParts.push({ text: prompt })

        // 安全配置（关闭过滤）
        const safetySettings = [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ]

        console.log(`[GeminiCompatible] 使用模型: ${this.modelId}, baseUrl: ${config.baseUrl}`)

        try {
            // 调用 API（使用用户配置的模型名称）
            const response = await ai.models.generateContent({
                model: this.modelId,
                contents: [{ parts: contentParts }],
                config: {
                    safetySettings,
                    // 🔥 关键：告诉 Gemini 返回图片
                    responseModalities: ['IMAGE', 'TEXT'],
                    imageConfig: {
                        aspectRatio,
                        imageSize: resolution
                    }
                }
            })

            // 提取图片
            const candidate = response.candidates?.[0]
            const parts = candidate?.content?.parts || []

            for (const part of parts) {
                if (part.inlineData) {
                    const imageBase64 = part.inlineData.data
                    if (imageBase64) {
                        const mimeType = part.inlineData.mimeType || 'image/png'
                        console.log(`[GeminiCompatible] 成功生成图片`)
                        return {
                            success: true,
                            imageBase64,
                            imageUrl: `data:${mimeType};base64,${imageBase64}`
                        }
                    }
                }
            }

            // 检查失败原因
            const finishReason = candidate?.finishReason
            if (finishReason === 'IMAGE_SAFETY' || finishReason === 'SAFETY') {
                throw new Error('内容因安全策略被过滤')
            }

            // 🔥 检查是否返回了文本而非图片（常见的代理路由问题）
            const textParts = parts.filter((p: any) => p.text)
            if (textParts.length > 0) {
                console.warn(`[GeminiCompatible] 代理返回了文本而非图片: ${textParts[0].text?.substring(0, 100)}...`)
                throw new Error('代理服务返回了文本而非图片，请检查模型配置')
            }

            // 🔥 详细日志：打印完整响应结构
            console.error(`[GeminiCompatible] ❌ 响应未包含图片，调试信息:`)
            console.error(`  - candidates 数量: ${response.candidates?.length || 0}`)
            console.error(`  - parts 数量: ${parts.length}`)
            console.error(`  - finishReason: ${candidate?.finishReason}`)
            console.error(`  - parts 类型: ${parts.map((p: any) => Object.keys(p).join(',')).join(' | ')}`)
            console.error(`  - 完整响应: ${JSON.stringify(response, null, 2).substring(0, 500)}...`)

            throw new Error('Gemini 兼容服务未返回图片')
        } catch (error: any) {
            console.error(`[GeminiCompatible] 生成失败:`, error.message)

            // 处理常见错误
            if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
                throw new Error('API Key 无效，请检查配置')
            }
            if (error.message?.includes('404') || error.message?.includes('not found')) {
                throw new Error(`模型 ${this.modelId} 不存在于服务端`)
            }
            if (error.message?.includes('quota') || error.message?.includes('limit')) {
                throw new Error('API 配额不足')
            }

            throw error
        }
    }
}
