'use client'

/**
 * 音色设置组件 - 从 CharacterCard 提取
 * 支持上传自定义音频和 AI 声音设计
 */

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { shouldShowError } from '@/lib/error-utils'
import { useUploadCharacterVoice } from '@/lib/query/mutations'
import { AppIcon } from '@/components/ui/icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface VoiceSettingsProps {
    characterId: string
    characterName: string
    customVoiceUrl: string | null | undefined
    projectId?: string  // 可选，Asset Hub 不需要
    onVoiceChange?: (characterId: string, customVoiceUrl?: string) => void
    onVoiceDesign?: (characterId: string, characterName: string) => void
    onVoiceSelect?: (characterId: string) => void  // 从音色库选择
    compact?: boolean  // 紧凑模式（单图卡片用）
}

export default function VoiceSettings({
    characterId,
    characterName,
    customVoiceUrl,
    projectId,
    onVoiceChange,
    onVoiceDesign,
    onVoiceSelect,
    compact = false
}: VoiceSettingsProps) {
    const t = useTranslations('assetHub')
    // 🔥 使用 mutation hook
    const uploadVoice = useUploadCharacterVoice()
    void projectId
    const voiceFileInputRef = useRef<HTMLInputElement>(null)
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const [isPreviewingVoice, setIsPreviewingVoice] = useState(false)
    type UploadedVoiceResult = { audioUrl?: string }

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
        } catch (error: unknown) {
            if (shouldShowError(error)) {
                const message = error instanceof Error ? error.message : String(error)
                alert(t('voiceSettings.previewFailed', { error: message }))
            }
            setIsPreviewingVoice(false)
        }
    }

    // 上传自定义音频
    const handleUploadVoice = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        uploadVoice.mutate(
            { file, characterId },
            {
                onSuccess: (data) => {
                    const result = (data || {}) as UploadedVoiceResult
                    onVoiceChange?.(characterId, result.audioUrl)
                },
                onError: (error) => {
                    if (shouldShowError(error)) {
                        alert(t('voiceSettings.uploadFailed', { error: error.message }))
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
        ? 'p-3'
        : 'mt-4 p-4'

    const headerClass = compact
        ? 'mb-2 flex items-center gap-2 border-b pb-2'
        : 'mb-3 flex items-center gap-2 border-b pb-2'

    const iconSize = compact ? 'w-5 h-5' : 'w-6 h-6'
    const innerIconSize = compact ? 'w-3 h-3' : 'w-3.5 h-3.5'

    return (
        <Card className={containerClass}>
            <div className={`${headerClass} ${hasCustomVoice ? 'border-border' : 'border-amber-300'}`}>
                <div className={`${iconSize} flex items-center justify-center rounded-full ${hasCustomVoice ? 'bg-muted text-muted-foreground' : 'bg-amber-100 text-amber-700'}`}>
                    <AppIcon name="mic" className={innerIconSize} />
                </div>
                <span className={`font-medium ${compact ? 'text-xs' : 'text-sm'} ${hasCustomVoice ? 'text-foreground' : 'text-amber-700'}`}>
                    {t('voiceSettings.title')}
                    {!hasCustomVoice && <span className="ml-1 text-amber-700">({t('voiceSettings.noVoice')})</span>}
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

            <div className="flex w-full flex-wrap justify-center gap-2">
                <Button
                    onClick={() => voiceFileInputRef.current?.click()}
                    disabled={uploadVoice.isPending}
                    variant="outline"
                    size="sm"
                    className="h-8 min-w-[90px] flex-1 whitespace-nowrap text-xs"
                >
                    <div className="flex items-center justify-center gap-1">
                        {hasCustomVoice && <Badge className="h-1.5 w-1.5 rounded-full p-0" />}
                        <span>{uploadVoice.isPending ? t('voiceSettings.uploading') : hasCustomVoice ? t('voiceSettings.uploaded') : t('voiceSettings.uploadAudio')}</span>
                    </div>
                </Button>

                {onVoiceDesign && (
                    <Button
                        onClick={() => onVoiceDesign(characterId, characterName)}
                        variant="secondary"
                        size="sm"
                        className="h-8 min-w-[90px] flex-1 whitespace-nowrap text-xs"
                    >
                        <div className="flex items-center justify-center gap-1">
                            <AppIcon name="bolt" className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>{t('voiceSettings.aiDesign')}</span>
                        </div>
                    </Button>
                )}

                {onVoiceSelect && (
                    <Button
                        onClick={() => onVoiceSelect(characterId)}
                        variant="outline"
                        size="sm"
                        className="h-8 min-w-[90px] flex-1 whitespace-nowrap text-xs"
                    >
                        <div className="flex items-center justify-center gap-1">
                            <AppIcon name="folderCards" className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>{t('voiceSettings.voiceLibrary')}</span>
                        </div>
                    </Button>
                )}
            </div>

            {/* 试听按钮 - 仅在有音频时显示 */}
            {hasCustomVoice && (
                <Button
                    onClick={handlePreviewVoice}
                    variant={isPreviewingVoice ? 'default' : 'outline'}
                    className="mt-2 h-9 w-full text-sm"
                >
                    <div className="flex items-center justify-center gap-2">
                        {isPreviewingVoice ? (
                            <AppIcon name="pause" className="w-4 h-4" />
                        ) : (
                            <AppIcon name="play" className="w-4 h-4" />
                        )}
                        {isPreviewingVoice ? t('voiceSettings.pause') : t('voiceSettings.preview')}
                    </div>
                </Button>
            )}
        </Card>
    )
}
