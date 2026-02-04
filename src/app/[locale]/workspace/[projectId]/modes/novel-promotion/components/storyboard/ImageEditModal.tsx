'use client'
import { useTranslations } from 'next-intl'

import { useState, useRef, useCallback } from 'react'
import { Character, Location } from '@/types/project'
import { useProjectAssets } from '@/lib/query/hooks/useProjectAssets'
import { SelectedAsset } from './hooks/useImageGeneration'

// 🔥 V6.5 重构：删除 characters, locations props，内部直接订阅
interface ImageEditModalProps {
  projectId: string  // 🔥 V6.5 新增：用于订阅 useProjectAssets
  // 🔥 V6.5 删除：characters, locations - 现在内部直接订阅
  defaultAssets: SelectedAsset[]
  onSubmit: (prompt: string, images: string[], assets: SelectedAsset[]) => void
  onClose: () => void
}

export default function ImageEditModal({
  projectId,
  // 🔥 V6.5 删除：characters, locations - 现在内部直接订阅
  defaultAssets,
  onSubmit,
  onClose
}: ImageEditModalProps) {
  const t = useTranslations('storyboard')

  // 🔥 V6.5 重构：直接订阅缓存，消除 props drilling
  const { data: assets } = useProjectAssets(projectId)
  const characters: Character[] = assets?.characters ?? []
  const locations: Location[] = assets?.locations ?? []

  const [editPrompt, setEditPrompt] = useState('')
  const [editImages, setEditImages] = useState<string[]>([])
  const [selectedAssets, setSelectedAssets] = useState<SelectedAsset[]>(defaultAssets)
  const [showAssetPicker, setShowAssetPicker] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 处理图片上传
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    Array.from(files).forEach(file => {
      const reader = new FileReader()
      reader.onload = (event) => {
        const base64 = event.target?.result as string
        setEditImages(prev => [...prev, base64])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }, [])

  // 处理粘贴图片
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile()
        if (file) {
          const reader = new FileReader()
          reader.onload = (event) => {
            const base64 = event.target?.result as string
            setEditImages(prev => [...prev, base64])
          }
          reader.readAsDataURL(file)
        }
      }
    }
  }, [])

  // 移除图片
  const removeImage = (index: number) => {
    setEditImages(prev => prev.filter((_, i) => i !== index))
  }

  // 添加资产
  const handleAddAsset = (asset: SelectedAsset) => {
    setSelectedAssets(prev => {
      if (prev.some(a => a.id === asset.id && a.type === asset.type)) return prev
      return [...prev, asset]
    })
  }

  // 移除资产
  const handleRemoveAsset = (assetId: string, assetType: string) => {
    setSelectedAssets(prev => prev.filter(a => !(a.id === assetId && a.type === assetType)))
  }

  // 提交编辑
  const handleSubmit = () => {
    if (!editPrompt.trim()) {
      alert('请输入修改指令')
      return
    }
    onSubmit(editPrompt, editImages, selectedAssets)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onPaste={handlePaste}
      >
        <div className="p-6 border-b">
          <h3 className="text-lg font-bold text-gray-900">编辑分镜</h3>
          <p className="text-sm text-gray-500 mt-1">输入修改指令，可选择上传参考图片和资产</p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">修改指令</label>
            <textarea
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              placeholder="描述你想要修改的内容，例如：改变背景颜色、调整人物表情..."
              className="w-full h-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none"
              autoFocus
            />
          </div>

          {/* 资产列表 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                参考资产 <span className="text-gray-400 font-normal">({selectedAssets.length}个)</span>
              </label>
              <button
                onClick={() => setShowAssetPicker(true)}
                className="text-sm text-purple-600 hover:text-purple-700 flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                添加资产
              </button>
            </div>
            <div className="flex flex-wrap gap-2 min-h-[64px] p-2 bg-gray-50 rounded-lg">
              {selectedAssets.length === 0 ? (
                <p className="text-sm text-gray-400 w-full text-center py-4">暂无资产，点击"添加资产"选择</p>
              ) : (
                selectedAssets.map((asset) => (
                  <div key={`${asset.type}-${asset.id}`} className="relative w-14 h-14 group">
                    {asset.imageUrl ? (
                      <img
                        src={asset.imageUrl.startsWith('images/') ? `/api/cos/sign?key=${encodeURIComponent(asset.imageUrl)}` : asset.imageUrl}
                        alt={asset.name}
                        className="w-full h-full object-cover rounded-lg border"
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-200 rounded-lg flex items-center justify-center text-gray-400 text-xs">
                        {asset.type === 'character' ? '👤' : '📍'}
                      </div>
                    )}
                    <button
                      onClick={() => handleRemoveAsset(asset.id, asset.type)}
                      className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ×
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs px-1 py-0.5 rounded-b-lg truncate">
                      {asset.name}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 参考图片上传 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              参考图片 <span className="text-gray-400 font-normal">(可选，支持粘贴)</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              className="hidden"
            />
            <div className="flex flex-wrap gap-2">
              {editImages.map((img, idx) => (
                <div key={idx} className="relative w-16 h-16">
                  <img src={img} alt="" className="w-full h-full object-cover rounded-lg" />
                  <button
                    onClick={() => removeImage(idx)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-16 h-16 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 hover:border-purple-400 hover:text-purple-400 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div className="p-6 border-t flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {t("candidate.cancel")}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!editPrompt.trim()}
            className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            开始编辑
          </button>
        </div>
      </div>

      {/* 资产选择弹窗 */}
      {showAssetPicker && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <h4 className="font-bold text-gray-900">选择资产</h4>
              <button onClick={() => setShowAssetPicker(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {characters.length > 0 && (
                <div className="mb-4">
                  <h5 className="text-sm font-medium text-gray-700 mb-2">👤 角色</h5>
                  <div className="grid grid-cols-4 gap-2">
                    {characters.map(char => {
                      const appearances = char.appearances || []
                      const hasMultipleAppearances = appearances.length > 1
                      return appearances.map((app: any) => {
                        const isSelected = selectedAssets.some(a => a.id === char.id && a.type === 'character' && a.appearanceId === app.appearanceIndex)
                        const displayName = hasMultipleAppearances
                          ? `${char.name} - ${app.changeReason || '初始形象'}`
                          : char.name
                        return (
                          <button
                            key={`${char.id}-${app.appearanceIndex}`}
                            onClick={() => {
                              if (isSelected) {
                                handleRemoveAsset(char.id, 'character')
                              } else {
                                handleAddAsset({
                                  id: char.id,
                                  name: displayName,
                                  type: 'character',
                                  imageUrl: app.imageUrl,
                                  appearanceId: app.appearanceIndex,
                                  appearanceName: app.changeReason
                                })
                              }
                            }}
                            className={`relative aspect-square rounded-lg overflow-hidden border-2 ${isSelected ? 'border-purple-500' : 'border-transparent'}`}
                          >
                            {app.imageUrl ? (
                              <img
                                src={app.imageUrl.startsWith('images/') ? `/api/cos/sign?key=${encodeURIComponent(app.imageUrl)}` : app.imageUrl}
                                alt={displayName}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full bg-gray-200 flex items-center justify-center text-2xl">👤</div>
                            )}
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-1 truncate" title={displayName}>
                              {displayName}
                            </div>
                            {isSelected && (
                              <div className="absolute top-1 right-1 w-5 h-5 bg-purple-500 text-white rounded-full flex items-center justify-center text-xs">✓</div>
                            )}
                          </button>
                        )
                      })
                    })}
                  </div>
                </div>
              )}
              {locations.length > 0 && (
                <div>
                  <h5 className="text-sm font-medium text-gray-700 mb-2">📍 场景</h5>
                  <div className="grid grid-cols-4 gap-2">
                    {locations.map(loc => {
                      const isSelected = selectedAssets.some(a => a.id === loc.id && a.type === 'location')
                      const selectedImage = loc.images?.find((img: any) => img.isSelected) || loc.images?.[0]
                      const imageUrl = selectedImage?.imageUrl
                      return (
                        <button
                          key={loc.id}
                          onClick={() => {
                            if (isSelected) {
                              handleRemoveAsset(loc.id, 'location')
                            } else {
                              handleAddAsset({
                                id: loc.id,
                                name: loc.name,
                                type: 'location',
                                imageUrl: imageUrl
                              })
                            }
                          }}
                          className={`relative aspect-[3/2] rounded-lg overflow-hidden border-2 ${isSelected ? 'border-purple-500' : 'border-transparent'}`}
                        >
                          {imageUrl ? (
                            <img
                              src={imageUrl.startsWith('images/') ? `/api/cos/sign?key=${encodeURIComponent(imageUrl)}` : imageUrl}
                              alt={loc.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-gray-200 flex items-center justify-center text-2xl">📍</div>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-1 truncate">
                            {loc.name}
                          </div>
                          {isSelected && (
                            <div className="absolute top-1 right-1 w-5 h-5 bg-purple-500 text-white rounded-full flex items-center justify-center text-xs">✓</div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t flex justify-end">
              <button
                onClick={() => setShowAssetPicker(false)}
                className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}






