 import { logInfo as _ulogInfo, logWarn as _ulogWarn, logError as _ulogError } from '@/lib/logging/core'
/**
 * 分镜生成多阶段处理器
 * 将分镜生成拆分为3个独立阶段，每阶段控制在Vercel时间限制内
 * 
 * 每个阶段失败后重试一次
 */

import { executeAiTextStep } from '@/lib/ai-runtime'
import { logAIAnalysis } from '@/lib/logging/semantic'
import { buildCharactersIntroduction } from '@/lib/constants'
import type { Locale } from '@/i18n/routing'
import { getPromptTemplate, PROMPT_IDS } from '@/lib/prompt-i18n'

// 阶段类型
export type StoryboardPhase = 1 | '2-cinematography' | '2-acting' | 3

type JsonRecord = Record<string, unknown>

export type ClipCharacterRef = string | { name?: string | null }

type CharacterAppearance = {
    changeReason?: string | null
    descriptions?: string | null
    selectedIndex?: number | null
    description?: string | null
}

export type CharacterAsset = {
    name: string
    appearances?: CharacterAppearance[]
}

export type LocationAsset = {
    name: string
    images?: Array<{
        isSelected?: boolean
        description?: string | null
    }>
}

type ClipAsset = {
    id?: string
    start?: string | number | null
    end?: string | number | null
    startText?: string | null
    endText?: string | null
    characters?: string | null
    location?: string | null
    content?: string | null
    screenplay?: string | null
}

type SessionAsset = {
    user: {
        id: string
        name: string
    }
}

type NovelPromotionAssetData = {
    analysisModel: string
    characters: CharacterAsset[]
    locations: LocationAsset[]
}

export type StoryboardPanel = JsonRecord & {
    panel_number?: number
    description?: string
    location?: string
    source_text?: string
    characters?: unknown
    srt_range?: unknown[]
    scene_type?: string
    shot_type?: string
    camera_move?: string
    video_prompt?: string
    duration?: number
    photographyPlan?: JsonRecord
    actingNotes?: unknown
}

export type PhotographyRule = JsonRecord & {
    panel_number?: number
    composition?: string
    lighting?: string
    color_palette?: string
    atmosphere?: string
    technical_notes?: string
}

export type ActingDirection = JsonRecord & {
    panel_number?: number
    characters?: unknown
}

function isJsonRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null
}

function parseClipCharacters(raw: string | null | undefined): ClipCharacterRef[] {
    if (!raw) return []
    try {
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? (parsed as ClipCharacterRef[]) : []
    } catch {
        return []
    }
}

function parseScreenplay(raw: string | null | undefined): unknown {
    if (!raw) return null
    try {
        return JSON.parse(raw)
    } catch {
        return null
    }
}

function parseDescriptions(raw: string | null | undefined): string[] {
    if (!raw) return []
    try {
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        return parsed.filter((item): item is string => typeof item === 'string')
    } catch {
        return []
    }
}

// 阶段进度映射
export const PHASE_PROGRESS: Record<string, { start: number, end: number, label: string, labelKey: string }> = {
    '1': { start: 10, end: 40, label: '规划分镜', labelKey: 'phases.planning' },
    '2-cinematography': { start: 40, end: 55, label: '设计摄影', labelKey: 'phases.cinematography' },
    '2-acting': { start: 55, end: 70, label: '设计演技', labelKey: 'phases.acting' },
    '3': { start: 70, end: 100, label: '补充细节', labelKey: 'phases.detail' }
}

// 中间结果存储接口
export interface PhaseResult {
    clipId: string
    planPanels?: StoryboardPanel[]
    photographyRules?: PhotographyRule[]
    actingDirections?: ActingDirection[]  // 演技指导数据
    finalPanels?: StoryboardPanel[]
}

// ========== 辅助函数 ==========

// 🔥 辅助函数：从 clipCharacters 提取角色名（支持混合格式）
function extractCharacterNames(clipCharacters: ClipCharacterRef[]): string[] {
    return clipCharacters.map(item => {
        if (typeof item === 'string') return item
        if (typeof item === 'object' && typeof item.name === 'string') return item.name
        return ''
    }).filter(Boolean)
}

/**
 * 按别名匹配检查角色名是否匹配引用名
 * 优先级：1. 精确全名  2. 按 '/' 拆分后别名精确匹配
 */
function characterNameMatches(characterName: string, referenceName: string): boolean {
    const charLower = characterName.toLowerCase().trim()
    const refLower = referenceName.toLowerCase().trim()
    if (charLower === refLower) return true
    const charAliases = charLower.split('/').map(s => s.trim()).filter(Boolean)
    const refAliases = refLower.split('/').map(s => s.trim()).filter(Boolean)
    return refAliases.some(refAlias => charAliases.includes(refAlias))
}

// 根据 clip.characters 筛选角色形象列表
export function getFilteredAppearanceList(characters: CharacterAsset[], clipCharacters: ClipCharacterRef[]): string {
    if (clipCharacters.length === 0) return '无'
    const charNames = extractCharacterNames(clipCharacters)
    return characters
        .filter((c) => charNames.some(name => characterNameMatches(c.name, name)))
        .map((c) => {
            const appearances = c.appearances || []
            if (appearances.length === 0) return `${c.name}: ["初始形象"]`
            const appearanceNames = appearances.map((app) => app.changeReason || '初始形象')
            return `${c.name}: [${appearanceNames.map((n: string) => `"${n}"`).join(', ')}]`
        }).join('\n') || '无'
}

// 根据 clip.characters 筛选角色完整描述
export function getFilteredFullDescription(characters: CharacterAsset[], clipCharacters: ClipCharacterRef[]): string {
    if (clipCharacters.length === 0) return '无'
    const charNames = extractCharacterNames(clipCharacters)
    return characters
        .filter((c) => charNames.some(name => characterNameMatches(c.name, name)))
        .map((c) => {
            const appearances = c.appearances || []
            if (appearances.length === 0) return `【${c.name}】无形象描述`

            return appearances.map((app) => {
                const appearanceName = app.changeReason || '初始形象'
                const descriptions = parseDescriptions(app.descriptions)
                const selectedIndex = typeof app.selectedIndex === 'number' ? app.selectedIndex : 0
                const finalDesc = descriptions[selectedIndex] || app.description || '无描述'
                return `【${c.name} - ${appearanceName}】${finalDesc}`
            }).join('\n')
        }).join('\n') || '无'
}

// 根据 clip.location 筛选场景描述
export function getFilteredLocationsDescription(locations: LocationAsset[], clipLocation: string | null): string {
    if (!clipLocation) return '无'
    const location = locations.find((l) => l.name.toLowerCase() === clipLocation.toLowerCase())
    if (!location) return '无'
    const selectedImage = location.images?.find((img) => img.isSelected) || location.images?.[0]
    return selectedImage?.description || '无描述'
}

// 格式化Clip标识（支持SRT模式和Agent模式）
export function formatClipId(clip: ClipAsset): string {
    // SRT 模式
    if (clip.start !== undefined && clip.start !== null) {
        return `${clip.start}-${clip.end}`
    }
    // Agent 模式
    if (clip.startText && clip.endText) {
        return `${clip.startText.substring(0, 10)}...~...${clip.endText.substring(0, 10)}`
    }
    // 回退
    return clip.id?.substring(0, 8) || 'unknown'
}

// 解析JSON响应
function parseJsonResponse<T extends JsonRecord>(responseText: string, clipId: string, phase: number): T[] {
    let jsonText = responseText.trim()
    jsonText = jsonText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '')

    const firstBracket = jsonText.indexOf('[')
    const lastBracket = jsonText.lastIndexOf(']')

    if (firstBracket === -1 || lastBracket === -1 || lastBracket <= firstBracket) {
        throw new Error(`Phase ${phase}: JSON格式错误 clip ${clipId}`)
    }

    jsonText = jsonText.substring(firstBracket, lastBracket + 1)
    const result = JSON.parse(jsonText)

    if (!Array.isArray(result) || result.length === 0) {
        throw new Error(`Phase ${phase}: 返回空数据 clip ${clipId}`)
    }

    const normalized = result.filter(isJsonRecord) as T[]
    if (normalized.length === 0) {
        throw new Error(`Phase ${phase}: 数据结构错误 clip ${clipId}`)
    }

    return normalized
}

// ========== Phase 1: 基础分镜规划 ==========
export async function executePhase1(
    clip: ClipAsset,
    novelPromotionData: NovelPromotionAssetData,
    session: SessionAsset,
    projectId: string,
    projectName: string,
    locale: Locale,
    taskId?: string
): Promise<PhaseResult> {
    const clipId = formatClipId(clip)
    void taskId
    _ulogInfo(`[Phase 1] Clip ${clipId}: 开始基础分镜规划...`)

    // 读取提示词模板
    const planPromptTemplate = getPromptTemplate(PROMPT_IDS.NP_AGENT_STORYBOARD_PLAN, locale)

    // 解析clip数据
    const clipCharacters = parseClipCharacters(clip.characters)
    const clipLocation = clip.location || null

    // 构建资产信息
    const charactersLibName = novelPromotionData.characters.map((c) => c.name).join(', ') || '无'
    const locationsLibName = novelPromotionData.locations.map((l) => l.name).join(', ') || '无'
    const filteredAppearanceList = getFilteredAppearanceList(novelPromotionData.characters, clipCharacters)
    const filteredFullDescription = getFilteredFullDescription(novelPromotionData.characters, clipCharacters)
    const charactersIntroduction = buildCharactersIntroduction(novelPromotionData.characters)

    // 构建clip JSON
    const clipJson = JSON.stringify({
        id: clip.id,
        content: clip.content,
        characters: clipCharacters,
        location: clipLocation
    }, null, 2)

    // 读取剧本
    const screenplay = parseScreenplay(clip.screenplay)
    if (clip.screenplay && !screenplay) {
        _ulogWarn(`[Phase 1] Clip ${clipId}: 剧本JSON解析失败`)
    }

    // 构建提示词
    let planPrompt = planPromptTemplate
        .replace('{characters_lib_name}', charactersLibName)
        .replace('{locations_lib_name}', locationsLibName)
        .replace('{characters_introduction}', charactersIntroduction)
        .replace('{characters_appearance_list}', filteredAppearanceList)
        .replace('{characters_full_description}', filteredFullDescription)
        .replace('{clip_json}', clipJson)

    if (screenplay) {
        planPrompt = planPrompt.replace('{clip_content}', `【剧本格式】\n${JSON.stringify(screenplay, null, 2)}`)
    } else {
        planPrompt = planPrompt.replace('{clip_content}', clip.content || '')
    }

    // 记录发送给 AI 的完整 prompt
    logAIAnalysis(session.user.id, session.user.name, projectId, projectName, {
        action: 'STORYBOARD_PHASE1_PROMPT',
        input: { 片段标识: clipId, 完整提示词: planPrompt },
        model: novelPromotionData.analysisModel
    })

    // 调用AI（失败后重试一次）
    let planPanels: StoryboardPanel[] = []

    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const planResult = await executeAiTextStep({
                userId: session.user.id,
                model: novelPromotionData.analysisModel,
                messages: [{ role: 'user', content: planPrompt }],
                reasoning: true,
                projectId,
                action: 'storyboard_phase1_plan',
                meta: {
                    stepId: 'storyboard_phase1_plan',
                    stepTitle: '分镜规划',
                    stepIndex: 1,
                    stepTotal: 1,
                },
            })

            const planResponseText = planResult.text
            if (!planResponseText) {
                throw new Error(`Phase 1: 无响应 clip ${clipId}`)
            }

            planPanels = parseJsonResponse<StoryboardPanel>(planResponseText, clipId, 1)

            // 统计有效分镜数量
            const validPanelCount = planPanels.filter(panel =>
                panel.description && panel.description !== '无' && panel.location !== '无'
            ).length

            _ulogInfo(`[Phase 1] Clip ${clipId}: 共 ${planPanels.length} 个分镜，其中 ${validPanelCount} 个有效分镜`)

            if (validPanelCount === 0) {
                throw new Error(`Phase 1: 返回全部为空分镜 clip ${clipId}`)
            }

            // ========== 检测 source_text 字段，缺失则重试 ==========
            const missingSourceText = planPanels.some(panel => !panel.source_text)
            if (missingSourceText && attempt === 1) {
                _ulogWarn(`[Phase 1] Clip ${clipId}: 有分镜缺少source_text，尝试重试...`)
                continue
            }

            // 成功，跳出循环
            break
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error)
            _ulogError(`[Phase 1] Clip ${clipId}: 第${attempt}次尝试失败: ${message}`)
            if (attempt === 2) throw error
        }
    }

    // 记录第一阶段完整输出
    logAIAnalysis(session.user.id, session.user.name, projectId, projectName, {
        action: 'STORYBOARD_PHASE1_OUTPUT',
        output: {
            片段标识: clipId,
            总分镜数: planPanels.length,
            第一阶段完整结果: planPanels
        },
        model: novelPromotionData.analysisModel
    })

    _ulogInfo(`[Phase 1] Clip ${clipId}: 生成 ${planPanels.length} 个基础分镜`)

    return { clipId, planPanels }
}

// ========== Phase 2: 摄影规则生成 ==========
export async function executePhase2(
    clip: ClipAsset,
    planPanels: StoryboardPanel[],
    novelPromotionData: NovelPromotionAssetData,
    session: SessionAsset,
    projectId: string,
    projectName: string,
    locale: Locale,
    taskId?: string
): Promise<PhaseResult> {
    const clipId = formatClipId(clip)
    void taskId
    _ulogInfo(`[Phase 2] Clip ${clipId}: 开始生成摄影规则...`)

    // 读取提示词
    const cinematographerPromptTemplate = getPromptTemplate(PROMPT_IDS.NP_AGENT_CINEMATOGRAPHER, locale)

    // 解析clip数据
    const clipCharacters = parseClipCharacters(clip.characters)
    const clipLocation = clip.location || null

    const filteredFullDescription = getFilteredFullDescription(novelPromotionData.characters, clipCharacters)
    const filteredLocationsDescription = getFilteredLocationsDescription(novelPromotionData.locations, clipLocation)

    // 构建提示词
    const cinematographerPrompt = cinematographerPromptTemplate
        .replace('{panels_json}', JSON.stringify(planPanels, null, 2))
        .replace('{panel_count}', planPanels.length.toString())
        .replace(/\{panel_count\}/g, planPanels.length.toString())
        .replace('{locations_description}', filteredLocationsDescription)
        .replace('{characters_info}', filteredFullDescription)

    let photographyRules: PhotographyRule[] = []

    // 失败后重试一次
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const cinematographerResult = await executeAiTextStep({
                userId: session.user.id,
                model: novelPromotionData.analysisModel,
                messages: [{ role: 'user', content: cinematographerPrompt }],
                reasoning: true,
                projectId,
                action: 'storyboard_phase2_cinematography',
                meta: {
                    stepId: 'storyboard_phase2_cinematography',
                    stepTitle: '摄影规则',
                    stepIndex: 1,
                    stepTotal: 1,
                },
            })

            const responseText = cinematographerResult.text
            if (!responseText) {
                throw new Error(`Phase 2: 无响应 clip ${clipId}`)
            }

            photographyRules = parseJsonResponse<PhotographyRule>(responseText, clipId, 2)

            _ulogInfo(`[Phase 2] Clip ${clipId}: 成功生成 ${photographyRules.length} 个镜头的摄影规则`)

            // 记录摄影方案生成结果
            logAIAnalysis(session.user.id, session.user.name, projectId, projectName, {
                action: 'CINEMATOGRAPHER_PLAN',
                output: {
                    片段标识: clipId,
                    镜头数量: planPanels.length,
                    摄影规则数量: photographyRules.length,
                    摄影规则: photographyRules
                },
                model: novelPromotionData.analysisModel
            })

            // 成功，跳出循环
            break
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e)
            _ulogError(`[Phase 2] Clip ${clipId}: 第${attempt}次尝试失败: ${message}`)
            if (attempt === 2) throw e
        }
    }

    return { clipId, planPanels, photographyRules }
}

// ========== Phase 2-Acting: 演技指导生成 ==========
export async function executePhase2Acting(
    clip: ClipAsset,
    planPanels: StoryboardPanel[],
    novelPromotionData: NovelPromotionAssetData,
    session: SessionAsset,
    projectId: string,
    projectName: string,
    locale: Locale,
    taskId?: string
): Promise<PhaseResult> {
    const clipId = formatClipId(clip)
    void taskId
    _ulogInfo(`[Phase 2-Acting] ==========================================`)
    _ulogInfo(`[Phase 2-Acting] Clip ${clipId}: 开始生成演技指导...`)
    _ulogInfo(`[Phase 2-Acting] planPanels 数量: ${planPanels.length}`)
    _ulogInfo(`[Phase 2-Acting] projectId: ${projectId}, projectName: ${projectName}`)

    // 读取提示词
    const actingPromptTemplate = getPromptTemplate(PROMPT_IDS.NP_AGENT_ACTING_DIRECTION, locale)

    // 解析clip数据
    const clipCharacters = parseClipCharacters(clip.characters)

    const filteredFullDescription = getFilteredFullDescription(novelPromotionData.characters, clipCharacters)

    // 构建提示词
    const actingPrompt = actingPromptTemplate
        .replace('{panels_json}', JSON.stringify(planPanels, null, 2))
        .replace('{panel_count}', planPanels.length.toString())
        .replace(/\{panel_count\}/g, planPanels.length.toString())
        .replace('{characters_info}', filteredFullDescription)

    let actingDirections: ActingDirection[] = []

    // 失败后重试一次
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const actingResult = await executeAiTextStep({
                userId: session.user.id,
                model: novelPromotionData.analysisModel,
                messages: [{ role: 'user', content: actingPrompt }],
                reasoning: true,
                projectId,
                action: 'storyboard_phase2_acting',
                meta: {
                    stepId: 'storyboard_phase2_acting',
                    stepTitle: '演技指导',
                    stepIndex: 1,
                    stepTotal: 1,
                },
            })

            const responseText = actingResult.text
            if (!responseText) {
                throw new Error(`Phase 2-Acting: 无响应 clip ${clipId}`)
            }

            actingDirections = parseJsonResponse<ActingDirection>(responseText, clipId, 2)

            _ulogInfo(`[Phase 2-Acting] Clip ${clipId}: 成功生成 ${actingDirections.length} 个镜头的演技指导`)

            // 记录演技指导生成结果
            logAIAnalysis(session.user.id, session.user.name, projectId, projectName, {
                action: 'ACTING_DIRECTION_PLAN',
                output: {
                    片段标识: clipId,
                    镜头数量: planPanels.length,
                    演技指导数量: actingDirections.length,
                    演技指导: actingDirections
                },
                model: novelPromotionData.analysisModel
            })

            // 成功，跳出循环
            break
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e)
            _ulogError(`[Phase 2-Acting] Clip ${clipId}: 第${attempt}次尝试失败: ${message}`)
            if (attempt === 2) throw e
        }
    }

    return { clipId, planPanels, actingDirections }
}

// ========== Phase 3: 补充细节和video_prompt ==========
export async function executePhase3(
    clip: ClipAsset,
    planPanels: StoryboardPanel[],
    photographyRules: PhotographyRule[],
    novelPromotionData: NovelPromotionAssetData,
    session: SessionAsset,
    projectId: string,
    projectName: string,
    locale: Locale,
    taskId?: string
): Promise<PhaseResult> {
    const clipId = formatClipId(clip)
    void taskId
    _ulogInfo(`[Phase 3] Clip ${clipId}: 开始补充镜头细节...`)

    // 读取提示词
    const detailPromptTemplate = getPromptTemplate(PROMPT_IDS.NP_AGENT_STORYBOARD_DETAIL, locale)

    // 解析clip数据
    const clipCharacters = parseClipCharacters(clip.characters)
    const clipLocation = clip.location || null

    const filteredFullDescription = getFilteredFullDescription(novelPromotionData.characters, clipCharacters)
    const filteredLocationsDescription = getFilteredLocationsDescription(novelPromotionData.locations, clipLocation)

    // 构建提示词
    const detailPrompt = detailPromptTemplate
        .replace('{panels_json}', JSON.stringify(planPanels, null, 2))
        .replace('{characters_age_gender}', filteredFullDescription)  // 改用完整描述
        .replace('{locations_description}', filteredLocationsDescription)

    // 记录发送给 AI 的完整 prompt
    logAIAnalysis(session.user.id, session.user.name, projectId, projectName, {
        action: 'STORYBOARD_PHASE3_PROMPT',
        input: { 片段标识: clipId, 完整提示词: detailPrompt },
        model: novelPromotionData.analysisModel
    })

    void photographyRules
    let finalPanels: StoryboardPanel[] = []

    // 失败后重试一次
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const detailResult = await executeAiTextStep({
                userId: session.user.id,
                model: novelPromotionData.analysisModel,
                messages: [{ role: 'user', content: detailPrompt }],
                reasoning: true,
                projectId,
                action: 'storyboard_phase3_detail',
                meta: {
                    stepId: 'storyboard_phase3_detail',
                    stepTitle: '镜头细化',
                    stepIndex: 1,
                    stepTotal: 1,
                },
            })

            const detailResponseText = detailResult.text
            if (!detailResponseText) {
                throw new Error(`Phase 3: 无响应 clip ${clipId}`)
            }

            finalPanels = parseJsonResponse<StoryboardPanel>(detailResponseText, clipId, 3)

            // 记录第三阶段完整输出（过滤前）
            logAIAnalysis(session.user.id, session.user.name, projectId, projectName, {
                action: 'STORYBOARD_PHASE3_OUTPUT',
                output: {
                    片段标识: clipId,
                    总分镜数: finalPanels.length,
                    第三阶段完整结果_过滤前: finalPanels
                },
                model: novelPromotionData.analysisModel
            })

            // 过滤掉"无"的空分镜
            const beforeFilterCount = finalPanels.length
            finalPanels = finalPanels.filter((panel) =>
                panel.description && panel.description !== '无' && panel.location !== '无'
            )
            _ulogInfo(`[Phase 3] Clip ${clipId}: 过滤空分镜 ${beforeFilterCount} -> ${finalPanels.length} 个有效分镜`)

            if (finalPanels.length === 0) {
                throw new Error(`Phase 3: 过滤后无有效分镜 clip ${clipId}`)
            }

            // 注意：photographyRules的合并已移至route.ts中，与并行执行的Phase 2结果合并

            // 记录最终输出
            logAIAnalysis(session.user.id, session.user.name, projectId, projectName, {
                action: 'STORYBOARD_FINAL_OUTPUT',
                output: {
                    片段标识: clipId,
                    过滤前总数: beforeFilterCount,
                    过滤后有效数: finalPanels.length,
                    最终有效分镜: finalPanels
                },
                model: novelPromotionData.analysisModel
            })

            // 成功，跳出循环
            break
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e)
            _ulogError(`[Phase 3] Clip ${clipId}: 第${attempt}次尝试失败: ${message}`)
            if (attempt === 2) throw e
        }
    }

    _ulogInfo(`[Phase 3] Clip ${clipId}: 完成 ${finalPanels.length} 个镜头细节`)

    return { clipId, finalPanels }
}
