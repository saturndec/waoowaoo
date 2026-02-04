/**
 * 统一配置服务
 * 
 * 所有API通过此服务获取模型配置，确保数据源一致性。
 * 
 * 优先级：项目配置 > 用户偏好 > null
 */

import { prisma } from '@/lib/prisma'

/**
 * 项目级模型配置
 */
export interface ProjectModelConfig {
    /** AI分析模型 (LLM) */
    analysisModel: string | null
    /** 角色图像模型 */
    characterModel: string | null
    /** 场景图像模型 */
    locationModel: string | null
    /** 分镜图像模型 */
    storyboardModel: string | null
    /** 修图/编辑模型 */
    editModel: string | null
    /** 视频模型 */
    videoModel: string | null
    /** 画面比例 */
    videoRatio: string | null
    /** 艺术风格 */
    artStyle: string | null
}

/**
 * 用户级模型配置（无项目时使用，如资产中心）
 */
export interface UserModelConfig {
    /** AI分析模型 */
    analysisModel: string | null
    /** 角色图像模型 */
    characterModel: string | null
    /** 场景图像模型 */
    locationModel: string | null
    /** 分镜图像模型 */
    storyboardModel: string | null
    /** 修图/编辑模型 */
    editModel: string | null
    /** 视频模型 */
    videoModel: string | null
}

/**
 * 获取项目级模型配置
 * 
 * @param projectId 项目ID
 * @param userId 用户ID（用于获取用户偏好作为回退）
 * @returns 项目模型配置
 */
export async function getProjectModelConfig(
    projectId: string,
    userId: string
): Promise<ProjectModelConfig> {
    const [projectData, userPref] = await Promise.all([
        prisma.novelPromotionProject.findUnique({ where: { projectId } }),
        prisma.userPreference.findUnique({ where: { userId } })
    ])

    const pd = projectData as any
    const up = userPref as any

    return {
        // AI分析模型：项目 > 用户偏好
        analysisModel: pd?.analysisModel || up?.analysisModel || null,
        // 角色图像模型：仅项目级
        characterModel: pd?.characterModel || null,
        // 场景图像模型：仅项目级
        locationModel: pd?.locationModel || null,
        // 分镜图像模型：仅项目级
        storyboardModel: pd?.storyboardModel || null,
        // 修图/编辑模型：仅项目级，无 fallback
        editModel: pd?.editModel || null,
        // 视频模型：项目 > 用户偏好
        videoModel: pd?.videoModel || up?.videoModel || null,
        // 画面比例
        videoRatio: pd?.videoRatio || '16:9',
        // 艺术风格
        artStyle: pd?.artStyle || null,
    }
}

/**
 * 获取用户级模型配置（无项目时使用，如资产中心）
 * 
 * @param userId 用户ID
 * @returns 用户模型配置
 */
export async function getUserModelConfig(userId: string): Promise<UserModelConfig> {
    const userPref = await prisma.userPreference.findUnique({
        where: { userId }
    })

    return {
        // AI分析模型
        analysisModel: userPref?.analysisModel || null,
        // 角色图像模型
        characterModel: userPref?.characterModel || null,
        // 场景图像模型
        locationModel: userPref?.locationModel || null,
        // 分镜图像模型
        storyboardModel: userPref?.storyboardModel || null,
        // 修图/编辑模型
        editModel: userPref?.editModel || null,
        // 视频模型
        videoModel: userPref?.videoModel || null,
    }
}

/**
 * 检查必需的模型配置是否存在
 * 
 * @param config 配置对象
 * @param requiredFields 必需的字段列表
 * @returns 缺失的字段列表
 */
export function checkRequiredModels(
    config: Partial<ProjectModelConfig | UserModelConfig>,
    requiredFields: (keyof ProjectModelConfig | keyof UserModelConfig)[]
): string[] {
    const missing: string[] = []

    const fieldNames: Record<string, string> = {
        analysisModel: 'AI分析模型',
        characterModel: '角色图像模型',
        locationModel: '场景图像模型',
        storyboardModel: '分镜图像模型',
        editModel: '修图/编辑模型',
        videoModel: '视频模型',
    }

    for (const field of requiredFields) {
        if (!(config as any)[field]) {
            missing.push(fieldNames[field] || field)
        }
    }

    return missing
}

/**
 * 生成缺失配置的错误消息
 */
export function getMissingConfigError(missingFields: string[]): string {
    if (missingFields.length === 0) return ''
    if (missingFields.length === 1) {
        return `请先在项目设置中配置"${missingFields[0]}"`
    }
    return `请先在项目设置中配置以下模型：${missingFields.join('、')}`
}
