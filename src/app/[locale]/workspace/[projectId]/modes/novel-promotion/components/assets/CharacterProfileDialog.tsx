'use client'

/**
 * 角色档案编辑对话框
 * 允许用户编辑角色档案的各项属性
 */

import { useTranslations } from 'next-intl'
import { useState, useEffect } from 'react'
import { CharacterProfileData, RoleLevel, CostumeTier } from '@/types/character-profile'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { AppIcon } from '@/components/ui/icons'

interface CharacterProfileDialogProps {
    isOpen: boolean
    characterName: string
    profileData: CharacterProfileData
    onClose: () => void
    onSave: (profileData: CharacterProfileData) => void
    isSaving?: boolean
}

const ROLE_LEVELS: RoleLevel[] = ['S', 'A', 'B', 'C', 'D']
const COSTUME_TIERS: CostumeTier[] = [5, 4, 3, 2, 1]

export default function CharacterProfileDialog({
    isOpen,
    characterName,
    profileData,
    onClose,
    onSave,
    isSaving = false
}: CharacterProfileDialogProps) {
    const t = useTranslations('assets')
    const savingState = isSaving
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'build',
            resource: 'image',
            hasOutput: false,
        })
        : null
    const [formData, setFormData] = useState<CharacterProfileData>(profileData)
    const [newTag, setNewTag] = useState('')
    const [newColor, setNewColor] = useState('')
    const [newKeyword, setNewKeyword] = useState('')

    useEffect(() => {
        setFormData(profileData)
    }, [profileData])

    if (!isOpen) return null

    const handleSubmit = () => {
        onSave(formData)
    }

    const addTag = () => {
        if (newTag.trim() && !formData.personality_tags.includes(newTag.trim())) {
            setFormData({ ...formData, personality_tags: [...formData.personality_tags, newTag.trim()] })
            setNewTag('')
        }
    }

    const removeTag = (index: number) => {
        setFormData({
            ...formData,
            personality_tags: formData.personality_tags.filter((_, i) => i !== index)
        })
    }

    const addColor = () => {
        if (newColor.trim() && !formData.suggested_colors.includes(newColor.trim())) {
            setFormData({ ...formData, suggested_colors: [...formData.suggested_colors, newColor.trim()] })
            setNewColor('')
        }
    }

    const removeColor = (index: number) => {
        setFormData({
            ...formData,
            suggested_colors: formData.suggested_colors.filter((_, i) => i !== index)
        })
    }

    const addKeyword = () => {
        if (newKeyword.trim() && !formData.visual_keywords.includes(newKeyword.trim())) {
            setFormData({ ...formData, visual_keywords: [...formData.visual_keywords, newKeyword.trim()] })
            setNewKeyword('')
        }
    }

    const removeKeyword = (index: number) => {
        setFormData({
            ...formData,
            visual_keywords: formData.visual_keywords.filter((_, i) => i !== index)
        })
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55" onClick={onClose}>
            <div
                className="bg-card rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto m-4"
                onClick={(e) => e.stopPropagation()}
            >
                {/* 头部 */}
                <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-foreground">{t('characterProfile.editDialogTitle', { name: characterName })}</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-muted rounded-lg transition-colors"
                    >
                        <AppIcon name="close" className="w-5 h-5" />
                    </button>
                </div>

                {/* 表单内容 */}
                <div className="p-6 space-y-4">
                    {/* 角色层级 */}
                    <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-2">{t('characterProfile.importanceLevel')}</label>
                        <select
                            value={formData.role_level}
                            onChange={(e) => setFormData({ ...formData, role_level: e.target.value as RoleLevel })}
                            className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary/40"
                        >
                            {ROLE_LEVELS.map((level) => (
                                <option key={level} value={level}>
                                    {t(`characterProfile.importance.${level}` as never)}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* 角色原型 */}
                    <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-2">{t('characterProfile.characterArchetype')}</label>
                        <input
                            type="text"
                            value={formData.archetype}
                            onChange={(e) => setFormData({ ...formData, archetype: e.target.value })}
                            placeholder={t('characterProfile.archetypePlaceholder')}
                            className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary/40"
                        />
                    </div>

                    {/* 性格标签 */}
                    <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-2">{t('characterProfile.personalityTags')}</label>
                        <div className="flex gap-2 mb-2">
                            {formData.personality_tags.map((tag, i) => (
                                <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-lg text-sm">
                                    {tag}
                                    <button onClick={() => removeTag(i)} className="inline-flex h-4 w-4 items-center justify-center hover:text-foreground">
                                        <AppIcon name="closeSm" className="h-3 w-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newTag}
                                onChange={(e) => setNewTag(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                                placeholder={t('characterProfile.addTagPlaceholder')}
                                className="flex-1 px-3 py-2 border border-border rounded-lg"
                            />
                            <button onClick={addTag} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90">
                                {t("common.add")}
                            </button>
                        </div>
                    </div>

                    {/* 服装华丽度 */}
                    <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-2">{t('characterProfile.costumeLevelLabel')}</label>
                        <select
                            value={formData.costume_tier}
                            onChange={(e) => setFormData({ ...formData, costume_tier: Number(e.target.value) as CostumeTier })}
                            className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary/40"
                        >
                            {COSTUME_TIERS.map((tier) => (
                                <option key={tier} value={tier}>
                                    {t(`characterProfile.costumeLevel.${tier}` as never)}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* 建议色彩 */}
                    <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-2">{t('characterProfile.suggestedColors')}</label>
                        <div className="flex gap-2 mb-2 flex-wrap">
                            {formData.suggested_colors.map((color, i) => (
                                <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-muted text-muted-foreground rounded-lg text-sm">
                                    {color}
                                    <button onClick={() => removeColor(i)} className="inline-flex h-4 w-4 items-center justify-center hover:text-foreground">
                                        <AppIcon name="closeSm" className="h-3 w-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newColor}
                                onChange={(e) => setNewColor(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addColor())}
                                placeholder={t('characterProfile.colorPlaceholder')}
                                className="flex-1 px-3 py-2 border border-border rounded-lg"
                            />
                            <button onClick={addColor} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90">
                                {t("common.add")}
                            </button>
                        </div>
                    </div>

                    {/* 辨识标志 */}
                    <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-2">
                            {t('characterProfile.primaryMarker')} <span className="text-xs text-muted-foreground">{t('characterProfile.markerNote')}</span>
                        </label>
                        <input
                            type="text"
                            value={formData.primary_identifier || ''}
                            onChange={(e) => setFormData({ ...formData, primary_identifier: e.target.value })}
                            placeholder={t('characterProfile.markingsPlaceholder')}
                            className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary/40"
                        />
                    </div>

                    {/* 视觉关键词 */}
                    <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-2">{t('characterProfile.visualKeywords')}</label>
                        <div className="flex gap-2 mb-2 flex-wrap">
                            {formData.visual_keywords.map((keyword, i) => (
                                <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-lg text-sm">
                                    {keyword}
                                    <button onClick={() => removeKeyword(i)} className="inline-flex h-4 w-4 items-center justify-center hover:text-foreground">
                                        <AppIcon name="closeSm" className="h-3 w-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newKeyword}
                                onChange={(e) => setNewKeyword(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                                placeholder={t('characterProfile.keywordsPlaceholder')}
                                className="flex-1 px-3 py-2 border border-border rounded-lg"
                            />
                            <button onClick={addKeyword} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90">
                                {t("common.add")}
                            </button>
                        </div>
                    </div>
                </div>

                {/* 底部按钮 */}
                <div className="sticky bottom-0 bg-card border-t border-border px-6 py-4 flex gap-3 justify-end">
                    <button
                        onClick={onClose}
                        disabled={isSaving}
                        className="px-6 py-2 border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
                    >
                        {t("common.cancel")}
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSaving}
                        className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                        {isSaving && <TaskStatusInline state={savingState} className="text-white [&>span]:sr-only [&_svg]:text-white" />}
                        {t('characterProfile.confirmAndGenerate')}
                    </button>
                </div>
            </div>
        </div>
    )
}
