'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
    ART_STYLES,
    VIDEO_RATIOS,
} from '@/lib/constants'
import type {
    CapabilitySelections,
    CapabilityValue,
    ModelCapabilities,
} from '@/lib/ai-registry/types'
import { filterNormalVideoModelOptions } from '@/lib/ai-registry/video-capabilities'
import { RatioSelector, StyleSelector } from './config-modal-selectors'
import { ModelCapabilityDropdown } from './ModelCapabilityDropdown'
import { AppIcon } from '@/components/ui/icons'

interface ModelOption {
    value: string
    label: string
    provider?: string
    providerName?: string
    capabilities?: ModelCapabilities
}

interface UserModels {
    llm: ModelOption[]
    image: ModelOption[]
    video: ModelOption[]
    audio: ModelOption[]
}

export interface CapabilityFieldDefinition {
    field: string
    options: CapabilityValue[]
    label: string
}

interface CapabilityDefaultTarget {
    modelKey?: string
    fields: CapabilityFieldDefinition[]
}

interface SettingsModalProps {
    isOpen: boolean
    onClose: () => void
    availableModels?: Partial<UserModels>
    modelsLoaded?: boolean
    artStyle?: string
    analysisModel?: string
    characterModel?: string
    locationModel?: string
    imageModel?: string
    editModel?: string

    videoModel?: string
    singleShotVideoModel?: string
    sequenceVideoModel?: string
    audioModel?: string
    videoRatio?: string
    capabilityOverrides?: CapabilitySelections
    onArtStyleChange?: (value: string) => void
    onAnalysisModelChange?: (value: string) => void
    onCharacterModelChange?: (value: string) => void
    onLocationModelChange?: (value: string) => void
    onImageModelChange?: (value: string) => void
    onEditModelChange?: (value: string) => void

    onVideoModelChange?: (value: string) => void
    onSingleShotVideoModelChange?: (value: string) => void
    onSequenceVideoModelChange?: (value: string) => void
    onAudioModelChange?: (value: string) => void
    onVideoRatioChange?: (value: string) => void
    onCapabilityOverridesChange?: (value: CapabilitySelections) => void
    onConfigPatch?: (value: Record<string, unknown>) => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isCapabilityValue(value: unknown): value is CapabilityValue {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function toFieldLabel(field: string): string {
    return field.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase())
}

function parseBySample(input: string, sample: CapabilityValue): CapabilityValue {
    if (typeof sample === 'number') return Number(input)
    if (typeof sample === 'boolean') return input === 'true'
    return input
}

function extractCapabilityFields(
    capabilities: ModelCapabilities | undefined,
    namespace: 'llm' | 'image' | 'video' | 'audio',
): CapabilityFieldDefinition[] {
    const rawNamespace = capabilities?.[namespace]
    if (!isRecord(rawNamespace)) return []

    return Object.entries(rawNamespace)
        .filter(([key, value]) => key.endsWith('Options') && Array.isArray(value) && value.every(isCapabilityValue) && value.length > 0)
        .filter(([key]) => !(namespace === 'video' && key === 'durationOptions'))
        .map(([key, value]) => {
            const field = key.slice(0, -'Options'.length)
            return {
                field,
                options: value as CapabilityValue[],
                label: toFieldLabel(field),
            }
        })
}

function readCapabilitySelectionForModel(
    overrides: CapabilitySelections | undefined,
    modelKey: string | undefined,
): Record<string, CapabilityValue> {
    if (!modelKey || !overrides) return {}
    const raw = overrides[modelKey]
    if (!isRecord(raw)) return {}

    const normalized: Record<string, CapabilityValue> = {}
    for (const [field, value] of Object.entries(raw)) {
        if (isCapabilityValue(value)) {
            normalized[field] = value
        }
    }
    return normalized
}

function capabilityFieldsSignature(fields: readonly CapabilityFieldDefinition[]): Array<{
    readonly field: string
    readonly options: readonly CapabilityValue[]
}> {
    return fields.map((field) => ({
        field: field.field,
        options: field.options,
    }))
}

export function ensureCapabilityDefaultsForModels(input: {
    capabilityOverrides?: CapabilitySelections
    targets: readonly CapabilityDefaultTarget[]
}): { changed: boolean; capabilityOverrides: CapabilitySelections } {
    const nextOverrides: CapabilitySelections = { ...(input.capabilityOverrides || {}) }
    let changed = false

    for (const target of input.targets) {
        if (!target.modelKey || target.fields.length === 0) continue

        const existing = isRecord(nextOverrides[target.modelKey])
            ? { ...(nextOverrides[target.modelKey] as Record<string, CapabilityValue>) }
            : {}
        let targetChanged = false

        for (const field of target.fields) {
            if (existing[field.field] !== undefined || field.options.length === 0) continue
            existing[field.field] = field.options[0]
            targetChanged = true
        }

        if (targetChanged) {
            nextOverrides[target.modelKey] = existing
            changed = true
        }
    }

    return { changed, capabilityOverrides: nextOverrides }
}

export function buildModelCapabilityConfigPatch(input: {
    configPatch: Record<string, unknown>
    capabilityOverrides?: CapabilitySelections
    modelKey: string
    fields: CapabilityFieldDefinition[]
}): { changed: boolean; patch: Record<string, unknown> } {
    const capabilityResult = ensureCapabilityDefaultsForModels({
        capabilityOverrides: input.capabilityOverrides,
        targets: [{ modelKey: input.modelKey, fields: input.fields }],
    })

    return {
        changed: capabilityResult.changed,
        patch: {
            ...input.configPatch,
            ...(capabilityResult.changed ? { capabilityOverrides: capabilityResult.capabilityOverrides } : {}),
        },
    }
}

export function SettingsModal({
    isOpen,
    onClose,
    availableModels,
    modelsLoaded = false,
    artStyle = 'american-comic',
    analysisModel,
    characterModel,
    locationModel,
    imageModel,
    editModel,
    videoModel,
    singleShotVideoModel,
    sequenceVideoModel,
    audioModel,
    videoRatio = '9:16',
    capabilityOverrides,
    onArtStyleChange,
    onAnalysisModelChange,
    onCharacterModelChange,
    onLocationModelChange,
    onImageModelChange,
    onEditModelChange,
    onVideoModelChange,
    onSingleShotVideoModelChange,
    onSequenceVideoModelChange,
    onAudioModelChange,
    onVideoRatioChange,
    onCapabilityOverridesChange,
    onConfigPatch,
}: SettingsModalProps) {
    const t = useTranslations('configModal')
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle')
    const lastAppliedCapabilityDefaultsSignatureRef = useRef<string | null>(null)
    const userModels = useMemo<UserModels>(() => ({
        llm: Array.isArray(availableModels?.llm) ? availableModels.llm : [],
        image: Array.isArray(availableModels?.image) ? availableModels.image : [],
        video: Array.isArray(availableModels?.video) ? availableModels.video : [],
        audio: Array.isArray(availableModels?.audio) ? availableModels.audio : [],
    }), [availableModels])
    const normalVideoModels = useMemo<ModelOption[]>(
        () => filterNormalVideoModelOptions(userModels.video),
        [userModels.video],
    )

    const effectiveSingleShotVideoModel = singleShotVideoModel || videoModel

    const selectedSingleShotVideoModelOption = useMemo(
        () => normalVideoModels.find((model) => model.value === effectiveSingleShotVideoModel) || null,
        [normalVideoModels, effectiveSingleShotVideoModel],
    )
    const selectedSequenceVideoModelOption = useMemo(
        () => normalVideoModels.find((model) => model.value === sequenceVideoModel) || null,
        [normalVideoModels, sequenceVideoModel],
    )
    const selectedAnalysisModelOption = useMemo(
        () => userModels.llm.find((model) => model.value === analysisModel) || null,
        [userModels.llm, analysisModel],
    )
    const selectedAudioModelOption = useMemo(
        () => userModels.audio.find((model) => model.value === audioModel) || null,
        [userModels.audio, audioModel],
    )

    const singleShotVideoCapabilityFields = useMemo(
        () => extractCapabilityFields(selectedSingleShotVideoModelOption?.capabilities, 'video'),
        [selectedSingleShotVideoModelOption],
    )
    const sequenceVideoCapabilityFields = useMemo(
        () => extractCapabilityFields(selectedSequenceVideoModelOption?.capabilities, 'video'),
        [selectedSequenceVideoModelOption],
    )
    const analysisCapabilityFields = useMemo(
        () => extractCapabilityFields(selectedAnalysisModelOption?.capabilities, 'llm'),
        [selectedAnalysisModelOption],
    )
    const audioCapabilityFields = useMemo(
        () => extractCapabilityFields(selectedAudioModelOption?.capabilities, 'audio'),
        [selectedAudioModelOption],
    )
    const selectedCharacterModelOption = useMemo(
        () => userModels.image.find((model) => model.value === characterModel) || null,
        [userModels.image, characterModel],
    )
    const selectedLocationModelOption = useMemo(
        () => userModels.image.find((model) => model.value === locationModel) || null,
        [userModels.image, locationModel],
    )
    const selectedStoryboardModelOption = useMemo(
        () => userModels.image.find((model) => model.value === imageModel) || null,
        [userModels.image, imageModel],
    )
    const selectedEditModelOption = useMemo(
        () => userModels.image.find((model) => model.value === editModel) || null,
        [userModels.image, editModel],
    )
    const characterCapabilityFields = useMemo(
        () => extractCapabilityFields(selectedCharacterModelOption?.capabilities, 'image'),
        [selectedCharacterModelOption],
    )
    const locationCapabilityFields = useMemo(
        () => extractCapabilityFields(selectedLocationModelOption?.capabilities, 'image'),
        [selectedLocationModelOption],
    )
    const storyboardCapabilityFields = useMemo(
        () => extractCapabilityFields(selectedStoryboardModelOption?.capabilities, 'image'),
        [selectedStoryboardModelOption],
    )
    const editCapabilityFields = useMemo(
        () => extractCapabilityFields(selectedEditModelOption?.capabilities, 'image'),
        [selectedEditModelOption],
    )

    const selectedSingleShotVideoOverrides = useMemo<Record<string, CapabilityValue>>(() => {
        return readCapabilitySelectionForModel(capabilityOverrides, effectiveSingleShotVideoModel)
    }, [capabilityOverrides, effectiveSingleShotVideoModel])
    const selectedSequenceVideoOverrides = useMemo<Record<string, CapabilityValue>>(() => {
        return readCapabilitySelectionForModel(capabilityOverrides, sequenceVideoModel)
    }, [capabilityOverrides, sequenceVideoModel])
    const selectedAnalysisOverrides = useMemo<Record<string, CapabilityValue>>(() => {
        return readCapabilitySelectionForModel(capabilityOverrides, analysisModel)
    }, [capabilityOverrides, analysisModel])
    const selectedAudioOverrides = useMemo<Record<string, CapabilityValue>>(() => {
        return readCapabilitySelectionForModel(capabilityOverrides, audioModel)
    }, [capabilityOverrides, audioModel])
    const selectedCharacterOverrides = useMemo<Record<string, CapabilityValue>>(() => {
        return readCapabilitySelectionForModel(capabilityOverrides, characterModel)
    }, [capabilityOverrides, characterModel])
    const selectedLocationOverrides = useMemo<Record<string, CapabilityValue>>(() => {
        return readCapabilitySelectionForModel(capabilityOverrides, locationModel)
    }, [capabilityOverrides, locationModel])
    const selectedStoryboardOverrides = useMemo<Record<string, CapabilityValue>>(() => {
        return readCapabilitySelectionForModel(capabilityOverrides, imageModel)
    }, [capabilityOverrides, imageModel])
    const selectedEditOverrides = useMemo<Record<string, CapabilityValue>>(() => {
        return readCapabilitySelectionForModel(capabilityOverrides, editModel)
    }, [capabilityOverrides, editModel])

    useEffect(() => {
        if (!isOpen || !onCapabilityOverridesChange) return
        const targets = [
            { modelKey: analysisModel, fields: analysisCapabilityFields },
            { modelKey: characterModel, fields: characterCapabilityFields },
            { modelKey: locationModel, fields: locationCapabilityFields },
            { modelKey: imageModel, fields: storyboardCapabilityFields },
            { modelKey: editModel, fields: editCapabilityFields },
            { modelKey: effectiveSingleShotVideoModel, fields: singleShotVideoCapabilityFields },
            { modelKey: sequenceVideoModel, fields: sequenceVideoCapabilityFields },
            { modelKey: audioModel, fields: audioCapabilityFields },
        ]
        const defaultsSignature = JSON.stringify({
            capabilityOverrides: capabilityOverrides || {},
            targets: targets.map((target) => ({
                modelKey: target.modelKey || null,
                fields: capabilityFieldsSignature(target.fields),
            })),
        })
        const result = ensureCapabilityDefaultsForModels({
            capabilityOverrides,
            targets,
        })
        if (result.changed) {
            if (lastAppliedCapabilityDefaultsSignatureRef.current === defaultsSignature) return
            lastAppliedCapabilityDefaultsSignatureRef.current = defaultsSignature
            onCapabilityOverridesChange(result.capabilityOverrides)
            return
        }
        lastAppliedCapabilityDefaultsSignatureRef.current = null
    }, [
        isOpen,
        onCapabilityOverridesChange,
        capabilityOverrides,
        analysisModel,
        analysisCapabilityFields,
        characterModel,
        characterCapabilityFields,
        locationModel,
        locationCapabilityFields,
        imageModel,
        storyboardCapabilityFields,
        editModel,
        editCapabilityFields,
        effectiveSingleShotVideoModel,
        singleShotVideoCapabilityFields,
        sequenceVideoModel,
        sequenceVideoCapabilityFields,
        audioModel,
        audioCapabilityFields,
    ])

    const applyCapabilityOverride = (modelKey: string | undefined, field: string, value: string, sample: CapabilityValue) => {
        if (!modelKey || !onCapabilityOverridesChange) return

        const nextOverrides: CapabilitySelections = {
            ...(capabilityOverrides || {}),
        }
        const currentSelection = isRecord(nextOverrides[modelKey])
            ? { ...(nextOverrides[modelKey] as Record<string, CapabilityValue>) }
            : {}

        if (!value) {
            delete currentSelection[field]
        } else {
            currentSelection[field] = parseBySample(value, sample)
        }

        if (Object.keys(currentSelection).length === 0) {
            delete nextOverrides[modelKey]
        } else {
            nextOverrides[modelKey] = currentSelection
        }

        onCapabilityOverridesChange(nextOverrides)
        showSaved()
    }

    /**
     * 切换模型时，自动将该模型所有 capability fields 的第一个 option 写入 overrides
     * 解决 UI 视觉上显示默认选中（第一项高亮）但 DB 实际为空，导致 requireAllFields 报错的问题
     */
    const handleModelChange = (
        modelKey: string,
        modelOptions: ModelOption[],
        namespace: 'llm' | 'image' | 'video' | 'audio',
        configPatch: Record<string, unknown>,
        onModelChangeFn?: (v: string) => void,
    ) => {
        // 用新选中的模型的 capabilities 计算 fields，而不是旧模型的
        const newModel = modelOptions.find((m) => m.value === modelKey)
        const capabilityFieldsForModel = extractCapabilityFields(newModel?.capabilities, namespace)
        const configPatchResult = buildModelCapabilityConfigPatch({
            configPatch,
            capabilityOverrides,
            modelKey,
            fields: capabilityFieldsForModel,
        })

        if (onConfigPatch) {
            onConfigPatch(configPatchResult.patch)
            showSaved()
            return
        }

        onModelChangeFn?.(modelKey)
        if (configPatchResult.changed) {
            const nextCapabilityOverrides = configPatchResult.patch.capabilityOverrides
            if (isRecord(nextCapabilityOverrides)) {
                onCapabilityOverridesChange?.(nextCapabilityOverrides as CapabilitySelections)
            }
        }
        showSaved()
    }

    useEffect(() => {
        if (!isOpen) return
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, onClose])

    const showSaved = () => {
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
    }

    const handleChange = (callback?: (value: string) => void) => (value: string) => {
        callback?.(value)
        showSaved()
    }

    if (!isOpen) return null

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center glass-overlay animate-fadeIn"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose()
            }}
        >
            <div className="glass-surface-modal p-7 w-full max-w-3xl transform transition-all scale-100 max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-2xl font-bold text-[var(--glass-text-primary)]">{t('title')}</h2>
                    <div className="flex items-center gap-3">
                        <div className={`glass-chip text-xs transition-all duration-300 ${saveStatus === 'saved'
                            ? 'glass-chip-success'
                            : 'glass-chip-neutral'
                            }`}>
                            {saveStatus === 'saved' ? (
                                <>
                                    <AppIcon name="check" className="w-3.5 h-3.5" />
                                    {t('saved')}
                                </>
                            ) : (
                                <>
                                    <span className="w-1.5 h-1.5 bg-[var(--glass-tone-success-fg)] rounded-full"></span>
                                    {t('autoSave')}
                                </>
                            )}
                        </div>
                        <button
                            onClick={onClose}
                            className="glass-btn-base glass-btn-soft rounded-full p-2 text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-secondary)]"
                        >
                            <AppIcon name="close" className="w-6 h-6" />
                        </button>
                    </div>
                </div>
                <p className="text-[12px] text-[var(--glass-text-tertiary)] mb-6">{t('subtitle')}</p>
                <div className="space-y-5 flex-1 min-h-0 overflow-y-auto app-scrollbar">
                    <div className="glass-surface-soft p-5 sm:p-6 space-y-4">
                        <h3 className="text-sm font-semibold text-[var(--glass-text-tertiary)]">{t('visualSettings')}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-[var(--glass-text-secondary)]">{t('visualStyle')}</label>
                                <StyleSelector
                                    value={artStyle}
                                    onChange={(value) => handleChange(onArtStyleChange)(value)}
                                    options={ART_STYLES}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-[var(--glass-text-secondary)]">{t('aspectRatio')}</label>
                                <RatioSelector
                                    value={videoRatio}
                                    onChange={(value) => { handleChange(onVideoRatioChange)(value) }}
                                    options={VIDEO_RATIOS}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="glass-surface-soft p-5 sm:p-6 space-y-4">
                        <h3 className="text-sm font-semibold text-[var(--glass-text-tertiary)]">{t('modelParams')}</h3>
                        {!modelsLoaded && (
                            <div className="text-xs text-[var(--glass-text-tertiary)]">{t('loadingModels')}</div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-[var(--glass-text-secondary)]">{t('analysisModel')}</label>
                                <ModelCapabilityDropdown
                                    models={userModels.llm}
                                    value={analysisModel}
                                    onModelChange={(v) => handleModelChange(v, userModels.llm, 'llm', { analysisModel: v }, onAnalysisModelChange)}
                                    capabilityFields={analysisCapabilityFields}
                                    capabilityOverrides={selectedAnalysisOverrides}
                                    onCapabilityChange={(field, rawValue, sample) => {
                                        applyCapabilityOverride(analysisModel, field, rawValue, sample)
                                    }}
                                    placeholder={t('pleaseSelect')}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-[var(--glass-text-secondary)]">{t('characterModel')}</label>
                                <ModelCapabilityDropdown
                                    models={userModels.image}
                                    value={characterModel}
                                    onModelChange={(v) => handleModelChange(v, userModels.image, 'image', { characterModel: v }, onCharacterModelChange)}
                                    capabilityFields={characterCapabilityFields}
                                    capabilityOverrides={selectedCharacterOverrides}
                                    onCapabilityChange={(field, rawValue, sample) => {
                                        applyCapabilityOverride(characterModel, field, rawValue, sample)
                                    }}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-[var(--glass-text-secondary)]">{t('locationModel')}</label>
                                <ModelCapabilityDropdown
                                    models={userModels.image}
                                    value={locationModel}
                                    onModelChange={(v) => handleModelChange(v, userModels.image, 'image', { locationModel: v }, onLocationModelChange)}
                                    capabilityFields={locationCapabilityFields}
                                    capabilityOverrides={selectedLocationOverrides}
                                    onCapabilityChange={(field, rawValue, sample) => {
                                        applyCapabilityOverride(locationModel, field, rawValue, sample)
                                    }}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-[var(--glass-text-secondary)]">{t('storyboardModel')}</label>
                                <ModelCapabilityDropdown
                                    models={userModels.image}
                                    value={imageModel}
                                    onModelChange={(v) => handleModelChange(v, userModels.image, 'image', { storyboardModel: v }, onImageModelChange)}
                                    capabilityFields={storyboardCapabilityFields}
                                    capabilityOverrides={selectedStoryboardOverrides}
                                    onCapabilityChange={(field, rawValue, sample) => {
                                        applyCapabilityOverride(imageModel, field, rawValue, sample)
                                    }}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-[var(--glass-text-secondary)]">{t('editModel')}</label>
                                <ModelCapabilityDropdown
                                    models={userModels.image}
                                    value={editModel}
                                    onModelChange={(v) => handleModelChange(v, userModels.image, 'image', { editModel: v }, onEditModelChange)}
                                    capabilityFields={editCapabilityFields}
                                    capabilityOverrides={selectedEditOverrides}
                                    onCapabilityChange={(field, rawValue, sample) => {
                                        applyCapabilityOverride(editModel, field, rawValue, sample)
                                    }}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-[var(--glass-text-secondary)]">{t('singleShotVideoModel')}</label>
                                <ModelCapabilityDropdown
                                    models={normalVideoModels}
                                    value={effectiveSingleShotVideoModel}
                                    onModelChange={(v) => {
                                        handleModelChange(v, normalVideoModels, 'video', { singleShotVideoModel: v, videoModel: v }, (value) => {
                                            onSingleShotVideoModelChange?.(value)
                                            onVideoModelChange?.(value)
                                        })
                                    }}
                                    capabilityFields={singleShotVideoCapabilityFields}
                                    capabilityOverrides={selectedSingleShotVideoOverrides}
                                    onCapabilityChange={(field, rawValue, sample) => {
                                        applyCapabilityOverride(effectiveSingleShotVideoModel, field, rawValue, sample)
                                    }}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-[var(--glass-text-secondary)]">{t('sequenceVideoModel')}</label>
                                <ModelCapabilityDropdown
                                    models={normalVideoModels}
                                    value={sequenceVideoModel}
                                    onModelChange={(v) => handleModelChange(v, normalVideoModels, 'video', { sequenceVideoModel: v }, onSequenceVideoModelChange)}
                                    capabilityFields={sequenceVideoCapabilityFields}
                                    capabilityOverrides={selectedSequenceVideoOverrides}
                                    onCapabilityChange={(field, rawValue, sample) => {
                                        applyCapabilityOverride(sequenceVideoModel, field, rawValue, sample)
                                    }}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-[var(--glass-text-secondary)]">{t('audioModel')}</label>
                                <ModelCapabilityDropdown
                                    models={userModels.audio}
                                    value={audioModel}
                                    onModelChange={(v) => handleModelChange(v, userModels.audio, 'audio', { audioModel: v }, onAudioModelChange)}
                                    capabilityFields={audioCapabilityFields}
                                    capabilityOverrides={selectedAudioOverrides}
                                    onCapabilityChange={(field, rawValue, sample) => {
                                        applyCapabilityOverride(audioModel, field, rawValue, sample)
                                    }}
                                    placeholder={t('pleaseSelect')}
                                />
                            </div>
                        </div>
                    </div>


                </div>
            </div>
        </div>
    )
}

export { SettingsModal as ConfigEditModal }
export { WorldContextModal } from './WorldContextModal'
