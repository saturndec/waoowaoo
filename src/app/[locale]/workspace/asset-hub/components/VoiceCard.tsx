'use client'

import { useState, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { useDeleteVoice } from '@/lib/query/mutations'
import { AppIcon } from '@/components/ui/icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

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
    onSelect?: (voice: Voice) => void
    isSelected?: boolean
    selectionMode?: boolean
}

export function VoiceCard({ voice, onSelect, isSelected = false, selectionMode = false }: VoiceCardProps) {
    const deleteVoice = useDeleteVoice()
    const t = useTranslations('assetHub')
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [isPlaying, setIsPlaying] = useState(false)
    const audioRef = useRef<HTMLAudioElement | null>(null)

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

    const handleDelete = () => {
        deleteVoice.mutate(voice.id, {
            onSettled: () => setShowDeleteConfirm(false)
        })
    }

    const handleCardClick = () => {
        if (selectionMode && onSelect) {
            onSelect(voice)
        }
    }

    const genderIcon = voice.gender === 'male' ? 'M' : voice.gender === 'female' ? 'F' : ''

    return (
        <>
            <Card
                onClick={handleCardClick}
                className={`group relative overflow-hidden transition-all ${selectionMode ? 'cursor-pointer hover:border-primary/40 hover:shadow-sm' : ''} ${isSelected ? 'ring-2 ring-primary/50' : ''}`}
            >
                {isSelected && (
                    <div className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <AppIcon name="checkSolid" className="h-4 w-4" />
                    </div>
                )}

                <div className="relative flex items-center justify-center bg-muted/50 p-6">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-background">
                        <AppIcon name="mic" className="h-8 w-8 text-primary" />
                    </div>

                    {genderIcon && (
                        <Badge variant="secondary" className="absolute left-2 top-2 h-5 rounded-full px-1.5 text-[10px]">
                            {genderIcon}
                        </Badge>
                    )}

                    {voice.customVoiceUrl && (
                        <Button
                            onClick={(event) => {
                                event.stopPropagation()
                                handlePlay()
                            }}
                            variant={isPlaying ? 'default' : 'secondary'}
                            size="icon"
                            className={`absolute bottom-2 right-2 h-10 w-10 rounded-full ${isPlaying ? 'animate-pulse' : ''}`}
                        >
                            {isPlaying ? (
                                <AppIcon name="pause" className="h-5 w-5" />
                            ) : (
                                <AppIcon name="play" className="h-5 w-5" />
                            )}
                        </Button>
                    )}
                </div>

                <CardContent className="space-y-1 p-3">
                    <div className="flex items-center justify-between gap-2">
                        <h3 className="truncate text-sm font-medium text-foreground">{voice.name}</h3>
                        {!selectionMode && (
                            <Button
                                onClick={(event) => {
                                    event.stopPropagation()
                                    setShowDeleteConfirm(true)
                                }}
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                            >
                                <AppIcon name="trash" className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                    {voice.description && (
                        <p className="line-clamp-2 text-xs text-muted-foreground">{voice.description}</p>
                    )}
                    {voice.voicePrompt && !voice.description && (
                        <p className="line-clamp-2 text-xs italic text-muted-foreground">{voice.voicePrompt}</p>
                    )}
                </CardContent>
            </Card>

            <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="text-base">{t('confirmDeleteVoice')}</DialogTitle>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                            {t('cancel')}
                        </Button>
                        <Button variant="destructive" onClick={handleDelete}>
                            {t('delete')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}

export default VoiceCard
