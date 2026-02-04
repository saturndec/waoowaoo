/**
 * API 配置类型定义和预设常量
 */

// 统一提供商接口
export interface Provider {
    id: string
    name: string
    type: 'llm' | 'image' | 'video' | 'audio' | 'lipsync'
    baseUrl?: string
    apiKey?: string
    hasApiKey?: boolean
}

// 模型接口
export interface CustomModel {
    modelId: string       // 唯一标识符（如 anthropic/claude-sonnet-4.5）
    name: string          // 显示名称
    type: 'llm' | 'image' | 'video'
    provider: string
    price: number
    enabled: boolean
    resolution?: '2K' | '4K'  // 图片模型分辨率配置
}

// API 配置响应
export interface ApiConfig {
    models: CustomModel[]
    providers: Provider[]
}

// 预设模型
export const PRESET_MODELS: Omit<CustomModel, 'enabled'>[] = [
    // 文本模型
    { modelId: 'google/gemini-3-pro-preview', name: 'Gemini 3 Pro', type: 'llm', provider: 'openrouter', price: 10.00 },
    { modelId: 'google/gemini-3-flash-preview', name: 'Gemini 3 Flash', type: 'llm', provider: 'openrouter', price: 0.30 },
    { modelId: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5', type: 'llm', provider: 'openrouter', price: 15.00 },
    { modelId: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', type: 'llm', provider: 'openrouter', price: 15.00 },

    // 图像模型
    { modelId: 'banana', name: 'Banana Pro', type: 'image', provider: 'fal', price: 0.96, resolution: '2K' },
    { modelId: 'doubao-seedream-4-5-251128', name: 'Seedream 4.5', type: 'image', provider: 'ark', price: 0.25, resolution: '4K' },
    { modelId: 'doubao-seedream-4-0-250828', name: 'Seedream 4.0', type: 'image', provider: 'ark', price: 0.20, resolution: '4K' },
    { modelId: 'gemini-3-pro-image-preview', name: 'Banana Pro', type: 'image', provider: 'google', price: 0.96, resolution: '4K' },
    { modelId: 'gemini-3-pro-image-preview-batch', name: 'Banana Pro (Batch)', type: 'image', provider: 'google', price: 0.48, resolution: '4K' },
    { modelId: 'imagen-4.0-generate-001', name: 'Imagen 4', type: 'image', provider: 'google', price: 0.29, resolution: '4K' },
    { modelId: 'imagen-4.0-fast-generate-001', name: 'Imagen 4 Fast', type: 'image', provider: 'google', price: 0.14, resolution: '4K' },
    // Flow2API (用户自建服务，暂时隐藏)
    // { modelId: 'gemini-3.0-pro-image-portrait', name: 'Gemini 3.0 Pro (竖屏)', type: 'image', provider: 'flow2api', price: 0 },

    // 视频模型
    { modelId: 'doubao-seedance-1-0-pro-fast-251015', name: 'Seedance ProFast', type: 'video', provider: 'ark', price: 0.75 },
    { modelId: 'doubao-seedance-1-5-pro-251215', name: 'Seedance 1.5 Pro', type: 'video', provider: 'ark', price: 4.0 },
    { modelId: 'doubao-seedance-1-0-pro-250528', name: 'Seedance Pro', type: 'video', provider: 'ark', price: 4.0 },
    { modelId: 'fal-wan25', name: 'Wan 2.6', type: 'video', provider: 'fal', price: 1.8 },
    { modelId: 'fal-veo31', name: 'Veo 3.1', type: 'video', provider: 'fal', price: 2.88 },
    { modelId: 'fal-sora2', name: 'Sora 2', type: 'video', provider: 'fal', price: 3.6 },
    { modelId: 'fal-kling25', name: 'Kling 2.6', type: 'video', provider: 'fal', price: 2.16 },

    // MiniMax 视频模型
    { modelId: 'minimax-hailuo-2.3', name: 'Hailuo 2.3', type: 'video', provider: 'minimax', price: 1.0 },
    { modelId: 'minimax-hailuo-2.3-fast', name: 'Hailuo 2.3 Fast', type: 'video', provider: 'minimax', price: 0.7 },
    { modelId: 'minimax-hailuo-02', name: 'Hailuo 02', type: 'video', provider: 'minimax', price: 0.5 },
    { modelId: 't2v-01', name: 'T2V-01', type: 'video', provider: 'minimax', price: 0.5 },
    { modelId: 't2v-01-director', name: 'T2V-01 Director', type: 'video', provider: 'minimax', price: 1.0 },

    // MiniMax 图像模型
    { modelId: 'image-01', name: 'MiniMax Image-01', type: 'image', provider: 'minimax', price: 0.2, resolution: '2K' },
    { modelId: 'image-01-live', name: 'MiniMax Image-01 Live', type: 'image', provider: 'minimax', price: 0.3, resolution: '2K' },

    // Vidu 视频模型 (价格 = 积分消耗/秒 × 5秒 × 0.03125)
    { modelId: 'viduq3-pro', name: 'Vidu Q3 Pro (1080p)', type: 'video', provider: 'vidu', price: 5.0 },
    { modelId: 'viduq2-pro-fast', name: 'Vidu Q2 Pro Fast', type: 'video', provider: 'vidu', price: 1.25 },
    { modelId: 'viduq2-pro', name: 'Vidu Q2 Pro', type: 'video', provider: 'vidu', price: 2.34 },
    { modelId: 'viduq2-turbo', name: 'Vidu Q2 Turbo', type: 'video', provider: 'vidu', price: 1.25 },
    { modelId: 'viduq2', name: 'Vidu Q2', type: 'video', provider: 'vidu', price: 1.09 },
    { modelId: 'viduq1', name: 'Vidu Q1', type: 'video', provider: 'vidu', price: 2.5 },
    { modelId: 'viduq1-classic', name: 'Vidu Q1 Classic', type: 'video', provider: 'vidu', price: 2.5 },
    { modelId: 'vidu2.0', name: 'Vidu 2.0', type: 'video', provider: 'vidu', price: 0.625 },
]

// 预设提供商（所有类型）
export const PRESET_PROVIDERS: Omit<Provider, 'apiKey' | 'hasApiKey'>[] = [
    // LLM
    { id: 'openrouter', name: 'OpenRouter', type: 'llm', baseUrl: 'https://openrouter.ai/api/v1' },
    { id: 'deepseek', name: 'DeepSeek', type: 'llm', baseUrl: 'https://api.deepseek.com/v1' },
    { id: 'groq', name: 'Groq', type: 'llm', baseUrl: 'https://api.groq.com/openai/v1' },
    { id: 'together', name: 'Together AI', type: 'llm', baseUrl: 'https://api.together.xyz/v1' },
    { id: 'siliconflow', name: '硅基流动', type: 'llm', baseUrl: 'https://api.siliconflow.cn/v1' },
    // 图片/视频
    { id: 'fal', name: 'FAL', type: 'image' },
    { id: 'google', name: 'Google AI Studio', type: 'image' },
    { id: 'ark', name: '火山引擎(方舟)', type: 'image' },
    { id: 'flow2api', name: 'Flow2API (自建)', type: 'image', baseUrl: 'http://localhost:8000' },
    // MiniMax
    { id: 'minimax', name: 'MiniMax (海螺)', type: 'image' },
    // Vidu
    { id: 'vidu', name: 'Vidu (生数科技)', type: 'video' },
    // Gemini 兼容层
    { id: 'gemini-compatible', name: 'Gemini 兼容层', type: 'image' },
    // 唇形同步
    { id: 'fal-lipsync', name: 'FAL (Kling LipSync)', type: 'lipsync' },
    // 语音
    { id: 'qwen', name: '通义千问', type: 'audio' },
]

/**
 * 获取厂商的友好显示名称
 * @param providerId - 厂商ID（如 'ark', 'google'）
 * @returns 友好名称（如 '火山引擎(方舟)', 'Google AI Studio'）
 */
export function getProviderDisplayName(providerId?: string): string {
    if (!providerId) return ''
    const provider = PRESET_PROVIDERS.find(p => p.id === providerId)
    return provider?.name || providerId
}

// 教程步骤接口
export interface TutorialStep {
    text: string           // 步骤描述 (i18n key)
    url?: string           // 可选的链接地址
}

// 厂商教程接口
export interface ProviderTutorial {
    providerId: string
    steps: TutorialStep[]
}

// 厂商开通教程配置
// 注意: text 字段使用 i18n key, 翻译在 apiConfig.tutorials 下
export const PROVIDER_TUTORIALS: ProviderTutorial[] = [
    {
        providerId: 'ark',
        steps: [
            {
                text: 'ark_step1',
                url: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey?apikey=%7B%7D'
            },
            {
                text: 'ark_step2',
                url: 'https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement?LLM=%7B%7D&advancedActiveKey=model'
            }
        ]
    },
    {
        providerId: 'openrouter',
        steps: [
            {
                text: 'openrouter_step1',
                url: 'https://openrouter.ai/settings/keys'
            }
        ]
    },
    {
        providerId: 'fal',
        steps: [
            {
                text: 'fal_step1',
                url: 'https://fal.ai/dashboard/keys'
            }
        ]
    },
    {
        providerId: 'google',
        steps: [
            {
                text: 'google_step1',
                url: 'https://aistudio.google.com/api-keys'
            }
        ]
    },
    {
        providerId: 'minimax',
        steps: [
            {
                text: 'minimax_step1',
                url: 'https://platform.minimaxi.com/user-center/basic-information/interface-key'
            }
        ]
    },
    {
        providerId: 'vidu',
        steps: [
            {
                text: 'vidu_step1',
                url: 'https://platform.vidu.cn/api-keys'
            }
        ]
    },
    {
        providerId: 'gemini-compatible',
        steps: [
            {
                text: 'grsai_step1'
            }
        ]
    },
    {
        providerId: 'qwen',
        steps: [
            {
                text: 'qwen_step1',
                url: 'https://bailian.console.aliyun.com/cn-beijing/?tab=model#/api-key'
            }
        ]
    },
    {
        providerId: 'fal-lipsync',
        steps: [
            {
                text: 'fal_step1',
                url: 'https://fal.ai/dashboard/keys'
            }
        ]
    }
]

/**
 * 根据厂商ID获取教程配置
 * @param providerId - 厂商ID
 * @returns 教程配置，如果不存在则返回 undefined
 */
export function getProviderTutorial(providerId: string): ProviderTutorial | undefined {
    return PROVIDER_TUTORIALS.find(t => t.providerId === providerId)
}
