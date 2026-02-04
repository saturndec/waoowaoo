'use client'

/**
 * useTTSGeneration - TTS 和音色相关逻辑
 * 从 AssetsStage.tsx 提取
 * 
 * 🔥 V6.5 重构：直接订阅 useProjectAssets，消除 props drilling
 */

import { useState, useEffect } from 'react'
import { useProjectAssets, useRefreshProjectAssets } from '@/lib/query/hooks'

interface VoiceDesignCharacter {
    id: string
    name: string
    hasExistingVoice: boolean
}

interface AzureVoice {
    id: string
    name: string
    gender: 'male' | 'female'
    description: string
}

interface UseTTSGenerationProps {
    projectId: string
}

export function useTTSGeneration({
    projectId
}: UseTTSGenerationProps) {
    // 🔥 直接订阅缓存 - 消除 props drilling
    const { data: assets } = useProjectAssets(projectId)
    const characters = assets?.characters ?? []

    // 🔥 使用刷新函数
    const refreshAssets = useRefreshProjectAssets(projectId)

    const [azureVoices, setAzureVoices] = useState<AzureVoice[]>([])
    const [voiceDesignCharacter, setVoiceDesignCharacter] = useState<VoiceDesignCharacter | null>(null)

    // 获取 Azure 音色列表
    useEffect(() => {
        const fetchVoices = async () => {
            try {
                const res = await fetch('/api/voice-presets')
                if (res.ok) {
                    const data = await res.json()
                    setAzureVoices(data.voices || [])
                }
            } catch (error) {
                console.error('获取音色列表失败:', error)
            }
        }
        fetchVoices()
    }, [])

    // 音色变更回调 - 🔥 保存到服务器而不是本地更新
    const handleVoiceChange = async (characterId: string, voiceType: string, voiceId: string, customVoiceUrl?: string) => {
        try {
            const res = await fetch(`/api/novel-promotion/${projectId}/character`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    characterId,
                    voiceType: voiceType as 'azure' | 'custom' | null,
                    voiceId,
                    customVoiceUrl
                })
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || '更新音色失败')
            }

            // 🔥 刷新缓存
            refreshAssets()
        } catch (error: any) {
            console.error('更新音色失败:', error.message)
        }
    }

    // 打开 AI 声音设计对话框
    const handleOpenVoiceDesign = (characterId: string, characterName: string) => {
        const character = characters.find(c => c.id === characterId)
        setVoiceDesignCharacter({
            id: characterId,
            name: characterName,
            hasExistingVoice: !!character?.customVoiceUrl
        })
    }

    // 保存 AI 设计的声音
    const handleVoiceDesignSave = async (voiceId: string, audioBase64: string) => {
        if (!voiceDesignCharacter) return

        try {
            const response = await fetch(`/api/novel-promotion/${projectId}/character-voice`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    characterId: voiceDesignCharacter.id,
                    voiceDesign: {
                        voiceId,
                        audioBase64
                    }
                })
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || '保存失败')
            }

            const data = await response.json()
            await handleVoiceChange(voiceDesignCharacter.id, 'custom', voiceId, data.audioUrl)
            alert(`已为 ${voiceDesignCharacter.name} 设置 AI 设计的声音`)
        } catch (error: any) {
            alert('保存声音设计失败: ' + error.message)
        } finally {
            setVoiceDesignCharacter(null)
        }
    }

    // 关闭声音设计对话框
    const handleCloseVoiceDesign = () => {
        setVoiceDesignCharacter(null)
    }

    return {
        // 🔥 暴露 characters 供组件使用
        characters,
        azureVoices,
        voiceDesignCharacter,
        handleVoiceChange,
        handleOpenVoiceDesign,
        handleVoiceDesignSave,
        handleCloseVoiceDesign
    }
}
