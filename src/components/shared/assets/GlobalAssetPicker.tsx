'use client'

import { useState, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import ImagePreviewModal from '@/components/ui/ImagePreviewModal'

interface GlobalAssetPickerProps {
    isOpen: boolean
    onClose: () => void
    onSelect: (globalAssetId: string) => void
    type: 'character' | 'location' | 'voice'
    loading?: boolean
}

interface GlobalCharacter {
    id: string
    name: string
    folderName: string | null
    previewUrl: string | null
    appearanceCount: number
    hasVoice: boolean
}

interface GlobalLocation {
    id: string
    name: string
    summary: string | null
    folderName: string | null
    previewUrl: string | null
    imageCount: number
}

interface GlobalVoice {
    id: string
    name: string
    description: string | null
    folderName: string | null
    previewUrl: string | null
    voiceId: string | null
    voiceType: string
    gender: string | null
    language: string
}

// 内联 SVG 图标组件
const XMarkIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
)

const MagnifyingGlassIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
)

const FolderIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
)

const UserIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
)

const PhotoIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
)

const CheckCircleIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
        <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
    </svg>
)

const ZoomInIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
    </svg>
)

const MicrophoneIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
    </svg>
)

export default function GlobalAssetPicker({
    isOpen,
    onClose,
    onSelect,
    type,
    loading: externalLoading
}: GlobalAssetPickerProps) {
    const t = useTranslations('assetPicker')
    const [characters, setCharacters] = useState<GlobalCharacter[]>([])
    const [locations, setLocations] = useState<GlobalLocation[]>([])
    const [voices, setVoices] = useState<GlobalVoice[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [previewImage, setPreviewImage] = useState<string | null>(null)
    const [previewAudio, setPreviewAudio] = useState<string | null>(null)
    const [isPlayingAudio, setIsPlayingAudio] = useState(false)
    const audioRef = useRef<HTMLAudioElement | null>(null)

    // 停止音频播放的辅助函数
    const stopAudio = () => {
        if (audioRef.current) {
            audioRef.current.pause()
            audioRef.current.currentTime = 0
            audioRef.current = null
        }
        setIsPlayingAudio(false)
        setPreviewAudio(null)
    }

    useEffect(() => {
        if (isOpen) {
            fetchAssets()
            setSelectedId(null)
            setSearchQuery('')
        } else {
            // 关闭对话框时停止播放
            stopAudio()
        }
    }, [isOpen, type])

    const fetchAssets = async () => {
        setIsLoading(true)
        try {
            const res = await fetch(`/api/asset-hub/picker?type=${type}`)
            if (res.ok) {
                const data = await res.json()
                if (type === 'character') {
                    setCharacters(data.characters || [])
                } else if (type === 'location') {
                    setLocations(data.locations || [])
                } else if (type === 'voice') {
                    setVoices(data.voices || [])
                }
            }
        } catch (error) {
            console.error('Failed to fetch assets:', error)
        } finally {
            setIsLoading(false)
        }
    }

    const handleConfirm = () => {
        if (selectedId) {
            stopAudio()  // 确认复制时停止音频播放
            onSelect(selectedId)
        }
    }

    const filteredCharacters = characters.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.folderName && c.folderName.toLowerCase().includes(searchQuery.toLowerCase()))
    )

    const filteredLocations = locations.filter(l =>
        l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (l.folderName && l.folderName.toLowerCase().includes(searchQuery.toLowerCase()))
    )

    const filteredVoices = voices.filter(v =>
        v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (v.folderName && v.folderName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (v.description && v.description.toLowerCase().includes(searchQuery.toLowerCase()))
    )

    // 播放/暂停音频预览
    const handlePlayAudio = (audioUrl: string, e: React.MouseEvent) => {
        e.stopPropagation()

        // 如果点击的是当前正在播放的音频，则暂停
        if (previewAudio === audioUrl && isPlayingAudio) {
            stopAudio()
            return
        }

        // 停止之前的播放
        stopAudio()

        // 开始播放新音频
        setIsPlayingAudio(true)
        setPreviewAudio(audioUrl)
        const audio = new Audio(audioUrl)
        audioRef.current = audio
        audio.play()
        audio.onended = () => {
            setIsPlayingAudio(false)
            setPreviewAudio(null)
            audioRef.current = null
        }
        audio.onerror = () => {
            setIsPlayingAudio(false)
            setPreviewAudio(null)
            audioRef.current = null
        }
    }

    if (!isOpen) return null

    const items = type === 'character' ? filteredCharacters : type === 'location' ? filteredLocations : filteredVoices
    const hasNoAssets = type === 'character' ? characters.length === 0 : type === 'location' ? locations.length === 0 : voices.length === 0

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-2xl w-[600px] max-h-[80vh] flex flex-col">
                {/* 头部 */}
                <div className="flex items-center justify-between px-6 py-4 border-b">
                    <h2 className="text-lg font-semibold text-gray-900">
                        {type === 'character' ? t('selectCharacter') : type === 'location' ? t('selectLocation') : t('selectVoice')}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>

                {/* 搜索栏 */}
                <div className="px-6 py-3 border-b">
                    <div className="relative">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={t('searchPlaceholder')}
                            className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                </div>

                {/* 资产列表 */}
                <div className="flex-1 overflow-y-auto p-4">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-40">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                        </div>
                    ) : hasNoAssets ? (
                        <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                            {type === 'character' ? (
                                <UserIcon className="w-12 h-12 mb-2" />
                            ) : type === 'location' ? (
                                <PhotoIcon className="w-12 h-12 mb-2" />
                            ) : (
                                <MicrophoneIcon className="w-12 h-12 mb-2" />
                            )}
                            <p>{t('noAssets')}</p>
                            <p className="text-sm mt-1">{t('createInAssetHub')}</p>
                        </div>
                    ) : items.length === 0 ? (
                        <div className="flex items-center justify-center h-40 text-gray-400">
                            <p>{t('noSearchResults')}</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 gap-3">
                            {type === 'character' ? (
                                filteredCharacters.map((char) => (
                                    <div
                                        key={char.id}
                                        onClick={() => setSelectedId(char.id)}
                                        className={`relative cursor-pointer rounded-xl border-2 p-2 transition-all hover:shadow-md ${selectedId === char.id
                                            ? 'border-blue-500 bg-blue-50'
                                            : 'border-gray-200 hover:border-gray-300'
                                            }`}
                                    >
                                        {/* 选中标记 */}
                                        {selectedId === char.id && (
                                            <CheckCircleIcon className="absolute -top-2 -right-2 w-6 h-6 text-blue-500 bg-white rounded-full" />
                                        )}

                                        {/* 预览图 */}
                                        <div className="aspect-square rounded-lg overflow-hidden bg-gray-100 mb-2 relative group/image">
                                            {char.previewUrl ? (
                                                <>
                                                    <img
                                                        src={char.previewUrl}
                                                        alt={char.name}
                                                        className="w-full h-full object-cover cursor-zoom-in"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setPreviewImage(char.previewUrl)
                                                        }}
                                                    />
                                                    {/* 放大图标覆盖层 */}
                                                    <div
                                                        className="absolute inset-0 bg-black/0 group-hover/image:bg-black/30 transition-all flex items-center justify-center cursor-zoom-in"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setPreviewImage(char.previewUrl)
                                                        }}
                                                    >
                                                        <ZoomInIcon className="w-6 h-6 text-white opacity-0 group-hover/image:opacity-100 transition-opacity" />
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-gray-300">
                                                    <UserIcon className="w-12 h-12" />
                                                </div>
                                            )}
                                        </div>

                                        {/* 名称 */}
                                        <div className="text-center">
                                            <p className="font-medium text-sm text-gray-900 truncate">{char.name}</p>
                                            {char.folderName && (
                                                <p className="text-xs text-gray-400 flex items-center justify-center gap-1 mt-0.5">
                                                    <FolderIcon className="w-3 h-3" />
                                                    {char.folderName}
                                                </p>
                                            )}
                                            <p className="text-xs text-gray-500 mt-1">
                                                {char.appearanceCount} {t('appearances')}
                                                {char.hasVoice && ' · 🎤'}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            ) : type === 'location' ? (
                                filteredLocations.map((loc) => (
                                    <div
                                        key={loc.id}
                                        onClick={() => setSelectedId(loc.id)}
                                        className={`relative cursor-pointer rounded-xl border-2 p-2 transition-all hover:shadow-md ${selectedId === loc.id
                                            ? 'border-blue-500 bg-blue-50'
                                            : 'border-gray-200 hover:border-gray-300'
                                            }`}
                                    >
                                        {/* 选中标记 */}
                                        {selectedId === loc.id && (
                                            <CheckCircleIcon className="absolute -top-2 -right-2 w-6 h-6 text-blue-500 bg-white rounded-full" />
                                        )}

                                        {/* 预览图 */}
                                        <div className="aspect-video rounded-lg overflow-hidden bg-gray-100 mb-2 relative group/image">
                                            {loc.previewUrl ? (
                                                <>
                                                    <img
                                                        src={loc.previewUrl}
                                                        alt={loc.name}
                                                        className="w-full h-full object-cover cursor-zoom-in"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setPreviewImage(loc.previewUrl)
                                                        }}
                                                    />
                                                    {/* 放大图标覆盖层 */}
                                                    <div
                                                        className="absolute inset-0 bg-black/0 group-hover/image:bg-black/30 transition-all flex items-center justify-center cursor-zoom-in"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setPreviewImage(loc.previewUrl)
                                                        }}
                                                    >
                                                        <ZoomInIcon className="w-6 h-6 text-white opacity-0 group-hover/image:opacity-100 transition-opacity" />
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-gray-300">
                                                    <PhotoIcon className="w-12 h-12" />
                                                </div>
                                            )}
                                        </div>

                                        {/* 名称 */}
                                        <div className="text-center">
                                            <p className="font-medium text-sm text-gray-900 truncate">{loc.name}</p>
                                            {loc.folderName && (
                                                <p className="text-xs text-gray-400 flex items-center justify-center gap-1 mt-0.5">
                                                    <FolderIcon className="w-3 h-3" />
                                                    {loc.folderName}
                                                </p>
                                            )}
                                            <p className="text-xs text-gray-500 mt-1">
                                                {loc.imageCount} {t('images')}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                // 音色列表渲染
                                filteredVoices.map((voice) => (
                                    <div
                                        key={voice.id}
                                        onClick={() => setSelectedId(voice.id)}
                                        className={`relative cursor-pointer rounded-xl border-2 p-3 transition-all hover:shadow-md ${selectedId === voice.id
                                            ? 'border-blue-500 bg-blue-50'
                                            : 'border-gray-200 hover:border-gray-300'
                                            }`}
                                    >
                                        {/* 选中标记 */}
                                        {selectedId === voice.id && (
                                            <CheckCircleIcon className="absolute -top-2 -right-2 w-6 h-6 text-blue-500 bg-white rounded-full" />
                                        )}

                                        {/* 音色图标和播放按钮 */}
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${voice.previewUrl ? 'bg-gradient-to-br from-purple-500 to-pink-500' : 'bg-gray-100'}`}>
                                                <MicrophoneIcon className={`w-6 h-6 ${voice.previewUrl ? 'text-white' : 'text-gray-400'}`} />
                                            </div>
                                            {voice.previewUrl && (
                                                <button
                                                    onClick={(e) => handlePlayAudio(voice.previewUrl!, e)}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${previewAudio === voice.previewUrl && isPlayingAudio
                                                        ? 'bg-purple-500 text-white'
                                                        : 'bg-purple-100 text-purple-600 hover:bg-purple-200'
                                                        }`}
                                                >
                                                    {previewAudio === voice.previewUrl && isPlayingAudio ? t('stop') : t('preview')}
                                                </button>
                                            )}
                                        </div>

                                        {/* 音色信息 */}
                                        <div>
                                            <p className="font-medium text-sm text-gray-900 truncate">{voice.name}</p>
                                            {voice.description && (
                                                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{voice.description}</p>
                                            )}
                                            <div className="flex items-center gap-2 mt-1">
                                                {voice.folderName && (
                                                    <span className="text-xs text-gray-400 flex items-center gap-0.5">
                                                        <FolderIcon className="w-3 h-3" />
                                                        {voice.folderName}
                                                    </span>
                                                )}
                                                {voice.gender && (
                                                    <span className="text-xs text-gray-400">
                                                        {voice.gender === 'male' ? '♂' : voice.gender === 'female' ? '♀' : '⚪'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>

                {/* 底部按钮 */}
                <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                    >
                        {t('cancel')}
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={!selectedId || externalLoading}
                        className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {externalLoading && (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        )}
                        {t('confirmCopy')}
                    </button>
                </div>
            </div>

            {/* 图片放大预览弹窗 */}
            {previewImage && (
                <ImagePreviewModal
                    imageUrl={previewImage}
                    onClose={() => setPreviewImage(null)}
                />
            )}
        </div>
    )
}
