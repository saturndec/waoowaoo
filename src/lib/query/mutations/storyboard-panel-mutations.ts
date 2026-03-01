import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../keys'
import { resolveTaskResponse } from '@/lib/task/client'
import { resolveTaskErrorMessage } from '@/lib/task/error-message'
import {
    clearTaskTargetOverlay,
    upsertTaskTargetOverlay,
} from '../task-target-overlay'
import {
    getPageLocale,
    invalidateQueryTemplates,
    requestJsonWithError,
    requestTaskResponseWithError,
} from './mutation-shared'

export function useRegenerateProjectPanelImage(projectId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async ({ panelId, count }: { panelId: string; count?: number }) => {
            const res = await fetch(`/api/novel-promotion/${projectId}/regenerate-panel-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-App-Locale': getPageLocale() },
                body: JSON.stringify({ panelId, count: count ?? 1 }),
            })
            if (!res.ok) {
                const error = await res.json().catch(() => ({}))
                if (res.status === 402) throw new Error('余额不足，请充值后继续使用')
                if (res.status === 400 && String(error?.error || '').includes('敏感')) {
                    throw new Error(resolveTaskErrorMessage(error, '提示词包含敏感内容'))
                }
                if (res.status === 429 || error?.code === 'RATE_LIMIT') {
                    const retryAfter = error?.retryAfter || 60
                    throw new Error(`API 配额超限，请等待 ${retryAfter} 秒后重试`)
                }
                throw new Error(resolveTaskErrorMessage(error, '重新生成失败'))
            }
            return res.json()
        },
        onMutate: ({ panelId }) => {
            upsertTaskTargetOverlay(queryClient, {
                projectId,
                targetType: 'NovelPromotionPanel',
                targetId: panelId,
                intent: 'regenerate',
            })
        },
        onError: (_error, { panelId }) => {
            clearTaskTargetOverlay(queryClient, {
                projectId,
                targetType: 'NovelPromotionPanel',
                targetId: panelId,
            })
        },
        onSettled: () => {
            invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])
        },
    })
}

/**
 * 修改镜头图片（storyboard）
 */

export function useModifyProjectStoryboardImage(projectId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (payload: {
            storyboardId: string
            panelIndex: number
            modifyPrompt: string
            extraImageUrls: string[]
            selectedAssets: Array<{
                id: string
                name: string
                type: 'character' | 'location'
                imageUrl: string | null
                appearanceId?: number
                appearanceName?: string
            }>
        }) => {
            return await requestJsonWithError(`/api/novel-promotion/${projectId}/modify-storyboard-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            }, '修改失败')
        },
        onSettled: () => {
            invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])
        },
    })
}

/**
 * 下载剧集全部图片（zip）
 */

export function useDownloadProjectImages(projectId: string) {
    return useMutation({
        mutationFn: async ({ episodeId }: { episodeId: string }) => {
            const response = await fetch(`/api/novel-promotion/${projectId}/download-images?episodeId=${episodeId}`, {
                headers: { 'X-App-Locale': getPageLocale() },
            })
            if (!response.ok) {
                const error = await response.json().catch(() => ({}))
                throw new Error(resolveTaskErrorMessage(error, '下载失败'))
            }
            return response.blob()
        },
    })
}

/**
 * 更新分镜 panel
 */

export function useUpdateProjectPanel(projectId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) =>
            await requestJsonWithError(
                `/api/novel-promotion/${projectId}/panel`,
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                },
                '保存失败',
            ),
        onSettled: () => {
            invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])
        },
    })
}

/**
 * 选择/取消镜头候选图（项目）
 */

export function useCreateProjectPanel(projectId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (payload: Record<string, unknown>) => {
            return await requestJsonWithError(`/api/novel-promotion/${projectId}/panel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            }, '添加失败')
        },
        onSettled: () => {
            invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])
        },
    })
}

/**
 * 删除 panel
 */

export function useDeleteProjectPanel(projectId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async ({ panelId }: { panelId: string }) => {
            return await requestJsonWithError(`/api/novel-promotion/${projectId}/panel?panelId=${panelId}`, {
                method: 'DELETE',
            }, '删除失败')
        },
        onSettled: () => {
            invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])
        },
    })
}

/**
 * 删除 storyboard group
 */

export function useDeleteProjectStoryboardGroup(projectId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async ({ storyboardId }: { storyboardId: string }) => {
            return await requestJsonWithError(
                `/api/novel-promotion/${projectId}/storyboard-group?storyboardId=${storyboardId}`,
                { method: 'DELETE' },
                '删除失败',
            )
        },
        onSettled: () => {
            invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])
        },
    })
}

/**
 * 异步重生成文字分镜
 */

export function useRegenerateProjectStoryboardText(projectId: string) {
    return useMutation({
        mutationFn: async ({ storyboardId }: { storyboardId: string }) => {
            const response = await requestTaskResponseWithError(
                `/api/novel-promotion/${projectId}/regenerate-storyboard-text`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ storyboardId, async: true }),
                },
                'regenerate storyboard text failed',
            )
            return resolveTaskResponse(response)
        },
    })
}

/**
 * 新增 storyboard group
 */

export function useCreateProjectStoryboardGroup(projectId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (payload: { episodeId: string; insertIndex: number }) => {
            return await requestJsonWithError(`/api/novel-promotion/${projectId}/storyboard-group`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            }, '添加失败')
        },
        onSettled: () => {
            invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])
        },
    })
}

/**
 * 移动 storyboard group
 */

export function useMoveProjectStoryboardGroup(projectId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (payload: { episodeId: string; clipId: string; direction: 'up' | 'down' }) => {
            return await requestJsonWithError(`/api/novel-promotion/${projectId}/storyboard-group`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            }, '移动失败')
        },
        onSettled: () => {
            invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])
        },
    })
}

/**
 * 插入 panel（异步）
 */

export function useInsertProjectPanel(projectId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (payload: { storyboardId: string; insertAfterPanelId: string; userInput: string }) => {
            return await requestJsonWithError(`/api/novel-promotion/${projectId}/insert-panel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            }, '插入分镜失败')
        },
        onSettled: () => {
            invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])
        },
    })
}

/**
 * 生成镜头变体（异步）
 */

export function useCreateProjectPanelVariant(projectId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (payload: {
            storyboardId: string
            insertAfterPanelId: string
            sourcePanelId: string
            variant: {
                title: string
                description: string
                shot_type: string
                camera_move: string
                video_prompt: string
            }
            includeCharacterAssets: boolean
            includeLocationAsset: boolean
        }) => {
            return await requestJsonWithError<{ panelId: string }>(`/api/novel-promotion/${projectId}/panel-variant`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            }, '生成变体失败')
        },
        onSettled: () => {
            invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])
        },
    })
}

/**
 * 清除 storyboard 错误
 */
export function useClearProjectStoryboardError(projectId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async ({ storyboardId }: { storyboardId: string }) =>
            await requestJsonWithError(
                `/api/novel-promotion/${projectId}/storyboards`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ storyboardId }),
                },
                '清除分镜错误失败',
            ),
        onSettled: () => {
            invalidateQueryTemplates(queryClient, [queryKeys.projectAssets.all(projectId)])
        },
    })
}
