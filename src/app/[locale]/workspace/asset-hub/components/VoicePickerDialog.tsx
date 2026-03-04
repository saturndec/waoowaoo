'use client'
import { logError as _ulogError } from '@/lib/logging/core'

import { useState, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useGlobalVoices } from '@/lib/query/hooks'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { AppIcon } from '@/components/ui/icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

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

interface VoicePickerDialogProps {
    isOpen: boolean
    onClose: () => void
    onSelect: (voice: Voice) => void
}

export default function VoicePickerDialog({ isOpen, onClose, onSelect }: VoicePickerDialogProps) {
    const t = useTranslations('assetHub')
    const tv = useTranslations('voice.voiceDesign')
    const voicesQuery = useGlobalVoices()
    const [selectedVoice, setSelectedVoice] = useState<Voice | null>(null)
    const [playingId, setPlayingId] = useState<string | null>(null)
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const voices = (voicesQuery.data || []) as Voice[]
    const loading = isOpen ? voicesQuery.isFetching : false
    const loadingState = loading
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'process',
            resource: 'audio',
            hasOutput: false,
        })
        : null

    const refetchVoices = voicesQuery.refetch

    useEffect(() => {
        if (!isOpen) return
        refetchVoices().catch((error) => {
            _ulogError('加载音色失败:', error)
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen])

    // 播放预览
    const handlePlay = (voice: Voice) => {
        if (!voice.customVoiceUrl) return

        if (playingId === voice.id && audioRef.current) {
            audioRef.current.pause()
            setPlayingId(null)
            return
        }

        if (audioRef.current) {
            audioRef.current.pause()
        }

        const audio = new Audio(voice.customVoiceUrl)
        audioRef.current = audio
        audio.onended = () => setPlayingId(null)
        audio.onerror = () => setPlayingId(null)
        audio.play()
        setPlayingId(voice.id)
    }

    // 确认选择
    const handleConfirm = () => {
        if (selectedVoice) {
            onSelect(selectedVoice)
            onClose()
        }
    }

    // 关闭时清理
    const handleClose = () => {
        if (audioRef.current) {
            audioRef.current.pause()
        }
        setSelectedVoice(null)
        setPlayingId(null)
        onClose()
    }

    if (!isOpen) return null

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose() }}>
            <DialogContent className="z-[10000] max-h-[80vh] w-full max-w-2xl overflow-hidden p-0">
                <DialogHeader className="border-b border-border bg-muted/40 px-5 py-3">
                    <DialogTitle className="flex items-center gap-2 text-base">
                        <AppIcon name="mic" className="h-5 w-5 text-muted-foreground" />
                        {t('voicePickerTitle')}
                    </DialogTitle>
                </DialogHeader>

                {/* 内容区 */}
                <div className="max-h-[60vh] overflow-y-auto p-5">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <TaskStatusInline state={loadingState} />
                        </div>
                    ) : voices.length === 0 ? (
                        <div className="py-12 text-center text-muted-foreground">
                            <AppIcon name="mic" className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
                            <p>{t('voicePickerEmpty')}</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                            {voices.map((voice) => {
                                const isSelected = selectedVoice?.id === voice.id
                                const isPlaying = playingId === voice.id
                                const genderIcon = voice.gender === 'male' ? 'M' : voice.gender === 'female' ? 'F' : ''

                                return (
                                    <div
                                        key={voice.id}
                                        onClick={() => setSelectedVoice(voice)}
                                        className={`relative cursor-pointer rounded-xl border-2 p-4 transition-all ${isSelected
                                            ? 'border-primary/50 bg-primary/10'
                                            : 'border-border bg-card hover:border-primary/40'
                                            }`}
                                    >
                                        {/* 选中标记 */}
                                        {isSelected && (
                                            <div className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                                <AppIcon name="checkSolid" className="h-3 w-3" />
                                            </div>
                                        )}

                                        {/* 音色信息 */}
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-border bg-muted">
                                                <AppIcon name="mic" className="h-5 w-5 text-muted-foreground" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1">
                                                    <span className="truncate text-sm font-medium text-foreground">{voice.name}</span>
                                                    {genderIcon && <span className="rounded-full bg-muted px-1.5 py-0 text-[10px] text-muted-foreground">{genderIcon}</span>}
                                                </div>
                                                {voice.description && (
                                                    <p className="truncate text-xs text-muted-foreground">{voice.description}</p>
                                                )}
                                            </div>
                                        </div>

                                        {/* 试听按钮 */}
                                        {voice.customVoiceUrl && (
                                            <Button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); handlePlay(voice) }}
                                                variant={isPlaying ? 'secondary' : 'outline'}
                                                size="sm"
                                                className="mt-2 w-full gap-1 text-xs"
                                            >
                                                {isPlaying ? (
                                                    <>
                                                        <AppIcon name="pause" className="h-3 w-3" />
                                                        {tv('playing')}
                                                    </>
                                                ) : (
                                                    <>
                                                        <AppIcon name="play" className="h-3 w-3" />
                                                        {tv('preview')}
                                                    </>
                                                )}
                                            </Button>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* 底部操作 */}
                <div className="flex gap-2 border-t border-border bg-muted/40 p-4">
                    <Button
                        type="button"
                        onClick={handleClose}
                        variant="outline"
                        className="flex-1"
                    >
                        {t('cancel')}
                    </Button>
                    <Button
                        type="button"
                        onClick={handleConfirm}
                        disabled={!selectedVoice}
                        className="flex-1"
                    >
                        {t('voicePickerConfirm')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
