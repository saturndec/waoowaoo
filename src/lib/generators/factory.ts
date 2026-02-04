/**
 * 生成器工厂（增强版）
 * 
 * 支持：
 * - 根据 modelId 自动选择生成器
 * - 根据 provider 创建生成器
 */

import { ImageGenerator, VideoGenerator, AudioGenerator } from './base'
import { FalImageGenerator, FalBananaGenerator } from './fal'
import { ArkImageGenerator, ArkSeedreamGenerator, ArkVideoGenerator, ArkSeedanceVideoGenerator } from './ark'
import { FalVideoGenerator } from './fal'
import { GoogleGeminiImageGenerator, GoogleImagenGenerator, GoogleGeminiBatchImageGenerator, Flow2ApiImageGenerator, GeminiCompatibleImageGenerator } from './image'
import { QwenTTSGenerator } from './audio'
import { MinimaxVideoGenerator, MinimaxImageGenerator } from './minimax'
import { ViduVideoGenerator } from './vidu'

// 模型ID到生成器配置的映射
interface GeneratorConfig {
    provider: string
    endpoint?: string
    model?: string
}

// 图片模型映射
const IMAGE_MODEL_MAP: Record<string, GeneratorConfig> = {
    // FAL Banana
    'banana': { provider: 'fal' },
    'banana-2k': { provider: 'fal' },
    'banana-4k': { provider: 'fal' },

    // Google Gemini
    'gemini-3-pro-image-preview': { provider: 'google' },
    'gemini-3-pro-image-preview-batch': { provider: 'google-batch' },  // 🔥 使用 batch 模式

    // Google Imagen
    'imagen-4.0-generate-001': { provider: 'imagen' },
    'imagen-4.0-fast-generate-001': { provider: 'imagen' },
    'imagen-4.0-ultra-generate-001': { provider: 'imagen' },

    // 火山引擎 Seedream
    'seedream': { provider: 'ark', model: 'doubao-seedream-4-5-251128' },
    'seedream4': { provider: 'ark', model: 'doubao-seedream-4-0-250828' },
    'seedream4.5': { provider: 'ark', model: 'doubao-seedream-4-5-251128' },
    'doubao-seedream-4-0-250828': { provider: 'ark', model: 'doubao-seedream-4-0-250828' },
    'doubao-seedream-4-5-251128': { provider: 'ark', model: 'doubao-seedream-4-5-251128' },

    // Flow2API (用户自建服务)
    'gemini-3.0-pro-image-portrait': { provider: 'flow2api', model: 'gemini-3.0-pro-image-portrait' },

    // MiniMax (海螺)
    'image-01': { provider: 'minimax', model: 'image-01' },
    'image-01-live': { provider: 'minimax', model: 'image-01-live' },

    // 注意：gemini-compatible 的模型由用户自定义配置
    // 不在此处硬编码，通过 provider 动态路由
}

// 视频模型映射
const VIDEO_MODEL_MAP: Record<string, GeneratorConfig> = {
    // FAL
    'wan-2.6': { provider: 'fal', endpoint: 'fal-ai/wan/v2.6/image-to-video' },
    'veo-3.1': { provider: 'fal', endpoint: 'fal-ai/veo3.1/fast/image-to-video' },
    'sora-2': { provider: 'fal', endpoint: 'fal-ai/sora-2/fast/image-to-video' },
    'kling-2.5': { provider: 'fal', endpoint: 'fal-ai/kling-2.5/fast/image-to-video' },

    // 火山引擎 Seedance
    'seedance': { provider: 'ark', model: 'doubao-seedance-1-5-pro-251215' },
    'seedance-1.0': { provider: 'ark', model: 'doubao-seedance-1-0-pro-250528' },
    'seedance-1.5': { provider: 'ark', model: 'doubao-seedance-1-5-pro-251215' },
    'seedance-fast': { provider: 'ark', model: 'doubao-seedance-1-0-pro-fast-251015' },

    // MiniMax (海螺)
    'minimax-hailuo-2.3': { provider: 'minimax', model: 'MiniMax-Hailuo-2.3' },
    'minimax-hailuo-2.3-fast': { provider: 'minimax', model: 'MiniMax-Hailuo-2.3-Fast' },
    'minimax-hailuo-02': { provider: 'minimax', model: 'MiniMax-Hailuo-02' },
    't2v-01': { provider: 'minimax', model: 'T2V-01' },
    't2v-01-director': { provider: 'minimax', model: 'T2V-01-Director' },

    // Vidu
    'viduq3-pro': { provider: 'vidu', model: 'viduq3-pro' },
    'viduq2-pro-fast': { provider: 'vidu', model: 'viduq2-pro-fast' },
    'viduq2-pro': { provider: 'vidu', model: 'viduq2-pro' },
    'viduq2-turbo': { provider: 'vidu', model: 'viduq2-turbo' },
    'viduq2': { provider: 'vidu', model: 'viduq2' },
    'viduq1': { provider: 'vidu', model: 'viduq1' },
    'viduq1-classic': { provider: 'vidu', model: 'viduq1-classic' },
    'vidu2.0': { provider: 'vidu', model: 'vidu2.0' },
}

/**
 * 根据模型ID创建图片生成器
 */
export function createImageGeneratorByModel(modelId: string | null | undefined): ImageGenerator {
    // 🚨 统一检查：模型未配置时抛出友好错误
    if (!modelId) {
        console.error('[ImageGenerator] 图片模型未配置')
        throw new Error('IMAGE_MODEL_NOT_CONFIGURED: 请先在设置页面配置图片模型')
    }

    const config = IMAGE_MODEL_MAP[modelId.toLowerCase()]

    if (!config) {
        // 🔥 移除 fallback：未注册的模型直接报错
        throw new Error(
            `未知的图片模型: "${modelId}". ` +
            `支持的模型: ${Object.keys(IMAGE_MODEL_MAP).join(', ')}`
        )
    }

    return createImageGenerator(config.provider, modelId)
}

/**
 * 根据 provider 创建图片生成器
 */
export function createImageGenerator(provider: string, modelId?: string): ImageGenerator {
    switch (provider.toLowerCase()) {
        case 'fal':
            return new FalBananaGenerator()
        case 'google':
            return new GoogleGeminiImageGenerator()
        case 'google-batch':  // 🔥 Gemini Batch 异步模式
            return new GoogleGeminiBatchImageGenerator()
        case 'imagen':
            return new GoogleImagenGenerator(modelId)
        case 'ark':
            return new ArkSeedreamGenerator()
        case 'flow2api':
            return new Flow2ApiImageGenerator(modelId)
        case 'minimax':
            return new MinimaxImageGenerator()
        case 'gemini-compatible':
            return new GeminiCompatibleImageGenerator(modelId)
        default:
            throw new Error(`Unknown image generator provider: ${provider}`)
    }
}

/**
 * 根据模型ID创建视频生成器
 */
export function createVideoGeneratorByModel(modelId: string | null | undefined): VideoGenerator {
    // 🚨 统一检查：模型未配置时抛出友好错误
    if (!modelId) {
        console.error('[VideoGenerator] 视频模型未配置')
        throw new Error('VIDEO_MODEL_NOT_CONFIGURED: 请先在设置页面配置视频模型')
    }

    const config = VIDEO_MODEL_MAP[modelId.toLowerCase()]

    if (!config) {
        // 🔥 智能fallback：如果是 doubao- 开头，直接当作 ARK 模型ID
        if (modelId.toLowerCase().startsWith('doubao-')) {
            console.log(`[VideoGenerator] 使用完整ARK模型ID: ${modelId}`)
            return createVideoGenerator('ark')
        }

        // 其他未知模型报错
        throw new Error(
            `未知的视频模型: "${modelId}". ` +
            `支持的模型: ${Object.keys(VIDEO_MODEL_MAP).join(', ')}`
        )
    }

    return createVideoGenerator(config.provider)
}

/**
 * 根据 provider 创建视频生成器
 */
export function createVideoGenerator(provider: string): VideoGenerator {
    switch (provider.toLowerCase()) {
        case 'fal':
            return new FalVideoGenerator()
        case 'ark':
            return new ArkSeedanceVideoGenerator()
        case 'minimax':
            return new MinimaxVideoGenerator()
        case 'vidu':
            return new ViduVideoGenerator()
        default:
            throw new Error(`Unknown video generator provider: ${provider}`)
    }
}

/**
 * 创建语音生成器
 */
export function createAudioGenerator(provider: string): AudioGenerator {
    switch (provider.toLowerCase()) {
        case 'qwen':
            return new QwenTTSGenerator()
        default:
            throw new Error(`Unknown audio generator provider: ${provider}`)
    }
}
