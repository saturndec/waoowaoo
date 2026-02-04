'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../keys'

// ============ 类型定义 ============
export interface VoiceLine {
    id: string
    panelId: string
    text: string
    characterId: string | null
    characterName: string | null
    audioUrl: string | null
    generating: boolean
    errorMessage: string | null
}

export interface VoiceLinesData {
    lines: VoiceLine[]
}

// ============ 查询 Hooks ============

/**
 * 获取语音数据
 */
export function useVoiceLines(episodeId: string | null) {
    return useQuery({
        queryKey: queryKeys.voiceLines.all(episodeId || ''),
        queryFn: async () => {
            if (!episodeId) throw new Error('Episode ID is required')
            const res = await fetch(`/api/novel-promotion/episodes/${episodeId}/voice-lines`)
            if (!res.ok) throw new Error('Failed to fetch voice lines')
            const data = await res.json()
            return data as VoiceLinesData
        },
        enabled: !!episodeId,
    })
}

// ============ Mutation Hooks ============

/**
 * 生成单条语音
 */
export function useGenerateVoice(projectId: string | null, episodeId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ lineId }: { lineId: string }) => {
            if (!projectId) throw new Error('Project ID is required')
            const res = await fetch(`/api/novel-promotion/${projectId}/generate-voice`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lineId }),
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || error.error || 'Failed to generate voice')
            }
            return res.json()
        },
        onMutate: async ({ lineId }) => {
            if (!episodeId) return

            queryClient.setQueryData<VoiceLinesData>(
                queryKeys.voiceLines.all(episodeId),
                (old) => {
                    if (!old) return old
                    return {
                        ...old,
                        lines: old.lines.map(line =>
                            line.id === lineId ? { ...line, generating: true } : line
                        )
                    }
                }
            )
        },
        onSettled: () => {
            if (episodeId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.voiceLines.all(episodeId) })
            }
        },
    })
}

/**
 * 批量生成语音
 */
export function useBatchGenerateVoices(projectId: string | null, episodeId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ lineIds }: { lineIds: string[] }) => {
            if (!projectId) throw new Error('Project ID is required')
            const res = await fetch(`/api/novel-promotion/${projectId}/batch-generate-voices`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lineIds }),
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || error.error || 'Failed to batch generate voices')
            }
            return res.json()
        },
        onMutate: async ({ lineIds }) => {
            if (!episodeId) return

            queryClient.setQueryData<VoiceLinesData>(
                queryKeys.voiceLines.all(episodeId),
                (old) => {
                    if (!old) return old
                    return {
                        ...old,
                        lines: old.lines.map(line =>
                            lineIds.includes(line.id) ? { ...line, generating: true } : line
                        )
                    }
                }
            )
        },
        onSettled: () => {
            if (episodeId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.voiceLines.all(episodeId) })
            }
        },
    })
}

/**
 * 更新语音文本
 */
export function useUpdateVoiceText(episodeId: string | null) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ lineId, text }: { lineId: string; text: string }) => {
            const res = await fetch(`/api/novel-promotion/voice-lines/${lineId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
            })
            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.message || error.error || 'Failed to update voice text')
            }
            return res.json()
        },
        // 乐观更新
        onMutate: async ({ lineId, text }) => {
            if (!episodeId) return

            queryClient.setQueryData<VoiceLinesData>(
                queryKeys.voiceLines.all(episodeId),
                (old) => {
                    if (!old) return old
                    return {
                        ...old,
                        lines: old.lines.map(line =>
                            line.id === lineId ? { ...line, text } : line
                        )
                    }
                }
            )
        },
        onSettled: () => {
            if (episodeId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.voiceLines.all(episodeId) })
            }
        },
    })
}

/**
 * 刷新语音数据
 */
export function useRefreshVoiceLines(episodeId: string | null) {
    const queryClient = useQueryClient()

    return () => {
        if (episodeId) {
            queryClient.invalidateQueries({ queryKey: queryKeys.voiceLines.all(episodeId) })
        }
    }
}
