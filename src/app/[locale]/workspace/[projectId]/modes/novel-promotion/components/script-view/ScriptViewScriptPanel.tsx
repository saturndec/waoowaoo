'use client'

import { useEffect, useState } from 'react'
import { logWarn as _ulogWarn } from '@/lib/logging/core'
import { AppIcon } from '@/components/ui/icons'

interface Clip {
  id: string
  clipIndex?: number
  summary: string
  content: string
  screenplay?: string | null
  characters: string | null
  location: string | null
}

type ScreenplayContentItem =
  | { type: 'action'; text: string }
  | { type: 'dialogue'; character: string; lines: string }
  | { type: 'voiceover'; text: string }

interface ScreenplayScene {
  scene_number?: number
  heading?: {
    int_ext?: string
    location?: string
    time?: string
  }
  description?: string
  content?: ScreenplayContentItem[]
}

interface ScreenplayData {
  scenes: ScreenplayScene[]
}

function parseScreenplay(value: string | null | undefined): ScreenplayData | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object') return null
    const scenes = (parsed as { scenes?: unknown }).scenes
    if (!Array.isArray(scenes)) return null
    return parsed as ScreenplayData
  } catch (error) {
    _ulogWarn('解析剧本JSON失败:', error)
    return null
  }
}

interface ScriptViewScriptPanelProps {
  clips: Clip[]
  selectedClipId: string | null
  onSelectClip: (clipId: string) => void
  savingClips: Set<string>
  onClipEdit?: (clipId: string) => void
  onClipDelete?: (clipId: string) => void
  onClipUpdate?: (clipId: string, data: Partial<Clip>) => void
  t: (key: string, values?: Record<string, unknown>) => string
  tScript: (key: string, values?: Record<string, unknown>) => string
}

function EditableText({
  text,
  onSave,
  className = '',
  tScript,
}: {
  text: string
  onSave: (val: string) => void
  className?: string
  tScript: (key: string, values?: Record<string, unknown>) => string
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [value, setValue] = useState(text)

  useEffect(() => {
    setValue(text)
  }, [text])

  const handleBlur = () => {
    setIsEditing(false)
    if (value !== text) {
      onSave(value)
    }
  }

  if (isEditing) {
    return (
      <textarea
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        className={`w-full bg-card border border-primary/40 rounded p-1 outline-none focus:ring-2 focus:ring-primary/50 ${className}`}
        style={{ resize: 'none', minHeight: '1.5em' }}
      />
    )
  }

  return (
    <div
      onClick={(e) => {
        e.stopPropagation()
        setIsEditing(true)
      }}
      className={`cursor-text hover:bg-primary/10 rounded px-1 -mx-1 transition-colors border border-transparent hover:border-primary/40 ${className}`}
      title={tScript('screenplay.clickToEdit')}
    >
      {text}
    </div>
  )
}

export default function ScriptViewScriptPanel({
  clips,
  selectedClipId,
  onSelectClip,
  savingClips,
  onClipEdit,
  onClipDelete,
  onClipUpdate,
  t,
  tScript,
}: ScriptViewScriptPanelProps) {
  const handleScriptSave = async (clipId: string, newContent: string, isJson: boolean) => {
    if (!onClipUpdate) return
    const updateData: Partial<Clip> = isJson ? { screenplay: newContent } : { content: newContent }
    await onClipUpdate(clipId, updateData)
  }

  return (
    <div className="col-span-12 lg:col-span-8 flex flex-col min-h-[400px] lg:h-full gap-4">
      <div className="flex justify-between items-end px-2">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <span className="w-1.5 h-6 bg-primary rounded-full" /> {tScript('scriptBreakdown')}
        </h2>
        <span className="text-sm text-muted-foreground">
          {tScript('splitCount', { count: clips.length })}
        </span>
      </div>

      <div className="flex-1 rounded-xl border border-border bg-card shadow-md overflow-hidden flex flex-col relative w-full min-h-[300px]">
        <div className="lg:absolute lg:inset-0 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {clips.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <AppIcon name="fileFold" className="h-10 w-10 mb-2" />
              <p>{tScript('noClips')}</p>
            </div>
          ) : (
            clips.map((clip, idx) => {
              const screenplay = parseScreenplay(clip.screenplay)

              return (
                <div
                  key={clip.id}
                  onClick={() => onSelectClip(clip.id)}
                  className={`
                    group p-5 border-[1.5px] rounded-2xl transition-all cursor-pointer relative bg-card
                    ${selectedClipId === clip.id
                      ? 'border-primary/40 shadow-[0_6px_24px_rgba(0,0,0,0.06)] ring-2 ring-primary/20'
                      : 'border-border hover:border-primary/40 hover:shadow-md'
                    }
                  `}
                >
                  {savingClips.has(clip.id) && (
                    <div className="absolute top-2 right-2 text-xs text-primary flex items-center gap-1 animate-pulse">
                      <AppIcon name="upload" className="w-3 h-3" />
                      {t('preview.saving')}
                    </div>
                  )}

                  <div className="flex justify-between mb-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded text-primary bg-primary/10">
                      {tScript('segment.title', { index: idx + 1 })} {selectedClipId === clip.id && tScript('segment.selected')}
                    </span>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {onClipEdit && (
                        <button
                          onClick={() => onClipEdit(clip.id)}
                          className="text-muted-foreground text-xs cursor-pointer hover:text-primary"
                        >
                          {t('common.edit')}
                        </button>
                      )}
                      {onClipDelete && (
                        <button
                          onClick={() => onClipDelete(clip.id)}
                          className="text-muted-foreground text-xs cursor-pointer hover:text-destructive"
                        >
                          {t('common.delete')}
                        </button>
                      )}
                    </div>
                  </div>

                  {screenplay && screenplay.scenes ? (
                    <div className="space-y-3">
                      {screenplay.scenes.map((scene, sceneIdx: number) => (
                        <div key={sceneIdx}>
                          {/* 场景头信息 */}
                          <div className="flex items-center gap-1.5 text-xs mb-2 flex-wrap">
                            <span className="font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                              {tScript('screenplay.scene', { number: scene.scene_number })}
                            </span>
                            <span className="text-muted-foreground flex items-center gap-1">
                              {scene.heading?.int_ext} ·
                              <EditableText
                                text={scene.heading?.location || ''}
                                onSave={(newVal) => {
                                  const newScreenplay = JSON.parse(JSON.stringify(screenplay))
                                  newScreenplay.scenes[sceneIdx].heading.location = newVal
                                  void handleScriptSave(clip.id, JSON.stringify(newScreenplay), true)
                                }}
                                className="inline"
                                tScript={tScript}
                              />
                              ·
                              <EditableText
                                text={scene.heading?.time || ''}
                                onSave={(newVal) => {
                                  const newScreenplay = JSON.parse(JSON.stringify(screenplay))
                                  newScreenplay.scenes[sceneIdx].heading.time = newVal
                                  void handleScriptSave(clip.id, JSON.stringify(newScreenplay), true)
                                }}
                                className="inline"
                                tScript={tScript}
                              />
                            </span>
                          </div>

                          {/* 场景描述 */}
                          {scene.description && (
                            <div className="text-xs text-muted-foreground bg-muted border-l-2 border-border px-2 py-1 rounded mb-2">
                              <EditableText
                                text={scene.description}
                                onSave={(newVal) => {
                                  const newScreenplay = JSON.parse(JSON.stringify(screenplay))
                                  newScreenplay.scenes[sceneIdx].description = newVal
                                  void handleScriptSave(clip.id, JSON.stringify(newScreenplay), true)
                                }}
                                tScript={tScript}
                              />
                            </div>
                          )}

                          {/* 内容流 - 高密度胶囊文本流 */}
                          <div className="flex flex-col gap-2">
                            {scene.content?.map((item, itemIdx: number) => {
                              if (item.type === 'action') {
                                return (
                                  <div key={itemIdx} className="text-sm text-muted-foreground bg-muted/60 border border-border px-2.5 py-1 rounded-lg flex items-start gap-2 w-fit max-w-full leading-[1.5]">
                                    <AppIcon name="clapperboard" className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-[2px]" />
                                    <EditableText
                                      text={item.text}
                                      onSave={(newVal) => {
                                        const newScreenplay = JSON.parse(JSON.stringify(screenplay))
                                        newScreenplay.scenes[sceneIdx].content[itemIdx].text = newVal
                                        void handleScriptSave(clip.id, JSON.stringify(newScreenplay), true)
                                      }}
                                      tScript={tScript}
                                    />
                                  </div>
                                )
                              }
                              if (item.type === 'dialogue') {
                                return (
                                  <div key={itemIdx} className="flex flex-wrap items-baseline gap-2">
                                    <span className="inline-flex items-center text-[13px] font-bold text-primary bg-primary/10 border border-primary/40 px-2.5 py-0.5 rounded-full shrink-0">
                                      {item.character}
                                    </span>
                                    <div className="text-[15px] text-foreground font-medium leading-[1.5] flex-1 min-w-0">
                                      <EditableText
                                        text={item.lines}
                                        onSave={(newVal) => {
                                          const newScreenplay = JSON.parse(JSON.stringify(screenplay))
                                          newScreenplay.scenes[sceneIdx].content[itemIdx].lines = newVal
                                          void handleScriptSave(clip.id, JSON.stringify(newScreenplay), true)
                                        }}
                                        tScript={tScript}
                                      />
                                    </div>
                                  </div>
                                )
                              }
                              if (item.type === 'voiceover') {
                                return (
                                  <div key={itemIdx} className="flex flex-wrap items-baseline gap-2">
                                    <span className="inline-flex items-center text-[13px] font-bold text-primary/80 bg-primary/10 border border-primary/20 px-2.5 py-0.5 rounded-full shrink-0 italic">
                                      {tScript('screenplay.narration')}
                                    </span>
                                    <p className="text-[15px] text-muted-foreground font-medium italic leading-[1.5] flex-1">{item.text}</p>
                                  </div>
                                )
                              }
                              return null
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm leading-relaxed">{clip.summary || clip.content}</p>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
