import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { queryKeys } from '../keys'

/**
 * 取消/清除生成状态类型
 */
export type ClearType =
    | 'character_appearance'
    | 'character_image' // legacy alias
    | 'location_image'
    | 'panel_image'
    | 'panel_video'
    | 'panel_lip_sync'
    | 'shot_image'
    | 'voice_line'
    | 'storyboard_text'
    | 'global_character'
    | 'global_location'

export interface ClearParams {
    type: ClearType
    targetId: string
    onSuccess?: () => void
    onError?: (error: Error) => void
}

/**
 * 清除生成状态 Hook
 * 
 * 用于用户点击"取消"按钮时清除generating状态
 * 
 * @param projectId 项目ID（用于项目资产）
 * @param episodeId 剧集ID（用于分镜、镜头等）
 * 
 * @example
 * // 项目资产
 * const { clearGenerating } = useClearGenerating(projectId)
 * clearGenerating({ type: 'character_image', targetId: appearanceId })
 * 
 * @example
 * // 分镜面板
 * const { clearGenerating } = useClearGenerating(undefined, episodeId)
 * clearGenerating({ type: 'panel_video', targetId: panelId })
 */
export function useClearGenerating(projectId?: string, episodeId?: string) {
    const queryClient = useQueryClient()
    const [isCancelling, setIsCancelling] = useState(false)

    const normalizeType = (type: ClearType): Exclude<ClearType, 'character_image'> => {
        if (type === 'character_image') return 'character_appearance'
        return type
    }

    const clearGenerating = useCallback(async (params: ClearParams) => {
        const normalizedType = normalizeType(params.type)
        console.log('[useClearGenerating] 清除状态:', {
            type: normalizedType,
            targetId: params.targetId,
            projectId,
            episodeId
        })

        setIsCancelling(true)

        // 🔥 1. 乐观更新前端缓存（立即反馈）
        const updateCache = () => {
            switch (normalizedType) {
                case 'character_appearance':
                    if (projectId) {
                        const cacheKey = ['project-assets', projectId]
                        queryClient.setQueryData(cacheKey, (old: any) => {
                            if (!old) return old
                            return {
                                ...old,
                                characters: old.characters?.map((char: any) => ({
                                    ...char,
                                    appearances: char.appearances?.map((app: any) =>
                                        app.id === params.targetId
                                            ? { ...app, generating: false }
                                            : app
                                    )
                                }))
                            }
                        })
                    }
                    break
                case 'global_character':
                    queryClient.setQueriesData(
                        { queryKey: ['global-assets', 'characters'] },
                        (old: any) => {
                            if (!old) return old
                            return old.map((char: any) => ({
                                ...char,
                                appearances: char.appearances?.map((app: any) =>
                                    app.id === params.targetId
                                        ? { ...app, generating: false }
                                        : app
                                )
                            }))
                        }
                    )
                    break

                case 'location_image':
                    if (projectId) {
                        const cacheKey = ['project-assets', projectId]
                        queryClient.setQueryData(cacheKey, (old: any) => {
                            if (!old) return old
                            return {
                                ...old,
                                locations: old.locations?.map((loc: any) => ({
                                    ...loc,
                                    images: loc.images?.map((img: any) =>
                                        img.id === params.targetId
                                            ? { ...img, generating: false }
                                            : img
                                    )
                                }))
                            }
                        })
                    }
                    break
                case 'global_location':
                    queryClient.setQueriesData(
                        { queryKey: ['global-assets', 'locations'] },
                        (old: any) => {
                            if (!old) return old
                            return old.map((loc: any) => ({
                                ...loc,
                                images: loc.images?.map((img: any) =>
                                    img.id === params.targetId
                                        ? { ...img, generating: false }
                                        : img
                                )
                            }))
                        }
                    )
                    break

                case 'panel_image':
                case 'panel_video':
                case 'panel_lip_sync':
                    if (episodeId) {
                        const cacheKey = ['storyboards', episodeId]
                        queryClient.setQueryData(cacheKey, (old: any) => {
                            if (!old) return old
                            if (Array.isArray(old)) {
                                return old.map((storyboard: any) => ({
                                    ...storyboard,
                                    panels: storyboard.panels?.map((panel: any) =>
                                        panel.id === params.targetId
                                            ? {
                                                ...panel,
                                                generatingImage: normalizedType === 'panel_image' ? false : panel.generatingImage,
                                                generatingVideo: normalizedType === 'panel_video' ? false : panel.generatingVideo,
                                                generatingLipSync: normalizedType === 'panel_lip_sync' ? false : panel.generatingLipSync,
                                                candidateImages: normalizedType === 'panel_image' ? null : panel.candidateImages,
                                                lipSyncTaskId: normalizedType === 'panel_lip_sync' ? null : panel.lipSyncTaskId
                                            }
                                            : panel
                                    )
                                }))
                            }
                            if (Array.isArray(old?.groups)) {
                                return {
                                    ...old,
                                    groups: old.groups.map((group: any) => ({
                                        ...group,
                                        panels: group.panels?.map((panel: any) =>
                                            panel.id === params.targetId
                                                ? {
                                                    ...panel,
                                                    generatingImage: normalizedType === 'panel_image' ? false : panel.generatingImage,
                                                    generatingVideo: normalizedType === 'panel_video' ? false : panel.generatingVideo,
                                                    generatingLipSync: normalizedType === 'panel_lip_sync' ? false : panel.generatingLipSync,
                                                    candidateImages: normalizedType === 'panel_image' ? null : panel.candidateImages,
                                                    lipSyncTaskId: normalizedType === 'panel_lip_sync' ? null : panel.lipSyncTaskId
                                                }
                                                : panel
                                        )
                                    }))
                                }
                            }
                            return old
                        })
                    }
                    if (projectId && episodeId) {
                        queryClient.setQueryData(queryKeys.episodeData(projectId, episodeId), (old: any) => {
                            if (!old) return old
                            return {
                                ...old,
                                storyboards: old.storyboards?.map((storyboard: any) => ({
                                    ...storyboard,
                                    panels: storyboard.panels?.map((panel: any) =>
                                        panel.id === params.targetId
                                            ? {
                                                ...panel,
                                                generatingImage: normalizedType === 'panel_image' ? false : panel.generatingImage,
                                                generatingVideo: normalizedType === 'panel_video' ? false : panel.generatingVideo,
                                                generatingLipSync: normalizedType === 'panel_lip_sync' ? false : panel.generatingLipSync,
                                                candidateImages: normalizedType === 'panel_image' ? null : panel.candidateImages,
                                                lipSyncTaskId: normalizedType === 'panel_lip_sync' ? null : panel.lipSyncTaskId
                                            }
                                            : panel
                                    )
                                }))
                            }
                        })
                    }
                    break
                case 'storyboard_text':
                    if (projectId && episodeId) {
                        queryClient.setQueryData(queryKeys.episodeData(projectId, episodeId), (old: any) => {
                            if (!old) return old
                            return {
                                ...old,
                                storyboards: old.storyboards?.map((storyboard: any) =>
                                    storyboard.id === params.targetId
                                        ? { ...storyboard, generating: false, candidateImages: null, lastError: null }
                                        : storyboard
                                )
                            }
                        })
                    }
                    if (episodeId) {
                        const cacheKey = ['storyboards', episodeId]
                        queryClient.setQueryData(cacheKey, (old: any) => {
                            if (!old) return old
                            if (Array.isArray(old)) {
                                return old.map((storyboard: any) =>
                                    storyboard.id === params.targetId
                                        ? { ...storyboard, generating: false, candidateImages: null, lastError: null }
                                        : storyboard
                                )
                            }
                            if (Array.isArray(old?.groups)) {
                                return {
                                    ...old,
                                    groups: old.groups.map((group: any) => ({
                                        ...group,
                                        panels: group.panels
                                    }))
                                }
                            }
                            return old
                        })
                    }
                    break

                case 'shot_image':
                    if (episodeId) {
                        const cacheKey = ['shots', episodeId]
                        queryClient.setQueryData(cacheKey, (old: any) => {
                            if (!old) return old
                            return old.map((shot: any) =>
                                shot.id === params.targetId
                                    ? { ...shot, generatingImage: false }
                                    : shot
                            )
                        })
                    }
                    if (projectId && episodeId) {
                        queryClient.setQueryData(queryKeys.episodeData(projectId, episodeId), (old: any) => {
                            if (!old) return old
                            return {
                                ...old,
                                shots: old.shots?.map((shot: any) =>
                                    shot.id === params.targetId
                                        ? { ...shot, generatingImage: false }
                                        : shot
                                )
                            }
                        })
                    }
                    break

                case 'voice_line':
                    if (episodeId) {
                        const cacheKey = ['voice-lines', episodeId]
                        queryClient.setQueryData(cacheKey, (old: any) => {
                            if (!old) return old
                            return {
                                ...old,
                                voiceLines: old.voiceLines?.map((line: any) =>
                                    line.id === params.targetId
                                        ? { ...line, generating: false }
                                        : line
                                )
                            }
                        })
                    }
                    if (projectId && episodeId) {
                        queryClient.setQueryData(queryKeys.episodeData(projectId, episodeId), (old: any) => {
                            if (!old) return old
                            return {
                                ...old,
                                voiceLines: old.voiceLines?.map((line: any) =>
                                    line.id === params.targetId
                                        ? { ...line, generating: false }
                                        : line
                                )
                            }
                        })
                    }
                    break
            }
        }

        // 立即更新缓存
        updateCache()
        console.log('[useClearGenerating] ✅ 缓存已更新')

        // 🔥 2. 调用API清除数据库状态
        try {
            const response = await fetch(`/api/cancel-generation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: normalizedType,
                    targetId: params.targetId
                })
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || '清除状态失败')
            }

            console.log('[useClearGenerating] ✅ 数据库状态已清除')
            if (params.onSuccess) params.onSuccess()

            // 🔥 3. 刷新缓存确保同步
            switch (normalizedType) {
                case 'character_appearance':
                case 'location_image':
                    await queryClient.invalidateQueries({ queryKey: ['project-assets', projectId] })
                    break
                case 'global_character':
                    await queryClient.invalidateQueries({ queryKey: ['global-assets', 'characters'], exact: false })
                    break
                case 'global_location':
                    await queryClient.invalidateQueries({ queryKey: ['global-assets', 'locations'], exact: false })
                    break

                case 'panel_image':
                case 'panel_video':
                case 'panel_lip_sync':
                    if (episodeId) {
                        await queryClient.invalidateQueries({ queryKey: ['storyboards', episodeId] })
                    }
                    if (projectId && episodeId) {
                        await queryClient.invalidateQueries({ queryKey: queryKeys.episodeData(projectId, episodeId) })
                    }
                    break
                case 'storyboard_text':
                    if (episodeId) {
                        await queryClient.invalidateQueries({ queryKey: ['storyboards', episodeId] })
                    }
                    if (projectId && episodeId) {
                        await queryClient.invalidateQueries({ queryKey: queryKeys.episodeData(projectId, episodeId) })
                    }
                    break

                case 'shot_image':
                    if (episodeId) {
                        await queryClient.invalidateQueries({ queryKey: ['shots', episodeId] })
                    }
                    if (projectId && episodeId) {
                        await queryClient.invalidateQueries({ queryKey: queryKeys.episodeData(projectId, episodeId) })
                    }
                    break

                case 'voice_line':
                    if (episodeId) {
                        await queryClient.invalidateQueries({ queryKey: ['voice-lines', episodeId] })
                    }
                    if (projectId && episodeId) {
                        await queryClient.invalidateQueries({ queryKey: queryKeys.episodeData(projectId, episodeId) })
                    }
                    break
            }

            console.log('[useClearGenerating] ✅ 完成')
        } catch (error: any) {
            console.error('[useClearGenerating] ❌ API调用失败:', error)
            if (params.onError) params.onError(error)
            // 失败时回滚乐观更新
            switch (normalizedType) {
                case 'character_appearance':
                case 'location_image':
                    if (projectId) {
                        await queryClient.invalidateQueries({ queryKey: ['project-assets', projectId] })
                    }
                    break
                case 'global_character':
                    await queryClient.invalidateQueries({ queryKey: ['global-assets', 'characters'], exact: false })
                    break
                case 'global_location':
                    await queryClient.invalidateQueries({ queryKey: ['global-assets', 'locations'], exact: false })
                    break

                case 'panel_image':
                case 'panel_video':
                case 'panel_lip_sync':
                    if (episodeId) {
                        await queryClient.invalidateQueries({ queryKey: ['storyboards', episodeId] })
                    }
                    if (projectId && episodeId) {
                        await queryClient.invalidateQueries({ queryKey: queryKeys.episodeData(projectId, episodeId) })
                    }
                    break
                case 'storyboard_text':
                    if (episodeId) {
                        await queryClient.invalidateQueries({ queryKey: ['storyboards', episodeId] })
                    }
                    if (projectId && episodeId) {
                        await queryClient.invalidateQueries({ queryKey: queryKeys.episodeData(projectId, episodeId) })
                    }
                    break

                case 'shot_image':
                    if (episodeId) {
                        await queryClient.invalidateQueries({ queryKey: ['shots', episodeId] })
                    }
                    if (projectId && episodeId) {
                        await queryClient.invalidateQueries({ queryKey: queryKeys.episodeData(projectId, episodeId) })
                    }
                    break

                case 'voice_line':
                    if (episodeId) {
                        await queryClient.invalidateQueries({ queryKey: ['voice-lines', episodeId] })
                    }
                    if (projectId && episodeId) {
                        await queryClient.invalidateQueries({ queryKey: queryKeys.episodeData(projectId, episodeId) })
                    }
                    break
            }
        } finally {
            setIsCancelling(false)
        }
    }, [queryClient, projectId, episodeId])

    return {
        clearGenerating,
        cancelGeneration: clearGenerating, // Backward compatibility
        isCancelling,
        isClearing: false
    }
}

// Backward compatibility
export { useClearGenerating as useCancelGeneration }
