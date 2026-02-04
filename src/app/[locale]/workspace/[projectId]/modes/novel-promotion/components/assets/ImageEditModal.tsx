'use client'
import { useTranslations } from 'next-intl'

/**
 * 图片编辑弹窗 - 统一的 AI 修图组件
 * 支持角色和场景图片的 AI 编辑
 */

import { useState, useRef } from 'react'

interface ImageEditModalProps {
    type: 'character' | 'location'
    name: string
    onClose: () => void
    onConfirm: (modifyPrompt: string, extraImageUrls?: string[]) => void
}

export default function ImageEditModal({
    type,
    name,
    onClose,
    onConfirm
}: ImageEditModalProps) {
    const t = useTranslations('assets')
    const [modifyPrompt, setModifyPrompt] = useState('')
    const [editImages, setEditImages] = useState<string[]>([])
    const fileInputRef = useRef<HTMLInputElement>(null)

    const title = type === 'character' ? '编辑人物图片' : '编辑场景图片'
    const subtitle = type === 'character' ? `人物: ${name}` : `场景: ${name}`

    const handleSubmit = () => {
        if (!modifyPrompt.trim()) {
            alert('请输入修改指令')
            return
        }
        onConfirm(modifyPrompt, editImages.length > 0 ? editImages : undefined)
    }

    // 处理粘贴事件
    const handlePaste = async (e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items
        if (!items) return

        for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
                e.preventDefault()
                const file = item.getAsFile()
                if (file) {
                    const reader = new FileReader()
                    reader.onload = (e) => {
                        const base64 = e.target?.result as string
                        setEditImages(prev => [...prev, base64])
                    }
                    reader.readAsDataURL(file)
                }
            }
        }
    }

    // 处理文件上传
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files) return

        Array.from(files).forEach(file => {
            const reader = new FileReader()
            reader.onload = (e) => {
                const base64 = e.target?.result as string
                setEditImages(prev => [...prev, base64])
            }
            reader.readAsDataURL(file)
        })

        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }

    const removeImage = (index: number) => {
        setEditImages(prev => prev.filter((_, i) => i !== index))
    }

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div
                className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
                onPaste={handlePaste}
            >
                <div className="p-6 border-b">
                    <h3 className="text-lg font-bold text-gray-900">{title}</h3>
                    <p className="text-sm text-gray-500 mt-1">{subtitle} · 输入修改指令，可选择上传参考图片</p>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">修改指令</label>
                        <textarea
                            value={modifyPrompt}
                            onChange={(e) => setModifyPrompt(e.target.value)}
                            placeholder={type === 'character'
                                ? "描述你想要修改的内容，例如：把头发改成金色、添加眼镜、换成休闲装..."
                                : "描述你想要修改的内容，例如：添加更多树木、改成夜晚场景..."
                            }
                            className="w-full h-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none"
                            autoFocus
                        />
                    </div>
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
                        {t("common.cancel")}
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!modifyPrompt.trim()}
                        className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        开始编辑
                    </button>
                </div>
            </div>
        </div>
    )
}
