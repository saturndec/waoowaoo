/**
 * 角色档案数据结构
 * 用于两阶段角色生成系统
 */

export type RoleLevel = 'S' | 'A' | 'B' | 'C' | 'D'

export type CostumeTier = 1 | 2 | 3 | 4 | 5

export interface CharacterProfileData {
    /** 角色重要性层级 */
    role_level: RoleLevel

    /** 角色原型 (如: 霸道总裁, 心机婊) */
    archetype: string

    /** 性格标签 */
    personality_tags: string[]

    /** 时代背景 */
    era_period: string

    /** 社会阶层 */
    social_class: string

    /** 职业 (可选) */
    occupation?: string

    /** 服装华丽度 (1-5) */
    costume_tier: CostumeTier

    /** 建议色彩 */
    suggested_colors: string[]

    /** 主要辨识标志 (S/A级角色必须) */
    primary_identifier?: string

    /** 视觉关键词 */
    visual_keywords: string[]

    /** 性别 */
    gender: string

    /** 年龄段描述 */
    age_range: string
}

/**
 * 从JSON字符串解析角色档案
 */
export function parseProfileData(profileDataJson: string | null): CharacterProfileData | null {
    if (!profileDataJson) return null
    try {
        return JSON.parse(profileDataJson) as CharacterProfileData
    } catch {
        return null
    }
}

/**
 * 将角色档案序列化为JSON字符串
 */
export function stringifyProfileData(profileData: CharacterProfileData): string {
    return JSON.stringify(profileData)
}

/**
 * 验证角色档案数据完整性
 */
export function validateProfileData(data: any): data is CharacterProfileData {
    return !!(
        data &&
        typeof data.role_level === 'string' &&
        ['S', 'A', 'B', 'C', 'D'].includes(data.role_level) &&
        typeof data.archetype === 'string' &&
        Array.isArray(data.personality_tags) &&
        typeof data.era_period === 'string' &&
        typeof data.social_class === 'string' &&
        typeof data.costume_tier === 'number' &&
        data.costume_tier >= 1 &&
        data.costume_tier <= 5 &&
        Array.isArray(data.suggested_colors) &&
        Array.isArray(data.visual_keywords) &&
        typeof data.gender === 'string' &&
        typeof data.age_range === 'string'
    )
}
