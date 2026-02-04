/**
 * API 配置读取器（极简版）
 * 
 * 从用户配置读取 API Key 和模型列表
 */

import { prisma } from './prisma'
import { decryptApiKey } from './crypto-utils'

// ============================================================
// 类型定义
// ============================================================

export interface CustomModel {
    modelId: string    // 唯一标识符
    name: string       // 显示名
    type: 'llm' | 'image' | 'video'
    provider: string   // 关联的厂商 ID
    price: number      // LLM: ¥/百万token，图片: ¥/张，视频: ¥/条
    resolution?: '2K' | '4K'  // 图片模型分辨率配置
}

export interface LLMConfig {
    baseUrl: string
    apiKey: string
}

// ============================================================
// LLM 配置
// ============================================================

// 统一 Provider 接口（与前端保持一致）
interface CustomProvider {
    id: string
    name: string
    type: 'llm' | 'image' | 'video' | 'audio' | 'lipsync'
    baseUrl?: string
    apiKey?: string  // 加密存储
}

/**
 * 获取用户的 LLM 配置（默认 OpenRouter）
 * @deprecated 使用 getLLMConfigForModel 代替
 */
export async function getLLMConfig(userId: string): Promise<LLMConfig> {
    const pref = await prisma.userPreference.findUnique({
        where: { userId },
        select: { llmBaseUrl: true, llmApiKey: true, customProviders: true }
    })

    // 优先从 customProviders 中查找 openrouter
    if (pref?.customProviders) {
        try {
            const providers: CustomProvider[] = JSON.parse(pref.customProviders)
            const openrouter = providers.find(p => p.id === 'openrouter')
            if (openrouter?.apiKey) {
                return {
                    baseUrl: openrouter.baseUrl || 'https://openrouter.ai/api/v1',
                    apiKey: decryptApiKey(openrouter.apiKey)
                }
            }
        } catch { }
    }

    // 后备：使用旧的全局配置
    if (!pref?.llmApiKey) {
        throw new Error('请先在设置中配置 LLM API Key')
    }

    return {
        baseUrl: pref.llmBaseUrl || 'https://openrouter.ai/api/v1',
        apiKey: decryptApiKey(pref.llmApiKey)
    }
}

/**
 * 根据提供商 ID 获取 LLM 配置
 */
export async function getLLMConfigForProvider(userId: string, providerId: string): Promise<LLMConfig> {
    const pref = await prisma.userPreference.findUnique({
        where: { userId },
        select: { customProviders: true, llmBaseUrl: true, llmApiKey: true }
    })

    if (pref?.customProviders) {
        try {
            const providers: CustomProvider[] = JSON.parse(pref.customProviders)
            const provider = providers.find(p => p.id === providerId)
            if (provider?.apiKey) {
                return {
                    baseUrl: provider.baseUrl,
                    apiKey: decryptApiKey(provider.apiKey)
                }
            }
        } catch { }
    }

    // 如果是 openrouter 且有旧的全局配置
    if (providerId === 'openrouter' && pref?.llmApiKey) {
        return {
            baseUrl: pref.llmBaseUrl || 'https://openrouter.ai/api/v1',
            apiKey: decryptApiKey(pref.llmApiKey)
        }
    }

    throw new Error(`未配置提供商 ${providerId} 的 API Key`)
}

/**
 * 根据模型获取对应的 LLM 配置
 * 查找该模型使用的提供商，返回其配置
 */
export async function getLLMConfigForModel(userId: string, modelId: string): Promise<LLMConfig> {
    const pref = await prisma.userPreference.findUnique({
        where: { userId },
        select: { customModels: true, customProviders: true, llmBaseUrl: true, llmApiKey: true }
    })

    // 查找模型配置
    let providerId = 'openrouter' // 默认提供商
    if (pref?.customModels) {
        try {
            const models = JSON.parse(pref.customModels)
            const model = models.find((m: any) => m.modelId === modelId)
            if (model?.provider) {
                providerId = model.provider
            }
        } catch { }
    }

    // 获取提供商配置
    if (pref?.customProviders) {
        try {
            const providers: CustomProvider[] = JSON.parse(pref.customProviders)
            const provider = providers.find(p => p.id === providerId)
            if (provider?.apiKey) {
                return {
                    baseUrl: provider.baseUrl,
                    apiKey: decryptApiKey(provider.apiKey)
                }
            }
        } catch { }
    }

    // 后备：使用旧的全局配置（兼容老数据）
    if (pref?.llmApiKey) {
        return {
            baseUrl: pref.llmBaseUrl || 'https://openrouter.ai/api/v1',
            apiKey: decryptApiKey(pref.llmApiKey)
        }
    }

    throw new Error(`未配置提供商 ${providerId} 的 API Key，请在设置中添加`)
}

// ============================================================
// 图片/视频/语音 API Key（统一从 providers 读取）
// ============================================================

/**
 * 从 providers 中获取指定提供商的 API Key
 */
async function getProviderApiKey(userId: string, providerId: string, type: 'llm' | 'image' | 'video' | 'audio' | 'lipsync'): Promise<string> {
    const pref = await prisma.userPreference.findUnique({
        where: { userId },
        select: { customProviders: true } as any
    })

    if ((pref as any)?.customProviders) {
        try {
            const providers: CustomProvider[] = JSON.parse((pref as any).customProviders)
            const provider = providers.find(p => p.id === providerId && p.type === type)
            if (provider?.apiKey) {
                return decryptApiKey(provider.apiKey)
            }
        } catch { }
    }

    throw new Error(`请配置 ${providerId} 的 API Key`)
}

/**
 * 获取 FAL API Key
 */
export async function getFalApiKey(userId: string): Promise<string> {
    return getProviderApiKey(userId, 'fal', 'image')
}

/**
 * 获取 Google AI API Key
 */
export async function getGoogleAiKey(userId: string): Promise<string> {
    return getProviderApiKey(userId, 'google', 'image')
}

/**
 * 获取火山引擎 ARK API Key
 */
export async function getArkApiKey(userId: string): Promise<string> {
    return getProviderApiKey(userId, 'ark', 'image')
}

/**
 * 获取阿里百炼 API Key
 */
export async function getQwenApiKey(userId: string): Promise<string> {
    return getProviderApiKey(userId, 'qwen', 'audio')
}

/**
 * 获取 Fish Audio API Key
 */
export async function getFishAudioApiKey(userId: string): Promise<string> {
    return getProviderApiKey(userId, 'fish-audio', 'audio')
}

/**
 * 获取 ElevenLabs API Key
 */
export async function getElevenLabsApiKey(userId: string): Promise<string> {
    return getProviderApiKey(userId, 'elevenlabs', 'audio')
}

/**
 * 获取 Lip Sync API Key (FAL Kling)
 */
export async function getLipSyncApiKey(userId: string): Promise<string> {
    //先尝试专用的 lipsync provider，后备使用 fal image provider
    try {
        return await getProviderApiKey(userId, 'fal-lipsync', 'lipsync')
    } catch {
        return getProviderApiKey(userId, 'fal', 'image')
    }
}

/**
 * 获取 MiniMax API Key（海螺）
 */
export async function getMinimaxApiKey(userId: string): Promise<string> {
    return getProviderApiKey(userId, 'minimax', 'image')
}

/**
 * 获取 Vidu API Key
 */
export async function getViduApiKey(userId: string): Promise<string> {
    return getProviderApiKey(userId, 'vidu', 'video')
}


/**
 * 获取 Flow2API 配置（baseUrl + apiKey）
 * Flow2API 是用户自己部署的服务，需要同时获取地址和密钥
 */
export async function getFlow2ApiConfig(userId: string): Promise<{ baseUrl: string; apiKey: string }> {
    const pref = await prisma.userPreference.findUnique({
        where: { userId },
        select: { customProviders: true } as any
    })

    if ((pref as any)?.customProviders) {
        try {
            const providers: CustomProvider[] = JSON.parse((pref as any).customProviders)
            const provider = providers.find(p => p.id === 'flow2api' && p.type === 'image')
            if (provider?.apiKey && provider?.baseUrl) {
                return {
                    baseUrl: provider.baseUrl,
                    apiKey: decryptApiKey(provider.apiKey)
                }
            }
        } catch { }
    }

    throw new Error('请配置 Flow2API 的地址和 API Key')
}

/**
 * 获取 Gemini 兼容层配置（baseUrl + apiKey）
 * 用于支持 GRSAI/Nano Banana 等 Gemini API 兼容服务
 */
export async function getGeminiCompatibleConfig(userId: string): Promise<{ baseUrl: string; apiKey: string }> {
    const pref = await prisma.userPreference.findUnique({
        where: { userId },
        select: { customProviders: true } as any
    })

    if ((pref as any)?.customProviders) {
        try {
            const providers: CustomProvider[] = JSON.parse((pref as any).customProviders)
            const provider = providers.find(p => p.id === 'gemini-compatible' && p.type === 'image')
            if (provider?.apiKey && provider?.baseUrl) {
                return {
                    baseUrl: provider.baseUrl,
                    apiKey: decryptApiKey(provider.apiKey)
                }
            }
        } catch { }
    }

    throw new Error('请配置 Gemini 兼容服务的地址和 API Key')
}

/**
 * 根据模型 ID 自动选择对应的 API Key
 */
export async function getImageApiKey(userId: string, modelId: string): Promise<string> {
    // 火山引擎模型
    if (modelId.includes('seedream') || modelId.includes('doubao')) {
        return getArkApiKey(userId)
    }

    // Google AI 模型
    if (modelId.includes('gemini') || modelId.includes('imagen')) {
        return getGoogleAiKey(userId)
    }

    // FAL 模型（默认）
    return getFalApiKey(userId)
}

/**
 * 根据模型 ID 自动选择对应的视频 API Key
 */
export async function getVideoApiKey(userId: string, modelId: string): Promise<string> {
    // 火山引擎模型
    if (modelId.includes('seedance') || modelId.includes('doubao')) {
        return getArkApiKey(userId)
    }

    // FAL 模型
    return getFalApiKey(userId)
}

// ============================================================
// 模型列表
// ============================================================

/**
 * 获取用户的自定义模型列表
 */
export async function getUserModels(userId: string): Promise<CustomModel[]> {
    const pref = await prisma.userPreference.findUnique({
        where: { userId },
        select: { customModels: true }
    })

    if (!pref?.customModels) {
        return []
    }

    try {
        return JSON.parse(pref.customModels)
    } catch {
        return []
    }
}

/**
 * 获取模型关联的 provider
 * 用于动态路由用户自定义模型
 */
export async function getModelProvider(userId: string, modelId: string): Promise<string | null> {
    const models = await getUserModels(userId)
    const model = models.find(m => m.modelId === modelId)
    return model?.provider || null
}

/**
 * 获取指定类型的模型列表
 */
export async function getModelsByType(userId: string, type: 'llm' | 'image' | 'video'): Promise<CustomModel[]> {
    const models = await getUserModels(userId)
    return models.filter(m => m.type === type)
}

/**
 * 解析模型 ID - 直接返回输入的 modelId
 */
export async function resolveModelId(userId: string, modelId: string): Promise<string> {
    return modelId
}

/**
 * 获取模型价格
 */
export async function getModelPrice(userId: string, modelId: string): Promise<number> {
    const models = await getUserModels(userId)
    const model = models.find(m => m.modelId === modelId)
    return model?.price || 0
}

/**
 * 获取图片模型分辨率
 * 从模型配置中读取分辨率（每个模型独立的配置）
 */
export async function getModelResolution(userId: string, modelId: string): Promise<'2K' | '4K'> {
    // 查询用户的模型配置
    const pref = await prisma.userPreference.findUnique({
        where: { userId },
        select: { customModels: true } as any
    })

    // 从模型列表读取分辨率
    if (pref?.customModels) {
        try {
            const models: CustomModel[] = JSON.parse(pref.customModels)
            const model = models.find(m => m.modelId === modelId)
            if (model?.resolution) {
                return model.resolution
            }
        } catch { }
    }

    // 默认 2K
    return '2K'
}

/**
 * 检查用户是否已配置 API
 */
export async function hasApiConfig(userId: string): Promise<boolean> {
    const pref = await prisma.userPreference.findUnique({
        where: { userId },
        select: { llmApiKey: true }
    })

    return !!pref?.llmApiKey
}
