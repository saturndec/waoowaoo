import { logInfo as _ulogInfo } from '@/lib/logging/core'
/**
 * 生成器统一入口（增强版）
 * 
 * 支持：
 * - 严格使用 model_key（provider::modelId）
 * - 用户自定义模型的动态路由（仅通过配置中心）
 * - 统一错误处理
 */

import { createAudioGenerator, createImageGenerator, createVideoGenerator } from './generators/factory'
import type { GenerateResult } from './generators/base'
import { getProviderConfig, getProviderKey, resolveModelSelection } from './api-config'
import {
    generateImageViaOpenAICompat,
    generateImageViaOpenAICompatTemplate,
    generateVideoViaOpenAICompat,
    generateVideoViaOpenAICompatTemplate,
    resolveModelGatewayRoute,
} from './model-gateway'
import { generateBailianAudio, generateBailianImage, generateBailianVideo } from './providers/bailian'
import { generateSiliconFlowAudio, generateSiliconFlowImage, generateSiliconFlowVideo } from './providers/siliconflow'

const OFFICIAL_ONLY_PROVIDER_KEYS = new Set(['bailian', 'siliconflow'])

/**
 * 将 aspectRatio 映射为 OpenAI 兼容的 size
 */
function aspectRatioToOpenAISize(aspectRatio: string | undefined): string | undefined {
    if (!aspectRatio) return undefined
    const ratio = aspectRatio.trim()
    // OpenAI 支持的尺寸: 1024x1024, 1792x1024, 1024x1792, 1536x1024, 1024x1536
    const mapping: Record<string, string> = {
        '1:1': '1024x1024',
        '16:9': '1792x1024',
        '9:16': '1024x1792',
        '3:2': '1536x1024',
        '2:3': '1024x1536',
    }
    return mapping[ratio] || undefined
}

/**
 * 生成图片（简化版）
 * 
 * @param userId 用户 ID
 * @param modelKey 模型唯一键（provider::modelId）
 * @param prompt 提示词
 * @param options 生成选项
 */
export async function generateImage(
    userId: string,
    modelKey: string,
    prompt: string,
    options?: {
        referenceImages?: string[]
        aspectRatio?: string
        resolution?: string
        outputFormat?: string
        keepOriginalAspectRatio?: boolean  // 🔥 编辑时保持原图比例
        size?: string  // 🔥 直接指定像素尺寸如 "5016x3344"（优先于 aspectRatio）
    }
): Promise<GenerateResult> {
    const selection = await resolveModelSelection(userId, modelKey, 'image')
    _ulogInfo(`[generateImage] resolved model selection: ${selection.modelKey}`)
    const providerConfig = await getProviderConfig(userId, selection.provider)
    const providerKey = getProviderKey(selection.provider).toLowerCase()
    if (providerKey === 'bailian') {
        return await generateBailianImage({
            userId,
            prompt,
            referenceImages: options?.referenceImages,
            options: {
                ...(options || {}),
                provider: selection.provider,
                modelId: selection.modelId,
                modelKey: selection.modelKey,
            },
        })
    }
    if (providerKey === 'siliconflow') {
        return await generateSiliconFlowImage({
            userId,
            prompt,
            referenceImages: options?.referenceImages,
            options: {
                ...(options || {}),
                provider: selection.provider,
                modelId: selection.modelId,
                modelKey: selection.modelKey,
            },
        })
    }
    const defaultGatewayRoute = resolveModelGatewayRoute(selection.provider)
    let gatewayRoute = OFFICIAL_ONLY_PROVIDER_KEYS.has(providerKey)
        ? 'official'
        : (providerConfig.gatewayRoute || defaultGatewayRoute)
    if (providerKey === 'gemini-compatible') {
        // DEPRECATED: historical rows persisted gemini-compatible as openai-compat by default.
        // Runtime now resolves route by apiMode to avoid requiring data migration SQL.
        gatewayRoute = providerConfig.apiMode === 'openai-official' ? 'openai-compat' : 'official'
    }

    // 调用生成（提取 referenceImages 单独传递，其余选项合并进 options）
    const { referenceImages, ...generatorOptions } = options || {}
    if (gatewayRoute === 'openai-compat') {
        const compatProfile = providerKey === 'grok-compatible' ? 'grok-compatible' : 'openai-compatible'
        const compatTemplate = selection.compatMediaTemplate
        if ((providerKey === 'openai-compatible' || providerKey === 'grok-compatible') && !compatTemplate) {
            throw new Error(`MODEL_COMPAT_MEDIA_TEMPLATE_REQUIRED: ${selection.modelKey}`)
        }
        if (compatTemplate) {
            return await generateImageViaOpenAICompatTemplate({
                userId,
                providerId: selection.provider,
                modelId: selection.modelId,
                modelKey: selection.modelKey,
                prompt,
                referenceImages,
                options: {
                    ...generatorOptions,
                    provider: selection.provider,
                    modelId: selection.modelId,
                    modelKey: selection.modelKey,
                },
                profile: compatProfile,
                template: compatTemplate,
            })
        }

        // OpenAI 兼容模式：将 aspectRatio 转换为 size
        let openaiCompatOptions = { ...generatorOptions }
        if (openaiCompatOptions.aspectRatio) {
            const mappedSize = aspectRatioToOpenAISize(openaiCompatOptions.aspectRatio)
            if (mappedSize && !openaiCompatOptions.size) {
                openaiCompatOptions = { ...openaiCompatOptions, size: mappedSize }
            }
            // 移除不支持的 aspectRatio
            delete openaiCompatOptions.aspectRatio
        }

        return await generateImageViaOpenAICompat({
            userId,
            providerId: selection.provider,
            modelId: selection.modelId,
            prompt,
            referenceImages,
            options: {
                ...openaiCompatOptions,
                provider: selection.provider,
                modelId: selection.modelId,
                modelKey: selection.modelKey,
            },
            profile: compatProfile,
        })
    }

    const generator = createImageGenerator(selection.provider, selection.modelId)
    return await generator.generate({
        userId,
        prompt,
        referenceImages,
        options: {
            ...generatorOptions,
            provider: selection.provider,
            modelId: selection.modelId,
            modelKey: selection.modelKey,
        }
    })
}

/**
 * 生成视频（增强版）
 * 
 * @param userId 用户 ID
 * @param modelKey 模型唯一键（provider::modelId）
 * @param imageUrl 输入图片 URL
 * @param options 生成选项
 */
export async function generateVideo(
    userId: string,
    modelKey: string,
    imageUrl: string,
    options?: {
        prompt?: string
        duration?: number
        fps?: number
        resolution?: string      // '720p' | '1080p'
        aspectRatio?: string     // '16:9' | '9:16'
        generateAudio?: boolean  // 仅 Seedance 1.5 Pro 支持
        lastFrameImageUrl?: string  // 首尾帧模式的尾帧图片
        [key: string]: string | number | boolean | undefined
    }
): Promise<GenerateResult> {
    const selection = await resolveModelSelection(userId, modelKey, 'video')
    _ulogInfo(`[generateVideo] resolved model selection: ${selection.modelKey}`)
    const providerKey = getProviderKey(selection.provider).toLowerCase()
    if (providerKey === 'bailian') {
        return await generateBailianVideo({
            userId,
            imageUrl,
            prompt: options?.prompt,
            options: {
                ...(options || {}),
                provider: selection.provider,
                modelId: selection.modelId,
                modelKey: selection.modelKey,
            },
        })
    }
    if (providerKey === 'siliconflow') {
        return await generateSiliconFlowVideo({
            userId,
            imageUrl,
            prompt: options?.prompt,
            options: {
                ...(options || {}),
                provider: selection.provider,
                modelId: selection.modelId,
                modelKey: selection.modelKey,
            },
        })
    }
    const providerConfig = await getProviderConfig(userId, selection.provider)
    const defaultGatewayRoute = resolveModelGatewayRoute(selection.provider)
    const gatewayRoute = OFFICIAL_ONLY_PROVIDER_KEYS.has(providerKey)
        ? 'official'
        : (providerConfig.gatewayRoute || defaultGatewayRoute)

    const { prompt, ...providerOptions } = options || {}
    if (gatewayRoute === 'openai-compat') {
        const compatProfile = providerKey === 'grok-compatible' ? 'grok-compatible' : 'openai-compatible'
        const compatTemplate = selection.compatMediaTemplate
        if ((providerKey === 'openai-compatible' || providerKey === 'grok-compatible') && !compatTemplate) {
            throw new Error(`MODEL_COMPAT_MEDIA_TEMPLATE_REQUIRED: ${selection.modelKey}`)
        }
        if (compatTemplate) {
            return await generateVideoViaOpenAICompatTemplate({
                userId,
                providerId: selection.provider,
                modelId: selection.modelId,
                modelKey: selection.modelKey,
                imageUrl,
                prompt: prompt || '',
                options: {
                    ...providerOptions,
                    provider: selection.provider,
                    modelId: selection.modelId,
                    modelKey: selection.modelKey,
                },
                profile: compatProfile,
                template: compatTemplate,
            })
        }

        return await generateVideoViaOpenAICompat({
            userId,
            providerId: selection.provider,
            modelId: selection.modelId,
            modelKey: selection.modelKey,
            imageUrl,
            prompt: prompt || '',
            options: {
                ...providerOptions,
                provider: selection.provider,
                modelId: selection.modelId,
                modelKey: selection.modelKey,
            },
            profile: compatProfile,
        })
    }

    const generator = createVideoGenerator(selection.provider)
    return await generator.generate({
        userId,
        imageUrl,
        prompt,
        options: {
            ...providerOptions,
            provider: selection.provider,
            modelId: selection.modelId,
            modelKey: selection.modelKey,
        }
    })
}

/**
 * 生成语音
 */
export async function generateAudio(
    userId: string,
    modelKey: string,
    text: string,
    options?: {
        voice?: string
        rate?: number
    }
): Promise<GenerateResult> {
    const selection = await resolveModelSelection(userId, modelKey, 'audio')
    const providerKey = getProviderKey(selection.provider).toLowerCase()
    if (providerKey === 'bailian') {
        return await generateBailianAudio({
            userId,
            text,
            voice: options?.voice,
            rate: options?.rate,
            options: {
                provider: selection.provider,
                modelId: selection.modelId,
                modelKey: selection.modelKey,
            },
        })
    }
    if (providerKey === 'siliconflow') {
        return await generateSiliconFlowAudio({
            userId,
            text,
            voice: options?.voice,
            rate: options?.rate,
            options: {
                provider: selection.provider,
                modelId: selection.modelId,
                modelKey: selection.modelKey,
            },
        })
    }
    const generator = createAudioGenerator(selection.provider)

    return generator.generate({
        userId,
        text,
        voice: options?.voice,
        rate: options?.rate,
        options: {
            provider: selection.provider,
            modelId: selection.modelId,
            modelKey: selection.modelKey,
        },
    })
}
