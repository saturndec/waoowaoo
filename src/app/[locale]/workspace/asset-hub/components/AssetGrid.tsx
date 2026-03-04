'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { CharacterCard } from './CharacterCard'
import { LocationCard } from './LocationCard'
import { VoiceCard } from './VoiceCard'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { AppIcon } from '@/components/ui/icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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
        imageUrls: string[]
        selectedIndex: number | null
        effectiveSelectedIndex?: number | null
        previousImageUrl: string | null
        previousImageUrls: string[]
        imageTaskRunning: boolean
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
        imageTaskRunning: boolean
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
    onImageEdit?: (type: 'character' | 'location', id: string, name: string, imageIndex: number, appearanceIndex?: number) => void
    onVoiceDesign?: (characterId: string, characterName: string) => void
    onCharacterEdit?: (character: unknown, appearance: unknown) => void
    onLocationEdit?: (location: unknown, imageIndex: number) => void
    onVoiceSelect?: (characterId: string) => void
}

const PlusIcon = ({ className }: { className?: string }) => (
    <AppIcon name="plus" className={className} />
)

type FilterType = 'all' | 'character' | 'location' | 'voice'
type SectionType = 'character' | 'location' | 'voice'

const sectionGridClassName =
    'grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,15.5rem),1fr))] 2xl:[grid-template-columns:repeat(auto-fill,minmax(min(100%,17rem),1fr))]'

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
    void selectedFolderId

    const loadingState = loading
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'generate',
            resource: 'image',
            hasOutput: false,
        })
        : null

    const [filter, setFilter] = useState<FilterType>('all')
    const [sectionPage, setSectionPage] = useState<{ character: number; location: number; voice: number }>({
        character: 1,
        location: 1,
        voice: 1,
    })

    const pageSize = 40
    const paginate = <T,>(rows: T[], page: number) => {
        const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
        const safePage = Math.min(Math.max(page, 1), totalPages)
        const start = (safePage - 1) * pageSize
        return {
            items: rows.slice(start, start + pageSize),
            page: safePage,
            totalPages,
        }
    }

    const setPage = (type: SectionType, page: number) => {
        setSectionPage((prev) => ({ ...prev, [type]: page }))
    }

    const charactersPage = paginate(characters, sectionPage.character)
    const locationsPage = paginate(locations, sectionPage.location)
    const voicesPage = paginate(voices, sectionPage.voice)

    const renderPagination = (type: SectionType, page: number, totalPages: number) => {
        if (totalPages <= 1) return null
        return (
            <div className="mt-4 flex items-center justify-end gap-2">
                <Button
                    onClick={() => setPage(type, page - 1)}
                    disabled={page <= 1}
                    size="sm"
                    variant="outline"
                >
                    {t('pagination.previous')}
                </Button>
                <span className="text-xs text-muted-foreground">
                    {page} / {totalPages}
                </span>
                <Button
                    onClick={() => setPage(type, page + 1)}
                    disabled={page >= totalPages}
                    size="sm"
                    variant="outline"
                >
                    {t('pagination.next')}
                </Button>
            </div>
        )
    }

    if (loading) {
        return (
            <Card className="flex min-h-[360px] flex-1 items-center justify-center">
                <CardContent className="p-8">
                    <TaskStatusInline state={loadingState} />
                </CardContent>
            </Card>
        )
    }

    const isEmpty = characters.length === 0 && locations.length === 0 && voices.length === 0

    const tabs: Array<{ id: FilterType; label: string }> = [
        { id: 'all', label: t('allAssets') },
        { id: 'character', label: t('characters') },
        { id: 'location', label: t('locations') },
        { id: 'voice', label: t('voices') },
    ]

    return (
        <div className="min-w-0 flex-1 space-y-4">
            <Card>
                <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="grid w-full grid-cols-2 gap-1 rounded-lg border border-border bg-muted p-1 sm:w-auto sm:grid-cols-4">
                        {tabs.map((tab) => (
                            <Button
                                key={tab.id}
                                onClick={() => setFilter(tab.id)}
                                variant={filter === tab.id ? 'secondary' : 'ghost'}
                                size="sm"
                                className="h-8 justify-center px-3 text-xs"
                            >
                                {tab.label}
                            </Button>
                        ))}
                    </div>

                    <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-3">
                        <Button onClick={onAddCharacter} className="h-9 justify-center gap-1.5 text-sm">
                            <PlusIcon className="h-4 w-4" />
                            <span>{t('addCharacter')}</span>
                        </Button>
                        <Button onClick={onAddLocation} className="h-9 justify-center gap-1.5 text-sm">
                            <PlusIcon className="h-4 w-4" />
                            <span>{t('addLocation')}</span>
                        </Button>
                        <Button onClick={onAddVoice} variant="secondary" className="h-9 justify-center gap-1.5 text-sm">
                            <PlusIcon className="h-4 w-4" />
                            <span>{t('addVoice')}</span>
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {isEmpty ? (
                <Card className="border-dashed">
                    <CardContent className="py-14 text-center">
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                            <PlusIcon className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <p className="mb-2 text-sm text-foreground">{t('emptyState')}</p>
                        <p className="text-xs text-muted-foreground">{t('emptyStateHint')}</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {(filter === 'all' || filter === 'character') && characters.length > 0 && (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2 text-sm">
                                    {t('characters')}
                                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                                        {characters.length}
                                    </Badge>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-0">
                                <div className={sectionGridClassName}>
                                    {charactersPage.items.map((character) => (
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
                                {renderPagination('character', charactersPage.page, charactersPage.totalPages)}
                            </CardContent>
                        </Card>
                    )}

                    {(filter === 'all' || filter === 'location') && locations.length > 0 && (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2 text-sm">
                                    {t('locations')}
                                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                                        {locations.length}
                                    </Badge>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-0">
                                <div className={sectionGridClassName}>
                                    {locationsPage.items.map((location) => (
                                        <LocationCard
                                            key={location.id}
                                            location={location}
                                            onImageClick={onImageClick}
                                            onImageEdit={onImageEdit}
                                            onEdit={onLocationEdit}
                                        />
                                    ))}
                                </div>
                                {renderPagination('location', locationsPage.page, locationsPage.totalPages)}
                            </CardContent>
                        </Card>
                    )}

                    {(filter === 'all' || filter === 'voice') && voices.length > 0 && (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2 text-sm">
                                    {t('voices')}
                                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                                        {voices.length}
                                    </Badge>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-0">
                                <div className={sectionGridClassName}>
                                    {voicesPage.items.map((voice) => (
                                        <VoiceCard
                                            key={voice.id}
                                            voice={voice}
                                        />
                                    ))}
                                </div>
                                {renderPagination('voice', voicesPage.page, voicesPage.totalPages)}
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}
        </div>
    )
}
