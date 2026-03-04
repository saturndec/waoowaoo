'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import { shouldShowError } from '@/lib/error-utils'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import {
    useAiModifyCharacterDescription,
    useAiModifyProjectAppearanceDescription,
    useUpdateCharacterAppearanceDescription,
    useUpdateCharacterName,
    useUpdateProjectAppearanceDescription,
    useUpdateProjectCharacterIntroduction,
    useUpdateProjectCharacterName,
} from '@/lib/query/hooks'

export interface CharacterEditModalProps {
    mode: 'asset-hub' | 'project'
    characterId: string
    characterName: string
    description: string
    appearanceIndex?: number
    changeReason?: string
    projectId?: string
    appearanceId?: string
    descriptionIndex?: number
    isTaskRunning?: boolean
    introduction?: string | null
    onClose: () => void
    onSave: (characterId: string, appearanceId: string) => void
    onUpdate?: (newDescription: string) => void
    onIntroductionUpdate?: (newIntroduction: string) => void
    onNameUpdate?: (newName: string) => void
    onRefresh?: () => void
}

export function CharacterEditModal({
    mode,
    characterId,
    characterName,
    description,
    appearanceIndex,
    changeReason,
    projectId,
    appearanceId,
    descriptionIndex,
    isTaskRunning = false,
    introduction,
    onClose,
    onSave,
    onUpdate,
    onIntroductionUpdate,
    onNameUpdate,
    onRefresh,
}: CharacterEditModalProps) {
    const t = useTranslations('assets')

    const appearanceKey = mode === 'asset-hub'
        ? String(appearanceIndex ?? 0)
        : String(appearanceId ?? '')

    const [editingName, setEditingName] = useState(characterName)
    const [editingDescription, setEditingDescription] = useState(description)
    const [editingIntroduction, setEditingIntroduction] = useState(introduction || '')
    const [aiModifyInstruction, setAiModifyInstruction] = useState('')
    const [isAiModifying, setIsAiModifying] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const aiModifyingState = isAiModifying
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'modify',
            resource: 'image',
            hasOutput: true,
        })
        : null
    const savingState = isSaving
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'process',
            resource: 'text',
            hasOutput: false,
        })
        : null
    const taskRunningState = isTaskRunning
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'modify',
            resource: 'image',
            hasOutput: true,
        })
        : null

    const updateAssetHubName = useUpdateCharacterName()
    const updateProjectName = useUpdateProjectCharacterName(projectId ?? '')
    const updateAssetHubAppearanceDesc = useUpdateCharacterAppearanceDescription()
    const updateProjectAppearanceDesc = useUpdateProjectAppearanceDescription(projectId ?? '')
    const updateProjectIntroduction = useUpdateProjectCharacterIntroduction(projectId ?? '')
    const aiModifyAssetHub = useAiModifyCharacterDescription()
    const aiModifyProject = useAiModifyProjectAppearanceDescription(projectId ?? '')

    const getErrorMessage = (error: unknown, fallback: string) => {
        if (error instanceof Error && error.message) return error.message
        return fallback
    }

    const persistNameIfNeeded = async () => {
        const nextName = editingName.trim()
        if (!nextName || nextName === characterName) return

        if (mode === 'asset-hub') {
            await updateAssetHubName.mutateAsync({ characterId, name: nextName })
        } else {
            await updateProjectName.mutateAsync({ characterId, name: nextName })
        }
        onNameUpdate?.(nextName)
    }

    const persistDescription = async () => {
        if (mode === 'asset-hub') {
            await updateAssetHubAppearanceDesc.mutateAsync({
                characterId,
                appearanceIndex: appearanceIndex ?? 0,
                description: editingDescription,
            })
            return
        }

        if (!appearanceId) {
            throw new Error('Missing appearanceId')
        }
        await updateProjectAppearanceDesc.mutateAsync({
            characterId,
            appearanceId,
            description: editingDescription,
            descriptionIndex,
        })
    }

    const persistIntroductionIfNeeded = async () => {
        if (mode !== 'project' || !projectId) return
        if (editingIntroduction === (introduction || '')) return

        const nextIntro = editingIntroduction.trim()
        await updateProjectIntroduction.mutateAsync({
            characterId,
            introduction: nextIntro,
        })
        onIntroductionUpdate?.(nextIntro)
    }

    const handleAiModify = async () => {
        if (!aiModifyInstruction.trim()) return

        try {
            setIsAiModifying(true)

            if (mode === 'asset-hub') {
                const data = await aiModifyAssetHub.mutateAsync({
                    characterId,
                    appearanceIndex: appearanceIndex ?? 0,
                    currentDescription: editingDescription,
                    modifyInstruction: aiModifyInstruction,
                })
                if (data?.modifiedDescription) {
                    setEditingDescription(data.modifiedDescription)
                    onUpdate?.(data.modifiedDescription)
                    setAiModifyInstruction('')
                }
                return
            }

            if (!appearanceId) throw new Error('Missing appearanceId')
            const data = await aiModifyProject.mutateAsync({
                characterId,
                appearanceId,
                currentDescription: editingDescription,
                modifyInstruction: aiModifyInstruction,
            })
            if (data?.modifiedDescription) {
                setEditingDescription(data.modifiedDescription)
                onUpdate?.(data.modifiedDescription)
                setAiModifyInstruction('')
            }
        } catch (error: unknown) {
            if (shouldShowError(error)) {
                alert(`${t('modal.modifyFailed')}: ${getErrorMessage(error, t('errors.failed'))}`)
            }
        } finally {
            setIsAiModifying(false)
        }
    }

    const handleSaveName = async () => {
        try {
            await persistNameIfNeeded()
            onRefresh?.()
        } catch (error: unknown) {
            if (shouldShowError(error)) {
                alert(t('modal.saveName') + t('errors.failed'))
            }
        }
    }

    const handleSaveOnly = async () => {
        try {
            setIsSaving(true)
            await persistNameIfNeeded()
            await persistDescription()
            await persistIntroductionIfNeeded()

            onUpdate?.(editingDescription)
            onRefresh?.()
            onClose()
        } catch (error: unknown) {
            if (shouldShowError(error)) {
                alert(getErrorMessage(error, t('errors.saveFailed')))
            }
        } finally {
            setIsSaving(false)
        }
    }

    const handleSaveAndGenerate = async () => {
        const savedDescription = editingDescription
        const savedAppearanceKey = appearanceKey
        onClose()

        ; (async () => {
            try {
                await persistNameIfNeeded()
                await persistDescription()
                await persistIntroductionIfNeeded()

                onUpdate?.(savedDescription)
                onRefresh?.()
                onSave(characterId, savedAppearanceKey)
            } catch (error: unknown) {
                if (shouldShowError(error)) {
                    alert(getErrorMessage(error, t('errors.saveFailed')))
                }
            }
        })()
    }

    return (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4">
            <div className="rounded-xl border border-border bg-card shadow-lg max-w-2xl w-full max-h-[80vh] flex flex-col">
                <div className="p-6 space-y-4 overflow-y-auto flex-1">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-foreground">
                            {t('modal.editCharacter')} - {characterName}
                        </h3>
                        <button
                            onClick={onClose}
                            className="inline-flex items-center justify-center border border-border bg-muted/50 hover:bg-muted w-9 h-9 rounded-full text-muted-foreground"
                        >
                            <AppIcon name="close" className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-foreground block">
                            {t('character.name')}
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                className="w-full rounded-md border border-input bg-background flex-1 px-3 py-2"
                                placeholder={t('modal.namePlaceholder')}
                            />
                            {editingName !== characterName && (
                                <button
                                    onClick={handleSaveName}
                                    disabled={updateAssetHubName.isPending || updateProjectName.isPending || !editingName.trim()}
                                    className="inline-flex items-center justify-center bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-3 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm whitespace-nowrap"
                                >
                                    {(updateAssetHubName.isPending || updateProjectName.isPending)
                                        ? t('smartImport.preview.saving')
                                        : t('modal.saveName')}
                                </button>
                            )}
                        </div>
                    </div>

                    {mode === 'project' && (
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-foreground block">
                                {t('modal.introduction')}
                            </label>
                            <textarea
                                value={editingIntroduction}
                                onChange={(e) => setEditingIntroduction(e.target.value)}
                                rows={3}
                                className="w-full rounded-md border border-input bg-background w-full px-3 py-2 resize-none"
                                placeholder={t('modal.introductionPlaceholder')}
                            />
                            <p className="text-xs text-muted-foreground">
                                {t('modal.introductionTip')}
                            </p>
                        </div>
                    )}

                    {mode === 'asset-hub' && changeReason && (
                        <div className="text-sm text-muted-foreground">
                            {t('character.appearance')}:
                            <span className="ml-1 inline-flex items-center rounded-full px-2 py-0.5 bg-muted text-muted-foreground">
                                {changeReason}
                            </span>
                        </div>
                    )}

                    <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-4 rounded-lg border border-border">
                        <label className="block text-sm font-medium text-primary flex items-center gap-2">
                            <AppIcon name="bolt" className="w-4 h-4" />
                            {t('modal.smartModify')}
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={aiModifyInstruction}
                                onChange={(e) => setAiModifyInstruction(e.target.value)}
                                placeholder={t('modal.modifyPlaceholderCharacter')}
                                className="w-full rounded-md border border-input bg-background flex-1 px-3 py-2"
                                disabled={isAiModifying}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault()
                                        handleAiModify()
                                    }
                                }}
                            />
                            <button
                                onClick={handleAiModify}
                                disabled={isAiModifying || !aiModifyInstruction.trim()}
                                className="inline-flex items-center justify-center bg-primary/10 text-primary hover:bg-primary/15 px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                            >
                                {isAiModifying ? (
                                    <TaskStatusInline state={aiModifyingState} className="text-white [&>span]:text-white [&_svg]:text-white" />
                                ) : (
                                    <>
                                        <AppIcon name="bolt" className="w-4 h-4" />
                                        {t('modal.smartModify')}
                                    </>
                                )}
                            </button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {t('modal.aiTipSub')}
                        </p>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-foreground block">
                            {t('modal.appearancePrompt')}
                        </label>
                        <textarea
                            value={editingDescription}
                            onChange={(e) => setEditingDescription(e.target.value)}
                            className="w-full rounded-md border border-input bg-background w-full h-64 px-3 py-2 resize-none"
                            placeholder={t('modal.descPlaceholder')}
                            disabled={isAiModifying}
                        />
                    </div>
                </div>

                <div className="flex gap-3 justify-end p-4 border-t border-border bg-muted/40 rounded-b-lg flex-shrink-0">
                    <button
                        onClick={onClose}
                        className="inline-flex items-center justify-center border border-input bg-background hover:bg-accent hover:text-accent-foreground px-4 py-2 rounded-lg"
                        disabled={isSaving}
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={handleSaveOnly}
                        disabled={isSaving || !editingDescription.trim()}
                        className="inline-flex items-center justify-center bg-primary/10 text-primary hover:bg-primary/15 px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isSaving ? (
                            <TaskStatusInline state={savingState} className="text-white [&>span]:text-white [&_svg]:text-white" />
                        ) : (
                            t('modal.saveOnly')
                        )}
                    </button>
                    <button
                        onClick={handleSaveAndGenerate}
                        disabled={isSaving || isTaskRunning || !editingDescription.trim()}
                        className="inline-flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isTaskRunning ? (
                            <TaskStatusInline state={taskRunningState} className="text-white [&>span]:text-white [&_svg]:text-white" />
                        ) : (
                            t('modal.saveAndGenerate')
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
