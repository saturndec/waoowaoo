import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'
/**
 * MiniMax (海螺) 视频生成器
 * 
 * 支持模型：
 * 视频：MiniMax-Hailuo-2.3, MiniMax-Hailuo-2.3-Fast, MiniMax-Hailuo-02, T2V-01, T2V-01-Director
 */

import { BaseVideoGenerator, VideoGenerateParams, GenerateResult } from './base'
import { getProviderConfig } from '@/lib/api-config'
import { normalizeToBase64ForGeneration } from '@/lib/media/outbound-image'

const MINIMAX_BASE_URL = 'https://api.minimaxi.com/v1'
type MinimaxVideoGenerationMode = 'normal' | 'firstlastframe'
type MinimaxResolution = '512P' | '720P' | '768P' | '1080P'

interface MinimaxVideoOptions {
    modelId?: string
    duration?: number
    resolution?: string
    generationMode?: MinimaxVideoGenerationMode
    generateAudio?: boolean
    lastFrameImageUrl?: string
}

interface MinimaxResolutionDurationRule {
    resolution: MinimaxResolution
    durations: readonly number[]
}

interface MinimaxVideoModelSpec {
    apiModel: string
    supportsImageInput: boolean
    supportsFirstLastFrame: boolean
    normalRules: readonly MinimaxResolutionDurationRule[]
    firstLastFrameRules?: readonly MinimaxResolutionDurationRule[]
}

const MINIMAX_VIDEO_MODEL_SPECS: Record<string, MinimaxVideoModelSpec> = {
    'minimax-hailuo-2.3': {
        apiModel: 'MiniMax-Hailuo-2.3',
        supportsImageInput: true,
        supportsFirstLastFrame: false,
        normalRules: [
            { resolution: '768P', durations: [6, 10] },
            { resolution: '1080P', durations: [6] },
        ],
    },
    'minimax-hailuo-2.3-fast': {
        apiModel: 'MiniMax-Hailuo-2.3-Fast',
        supportsImageInput: true,
        supportsFirstLastFrame: false,
        normalRules: [
            { resolution: '768P', durations: [6, 10] },
            { resolution: '1080P', durations: [6] },
        ],
    },
    'minimax-hailuo-02': {
        apiModel: 'MiniMax-Hailuo-02',
        supportsImageInput: true,
        supportsFirstLastFrame: true,
        normalRules: [
            { resolution: '512P', durations: [6, 10] },
            { resolution: '768P', durations: [6, 10] },
            { resolution: '1080P', durations: [6] },
        ],
        firstLastFrameRules: [
            { resolution: '768P', durations: [6, 10] },
            { resolution: '1080P', durations: [6] },
        ],
    },
    't2v-01': {
        apiModel: 'T2V-01',
        supportsImageInput: false,
        supportsFirstLastFrame: false,
        normalRules: [
            { resolution: '720P', durations: [6] },
        ],
    },
    't2v-01-director': {
        apiModel: 'T2V-01-Director',
        supportsImageInput: false,
        supportsFirstLastFrame: false,
        normalRules: [
            { resolution: '720P', durations: [6] },
        ],
    },
    's2v-01': {
        apiModel: 'S2V-01',
        supportsImageInput: true,
        supportsFirstLastFrame: false,
        normalRules: [
            { resolution: '1080P', durations: [6] },
        ],
    },
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0
}

function getVideoModelSpec(modelId: string): MinimaxVideoModelSpec {
    const spec = MINIMAX_VIDEO_MODEL_SPECS[modelId]
    if (!spec) {
        throw new Error(`MINIMAX_VIDEO_OPTION_VALUE_UNSUPPORTED: modelId=${modelId}`)
    }
    return spec
}

function normalizeGenerationMode(raw: unknown): MinimaxVideoGenerationMode {
    if (raw === undefined || raw === null || raw === '') return 'normal'
    if (raw === 'normal' || raw === 'firstlastframe') return raw
    throw new Error(`MINIMAX_VIDEO_OPTION_VALUE_UNSUPPORTED: generationMode=${String(raw)}`)
}

function normalizeResolution(raw: string): MinimaxResolution {
    const normalized = raw.trim().toLowerCase()
    if (normalized.includes('512')) return '512P'
    if (normalized.includes('768')) return '768P'
    if (normalized.includes('720')) return '720P'
    if (normalized.includes('1080')) return '1080P'
    throw new Error(`MINIMAX_VIDEO_OPTION_VALUE_UNSUPPORTED: resolution=${raw}`)
}

function pickRulesByMode(
    modelId: string,
    spec: MinimaxVideoModelSpec,
    mode: MinimaxVideoGenerationMode,
): readonly MinimaxResolutionDurationRule[] {
    if (mode === 'normal') return spec.normalRules
    if (!spec.supportsFirstLastFrame) {
        throw new Error(`MINIMAX_VIDEO_OPTION_UNSUPPORTED: generationMode=${mode} for ${modelId}`)
    }
    return spec.firstLastFrameRules || []
}

function validateResolutionAndDuration(input: {
    modelId: string
    rules: readonly MinimaxResolutionDurationRule[]
    resolution?: MinimaxResolution
    duration?: number
}) {
    const { modelId, rules, resolution, duration } = input
    if (rules.length === 0) {
        throw new Error(`MINIMAX_VIDEO_OPTION_UNSUPPORTED: no rules for ${modelId}`)
    }

    if (resolution) {
        const matchedResolutionRule = rules.find((rule) => rule.resolution === resolution)
        if (!matchedResolutionRule) {
            throw new Error(`MINIMAX_VIDEO_OPTION_VALUE_UNSUPPORTED: resolution=${resolution} for ${modelId}`)
        }
        if (typeof duration === 'number' && !matchedResolutionRule.durations.includes(duration)) {
            throw new Error(
                `MINIMAX_VIDEO_OPTION_VALUE_UNSUPPORTED: duration=${duration} for resolution=${resolution} in ${modelId}`,
            )
        }
        return
    }

    if (typeof duration !== 'number') return

    const supportsDuration = rules.some((rule) => rule.durations.includes(duration))
    if (!supportsDuration) {
        throw new Error(`MINIMAX_VIDEO_OPTION_VALUE_UNSUPPORTED: duration=${duration} for ${modelId}`)
    }
}

// ==================== 视频生成器 ====================

export class MinimaxVideoGenerator extends BaseVideoGenerator {
    protected async doGenerate(params: VideoGenerateParams): Promise<GenerateResult> {
        const { userId, imageUrl, prompt = '', options = {} } = params

        const { apiKey } = await getProviderConfig(userId, 'minimax')
        const {
            modelId,
            duration,
            resolution,
            generationMode: rawGenerationMode,
            generateAudio,
            lastFrameImageUrl,
        } = options as MinimaxVideoOptions
        if (!modelId) {
            throw new Error('MINIMAX_VIDEO_OPTION_REQUIRED: modelId')
        }
        const modelSpec = getVideoModelSpec(modelId)
        const inferredGenerationMode: MinimaxVideoGenerationMode = isNonEmptyString(lastFrameImageUrl)
            ? 'firstlastframe'
            : 'normal'
        const generationMode = rawGenerationMode === undefined
            ? inferredGenerationMode
            : normalizeGenerationMode(rawGenerationMode)
        if (rawGenerationMode !== undefined && generationMode !== inferredGenerationMode) {
            throw new Error(`MINIMAX_VIDEO_OPTION_VALUE_UNSUPPORTED: generationMode=${String(rawGenerationMode)}`)
        }
        const resolvedRules = pickRulesByMode(modelId, modelSpec, generationMode)
        const normalizedResolution = resolution ? normalizeResolution(resolution) : undefined
        const hasFirstFrameImage = isNonEmptyString(imageUrl)
        validateResolutionAndDuration({
            modelId,
            rules: resolvedRules,
            resolution: normalizedResolution,
            duration,
        })

        if (generateAudio === true) {
            throw new Error(`MINIMAX_VIDEO_OPTION_UNSUPPORTED: generateAudio for ${modelId}`)
        }
        if (generateAudio !== undefined && typeof generateAudio !== 'boolean') {
            throw new Error(`MINIMAX_VIDEO_OPTION_VALUE_UNSUPPORTED: generateAudio=${String(generateAudio)}`)
        }
        if (generationMode === 'firstlastframe' && !isNonEmptyString(lastFrameImageUrl)) {
            throw new Error('MINIMAX_VIDEO_OPTION_REQUIRED: lastFrameImageUrl')
        }
        if (generationMode === 'normal' && lastFrameImageUrl !== undefined) {
            throw new Error('MINIMAX_VIDEO_OPTION_UNSUPPORTED: lastFrameImageUrl for normal mode')
        }
        if (generationMode === 'firstlastframe' && !hasFirstFrameImage) {
            throw new Error('MINIMAX_VIDEO_OPTION_REQUIRED: firstFrameImage')
        }
        if (
            modelId === 'minimax-hailuo-02'
            && generationMode === 'normal'
            && normalizedResolution === '512P'
            && !hasFirstFrameImage
        ) {
            throw new Error('MINIMAX_VIDEO_OPTION_REQUIRED: firstFrameImage for resolution=512P')
        }
        if (modelId === 's2v-01' && !hasFirstFrameImage) {
            throw new Error('MINIMAX_VIDEO_OPTION_REQUIRED: imageUrl (required for S2V-01)')
        }

        // aspectRatio 由 worker 层统一注入（来自项目 videoRatio），
        // MiniMax 不使用此参数（通过 resolution 控制输出规格），在白名单内静默忽略。
        const allowedOptionKeys = new Set([
            'provider',
            'modelId',
            'modelKey',
            'duration',
            'resolution',
            'generationMode',
            'generateAudio',
            'lastFrameImageUrl',
            'aspectRatio',  // 接受但不传给 API，避免 worker 层统一注入时报错
        ])
        for (const [key, value] of Object.entries(options)) {
            if (value === undefined) continue
            if (!allowedOptionKeys.has(key)) {
                throw new Error(`MINIMAX_VIDEO_OPTION_UNSUPPORTED: ${key}`)
            }
        }

        const logPrefix = `[MiniMax Video ${modelId}]`

        const requestBody: Record<string, unknown> = {
            model: modelSpec.apiModel,
            prompt: prompt,
            prompt_optimizer: true
        }
        if (typeof duration === 'number') {
            requestBody.duration = duration
        }
        if (normalizedResolution) {
            requestBody.resolution = normalizedResolution
        }

        if (modelSpec.supportsImageInput && hasFirstFrameImage) {
            const firstFrameDataUrl = imageUrl.startsWith('data:') ? imageUrl : await normalizeToBase64ForGeneration(imageUrl)
            requestBody.first_frame_image = firstFrameDataUrl
            if (generationMode === 'firstlastframe' && isNonEmptyString(lastFrameImageUrl)) {
                const lastFrameDataUrl = lastFrameImageUrl.startsWith('data:')
                    ? lastFrameImageUrl
                    : await normalizeToBase64ForGeneration(lastFrameImageUrl)
                requestBody.last_frame_image = lastFrameDataUrl
                _ulogInfo(`${logPrefix} 使用首尾帧图片 (已转Data URL)`)
            } else {
                _ulogInfo(`${logPrefix} 使用首帧图片 (已转Data URL)`)
            }
        }

        _ulogInfo(
            `${logPrefix} 提交任务，mode=${generationMode}，duration=${duration ?? '(provider default)'}s，resolution=${normalizedResolution ?? '(provider default)'}`,
        )

        try {
            const response = await fetch(`${MINIMAX_BASE_URL}/video_generation`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            })

            if (!response.ok) {
                const errorText = await response.text()
                _ulogError(`${logPrefix} API请求失败:`, response.status, errorText)
                throw new Error(`MiniMax API Error: ${response.status} - ${errorText}`)
            }

            const data = await response.json()

            // 检查响应
            if (data.base_resp?.status_code !== 0) {
                const errMsg = data.base_resp?.status_msg || '未知错误'
                _ulogError(`${logPrefix} 任务提交失败:`, errMsg)
                throw new Error(`MiniMax: ${errMsg}`)
            }

            const taskId = data.task_id
            if (!taskId) {
                _ulogError(`${logPrefix} 响应中缺少 task_id:`, data)
                throw new Error('MiniMax未返回task_id')
            }

            _ulogInfo(`${logPrefix} 任务已提交，task_id=${taskId}`)

            return {
                success: true,
                async: true,
                requestId: taskId,
                externalId: `MINIMAX:VIDEO:${taskId}`
            }
        } catch (error: unknown) {
            _ulogError(`${logPrefix} 生成失败:`, error)
            throw error
        }
    }
}
