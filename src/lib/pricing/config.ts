/**
 * 💰 HuanAI 价格配置中心
 * 
 * ⚠️ 所有价格调整只需修改此文件顶部配置
 * ⚠️ 下方计算逻辑无需改动
 */

// ============================================================
// 📌 基础配置
// ============================================================

export const USD_TO_CNY = 7.2

// ============================================================
// 📌 加价倍率（用户价格 = 成本 × 倍率）
// ============================================================

export const MARKUP = {
    global: 1.0,        // 🔧 全局默认（1.0 = 原价）
    text: 1.0,          // 🔧 LLM 分析
    image: 1.0,         // 🔧 图片生成
    video: 1.0,         // 🔧 视频生成
    tts: 1.0,           // 🔧 Azure TTS
    voice: 1.0,         // 🔧 配音（IndexTTS2）
    voiceDesign: 1.0,   // 🔧 声音设计（Qwen）
    lipSync: 1.0,       // 🔧 口型同步（Kling）
} as const

export type MarkupCategory = keyof typeof MARKUP

// ============================================================
// 📌 LLM 成本价（USD / 百万 token）
// ============================================================

export const TEXT_COST: Record<string, { input: number; output: number }> = {
    // Anthropic Claude
    'anthropic/claude-sonnet-4.5': { input: 3.00, output: 15.00 },
    'anthropic/claude-sonnet-4': { input: 3.00, output: 15.00 },
    // Google Gemini
    'google/gemini-3-pro-preview': { input: 1.25, output: 10.00 },
    'google/gemini-3-flash-preview': { input: 0.075, output: 0.30 },
}

// ============================================================
// 📌 图片成本价（CNY / 张）
// ============================================================

export const IMAGE_COST: Record<string, number> = {
    // 火山引擎 SeeDream
    'seedream': 0.25,
    'seedream4': 0.20,
    'doubao-seedream-4-5-251128': 0.25,
    'doubao-seedream-4-0-250828': 0.20,
    // FAL Banana
    'banana': 0.134 * USD_TO_CNY,  // ~¥0.96
    'banana-2k': 0.134 * USD_TO_CNY,
    'banana-4k': 0.24 * USD_TO_CNY,   // ~¥1.73
    // Google Gemini
    'gemini-3-pro-image-preview': 0.134 * USD_TO_CNY,
    'gemini-3-pro-image-preview-batch': 0.067 * USD_TO_CNY,  // ~¥0.48
    // Google Imagen 4
    'imagen-4.0-generate-001': 0.04 * USD_TO_CNY,        // $0.04/张 → ~¥0.29
    'imagen-4.0-ultra-generate-001': 0.08 * USD_TO_CNY,  // $0.08/张 → ~¥0.58
    'imagen-4.0-fast-generate-001': 0.02 * USD_TO_CNY,   // $0.02/张 → ~¥0.14
}

// ============================================================
// 📌 视频成本价（CNY / 条）
// ============================================================

export const VIDEO_COST: Record<string, number | { '720p': number; '1080p': number }> = {
    // ProFast 按分辨率计费
    'doubao-seedance-1-0-pro-fast-251015': { '720p': 0.5, '1080p': 1.0 },
    'doubao-seedance-1-0-pro-fast-251015-batch': { '720p': 0.25, '1080p': 0.5 },  // 批量模式 50% off
    // 其他模型统一价格
    'doubao-seedance-1-5-pro-251215': 4.0,
    'doubao-seedance-1-5-pro-251215-batch': 2.0,  // 批量模式 50% off
    'doubao-seedance-1-0-pro-250528': 4.0,
    'doubao-seedance-1-0-pro-250528-batch': 2.0,  // 批量模式 50% off
    // FAL 视频（按 5 秒计算）
    'fal-wan25': 5 * 0.05 * USD_TO_CNY,   // ~¥1.8
    'fal-veo31': 5 * 0.08 * USD_TO_CNY,   // ~¥2.88
    'fal-sora2': 5 * 0.10 * USD_TO_CNY,   // ~¥3.6
    'fal-kling25': 5 * 0.06 * USD_TO_CNY,   // ~¥2.16
}

// ============================================================
// 📌 TTS 成本价（CNY / 百万字符）
// ============================================================

export const TTS_COST: Record<string, number> = {
    'azure': 16 * USD_TO_CNY,  // ~¥115.2
}

// ============================================================
// 📌 配音成本价 - IndexTTS2（CNY / 秒）
// ============================================================

export const VOICE_COST = {
    perSecond: 0.002 * USD_TO_CNY,  // $0.002/秒 → ~¥0.0144/秒
}

// ============================================================
// 📌 声音设计成本价 - Qwen（CNY / 次）
// ============================================================

export const VOICE_DESIGN_COST = 0.2

// ============================================================
// 📌 口型同步成本价 - Kling（CNY / 次）
// ============================================================

export const LIP_SYNC_COST = 0.5

// ============================================================
// 📌 API 类型定义
// ============================================================

export type ApiType = 'text' | 'image' | 'video' | 'tts' | 'voice' | 'voice-design' | 'lip-sync'

export type UsageUnit = 'token' | 'image' | 'video' | 'character' | 'second' | 'call'
