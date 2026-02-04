'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'
import Navbar from '@/components/Navbar'
import { FolderSidebar } from './components/FolderSidebar'
import { AssetGrid } from './components/AssetGrid'
import { CharacterCreationModal, LocationCreationModal, CharacterEditModal, LocationEditModal } from '@/components/shared/assets'
import { FolderModal } from './components/FolderModal'
import ImagePreviewModal from '@/components/ui/ImagePreviewModal'
import ImageEditModal from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/assets/ImageEditModal'
import VoiceDesignDialog from './components/VoiceDesignDialog'
import VoiceCreationModal from './components/VoiceCreationModal'
import VoicePickerDialog from './components/VoicePickerDialog'
import {
    useGlobalCharacters,
    useGlobalLocations,
    useGlobalVoices,
    useGlobalFolders,
    useModifyCharacterImage,
    useModifyLocationImage,
    useRefreshGlobalAssets,
    type GlobalCharacter,
    type GlobalVoice,
} from '@/lib/query/hooks'
import { queryKeys } from '@/lib/query/keys'

export default function AssetHubPage() {
    const t = useTranslations('assetHub')
    const queryClient = useQueryClient()
    const refreshAssets = useRefreshGlobalAssets()

    // 文件夹选择状态
    const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)

    // 使用 React Query 获取数据
    const { data: folders = [], isLoading: foldersLoading } = useGlobalFolders()
    const { data: characters = [], isLoading: charactersLoading } = useGlobalCharacters(selectedFolderId)
    const { data: locations = [], isLoading: locationsLoading } = useGlobalLocations(selectedFolderId)
    const { data: voices = [], isLoading: voicesLoading } = useGlobalVoices(selectedFolderId)

    const loading = foldersLoading || charactersLoading || locationsLoading || voicesLoading

    // Mutation hooks
    const modifyCharacterImage = useModifyCharacterImage()
    const modifyLocationImage = useModifyLocationImage()

    // 弹窗状态
    const [showAddCharacter, setShowAddCharacter] = useState(false)
    const [showAddLocation, setShowAddLocation] = useState(false)
    const [showFolderModal, setShowFolderModal] = useState(false)
    const [editingFolder, setEditingFolder] = useState<{ id: string; name: string } | null>(null)
    const [previewImage, setPreviewImage] = useState<string | null>(null)
    const [imageEditModal, setImageEditModal] = useState<{
        type: 'character' | 'location'
        id: string
        name: string
        imageIndex: number
        appearanceId?: string
    } | null>(null)

    const [voiceDesignCharacter, setVoiceDesignCharacter] = useState<{
        id: string
        name: string
        hasExistingVoice: boolean
    } | null>(null)

    // 音色库弹窗状态
    const [showAddVoice, setShowAddVoice] = useState(false)
    const [voicePickerCharacterId, setVoicePickerCharacterId] = useState<string | null>(null)

    // 编辑角色弹窗状态
    const [characterEditModal, setCharacterEditModal] = useState<{
        characterId: string
        characterName: string
        appearanceId: string
        changeReason: string
        description: string
    } | null>(null)

    // 编辑场景弹窗状态
    const [locationEditModal, setLocationEditModal] = useState<{
        locationId: string
        locationName: string
        summary: string
        imageIndex: number
        description: string
    } | null>(null)

    // 自动轮询刷新：检测是否有生成中的资产
    useEffect(() => {
        const hasGenerating = characters.some(c => c.appearances.some(a => a.generating)) ||
            locations.some(l => l.images.some(i => i.generating))

        if (!hasGenerating) return

        // 每 3 秒静默刷新
        const interval = setInterval(() => {
            queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.characters() })
            queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.locations() })
        }, 3000)

        return () => clearInterval(interval)
    }, [characters, locations, queryClient])

    // 创建文件夹
    const handleCreateFolder = async (name: string) => {
        try {
            const res = await fetch('/api/asset-hub/folders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            })
            if (res.ok) {
                queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.folders() })
                setShowFolderModal(false)
            }
        } catch (error) {
            console.error('创建文件夹失败:', error)
        }
    }

    // 更新文件夹
    const handleUpdateFolder = async (folderId: string, name: string) => {
        try {
            const res = await fetch(`/api/asset-hub/folders/${folderId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            })
            if (res.ok) {
                queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.folders() })
                setEditingFolder(null)
                setShowFolderModal(false)
            }
        } catch (error) {
            console.error('更新文件夹失败:', error)
        }
    }

    // 删除文件夹
    const handleDeleteFolder = async (folderId: string) => {
        if (!confirm(t('confirmDeleteFolder'))) return

        try {
            const res = await fetch(`/api/asset-hub/folders/${folderId}`, {
                method: 'DELETE'
            })
            if (res.ok) {
                if (selectedFolderId === folderId) {
                    setSelectedFolderId(null)
                }
                queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.all() })
            }
        } catch (error) {
            console.error('删除文件夹失败:', error)
        }
    }

    // 打开图片编辑弹窗
    const handleOpenImageEdit = (type: 'character' | 'location', id: string, name: string, imageIndex: number, appearanceId?: string) => {
        setImageEditModal({ type, id, name, imageIndex, appearanceId })
    }

    // 处理图片编辑确认 - 使用 mutation
    const handleImageEdit = async (modifyPrompt: string, extraImageUrls?: string[]) => {
        if (!imageEditModal) return

        const { type, id, imageIndex, appearanceId } = imageEditModal
        setImageEditModal(null)

        if (type === 'character' && appearanceId) {
            modifyCharacterImage.mutate({
                characterId: id,
                appearanceId,
                imageIndex,
                modifyPrompt,
                extraImageUrls
            }, {
                onError: (error) => {
                    alert(error.message || '编辑失败')
                }
            })
        } else if (type === 'location') {
            modifyLocationImage.mutate({
                locationId: id,
                imageIndex,
                modifyPrompt,
                extraImageUrls
            }, {
                onError: (error) => {
                    alert(error.message || '编辑失败')
                }
            })
        }
    }

    // 打开 AI 声音设计对话框
    const handleOpenVoiceDesign = (characterId: string, characterName: string) => {
        const character = characters.find(c => c.id === characterId)
        setVoiceDesignCharacter({
            id: characterId,
            name: characterName,
            hasExistingVoice: !!character?.customVoiceUrl
        })
    }

    // 保存 AI 设计的声音
    const handleVoiceDesignSave = async (voiceId: string, audioBase64: string) => {
        if (!voiceDesignCharacter) return

        try {
            const res = await fetch('/api/asset-hub/character-voice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    characterId: voiceDesignCharacter.id,
                    voiceId,
                    audioBase64
                })
            })

            if (res.ok) {
                alert(`已为 ${voiceDesignCharacter.name} 设置 AI 设计的声音`)
                queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.characters() })
            } else {
                const data = await res.json()
                alert(data.error || '保存声音失败')
            }
        } catch (error) {
            console.error('保存声音失败:', error)
            alert('保存声音失败')
        }
    }

    // 打开角色编辑弹窗
    const handleOpenCharacterEdit = (character: GlobalCharacter, appearance: GlobalCharacter['appearances'][0]) => {
        setCharacterEditModal({
            characterId: character.id,
            characterName: character.name,
            appearanceId: appearance.id,
            changeReason: appearance.changeReason || `形象 ${appearance.appearanceIndex}`,
            description: appearance.description || ''
        })
    }

    // 打开场景编辑弹窗
    const handleOpenLocationEdit = (location: { id: string; name: string; summary: string | null; images: Array<{ imageIndex: number; description: string | null }> }, imageIndex: number) => {
        const image = location.images.find(img => img.imageIndex === imageIndex)
        setLocationEditModal({
            locationId: location.id,
            locationName: location.name,
            summary: location.summary || '',
            imageIndex: imageIndex,
            description: image?.description || location.summary || ''
        })
    }

    // 角色编辑后触发生成
    const handleCharacterEditGenerate = async () => {
        if (!characterEditModal) return

        try {
            await fetch('/api/asset-hub/generate-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'character',
                    id: characterEditModal.characterId,
                    appearanceId: characterEditModal.appearanceId
                })
            })
            queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.characters() })
        } catch (error) {
            console.error('触发生成失败:', error)
        }
    }

    // 场景编辑后触发生成
    const handleLocationEditGenerate = async () => {
        if (!locationEditModal) return

        try {
            await fetch('/api/asset-hub/generate-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'location',
                    id: locationEditModal.locationId
                })
            })
            queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.locations() })
        } catch (error) {
            console.error('触发生成失败:', error)
        }
    }

    // 从音色库选择后绑定到角色
    const handleVoiceSelect = async (voice: GlobalVoice) => {
        if (!voicePickerCharacterId) return

        try {
            const res = await fetch(`/api/asset-hub/characters/${voicePickerCharacterId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    globalVoiceId: voice.id,
                    customVoiceUrl: voice.customVoiceUrl
                })
            })

            if (res.ok) {
                queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.characters() })
                setVoicePickerCharacterId(null)
            } else {
                const data = await res.json()
                alert(data.error || '绑定音色失败')
            }
        } catch (error) {
            console.error('绑定音色失败:', error)
            alert('绑定音色失败')
        }
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <Navbar />
            <div className="max-w-7xl mx-auto px-4 py-6">
                {/* 页面标题 */}
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
                    <p className="text-sm text-gray-500 mt-1">{t('description')}</p>
                    <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {t('modelHint')}
                        <a href="/profile" className="text-blue-500 hover:text-blue-600 hover:underline">{t('modelHintLink')}</a>
                        {t('modelHintSuffix')}
                    </p>
                </div>

                <div className="flex gap-6">
                    {/* 左侧文件夹树 */}
                    <FolderSidebar
                        folders={folders}
                        selectedFolderId={selectedFolderId}
                        onSelectFolder={setSelectedFolderId}
                        onCreateFolder={() => {
                            setEditingFolder(null)
                            setShowFolderModal(true)
                        }}
                        onEditFolder={(folder) => {
                            setEditingFolder(folder)
                            setShowFolderModal(true)
                        }}
                        onDeleteFolder={handleDeleteFolder}
                    />

                    {/* 右侧资产网格 */}
                    <AssetGrid
                        characters={characters as any}
                        locations={locations as any}
                        voices={voices as any}
                        loading={loading}
                        onAddCharacter={() => setShowAddCharacter(true)}
                        onAddLocation={() => setShowAddLocation(true)}
                        onAddVoice={() => setShowAddVoice(true)}
                        selectedFolderId={selectedFolderId}
                        onImageClick={setPreviewImage}
                        onImageEdit={handleOpenImageEdit}
                        onVoiceDesign={handleOpenVoiceDesign}
                        onCharacterEdit={handleOpenCharacterEdit as any}
                        onLocationEdit={handleOpenLocationEdit as any}
                        onVoiceSelect={(characterId) => setVoicePickerCharacterId(characterId)}
                    />
                </div>
            </div>

            {/* 新建角色弹窗 */}
            {showAddCharacter && (
                <CharacterCreationModal
                    mode="asset-hub"
                    folderId={selectedFolderId}
                    onClose={() => setShowAddCharacter(false)}
                    onSuccess={() => {
                        setShowAddCharacter(false)
                        queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.characters() })
                    }}
                />
            )}

            {/* 新建场景弹窗 */}
            {showAddLocation && (
                <LocationCreationModal
                    mode="asset-hub"
                    folderId={selectedFolderId}
                    onClose={() => setShowAddLocation(false)}
                    onSuccess={() => {
                        setShowAddLocation(false)
                        queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.locations() })
                    }}
                />
            )}

            {/* 文件夹编辑弹窗 */}
            {showFolderModal && (
                <FolderModal
                    folder={editingFolder}
                    onClose={() => {
                        setShowFolderModal(false)
                        setEditingFolder(null)
                    }}
                    onSave={(name) => {
                        if (editingFolder) {
                            handleUpdateFolder(editingFolder.id, name)
                        } else {
                            handleCreateFolder(name)
                        }
                    }}
                />
            )}

            {/* 图片预览弹窗 */}
            {previewImage && (
                <ImagePreviewModal
                    imageUrl={previewImage}
                    onClose={() => setPreviewImage(null)}
                />
            )}

            {/* 图片编辑弹窗 */}
            {imageEditModal && (
                <ImageEditModal
                    type={imageEditModal.type}
                    name={imageEditModal.name}
                    onClose={() => setImageEditModal(null)}
                    onConfirm={handleImageEdit}
                />
            )}

            {/* AI 声音设计对话框 */}
            {voiceDesignCharacter && (
                <VoiceDesignDialog
                    isOpen={!!voiceDesignCharacter}
                    speaker={voiceDesignCharacter.name}
                    hasExistingVoice={voiceDesignCharacter.hasExistingVoice}
                    onClose={() => setVoiceDesignCharacter(null)}
                    onSave={handleVoiceDesignSave}
                />
            )}

            {/* 角色编辑弹窗 */}
            {characterEditModal && (
                <CharacterEditModal
                    mode="asset-hub"
                    characterId={characterEditModal.characterId}
                    characterName={characterEditModal.characterName}
                    appearanceId={characterEditModal.appearanceId}
                    changeReason={characterEditModal.changeReason}
                    description={characterEditModal.description}
                    onClose={() => setCharacterEditModal(null)}
                    onSave={handleCharacterEditGenerate}
                />
            )}

            {/* 场景编辑弹窗 */}
            {locationEditModal && (
                <LocationEditModal
                    mode="asset-hub"
                    locationId={locationEditModal.locationId}
                    locationName={locationEditModal.locationName}
                    summary={locationEditModal.summary}
                    imageIndex={locationEditModal.imageIndex}
                    description={locationEditModal.description}
                    onClose={() => setLocationEditModal(null)}
                    onSave={handleLocationEditGenerate}
                />
            )}

            {/* 新建音色弹窗 */}
            {showAddVoice && (
                <VoiceCreationModal
                    isOpen={showAddVoice}
                    folderId={selectedFolderId}
                    onClose={() => setShowAddVoice(false)}
                    onSuccess={() => {
                        setShowAddVoice(false)
                        queryClient.invalidateQueries({ queryKey: queryKeys.globalAssets.voices() })
                    }}
                />
            )}

            {/* 从音色库选择弹窗 */}
            {voicePickerCharacterId && (
                <VoicePickerDialog
                    isOpen={!!voicePickerCharacterId}
                    onClose={() => setVoicePickerCharacterId(null)}
                    onSelect={handleVoiceSelect as any}
                />
            )}
        </div>
    )
}
