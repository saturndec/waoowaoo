'use client'

import { useState } from 'react'

interface ScreenplayScene {
    scene_number: number
    heading: {
        int_ext: string
        location: string
        time: string
    } | string
    description?: string
    characters?: string[]
    content: Array<{
        type: 'action' | 'dialogue' | 'voiceover'
        text?: string
        character?: string
        lines?: string
        parenthetical?: string
    }>
}

interface Screenplay {
    clip_id: string
    original_text?: string
    scenes: ScreenplayScene[]
}

interface ScreenplayDisplayProps {
    screenplay: string | null
    originalContent: string
}

export default function ScreenplayDisplay({ screenplay, originalContent }: ScreenplayDisplayProps) {
    const [activeTab, setActiveTab] = useState<'screenplay' | 'original'>('screenplay')

    // 解析剧本JSON
    let parsedScreenplay: Screenplay | null = null
    try {
        if (screenplay) {
            parsedScreenplay = JSON.parse(screenplay)
        }
    } catch (e) {
        console.error('Failed to parse screenplay:', e)
    }

    return (
        <div>
            {/* 标签切换 */}
            <div className="flex border-b bg-gray-50">
                <button
                    onClick={() => setActiveTab('screenplay')}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'screenplay'
                            ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                >
                    📜 剧本格式
                </button>
                <button
                    onClick={() => setActiveTab('original')}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'original'
                            ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                >
                    📄 原文
                </button>
            </div>

            {/* 内容区域 */}
            <div className="p-4 max-h-96 overflow-y-auto">
                {activeTab === 'screenplay' && parsedScreenplay ? (
                    <div className="space-y-4">
                        {parsedScreenplay.scenes.map((scene, sceneIndex) => (
                            <div key={sceneIndex} className="border rounded-lg overflow-hidden">
                                {/* 场景头 */}
                                <div className="bg-slate-700 text-white px-3 py-2 font-mono text-sm">
                                    <span className="text-amber-400 font-bold">场景 {scene.scene_number}</span>
                                    <span className="mx-2">|</span>
                                    {typeof scene.heading === 'string' ? (
                                        <span>{scene.heading}</span>
                                    ) : (
                                        <span>
                                            {scene.heading.int_ext === 'INT' ? '内景' : '外景'} · {scene.heading.location} · {scene.heading.time}
                                        </span>
                                    )}
                                </div>

                                {/* 场景描述 */}
                                {scene.description && (
                                    <div className="px-3 py-2 bg-slate-100 text-slate-600 text-sm italic border-b">
                                        {scene.description}
                                    </div>
                                )}

                                {/* 角色列表 */}
                                {scene.characters && scene.characters.length > 0 && (
                                    <div className="px-3 py-1 bg-blue-50 text-blue-700 text-xs border-b">
                                        👤 出场角色：{scene.characters.join('、')}
                                    </div>
                                )}

                                {/* 内容 */}
                                <div className="p-3 space-y-2 bg-white">
                                    {scene.content.map((item, itemIndex) => (
                                        <div key={itemIndex}>
                                            {item.type === 'action' && (
                                                <p className="text-sm text-gray-700 leading-relaxed">
                                                    {item.text}
                                                </p>
                                            )}
                                            {item.type === 'dialogue' && (
                                                <div className="ml-4 my-2">
                                                    <div className="text-center">
                                                        <span className="font-bold text-sm text-gray-800">{item.character}</span>
                                                        {item.parenthetical && (
                                                            <span className="text-xs text-gray-500 ml-1">（{item.parenthetical}）</span>
                                                        )}
                                                    </div>
                                                    <p className="text-center text-sm text-gray-700 mt-1">
                                                        「{item.lines}」
                                                    </p>
                                                </div>
                                            )}
                                            {item.type === 'voiceover' && (
                                                <div className="bg-purple-50 border-l-4 border-purple-400 p-2 rounded-r">
                                                    <span className="text-xs text-purple-600 font-medium">
                                                        🎙️ {item.character || '旁白'}
                                                    </span>
                                                    <p className="text-sm text-purple-800 mt-1 italic">
                                                        {item.text}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : activeTab === 'screenplay' && !parsedScreenplay ? (
                    <div className="text-center text-gray-500 py-8">
                        <p>剧本格式解析失败</p>
                        <p className="text-xs mt-1">请查看原文内容</p>
                    </div>
                ) : (
                    <div className="text-sm text-gray-700 whitespace-pre-wrap">
                        {originalContent}
                    </div>
                )}
            </div>
        </div>
    )
}
