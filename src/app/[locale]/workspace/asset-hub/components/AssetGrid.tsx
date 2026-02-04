'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { CharacterCard } from './CharacterCard'
import { LocationCard } from './LocationCard'
import { VoiceCard } from './VoiceCard'

interface Character {
    id: string
    name: string
    folderId: string | null
    customVoiceUrl: string | null
    appearances: Array<{
        id: string
        appearanceIndex: number
        changeReason: string
        description: string | null
        imageUrl: string | null
        imageUrls: string | null
        selectedIndex: number | null
        effectiveSelectedIndex: number | null
        previousImageUrl: string | null
        previousImageUrls: string | null
        generating: boolean
    }>
}

interface Location {
    id: string
    name: string
    summary: string | null
    folderId: string | null
    images: Array<{
        id: string
        imageIndex: number
        description: string | null
        imageUrl: string | null
        previousImageUrl: string | null
        isSelected: boolean
        generating: boolean
    }>
}

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

interface AssetGridProps {
    characters: Character[]
    locations: Location[]
    voices: Voice[]
    loading: boolean
    onAddCharacter: () => void
    onAddLocation: () => void
    onAddVoice: () => void
    selectedFolderId: string | null
    onImageClick?: (url: string) => void
    onImageEdit?: (type: 'character' | 'location', id: string, name: string, imageIndex: number, appearanceId?: string) => void
    onVoiceDesign?: (characterId: string, characterName: string) => void
    onCharacterEdit?: (character: any, appearance: any) => void
    onLocationEdit?: (location: any, imageIndex: number) => void
    onVoiceSelect?: (characterId: string) => void
}

// 内联 SVG 图标
const PlusIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
)

export function AssetGrid({
    characters,
    locations,
    voices,
    loading,
    onAddCharacter,
    onAddLocation,
    onAddVoice,
    selectedFolderId,
    onImageClick,
    onImageEdit,
    onVoiceDesign,
    onCharacterEdit,
    onLocationEdit,
    onVoiceSelect
}: AssetGridProps) {
    const t = useTranslations('assetHub')

    const [filter, setFilter] = useState<'all' | 'character' | 'location' | 'voice'>('all')

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
        )
    }

    const isEmpty = characters.length === 0 && locations.length === 0 && voices.length === 0

    const tabs = [
        { id: 'all', label: '全部' },
        { id: 'character', label: t('characters') },
        { id: 'location', label: t('locations') },
        { id: 'voice', label: t('voices') },
    ]

    return (
        <div className="flex-1 min-w-0">
            {/* Header: 筛选 Tab + 操作按钮 */}
            <div className="flex items-center justify-between mb-6">
                {/* 左侧筛选 */}
                <div className="flex items-center bg-gray-100 p-1 rounded-lg">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setFilter(tab.id as any)}
                            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${filter === tab.id
                                ? 'bg-white text-gray-900 shadow-sm'
                                : 'text-gray-500 hover:text-gray-900'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* 右侧新建按钮 */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={onAddCharacter}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors text-sm font-medium shadow-sm"
                    >
                        <PlusIcon className="w-4 h-4" />
                        <span>{t('addCharacter')}</span>
                    </button>
                    <button
                        onClick={onAddLocation}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors text-sm font-medium shadow-sm"
                    >
                        <PlusIcon className="w-4 h-4" />
                        <span>{t('addLocation')}</span>
                    </button>
                    <button
                        onClick={onAddVoice}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors text-sm font-medium shadow-sm"
                    >
                        <PlusIcon className="w-4 h-4" />
                        <span>{t('addVoice')}</span>
                    </button>
                </div>
            </div>

            {isEmpty ? (
                /* 空状态 */
                <div className="bg-white/70 backdrop-blur-sm rounded-xl p-12 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                        <PlusIcon className="w-8 h-8 text-gray-400" />
                    </div>
                    <p className="text-gray-500 mb-2">{t('emptyState')}</p>
                    <p className="text-sm text-gray-400">{t('emptyStateHint')}</p>
                </div>
            ) : (
                <div className="space-y-8">
                    {/* 角色区块 */}
                    {(filter === 'all' || filter === 'character') && characters.length > 0 && (
                        <section>
                            <h2 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                                {t('characters')}
                                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{characters.length}</span>
                            </h2>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                {characters.map((character) => (
                                    <CharacterCard
                                        key={character.id}
                                        character={character}
                                        onImageClick={onImageClick}
                                        onImageEdit={onImageEdit}
                                        onVoiceDesign={onVoiceDesign}
                                        onEdit={onCharacterEdit}
                                        onVoiceSelect={onVoiceSelect}
                                    />
                                ))}
                            </div>
                        </section>
                    )}

                    {/* 场景区块 */}
                    {(filter === 'all' || filter === 'location') && locations.length > 0 && (
                        <section>
                            <h2 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                                {t('locations')}
                                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{locations.length}</span>
                            </h2>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {locations.map((location) => (
                                    <LocationCard
                                        key={location.id}
                                        location={location}
                                        onImageClick={onImageClick}
                                        onImageEdit={onImageEdit}
                                        onEdit={onLocationEdit}
                                    />
                                ))}
                            </div>
                        </section>
                    )}

                    {/* 音色区块 */}
                    {(filter === 'all' || filter === 'voice') && voices.length > 0 && (
                        <section>
                            <h2 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                                {t('voices')}
                                <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full">{voices.length}</span>
                            </h2>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                {voices.map((voice) => (
                                    <VoiceCard
                                        key={voice.id}
                                        voice={voice}
                                    />
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            )}
        </div>
    )
}
