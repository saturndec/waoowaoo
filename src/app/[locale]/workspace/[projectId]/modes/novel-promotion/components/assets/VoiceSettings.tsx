'use client'

/**
 * 音色设置组件 - 从 CharacterCard 提取
 * 支持上传自定义音频和 AI 声音设计
 */

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { shouldShowError } from '@/lib/error-utils'
import { useUploadProjectCharacterVoice } from '@/lib/query/mutations'

interface VoiceSettingsProps {
    characterId: string
    characterName: string
    customVoiceUrl: string | null | undefined
    projectId: string
    onVoiceChange?: (characterId: string, customVoiceUrl?: string) => void
    onVoiceDesign?: (characterId: string, characterName: string) => void
    onSelectFromHub?: (characterId: string) => void  // 从资产中心选择音色
    compact?: boolean  // 紧凑模式（单图卡片用）
}

export default function VoiceSettings({
    characterId,
    characterName,
    customVoiceUrl,
    projectId,
    onVoiceChange,
    onVoiceDesign,
    onSelectFromHub,
    compact = false
}: VoiceSettingsProps) {
    // 🔥 使用 mutation
    const uploadVoice = useUploadProjectCharacterVoice(projectId)
    const t = useTranslations('assets')
    const voiceFileInputRef = useRef<HTMLInputElement>(null)
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const [isPreviewingVoice, setIsPreviewingVoice] = useState(false)

    const hasCustomVoice = !!customVoiceUrl

    // 预览音色（播放/暂停自定义音频）
    const handlePreviewVoice = async () => {
        if (!customVoiceUrl) return

        // 如果正在播放，点击则暂停
        if (isPreviewingVoice && audioRef.current) {
            audioRef.current.pause()
            setIsPreviewingVoice(false)
            return
        }

        try {
            if (audioRef.current) {
                audioRef.current.pause()
            }
            const audio = new Audio(customVoiceUrl)
            audioRef.current = audio
            audio.play()
            audio.onended = () => setIsPreviewingVoice(false)
            audio.onerror = () => setIsPreviewingVoice(false)
            setIsPreviewingVoice(true)
        } catch (error: any) {
            if (shouldShowError(error)) {
                alert('预览失败: ' + error.message)
            }
            setIsPreviewingVoice(false)
        }
    }

    // 上传自定义音频
    const handleUploadVoice = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !projectId) return

        uploadVoice.mutate(
            { file, characterId },
            {
                onSuccess: (data) => {
                    onVoiceChange?.(characterId, data?.audioUrl)
                },
                onError: (error) => {
                    if (shouldShowError(error)) {
                        alert('上传音频失败: ' + error.message)
                    }
                },
                onSettled: () => {
                    if (voiceFileInputRef.current) {
                        voiceFileInputRef.current.value = ''
                    }
                }
            }
        )
    }

    // 紧凑模式样式
    const containerClass = compact
        ? 'border border-slate-200 rounded-xl p-3 bg-gradient-to-br from-white to-slate-50'
        : 'mt-4 border border-slate-200 rounded-xl p-4 bg-gradient-to-br from-white to-slate-50'

    const headerClass = compact
        ? 'flex items-center gap-2 mb-2 pb-2 border-b'
        : 'flex items-center gap-2 mb-3 pb-2 border-b'

    const iconSize = compact ? 'w-5 h-5' : 'w-6 h-6'
    const innerIconSize = compact ? 'w-3 h-3' : 'w-3.5 h-3.5'

    return (
        <div className={containerClass}>
            <div className={`${headerClass} ${hasCustomVoice ? 'border-slate-100' : 'border-yellow-200'}`}>
                <div className={`${iconSize} rounded-full flex items-center justify-center ${hasCustomVoice ? 'bg-slate-100' : 'bg-yellow-100'}`}>
                    <svg className={`${innerIconSize} ${hasCustomVoice ? 'text-slate-600' : 'text-yellow-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                </div>
                <span className={`text-${compact ? 'xs' : 'sm'} font-medium ${hasCustomVoice ? 'text-slate-700' : 'text-yellow-700'}`}>
                    配音音色{!hasCustomVoice && <span className="text-yellow-600">（无音色）</span>}
                </span>
            </div>

            {/* 隐藏的音频文件输入 */}
            <input
                ref={voiceFileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleUploadVoice}
                className="hidden"
            />

            <div className="flex flex-wrap gap-2 w-full justify-center">
                {/* 上传音频按钮 */}
                <button
                    onClick={() => voiceFileInputRef.current?.click()}
                    disabled={uploadVoice.isPending}
                    className="flex-1 min-w-[80px] px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 font-medium hover:border-green-300 hover:bg-green-50 hover:text-green-700 transition-all relative group whitespace-nowrap"
                >
                    <div className="flex items-center justify-center gap-1">
                        {hasCustomVoice && <div className="w-1.5 h-1.5 bg-green-500 rounded-full flex-shrink-0"></div>}
                        <span>{uploadVoice.isPending ? '上传中...' : hasCustomVoice ? '已上传' : '上传音频'}</span>
                    </div>
                </button>

                {/* 从资产中心选择按钮 */}
                {onSelectFromHub && (
                    <button
                        onClick={() => onSelectFromHub(characterId)}
                        className="flex-1 min-w-[80px] px-2 py-1.5 bg-white border border-blue-200 rounded-lg text-xs text-blue-600 font-medium hover:border-blue-400 hover:bg-blue-50 transition-all whitespace-nowrap"
                    >
                        <div className="flex items-center justify-center gap-1">
                            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            <span>资产库</span>
                        </div>
                    </button>
                )}

                {/* AI设计按钮 */}
                {onVoiceDesign && (
                    <button
                        onClick={() => onVoiceDesign(characterId, characterName)}
                        className="flex-1 min-w-[80px] px-2 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg text-xs font-medium hover:shadow-md transition-all whitespace-nowrap"
                    >
                        <div className="flex items-center justify-center gap-1">
                            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            <span>AI设计</span>
                        </div>
                    </button>
                )}
            </div>

            {/* 试听按钮 - 仅在有音频时显示 */}
            {hasCustomVoice && (
                <button
                    onClick={handlePreviewVoice}
                    className={`w-full mt-2 px-3 py-2 border rounded-lg text-sm font-medium transition-all ${isPreviewingVoice
                        ? 'bg-purple-500 border-purple-500 text-white hover:bg-purple-600'
                        : 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100'
                        }`}
                >
                    <div className="flex items-center justify-center gap-2">
                        {isPreviewingVoice ? (
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <rect x="6" y="5" width="4" height="14" rx="1" />
                                <rect x="14" y="5" width="4" height="14" rx="1" />
                            </svg>
                        ) : (
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                        )}
                        {isPreviewingVoice ? '暂停' : '试听音色'}
                    </div>
                </button>
            )}
        </div>
    )
}
