/**
 * 生成器统一入口（增强版）
 * 
 * 支持：
 * - 直接使用 modelId（无需用户配置查找）
 * - 自动模型映射
 * - 用户自定义模型的动态路由（通过 provider 参数）
 * - 统一错误处理
 */

import { createImageGeneratorByModel, createVideoGeneratorByModel, createAudioGenerator, createImageGenerator } from './generators/factory'
import type { GenerateResult } from './generators/base'

/**
 * 生成图片（简化版）
 * 
 * @param userId 用户 ID
 * @param modelId 模型 ID（直接使用，如 'banana', 'gemini', 'seedream'）
 * @param prompt 提示词
 * @param options 生成选项
 */
export async function generateImage(
    userId: string,
    modelId: string,
    prompt: string,
    options?: {
        referenceImages?: string[]
        aspectRatio?: string
        resolution?: string
        outputFormat?: string
        keepOriginalAspectRatio?: boolean  // 🔥 编辑时保持原图比例
        size?: string  // 🔥 直接指定像素尺寸如 "5016x3344"（优先于 aspectRatio）
        provider?: string  // 🔥 用户自定义模型的 provider（如 'gemini-compatible'）
    }
): Promise<GenerateResult> {
    let generator

    // 如果提供了 provider，使用动态路由
    if (options?.provider) {
        generator = createImageGenerator(options.provider, modelId)
    } else {
        // 尝试使用静态模型映射
        try {
            generator = createImageGeneratorByModel(modelId)
        } catch (error: any) {
            // 静态映射失败，尝试从用户配置查找 provider
            const { getModelProvider } = await import('./api-config')
            const provider = await getModelProvider(userId, modelId)

            if (provider) {
                console.log(`[generateImage] 模型 ${modelId} 未在静态映射中，使用用户配置的 provider: ${provider}`)
                generator = createImageGenerator(provider, modelId)
            } else {
                // 真的找不到，抛出原始错误
                throw error
            }
        }
    }

    // 调用生成
    return generator.generate({
        userId,
        prompt,
        referenceImages: options?.referenceImages,
        options
    })
}

/**
 * 生成视频（增强版）
 * 
 * @param userId 用户 ID
 * @param modelId 模型 ID（如 'fal-wan25', 'fal-veo31', 'seedance', 'seedance1.5-batch' 等）
 * @param imageUrl 输入图片 URL
 * @param options 生成选项
 */
export async function generateVideo(
    userId: string,
    modelId: string,
    imageUrl: string,
    options?: {
        prompt?: string
        duration?: number
        fps?: number
        resolution?: string      // '720p' | '1080p'
        aspectRatio?: string     // '16:9' | '9:16'
        generateAudio?: boolean  // 仅 Seedance 1.5 Pro 支持
        lastFrameImageUrl?: string  // 首尾帧模式的尾帧图片
    }
): Promise<GenerateResult> {
    const generator = createVideoGeneratorByModel(modelId)

    return generator.generate({
        userId,
        imageUrl,
        prompt: options?.prompt,
        options: {
            ...options,
            modelId  // 传递 modelId 给生成器以选择正确的端点
        }
    })
}

/**
 * 生成语音
 */
export async function generateAudio(
    userId: string,
    text: string,
    options?: {
        voice?: string
        rate?: number
    }
): Promise<GenerateResult> {
    const generator = createAudioGenerator('qwen')

    return generator.generate({
        userId,
        text,
        voice: options?.voice,
        rate: options?.rate
    })
}
