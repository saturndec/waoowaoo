'use client'

/**
 * StoryboardContext - 分镜组件共享上下文
 * 解决 Props Drilling 问题：从 index.tsx 到 ImageSection.tsx 的 36+ props 传递
 * 
 * 🔥 V6.5 重构：删除 characters 和 locations 字段
 * 子组件通过 useProjectAssets(projectId) 直接订阅，不再从 Context 获取
 */

import { createContext, useContext, ReactNode } from 'react'

/**
 * Context 值类型定义
 * 只包含稳定的、不频繁变化的数据和回调
 * 
 * 🔥 V6.5 重构：删除 characters, locations - 子组件直接订阅 useProjectAssets
 */
interface StoryboardContextValue {
    // === 项目级别的稳定数据 ===
    projectId: string
    videoRatio: string
    // 🔥 V6.5 删除：characters, locations - 子组件直接订阅 useProjectAssets(projectId)

    // === 共享的回调函数（通过 useCallback 创建，引用稳定）===

    // 图片生成相关
    regeneratePanelImage: (panelId: string, count?: number, force?: boolean) => void
    getPanelCandidates: (panel: any) => { candidates: string[]; selectedIndex: number } | null

    // 候选图片操作
    onSelectPanelCandidateIndex: (panelId: string, index: number) => void
    onConfirmPanelCandidate: (panelId: string, imageUrl: string) => void
    onCancelPanelCandidate: (panelId: string) => void
    onClearPanelError: (panelId: string) => void

    // 工具函数
    getImageUrl: (url: string | null) => string | null
    formatClipTitle: (clip: any) => string

    // === 状态集合（只读，用于状态检查）===
    savingPanels: Set<string>
    deletingPanelIds: Set<string>
    modifyingPanels: Set<string>
    regeneratingPanelIds: Set<string>
    failedPanels: Map<string, string>
}

// 创建 Context，默认值为 null
const StoryboardContext = createContext<StoryboardContextValue | null>(null)

/**
 * Provider 组件
 */
export function StoryboardProvider({
    children,
    value
}: {
    children: ReactNode
    value: StoryboardContextValue
}) {
    return (
        <StoryboardContext.Provider value={value}>
            {children}
        </StoryboardContext.Provider>
    )
}

/**
 * 使用 Context 的 Hook
 * 必须在 StoryboardProvider 内部使用
 */
export function useStoryboardContext(): StoryboardContextValue {
    const context = useContext(StoryboardContext)
    if (!context) {
        throw new Error('useStoryboardContext must be used within a StoryboardProvider')
    }
    return context
}

/**
 * 可选的 Context Hook（不强制要求在 Provider 内）
 * 用于可能在 Provider 外使用的组件
 */
export function useOptionalStoryboardContext(): StoryboardContextValue | null {
    return useContext(StoryboardContext)
}

// 导出类型供其他组件使用
export type { StoryboardContextValue }
