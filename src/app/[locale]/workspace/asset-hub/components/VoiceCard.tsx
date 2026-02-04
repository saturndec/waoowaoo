'use client'

import { useState, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { useDeleteVoice } from '@/lib/query/mutations'

interface Voice {
    id: string
    name: string
    description: string | null
    voiceId: string | null
    voiceType: string
    customVoiceUrl: string | null
    voicePrompt: string | null
    gender: string | null
    language: string
    folderId: string | null
}

interface VoiceCardProps {
    voice: Voice
    onSelect?: (voice: Voice) => void  // 选择模式时使用
    isSelected?: boolean  // 是否被选中
    selectionMode?: boolean  // 是否在选择模式
}

export function VoiceCard({ voice, onSelect, isSelected = false, selectionMode = false }: VoiceCardProps) {
    // 🔥 使用 mutation hook
    const deleteVoice = useDeleteVoice()
    const t = useTranslations('assetHub')
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [isPlaying, setIsPlaying] = useState(false)
    const audioRef = useRef<HTMLAudioElement | null>(null)

    // 播放预览
    const handlePlay = () => {
        if (!voice.customVoiceUrl) return

        if (isPlaying && audioRef.current) {
            audioRef.current.pause()
            setIsPlaying(false)
            return
        }

        const audio = new Audio(voice.customVoiceUrl)
        audioRef.current = audio
        audio.onended = () => setIsPlaying(false)
        audio.onerror = () => setIsPlaying(false)
        audio.play()
        setIsPlaying(true)
    }

    // 删除音色
    const handleDelete = () => {
        deleteVoice.mutate(voice.id, {
            onSettled: () => setShowDeleteConfirm(false)
        })
    }

    // 选择模式点击
    const handleCardClick = () => {
        if (selectionMode && onSelect) {
            onSelect(voice)
        }
    }

    // 性别图标
    const genderIcon = voice.gender === 'male' ? '♂' : voice.gender === 'female' ? '♀' : ''

    return (
        <div
            onClick={handleCardClick}
            className={`bg-white/80 backdrop-blur-sm rounded-xl shadow-sm overflow-hidden relative group transition-all ${selectionMode ? 'cursor-pointer hover:ring-2 hover:ring-purple-300' : ''
                } ${isSelected ? 'ring-2 ring-purple-500' : ''}`}
        >
            {/* 选中标记 */}
            {isSelected && (
                <div className="absolute top-2 right-2 w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center z-10">
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                </div>
            )}

            {/* 音色图标区域 */}
            <div className="relative bg-gradient-to-br from-purple-100 to-pink-100 p-6 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center shadow-lg">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                </div>

                {/* 性别标签 */}
                {genderIcon && (
                    <div className="absolute top-2 left-2 text-sm bg-white/80 px-2 py-0.5 rounded-full">
                        {genderIcon}
                    </div>
                )}

                {/* 试听按钮 */}
                {voice.customVoiceUrl && (
                    <button
                        onClick={(e) => { e.stopPropagation(); handlePlay() }}
                        className={`absolute bottom-2 right-2 w-10 h-10 rounded-full flex items-center justify-center shadow-md transition-all ${isPlaying
                            ? 'bg-purple-500 text-white animate-pulse'
                            : 'bg-white/90 text-purple-600 hover:bg-purple-500 hover:text-white'
                            }`}
                    >
                        {isPlaying ? (
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                <rect x="6" y="5" width="4" height="14" rx="1" />
                                <rect x="14" y="5" width="4" height="14" rx="1" />
                            </svg>
                        ) : (
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                        )}
                    </button>
                )}
            </div>

            {/* 信息区域 */}
            <div className="p-3">
                <div className="flex items-center justify-between">
                    <h3 className="font-medium text-gray-900 text-sm truncate">{voice.name}</h3>
                    {!selectionMode && (
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true) }}
                            className="w-6 h-6 rounded hover:bg-red-100 text-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    )}
                </div>
                {voice.description && (
                    <p className="mt-1 text-xs text-gray-500 line-clamp-2">{voice.description}</p>
                )}
                {voice.voicePrompt && !voice.description && (
                    <p className="mt-1 text-xs text-gray-400 line-clamp-2 italic">{voice.voicePrompt}</p>
                )}
            </div>

            {/* 删除确认 */}
            {showDeleteConfirm && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center backdrop-blur-sm z-20">
                    <div className="bg-white rounded-lg p-4 m-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <p className="mb-4 text-sm">{t('confirmDeleteVoice')}</p>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setShowDeleteConfirm(false)} className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">{t('cancel')}</button>
                            <button onClick={handleDelete} className="px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm">{t('delete')}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default VoiceCard
