/**
 * Google AI 图片生成器
 * 
 * 支持：
 * - Gemini 3 Pro Image (实时)
 * - Gemini 3 Pro Image (批量)
 * - Imagen 4
 */

import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai'
import { BaseImageGenerator, ImageGenerateParams, GenerateResult } from '../base'
import { getGoogleAiKey } from '@/lib/api-config'
import { getImageBase64Cached } from '@/lib/image-cache'

export class GoogleGeminiImageGenerator extends BaseImageGenerator {
    protected async doGenerate(params: ImageGenerateParams): Promise<GenerateResult> {
        const { userId, prompt, referenceImages = [], options = {} } = params

        const apiKey = await getGoogleAiKey(userId)
        const {
            aspectRatio = '3:4',
            resolution = '4K'
        } = options

        const ai = new GoogleGenAI({ apiKey })

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

        // 调用 API
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: [{ parts: contentParts }],
            config: {
                safetySettings,
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

        throw new Error('Gemini 未返回图片')
    }
}

/**
 * Google Imagen 4 图片生成器
 * 
 * 使用 Imagen 4 API（与 Gemini 不同的 API）
 * 支持：imagen-4.0-generate-001, imagen-4.0-fast-generate-001, imagen-4.0-ultra-generate-001
 */
export class GoogleImagenGenerator extends BaseImageGenerator {
    private modelId: string

    constructor(modelId: string = 'imagen-4.0-generate-001') {
        super()
        this.modelId = modelId
    }

    protected async doGenerate(params: ImageGenerateParams): Promise<GenerateResult> {
        const { userId, prompt, options = {} } = params

        const apiKey = await getGoogleAiKey(userId)
        const {
            aspectRatio = '3:4',
        } = options

        const ai = new GoogleGenAI({ apiKey })

        try {
            // 使用 Imagen API（不同于 Gemini generateContent）
            const response = await ai.models.generateImages({
                model: this.modelId,
                prompt,
                config: {
                    numberOfImages: 1,
                    aspectRatio,
                }
            })

            // 提取图片
            const generatedImages = (response as any).generatedImages
            if (generatedImages && generatedImages.length > 0) {
                const imageBytes = generatedImages[0].image?.imageBytes
                if (imageBytes) {
                    return {
                        success: true,
                        imageBase64: imageBytes,
                        imageUrl: `data:image/png;base64,${imageBytes}`
                    }
                }
            }

            throw new Error('Imagen 未返回图片')
        } catch (error: any) {
            // 检查安全过滤
            if (error.message?.includes('SAFETY') || error.message?.includes('blocked')) {
                throw new Error('内容因安全策略被过滤')
            }
            throw error
        }
    }
}

/**
 * Google Gemini Batch 图片生成器（异步模式）
 * 
 * 使用 ai.batches.create() 提交批量任务
 * 价格是标准 API 的 50%，处理时间 24 小时内
 */
export class GoogleGeminiBatchImageGenerator extends BaseImageGenerator {
    protected async doGenerate(params: ImageGenerateParams): Promise<GenerateResult> {
        const { userId, prompt, referenceImages = [], options = {} } = params

        const apiKey = await getGoogleAiKey(userId)
        const {
            aspectRatio = '3:4',
            resolution = '4K'
        } = options

        // 使用 Batch API 提交异步任务
        const { submitGeminiBatch } = await import('@/lib/gemini-batch-utils')

        const result = await submitGeminiBatch(apiKey, prompt, {
            referenceImages,
            aspectRatio,
            resolution
        })

        if (!result.success || !result.batchName) {
            return {
                success: false,
                error: result.error || 'Gemini Batch 提交失败'
            }
        }

        // 返回异步标识
        console.log(`[Gemini Batch Generator] ✅ 异步任务已提交: ${result.batchName}`)
        return {
            success: true,
            async: true,
            requestId: result.batchName,  // 向后兼容，格式: batches/xxx
            externalId: `GEMINI:BATCH:${result.batchName}`  // 🔥 标准格式
        }
    }
}
