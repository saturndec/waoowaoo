'use client'
import { logError as _ulogError } from '@/lib/logging/core'
import { useTranslations } from 'next-intl'

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
    const t = useTranslations('storyboard')
    const [activeTab, setActiveTab] = useState<'screenplay' | 'original'>('screenplay')

    // 解析剧本JSON
    let parsedScreenplay: Screenplay | null = null
    try {
        if (screenplay) {
            parsedScreenplay = JSON.parse(screenplay)
        }
    } catch (e) {
        _ulogError('Failed to parse screenplay:', e)
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <button
                    onClick={() => setActiveTab('screenplay')}
                    className={`inline-flex items-center justify-center rounded-xl px-3 py-1.5 text-sm ${activeTab === 'screenplay'
                        ? 'border border-input bg-background hover:bg-accent hover:text-accent-foreground text-muted-foreground'
                        : 'border border-border bg-muted/50 hover:bg-muted'
                        }`}
                >
                    {t('screenplay.tabs.formatted')}
                </button>
                <button
                    onClick={() => setActiveTab('original')}
                    className={`inline-flex items-center justify-center rounded-xl px-3 py-1.5 text-sm ${activeTab === 'original'
                        ? 'border border-input bg-background hover:bg-accent hover:text-accent-foreground text-muted-foreground'
                        : 'border border-border bg-muted/50 hover:bg-muted'
                        }`}
                >
                    {t('screenplay.tabs.original')}
                </button>
            </div>

            <div className="rounded-xl border border-border bg-muted/30 p-4 max-h-96 overflow-y-auto">
                {activeTab === 'screenplay' && parsedScreenplay ? (
                    <div className="space-y-3">
                        {parsedScreenplay.scenes.map((scene, sceneIndex) => (
                            <div key={sceneIndex} className="border-l-2 border-primary/40 pl-3 space-y-2">
                                <div className="flex items-center gap-2 text-xs flex-wrap">
                                    <span className="font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                                        {t('screenplay.scene', { number: scene.scene_number })}
                                    </span>
                                    <span className="text-muted-foreground">
                                        {typeof scene.heading === 'string'
                                            ? scene.heading
                                            : `${scene.heading.int_ext} · ${scene.heading.location} · ${scene.heading.time}`}
                                    </span>
                                </div>

                                {scene.description && (
                                    <div className="text-xs text-muted-foreground italic bg-muted/70 px-2 py-1 rounded">
                                        {scene.description}
                                    </div>
                                )}

                                {scene.characters && scene.characters.length > 0 && (
                                    <div className="flex gap-1 flex-wrap items-center">
                                        <span className="text-[10px] text-muted-foreground">{t('screenplay.characters')}</span>
                                        {scene.characters.map((name, index) => (
                                            <span key={`${name}-${index}`} className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                                {name}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                <div className="space-y-1.5">
                                    {scene.content.map((item, itemIndex) => (
                                        <div key={itemIndex}>
                                            {item.type === 'action' && (
                                                <p className="text-sm text-muted-foreground leading-relaxed">{item.text}</p>
                                            )}
                                            {item.type === 'dialogue' && (
                                                <div className="bg-amber-100/60 border-l-2 border-amber-300 pl-2 py-1">
                                                    <div>
                                                        <span className="text-xs font-medium text-amber-700">{item.character}</span>
                                                        {item.parenthetical && (
                                                            <span className="text-amber-700 ml-1">({item.parenthetical})</span>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-muted-foreground">
                                                        <span className="select-none text-muted-foreground">&quot;</span>
                                                        {item.lines}
                                                        <span className="select-none text-muted-foreground">&quot;</span>
                                                    </p>
                                                </div>
                                            )}
                                            {item.type === 'voiceover' && (
                                                <div className="bg-primary/10 border-l-2 border-primary/40 pl-2 py-1">
                                                    <span className="text-xs text-primary">{t('screenplay.voiceover')}</span>
                                                    <p className="text-sm text-muted-foreground italic">{item.text}</p>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : activeTab === 'screenplay' && !parsedScreenplay ? (
                    <div className="text-center text-muted-foreground py-8">
                        <p>{t('screenplay.parseFailedTitle')}</p>
                        <p className="text-xs mt-1">{t('screenplay.parseFailedDescription')}</p>
                    </div>
                ) : (
                    <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{originalContent}</div>
                )}
            </div>
        </div>
    )
}
