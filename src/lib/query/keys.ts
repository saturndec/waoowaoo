/**
 * 统一的 Query Keys 定义
 * 所有缓存 key 在此集中管理，避免不一致
 */
export const queryKeys = {
    // ============ 中心资产库（Asset Hub）============
    globalAssets: {
        all: () => ['global-assets'] as const,
        characters: (folderId?: string | null) =>
            folderId ? ['global-assets', 'characters', folderId] as const : ['global-assets', 'characters'] as const,
        locations: (folderId?: string | null) =>
            folderId ? ['global-assets', 'locations', folderId] as const : ['global-assets', 'locations'] as const,
        voices: (folderId?: string | null) =>
            folderId ? ['global-assets', 'voices', folderId] as const : ['global-assets', 'voices'] as const,
        folders: () => ['global-assets', 'folders'] as const,
    },

    // ============ 项目资产 ============
    projectAssets: {
        all: (projectId: string) => ['project-assets', projectId] as const,
        characters: (projectId: string) => ['project-assets', projectId, 'characters'] as const,
        locations: (projectId: string) => ['project-assets', projectId, 'locations'] as const,
        detail: (projectId: string) => ['project-assets', projectId, 'detail'] as const,
    },

    // ============ 分镜（Storyboard）============
    storyboards: {
        all: (episodeId: string) => ['storyboards', episodeId] as const,
        panels: (episodeId: string) => ['storyboards', episodeId, 'panels'] as const,
        groups: (episodeId: string) => ['storyboards', episodeId, 'groups'] as const,
    },

    // ============ 视频生成 ============
    videos: {
        all: (episodeId: string) => ['videos', episodeId] as const,
        panels: (episodeId: string) => ['videos', episodeId, 'panels'] as const,
    },

    // ============ 语音（Voice）============
    voiceLines: {
        all: (episodeId: string) => ['voice-lines', episodeId] as const,
        list: (episodeId: string) => ['voice-lines', episodeId, 'list'] as const,
    },

    // ============ 任务轮询 ============
    tasks: {
        pending: (projectId: string, episodeId?: string) =>
            episodeId
                ? ['pending-tasks', projectId, episodeId] as const
                : ['pending-tasks', projectId] as const,
    },

    // ============ 项目数据 ============
    project: {
        detail: (projectId: string) => ['project', projectId] as const,
        episodes: (projectId: string) => ['project', projectId, 'episodes'] as const,
        data: (projectId: string) => ['project', projectId, 'data'] as const,
    },

    // ============ 顶层便捷函数 ============
    /**
     * 项目基础数据
     */
    projectData: (projectId: string) => ['project-data', projectId] as const,

    /**
     * 剧集详情数据
     */
    episodeData: (projectId: string, episodeId: string) =>
        ['episode-data', projectId, episodeId] as const,
} as const

/**
 * 类型导出，用于类型推断
 */
export type QueryKeys = typeof queryKeys
