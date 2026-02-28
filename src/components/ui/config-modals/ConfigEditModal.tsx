'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
    ART_STYLES,
    VIDEO_RATIOS,
} from '@/lib/constants'
import type {
    CapabilitySelections,
    CapabilityValue,
    ModelCapabilities,
} from '@/lib/model-config-contract'
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
}

interface CapabilityFieldDefinition {
    field: string
    options: CapabilityValue[]
    label: string
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
    videoRatio?: string
    capabilityOverrides?: CapabilitySelections
    ttsRate?: string
    onArtStyleChange?: (value: string) => void
    onAnalysisModelChange?: (value: string) => void
    onCharacterModelChange?: (value: string) => void
    onLocationModelChange?: (value: string) => void
    onImageModelChange?: (value: string) => void
    onEditModelChange?: (value: string) => void

    onVideoModelChange?: (value: string) => void
    onVideoRatioChange?: (value: string) => void
    onCapabilityOverridesChange?: (value: CapabilitySelections) => void
    onTTSRateChange?: (value: string) => void
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
    namespace: 'llm' | 'image' | 'video',
): CapabilityFieldDefinition[] {
    const rawNamespace = capabilities?.[namespace]
    if (!isRecord(rawNamespace)) return []

    return Object.entries(rawNamespace)
        .filter(([key, value]) => key.endsWith('Options') && Array.isArray(value) && value.every(isCapabilityValue) && value.length > 0)
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
    videoRatio = '9:16',
    capabilityOverrides,
    ttsRate,
    onArtStyleChange,
    onAnalysisModelChange,
    onCharacterModelChange,
    onLocationModelChange,
    onImageModelChange,
    onEditModelChange,
    onVideoModelChange,
    onVideoRatioChange,
    onCapabilityOverridesChange,
    onTTSRateChange,
}: SettingsModalProps) {
    const t = useTranslations('configModal')
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle')
    const userModels = useMemo<UserModels>(() => ({
        llm: Array.isArray(availableModels?.llm) ? availableModels.llm : [],
        image: Array.isArray(availableModels?.image) ? availableModels.image : [],
        video: Array.isArray(availableModels?.video) ? availableModels.video : [],
    }), [availableModels])

    const selectedVideoModelOption = useMemo(
        () => userModels.video.find((model) => model.value === videoModel) || null,
        [userModels.video, videoModel],
    )
    const selectedAnalysisModelOption = useMemo(
        () => userModels.llm.find((model) => model.value === analysisModel) || null,
        [userModels.llm, analysisModel],
    )

    const videoCapabilityFields = useMemo(
        () => extractCapabilityFields(selectedVideoModelOption?.capabilities, 'video'),
        [selectedVideoModelOption],
    )
    const analysisCapabilityFields = useMemo(
        () => extractCapabilityFields(selectedAnalysisModelOption?.capabilities, 'llm'),
        [selectedAnalysisModelOption],
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

    const selectedVideoOverrides = useMemo<Record<string, CapabilityValue>>(() => {
        return readCapabilitySelectionForModel(capabilityOverrides, videoModel)
    }, [capabilityOverrides, videoModel])
    const selectedAnalysisOverrides = useMemo<Record<string, CapabilityValue>>(() => {
        return readCapabilitySelectionForModel(capabilityOverrides, analysisModel)
    }, [capabilityOverrides, analysisModel])
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
        namespace: 'llm' | 'image' | 'video',
        onModelChangeFn?: (v: string) => void,
    ) => {
        onModelChangeFn?.(modelKey)
        showSaved()
        if (!onCapabilityOverridesChange) return
        // 用新选中的模型的 capabilities 计算 fields，而不是旧模型的
        const newModel = modelOptions.find((m) => m.value === modelKey)
        const capabilityFieldsForModel = extractCapabilityFields(newModel?.capabilities, namespace)
        if (capabilityFieldsForModel.length === 0) return
        const nextOverrides: CapabilitySelections = { ...(capabilityOverrides || {}) }
        const existing = isRecord(nextOverrides[modelKey])
            ? { ...(nextOverrides[modelKey] as Record<string, CapabilityValue>) }
            : {}
        // 只对尚未配置的 field 设置默认值（不覆盖已有配置）
        let changed = false
        for (const def of capabilityFieldsForModel) {
            if (existing[def.field] === undefined && def.options.length > 0) {
                existing[def.field] = def.options[0]
                changed = true
            }
        }
        if (changed) {
            nextOverrides[modelKey] = existing
            onCapabilityOverridesChange(nextOverrides)
        }
    }

    void ttsRate
    void onTTSRateChange

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
            <div className="glass-surface-modal p-7 w-full max-w-3xl transform transition-all scale-100 max-h-[90vh] overflow-y-auto custom-scrollbar">
                <div className="flex justify-between items-center mb-6">
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

                <div className="space-y-5">
                    <div className="glass-surface-soft p-5 sm:p-6 space-y-4">
                        <h3 className="text-sm font-semibold text-[var(--glass-text-tertiary)]">{t('visualStyle')}</h3>
                        <div className="max-w-xs">
                            <StyleSelector
                                value={artStyle}
                                onChange={(value) => handleChange(onArtStyleChange)(value)}
                                options={ART_STYLES}
                            />
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
                                    onModelChange={(v) => handleChange(onAnalysisModelChange)(v)}
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
                                    onModelChange={(v) => handleModelChange(v, userModels.image, 'image', onCharacterModelChange)}
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
                                    onModelChange={(v) => handleModelChange(v, userModels.image, 'image', onLocationModelChange)}
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
                                    onModelChange={(v) => handleModelChange(v, userModels.image, 'image', onImageModelChange)}
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
                                    onModelChange={(v) => handleModelChange(v, userModels.image, 'image', onEditModelChange)}
                                    capabilityFields={editCapabilityFields}
                                    capabilityOverrides={selectedEditOverrides}
                                    onCapabilityChange={(field, rawValue, sample) => {
                                        applyCapabilityOverride(editModel, field, rawValue, sample)
                                    }}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-[var(--glass-text-secondary)]">{t('videoModel')}</label>
                                <ModelCapabilityDropdown
                                    models={userModels.video}
                                    value={videoModel}
                                    onModelChange={(v) => handleModelChange(v, userModels.video, 'video', onVideoModelChange)}
                                    capabilityFields={videoCapabilityFields}
                                    capabilityOverrides={selectedVideoOverrides}
                                    onCapabilityChange={(field, rawValue, sample) => {
                                        applyCapabilityOverride(videoModel, field, rawValue, sample)
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="glass-surface-soft p-5 sm:p-6 space-y-4">
                        <h3 className="text-sm font-semibold text-[var(--glass-text-tertiary)]">{t('aspectRatio')}</h3>
                        <div className="max-w-xs">
                            <RatioSelector
                                value={videoRatio}
                                onChange={(value) => { handleChange(onVideoRatioChange)(value) }}
                                options={VIDEO_RATIOS}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export { SettingsModal as ConfigEditModal }
export { WorldContextModal } from './WorldContextModal'
