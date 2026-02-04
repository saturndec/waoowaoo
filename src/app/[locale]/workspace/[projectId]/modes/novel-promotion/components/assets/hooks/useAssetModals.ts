'use client'

/**
 * useAssetModals - 资产编辑弹窗状态管理
 * 从 AssetsStage.tsx 提取
 * 
 * 🔥 V6.5 重构：直接订阅 useProjectAssets，消除 props drilling
 */

import { useState, useCallback } from 'react'
import { CharacterAppearance } from '@/types/project'
import { useProjectAssets, type Character, type Location } from '@/lib/query/hooks'

// 编辑弹窗状态类型
interface EditingAppearance {
    characterId: string
    characterName: string
    appearanceId: string  // UUID
    description: string
    descriptionIndex?: number
    introduction?: string | null  // 角色介绍
}

interface EditingLocation {
    locationId: string
    locationName: string
    description: string
}

interface ImageEditModal {
    locationId: string
    imageIndex: number
    locationName: string
}

interface CharacterImageEditModal {
    characterId: string
    appearanceId: string
    imageIndex: number
    characterName: string
}

interface UseAssetModalsProps {
    projectId: string
}

export function useAssetModals({
    projectId
}: UseAssetModalsProps) {
    // 🔥 直接订阅缓存 - 消除 props drilling
    const { data: assets } = useProjectAssets(projectId)
    const characters = assets?.characters ?? []
    const locations = assets?.locations ?? []

    // 获取形象列表（内置实现）
    const getAppearances = useCallback((character: Character): CharacterAppearance[] => {
        return character.appearances || []
    }, [])

    // 角色编辑弹窗
    const [editingAppearance, setEditingAppearance] = useState<EditingAppearance | null>(null)
    // 场景编辑弹窗
    const [editingLocation, setEditingLocation] = useState<EditingLocation | null>(null)
    // 新增弹窗
    const [showAddCharacter, setShowAddCharacter] = useState(false)
    const [showAddLocation, setShowAddLocation] = useState(false)
    // 图片编辑弹窗
    const [imageEditModal, setImageEditModal] = useState<ImageEditModal | null>(null)
    const [characterImageEditModal, setCharacterImageEditModal] = useState<CharacterImageEditModal | null>(null)
    // 全局资产设定弹窗
    const [showAssetSettingModal, setShowAssetSettingModal] = useState(false)

    // 编辑特定描述索引的角色形象
    const handleEditCharacterDescription = (characterId: string, appearanceIndex: number, descriptionIndex: number) => {
        const character = characters.find(c => c.id === characterId)
        if (!character) return
        const appearances = getAppearances(character)
        const appearance = appearances.find(a => a.appearanceIndex === appearanceIndex)
        if (!appearance) return

        const descriptions = appearance.descriptions || [appearance.description || '']
        const description = descriptions[descriptionIndex] || appearance.description || ''

        setEditingAppearance({
            characterId,
            characterName: character.name,
            appearanceId: appearance.id,
            description: description,
            descriptionIndex
        })
    }

    // 编辑特定描述索引的场景
    const handleEditLocationDescription = (locationId: string, imageIndex: number) => {
        const location = locations.find(l => l.id === locationId)
        if (!location) return

        const image = location.images?.find(img => img.imageIndex === imageIndex)
        const description = image?.description || ''

        setEditingLocation({
            locationId,
            locationName: location.name,
            description: description
        })
    }

    // 编辑角色形象
    const handleEditAppearance = (characterId: string, characterName: string, appearance: CharacterAppearance, introduction?: string | null) => {
        setEditingAppearance({
            characterId,
            characterName,
            appearanceId: appearance.id,
            description: appearance.description || '',
            introduction
        })
    }

    // 编辑场景
    const handleEditLocation = (location: Location) => {
        const firstImage = location.images?.[0]
        setEditingLocation({
            locationId: location.id,
            locationName: location.name,
            description: firstImage?.description || ''
        })
    }

    // 打开场景图片编辑弹窗
    const handleOpenLocationImageEdit = (locationId: string, imageIndex: number) => {
        const location = locations.find(l => l.id === locationId)
        if (!location) return

        setImageEditModal({
            locationId,
            imageIndex,
            locationName: location.name
        })
    }

    // 打开人物图片编辑弹窗
    const handleOpenCharacterImageEdit = (characterId: string, appearanceId: string, imageIndex: number, characterName: string) => {
        setCharacterImageEditModal({
            characterId,
            appearanceId,
            imageIndex,
            characterName
        })
    }

    // 关闭所有弹窗
    const closeEditingAppearance = () => setEditingAppearance(null)
    const closeEditingLocation = () => setEditingLocation(null)
    const closeAddCharacter = () => setShowAddCharacter(false)
    const closeAddLocation = () => setShowAddLocation(false)
    const closeImageEditModal = () => setImageEditModal(null)
    const closeCharacterImageEditModal = () => setCharacterImageEditModal(null)
    const closeAssetSettingModal = () => setShowAssetSettingModal(false)

    return {
        // 🔥 暴露数据供组件使用
        characters,
        locations,
        getAppearances,
        // 状态
        editingAppearance,
        editingLocation,
        showAddCharacter,
        showAddLocation,
        imageEditModal,
        characterImageEditModal,
        showAssetSettingModal,
        // Setters
        setEditingAppearance,
        setEditingLocation,
        setShowAddCharacter,
        setShowAddLocation,
        setImageEditModal,
        setCharacterImageEditModal,
        setShowAssetSettingModal,
        // Handlers
        handleEditCharacterDescription,
        handleEditLocationDescription,
        handleEditAppearance,
        handleEditLocation,
        handleOpenLocationImageEdit,
        handleOpenCharacterImageEdit,
        // Close helpers
        closeEditingAppearance,
        closeEditingLocation,
        closeAddCharacter,
        closeAddLocation,
        closeImageEditModal,
        closeCharacterImageEditModal,
        closeAssetSettingModal
    }
}
