/**
 * 分镜相关的类型守卫和工具类型
 * 解决 (storyboard as any).panels 类型断言问题
 */

import { NovelPromotionStoryboard, NovelPromotionPanel } from './project'

/**
 * 带有已加载 panels 的 Storyboard 类型
 * 用于数据库查询后包含 panels 的情况
 */
export interface StoryboardWithPanels extends NovelPromotionStoryboard {
    panels: NovelPromotionPanel[]
}

/**
 * 类型守卫：检查 storyboard 是否包含已加载的 panels
 */
export function hasLoadedPanels(
    storyboard: NovelPromotionStoryboard
): storyboard is StoryboardWithPanels {
    return Array.isArray((storyboard as StoryboardWithPanels).panels)
}

/**
 * 安全获取 panels 数组
 * 如果 panels 不存在则返回空数组
 */
export function getPanels(storyboard: NovelPromotionStoryboard): NovelPromotionPanel[] {
    if (hasLoadedPanels(storyboard)) {
        return storyboard.panels
    }
    return []
}

/**
 * 获取 panel 的候选图片
 * 处理 candidateImages JSON 字符串解析
 */
export function getPanelCandidates(panel: NovelPromotionPanel): string[] {
    if (!panel.imageHistory) return []
    try {
        const parsed = JSON.parse(panel.imageHistory)
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}
