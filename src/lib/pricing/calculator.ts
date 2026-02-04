/**
 * 🧮 费用计算函数
 * 
 * 所有计算自动应用加价倍率
 */

import {
    MARKUP, MarkupCategory, USD_TO_CNY,
    TEXT_COST, IMAGE_COST, VIDEO_COST, TTS_COST,
    VOICE_COST, VOICE_DESIGN_COST, LIP_SYNC_COST
} from './config'

// 获取加价倍率
function getMarkup(category: MarkupCategory): number {
    return MARKUP[category] ?? MARKUP.global
}

// ============================================================
// LLM 文本分析费用
// ============================================================

export function calcText(model: string, inputTokens: number, outputTokens: number): number {
    const cost = TEXT_COST[model]
    if (!cost) {
        // 默认使用 Claude Sonnet 4 的价格
        const defaultCost = TEXT_COST['anthropic/claude-sonnet-4']
        const rawCost = ((inputTokens / 1_000_000) * defaultCost.input + (outputTokens / 1_000_000) * defaultCost.output) * USD_TO_CNY
        return rawCost * getMarkup('text')
    }
    const rawCost = ((inputTokens / 1_000_000) * cost.input + (outputTokens / 1_000_000) * cost.output) * USD_TO_CNY
    return rawCost * getMarkup('text')
}

// ============================================================
// 图片生成费用
// ============================================================

export function calcImage(model: string, count: number = 1): number {
    const cost = IMAGE_COST[model] ?? IMAGE_COST['seedream']
    return cost * count * getMarkup('image')
}

// ============================================================
// 视频生成费用
// ============================================================

export function calcVideo(model: string, resolution: string = '720p', count: number = 1): number {
    const costConfig = VIDEO_COST[model]

    if (!costConfig) {
        // 默认 4 元/条
        return 4.0 * count * getMarkup('video')
    }

    const cost = typeof costConfig === 'number'
        ? costConfig
        : costConfig[resolution as '720p' | '1080p'] ?? costConfig['720p']

    return cost * count * getMarkup('video')
}

// ============================================================
// Azure TTS 费用
// ============================================================

export function calcTTS(characters: number): number {
    const cost = (characters / 1_000_000) * TTS_COST['azure']
    return cost * getMarkup('tts')
}

// ============================================================
// IndexTTS2 配音费用（按秒）
// ============================================================

export function calcVoice(durationSeconds: number): number {
    const cost = VOICE_COST.perSecond * durationSeconds
    return cost * getMarkup('voice')
}

// ============================================================
// Qwen 声音设计费用（固定）
// ============================================================

export function calcVoiceDesign(): number {
    return VOICE_DESIGN_COST * getMarkup('voiceDesign')
}

// ============================================================
// Kling 口型同步费用（固定）
// ============================================================

export function calcLipSync(): number {
    return LIP_SYNC_COST * getMarkup('lipSync')
}
