'use client'
import { logInfo as _ulogInfo } from '@/lib/logging/core'
import { resolveErrorDisplay } from '@/lib/errors/display'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
    useGenerateCharacterImage,
    useSelectCharacterImage,
    useUndoCharacterImage,
    useUploadCharacterImage,
    useDeleteCharacter,
    useDeleteCharacterAppearance,
    useUploadCharacterVoice
} from '@/lib/query/mutations'
import VoiceSettings from './VoiceSettings'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import TaskStatusOverlay from '@/components/task/TaskStatusOverlay'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { PRIMARY_APPEARANCE_INDEX } from '@/lib/constants'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AppIcon } from '@/components/ui/icons'

interface Appearance {
    id: string
    appearanceIndex: number
    changeReason: string
    description: string | null
    imageUrl: string | null
    imageUrls: string[]
    selectedIndex: number | null
    previousImageUrl: string | null
    previousImageUrls: string[]
    imageTaskRunning: boolean
    lastError?: { code: string; message: string } | null
}

interface Character {
    id: string
    name: string
    folderId: string | null
    customVoiceUrl: string | null
    appearances: Appearance[]
}

interface CharacterCardProps {
    character: Character
    onImageClick?: (url: string) => void
    onImageEdit?: (type: 'character' | 'location', id: string, name: string, imageIndex: number, appearanceIndex?: number) => void
    onVoiceDesign?: (characterId: string, characterName: string) => void
    onEdit?: (character: Character, appearance: Appearance) => void
    onVoiceSelect?: (characterId: string) => void
}

export function CharacterCard({ character, onImageClick, onImageEdit, onVoiceDesign, onEdit, onVoiceSelect }: CharacterCardProps) {
    // 🔥 使用 mutation hooks
    const generateImage = useGenerateCharacterImage()
    const selectImage = useSelectCharacterImage()
    const undoImage = useUndoCharacterImage()
    const uploadImage = useUploadCharacterImage()
    const deleteCharacter = useDeleteCharacter()
    const deleteAppearance = useDeleteCharacterAppearance()
    const uploadVoice = useUploadCharacterVoice()

    const t = useTranslations('assetHub')
    const tAssets = useTranslations('assets')
    const fileInputRef = useRef<HTMLInputElement>(null)
    const voiceInputRef = useRef<HTMLInputElement>(null)

    const [activeAppearance, setActiveAppearance] = useState(0)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [showDeleteMenu, setShowDeleteMenu] = useState(false)
    const latestSelectRequestRef = useRef(0)

    // 计算属性
    const appearance = character.appearances[activeAppearance] || character.appearances[0]
    const isPrimaryAppearance = appearance?.appearanceIndex === PRIMARY_APPEARANCE_INDEX
    const appearanceCount = character.appearances.length

    // URL 验证函数
    const isValidUrl = (url: string | null | undefined): boolean => {
        if (!url || url.trim() === '') return false
        if (url.startsWith('/')) return true
        if (url.startsWith('data:') || url.startsWith('blob:')) return true
        try { new URL(url); return true } catch { return false }
    }

    const imageUrls = appearance?.imageUrls || []
    const hasMultipleImages = imageUrls.filter(u => isValidUrl(u)).length > 1
    const effectiveSelectedIndex: number | null = appearance?.selectedIndex ?? null
    const currentImageUrl = appearance?.imageUrl || (effectiveSelectedIndex !== null ? imageUrls[effectiveSelectedIndex] : null) || imageUrls.find(u => u) || null
    const hasPreviousVersion = !!(appearance?.previousImageUrl || (appearance?.previousImageUrls && appearance.previousImageUrls.length > 0))

    const displayImageUrl = isValidUrl(currentImageUrl) ? currentImageUrl : null
    const serverTaskRunning = !!appearance?.imageTaskRunning
    const transientSubmitting = generateImage.isPending
    const isAppearanceTaskRunning = serverTaskRunning || transientSubmitting
    const taskErrorDisplay = !isAppearanceTaskRunning && appearance?.lastError
        ? resolveErrorDisplay(appearance.lastError)
        : null
    const displayTaskPresentation = isAppearanceTaskRunning
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: displayImageUrl ? 'process' : 'generate',
            resource: 'image',
            hasOutput: !!displayImageUrl,
        })
        : null
    const selectImageRunningState = selectImage.isPending
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'process',
            resource: 'image',
            hasOutput: !!displayImageUrl,
        })
        : null

    // 生成图片
    const handleGenerate = () => {
        generateImage.mutate(
            { characterId: character.id, appearanceIndex: appearance.appearanceIndex },
            { onError: (error) => alert(error.message || t('generateFailed')) }
        )
    }

    // 选择图片（依赖 query 缓存乐观更新）
    const handleSelectImage = (imageIndex: number | null) => {
        if (imageIndex === effectiveSelectedIndex) return
        const requestId = latestSelectRequestRef.current + 1
        latestSelectRequestRef.current = requestId
        selectImage.mutate({
            characterId: character.id,
            appearanceIndex: appearance.appearanceIndex,
            imageIndex,
            confirm: false
        }, {
            onError: (error) => {
                if (latestSelectRequestRef.current !== requestId) return
                alert(error.message || t('selectFailed'))
            }
        })
    }

    // 确认选择
    const handleConfirmSelection = () => {
        const requestId = latestSelectRequestRef.current + 1
        latestSelectRequestRef.current = requestId
        selectImage.mutate({
            characterId: character.id,
            appearanceIndex: appearance.appearanceIndex,
            imageIndex: effectiveSelectedIndex,
            confirm: true
        }, {
            onError: (error) => {
                if (latestSelectRequestRef.current !== requestId) return
                alert(error.message || t('selectFailed'))
            }
        })
    }

    // 撤回
    const handleUndo = () => {
        undoImage.mutate({ characterId: character.id, appearanceIndex: appearance.appearanceIndex })
    }

    // 上传图片
    const handleUpload = () => {
        const file = fileInputRef.current?.files?.[0]
        if (!file) return

        uploadImage.mutate(
            {
                file,
                characterId: character.id,
                appearanceIndex: appearance.appearanceIndex,
                labelText: `${character.name} - ${appearance.changeReason}`,
                imageIndex: effectiveSelectedIndex ?? undefined
            },
            {
                onError: (error) => alert(error.message || t('uploadFailed')),
                onSettled: () => {
                    if (fileInputRef.current) fileInputRef.current.value = ''
                }
            }
        )
    }

    // 删除角色
    const handleDelete = () => {
        deleteCharacter.mutate(character.id, {
            onSettled: () => setShowDeleteConfirm(false)
        })
    }

    // 删除子形象
    const handleDeleteAppearance = () => {
        deleteAppearance.mutate(
            { characterId: character.id, appearanceIndex: appearance.appearanceIndex },
            {
                onSuccess: () => setActiveAppearance(0),
                onSettled: () => setShowDeleteMenu(false)
            }
        )
    }

    // 上传音色
    const handleUploadVoice = () => {
        const file = voiceInputRef.current?.files?.[0]
        if (!file) return

        uploadVoice.mutate(
            { file, characterId: character.id },
            {
                onSettled: () => {
                    if (voiceInputRef.current) voiceInputRef.current.value = ''
                }
            }
        )
    }

    // 多图选择模式
    if (hasMultipleImages) {
        return (
            <div className="relative col-span-1 rounded-xl border bg-card p-4 shadow-sm md:col-span-2">
                {/* 隐藏输入 */}
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
                <input ref={voiceInputRef} type="file" accept="audio/*" onChange={handleUploadVoice} className="hidden" />

                {/* 顶部：名字 + 操作 */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{character.name}</span>
                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                            {appearance.changeReason}
                        </Badge>
                        {isPrimaryAppearance ? (
                            <Badge className="h-5 px-1.5 text-[10px]">{tAssets('character.primary')}</Badge>
                        ) : (
                            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{tAssets('character.secondary')}</Badge>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        <Button
                            onClick={() => { _ulogInfo('[CharacterCard] 多图模式 - 重新生成按钮点击, characterId:', character.id, 'appearanceCount:', appearanceCount); handleGenerate() }}
                            disabled={isAppearanceTaskRunning}
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title={t('regenerate')}
                        >
                            {isAppearanceTaskRunning ? (
                                <TaskStatusInline state={displayTaskPresentation} className="[&_span]:sr-only [&_svg]:text-primary" />
                            ) : (
                                <AppIcon name="refresh" className="h-4 w-4 text-primary" />
                            )}
                        </Button>
                        {hasPreviousVersion && (
                            <Button onClick={handleUndo} variant="ghost" size="icon" className="h-7 w-7" title={tAssets('image.undo')}>
                                <AppIcon name="sparkles" className="h-4 w-4 text-amber-600" />
                            </Button>
                        )}
                        <Button onClick={(e) => {
                            e.stopPropagation()
                            _ulogInfo('[CharacterCard] 多图模式 - 删除按钮点击, characterId:', character.id, 'appearanceCount:', appearanceCount, 'showDeleteMenu:', showDeleteMenu)
                            if (appearanceCount <= 1) {
                                setShowDeleteConfirm(true)
                                return
                            }
                            setShowDeleteMenu(!showDeleteMenu)
                        }} variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                            <AppIcon name="trash" className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* 任务失败错误提示 */}
                {taskErrorDisplay && !isAppearanceTaskRunning && (
                    <div className="mb-3 flex items-center gap-2 rounded-lg bg-destructive/10 p-2 text-destructive">
                        <AppIcon name="alert" className="h-4 w-4 shrink-0" />
                        <span className="text-xs line-clamp-2">{taskErrorDisplay.message}</span>
                    </div>
                )}

                {/* 图片列表 */}
                <div className="grid grid-cols-3 gap-3">
                    {imageUrls.map((url, index) => {
                        if (!isValidUrl(url)) return null
                        const validUrl = url as string
                        const isSelected = effectiveSelectedIndex === index
                        return (
                            <div key={index} className="relative group/thumb">
                                <div
                                    onClick={() => onImageClick?.(validUrl)}
                                    className={`cursor-zoom-in overflow-hidden rounded-lg border-2 transition-all ${isSelected ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-border hover:border-primary/40'}`}
                                >
                                    <MediaImageWithLoading
                                        src={validUrl}
                                        alt={`${character.name} ${index + 1}`}
                                        containerClassName="w-full min-h-[96px]"
                                        className="w-full h-auto object-contain"
                                    />
                                    <div className={`absolute bottom-2 left-2 rounded px-2 py-0.5 text-xs ${isSelected ? 'bg-emerald-600 text-white' : 'bg-background/90 text-foreground'}`}>
                                        {tAssets('image.optionNumber', { number: index + 1 })}
                                    </div>
                                </div>
                                <Button
                                    onClick={(e) => { e.stopPropagation(); handleSelectImage(isSelected ? null : index) }}
                                    variant={isSelected ? 'default' : 'secondary'}
                                    size="icon"
                                    className="absolute right-2 top-2 h-7 w-7 rounded-full"
                                >
                                    <AppIcon name="check" className="h-4 w-4" />
                                </Button>
                            </div>
                        )
                    })}
                </div>

                {/* 确认按钮 */}
                {effectiveSelectedIndex !== null && (
                    <div className="mt-4 flex justify-end">
                        <Button onClick={handleConfirmSelection} disabled={selectImage.isPending} className="h-9 gap-2 px-4 text-sm">
                            {selectImage.isPending ? (
                                <TaskStatusInline state={selectImageRunningState} className="text-white [&>span]:sr-only [&_svg]:text-white" />
                            ) : (
                                <AppIcon name="check" className="h-4 w-4" />
                            )}
                            {tAssets('image.confirmOption', { number: effectiveSelectedIndex + 1 })}
                        </Button>
                    </div>
                )}

                {/* 音色设置 */}
                <VoiceSettings
                    characterId={character.id}
                    characterName={character.name}
                    customVoiceUrl={character.customVoiceUrl}
                    onVoiceDesign={onVoiceDesign}
                    onVoiceSelect={onVoiceSelect}
                    compact={true}
                />

                {/* 删除菜单 */}
                {showDeleteMenu && appearanceCount > 1 && (
                    <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowDeleteMenu(false)} />
                        <div className="absolute right-4 top-12 z-20 min-w-[132px] rounded-md border bg-popover py-1 shadow-md">
                            <Button onClick={handleDeleteAppearance} variant="ghost" className="h-8 w-full justify-start rounded-none px-3 text-xs">
                                {tAssets('image.deleteThis')}
                            </Button>
                            <Button
                                onClick={() => { setShowDeleteMenu(false); setShowDeleteConfirm(true) }}
                                variant="ghost"
                                className="h-8 w-full justify-start rounded-none px-3 text-xs text-destructive hover:text-destructive"
                            >
                                {tAssets('character.deleteWhole')}
                            </Button>
                        </div>
                    </>
                )}

                {/* 删除确认对话框 - 多图模式也需要 */}
                {showDeleteConfirm && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45">
                        <div className="m-4 w-full max-w-sm rounded-xl border bg-card p-4 shadow-xl">
                            <p className="mb-4 text-sm text-foreground">{t('confirmDeleteCharacter')}</p>
                            <div className="flex gap-2 justify-end">
                                <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>{t('cancel')}</Button>
                                <Button variant="destructive" size="sm" onClick={handleDelete}>{t('delete')}</Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        )
    }

    // 单图模式
    return (
        <div className="group relative overflow-hidden rounded-xl border bg-card shadow-sm">
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
            <input ref={voiceInputRef} type="file" accept="audio/*" onChange={handleUploadVoice} className="hidden" />

            {/* 图片区域 */}
            <div className="relative min-h-[100px] bg-muted/50">
                {displayImageUrl ? (
                    <>
                        <MediaImageWithLoading
                            src={displayImageUrl}
                            alt={character.name}
                            containerClassName="w-full min-h-[120px]"
                            className="w-full h-auto object-contain cursor-zoom-in"
                            onClick={() => onImageClick?.(displayImageUrl)}
                        />
                        {/* 操作按钮 - 非生成时显示 */}
                        {!isAppearanceTaskRunning && (
                            <div className="absolute top-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button onClick={() => fileInputRef.current?.click()} disabled={uploadImage.isPending} variant="secondary" size="icon" className="h-7 w-7 rounded-full">
                                    <AppIcon name="upload" className="h-4 w-4 text-emerald-600" />
                                </Button>
                                <Button onClick={() => onImageEdit?.('character', character.id, character.name, effectiveSelectedIndex ?? 0, appearance.appearanceIndex)} variant="secondary" size="icon" className="h-7 w-7 rounded-full">
                                    <AppIcon name="edit" className="h-4 w-4" />
                                </Button>
                                <Button onClick={handleGenerate} variant="secondary" size="icon" className="h-7 w-7 rounded-full">
                                    <AppIcon name="refresh" className="h-4 w-4 text-primary" />
                                </Button>
                                {hasPreviousVersion && (
                                    <Button onClick={handleUndo} variant="secondary" size="icon" className="h-7 w-7 rounded-full">
                                        <AppIcon name="sparkles" className="h-4 w-4 text-amber-600" />
                                    </Button>
                                )}
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <AppIcon name="image" className="mb-3 h-12 w-12" />
                        <Button onClick={handleGenerate} className="h-8 gap-1.5 px-3 text-sm">
                            <AppIcon name="sparklesAlt" className="h-4 w-4" />
                            {t('generate')}
                        </Button>
                    </div>
                )}
                {isAppearanceTaskRunning && (
                    <TaskStatusOverlay state={displayTaskPresentation} />
                )}
                {taskErrorDisplay && !isAppearanceTaskRunning && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-destructive/10 p-3 text-destructive">
                        <AppIcon name="alert" className="h-6 w-6" />
                        <span className="text-xs text-center font-medium line-clamp-3">{taskErrorDisplay.message}</span>
                    </div>
                )}
            </div>

            {/* 信息区域 */}
            <div className="p-3">
                <div className="flex items-center justify-between">
                    <h3 className="truncate text-sm font-medium text-foreground">{character.name}</h3>
                    <div className="flex items-center gap-1">
                        {/* 编辑按钮 */}
                        <Button
                            onClick={() => onEdit?.(character, appearance)}
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
                            title={tAssets('video.panelCard.editPrompt')}
                        >
                            <AppIcon name="edit" className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        {/* 删除按钮 */}
                        <Button
                            onClick={() => appearanceCount <= 1 ? setShowDeleteConfirm(true) : setShowDeleteMenu(!showDeleteMenu)}
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                        >
                            <AppIcon name="trash" className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* 形象切换 */}
                {appearanceCount > 1 && (
                    <div className="flex gap-1 mt-2 overflow-x-auto">
                        {character.appearances.map((app, index) => (
                            <Button
                                key={app.id}
                                onClick={() => setActiveAppearance(index)}
                                size="sm"
                                variant={index === activeAppearance ? 'default' : 'secondary'}
                                className="h-6 whitespace-nowrap px-2 text-[11px]"
                            >
                                {app.changeReason || `形象 ${app.appearanceIndex}`}
                            </Button>
                        ))}
                    </div>
                )}

                {appearance?.description && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{appearance.description}</p>}

                {/* 音色设置 */}
                <VoiceSettings
                    characterId={character.id}
                    characterName={character.name}
                    customVoiceUrl={character.customVoiceUrl}
                    onVoiceDesign={onVoiceDesign}
                    onVoiceSelect={onVoiceSelect}
                    compact={true}
                />
            </div>

            {/* 删除确认 */}
            {showDeleteConfirm && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/45">
                    <div className="m-4 w-full max-w-sm rounded-xl border bg-card p-4 shadow-xl">
                        <p className="mb-4 text-sm text-foreground">{t('confirmDeleteCharacter')}</p>
                        <div className="flex gap-2 justify-end">
                            <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>{t('cancel')}</Button>
                            <Button variant="destructive" size="sm" onClick={handleDelete}>{t('delete')}</Button>
                        </div>
                    </div>
                </div>
            )}

            {/* 删除菜单 */}
            {showDeleteMenu && appearanceCount > 1 && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowDeleteMenu(false)} />
                    <div className="absolute bottom-16 right-3 top-auto z-20 min-w-[132px] rounded-md border bg-popover py-1 shadow-md">
                        <Button onClick={handleDeleteAppearance} variant="ghost" className="h-8 w-full justify-start rounded-none px-3 text-xs">{tAssets('image.deleteThis')}</Button>
                        <Button
                            onClick={() => { setShowDeleteMenu(false); setShowDeleteConfirm(true) }}
                            variant="ghost"
                            className="h-8 w-full justify-start rounded-none px-3 text-xs text-destructive hover:text-destructive"
                        >
                            {tAssets('character.deleteWhole')}
                        </Button>
                    </div>
                </>
            )}
        </div>
    )
}
