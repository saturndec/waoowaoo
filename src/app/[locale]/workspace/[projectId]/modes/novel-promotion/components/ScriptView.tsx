'use client'

/**
 * 剧本视图 - 左侧显示分镜剧本，右侧显示当前剧集的资产
 * 参考 new-ui 的 script 视图设计
 * 
 * 🔥 V6.5 重构：内部直接订阅 useProjectAssets，消除 props drilling
 */

import { useTranslations } from 'next-intl'
import { useState, useEffect, useRef, useMemo } from 'react'
import { Character, Location, CharacterAppearance } from '@/types/project'
import { useProjectAssets } from '@/lib/query/hooks/useProjectAssets'
import ImagePreviewModal from '@/components/ui/ImagePreviewModal'

interface Clip {
    id: string
    clipIndex?: number
    summary: string
    content: string
    screenplay?: string | null  // 剧本JSON
    // 实际数据中 characters 和 location 是字符串（逗号分隔的名字或场景名）
    characters: string | null
    location: string | null
}

// Panel 接口 - 用于从分镜面板中提取角色和场景
interface Panel {
    panelIndex: number
    characters?: string | null  // JSON 字符串，如 '[{"name":"张三","appearance":"初始形象"}]' 或 '["张三"]'
    location?: string | null
}

// Storyboard 接口
interface Storyboard {
    id: string
    clipId?: string
    panels?: Panel[]
}

interface ScriptViewProps {
    projectId: string
    episodeId?: string
    clips: Clip[]
    storyboards?: Storyboard[]  // 保留但不用于资产提取
    // 🔥 V6.5 删除：characters, locations - 现在内部直接订阅
    onClipEdit?: (clipId: string) => void
    onClipUpdate?: (clipId: string, data: Partial<Clip>) => void // 新增：用于更新 Clip 内容
    onClipDelete?: (clipId: string) => void
    onGenerateStoryboard?: () => void
    isGenerating?: boolean
    assetsLoading?: boolean  // 资产加载中状态
    onOpenAssetLibrary?: () => void  // 打开资产库弹窗
}

// SpotlightCharCard - 人物资产卡片
const SpotlightCharCard = ({
    char,
    appearance,
    isActive,
    onClick,
    onOpenAssetLibrary,
    onRemove // 新增移除回调
}: {
    char: Character
    appearance?: CharacterAppearance
    isActive: boolean
    onClick: () => void
    onOpenAssetLibrary?: () => void
    onRemove?: () => void
}) => {
    const tScript = useTranslations('scriptView')
    const [isPlaying, setIsPlaying] = useState(false)
    const [audioRef, setAudioRef] = useState<HTMLAudioElement | null>(null)

    // 🔥 统一图片URL优先级：imageUrl > imageUrls[selectedIndex] > imageUrls[0]
    // 与 CharacterCard 保持一致，确保编辑后的新图片能正确显示
    const selectedIdx = appearance?.selectedIndex ?? null
    const imageUrl = appearance?.imageUrl ||
        (selectedIdx !== null ? appearance?.imageUrls?.[selectedIdx] : null) ||
        (appearance?.imageUrls?.[0])

    // 检查是否有音色设置
    const hasVoice = !!char.customVoiceUrl

    // 播放/停止音频
    const handlePlayVoice = (e: React.MouseEvent) => {
        e.stopPropagation() // 阻止冒泡，避免触发卡片点击

        if (!char.customVoiceUrl) return

        if (isPlaying && audioRef) {
            audioRef.pause()
            audioRef.currentTime = 0
            setIsPlaying(false)
            return
        }

        const audio = new Audio(char.customVoiceUrl)
        setAudioRef(audio)

        audio.onended = () => {
            setIsPlaying(false)
            setAudioRef(null)
        }

        audio.onerror = () => {
            setIsPlaying(false)
            setAudioRef(null)
        }

        audio.play()
        setIsPlaying(true)
    }

    // 组件卸载时停止播放
    useEffect(() => {
        return () => {
            if (audioRef) {
                audioRef.pause()
                audioRef.currentTime = 0
            }
        }
    }, [audioRef])

    return (
        <div
            onClick={onClick}
            className={`
        group relative rounded-xl cursor-pointer transition-all duration-500 ease-out
        ${isActive
                    ? 'opacity-100 scale-100 ring-2 ring-blue-500/50 shadow-lg shadow-blue-500/20 bg-white'
                    : 'opacity-50 scale-95 grayscale hover:grayscale-0 hover:opacity-100 hover:scale-95 bg-slate-100'
                }
      `}
        >
            <div className="aspect-square relative bg-slate-100">
                {imageUrl ? (
                    <img src={imageUrl} alt={char.name} className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-3">
                        <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center mb-2">
                            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                        </div>
                        {onOpenAssetLibrary && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onOpenAssetLibrary(); }}
                                className="text-[11px] text-slate-700 font-medium hover:text-blue-600 transition-colors text-center leading-tight"
                            >
                                {tScript("asset.generateCharacter")}
                            </button>
                        )}
                    </div>
                )}
                {isActive && (
                    <div className="absolute top-2 right-2 w-2 h-2 bg-green-400 rounded-full shadow-[0_0_8px_rgba(74,222,128,0.8)] border border-white"></div>
                )}
                {/* 移除按钮 - 仅在 hover 且提供 onRemove 时显示 */}
                {isActive && onRemove && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(tScript('confirm.removeCharacter'))) {
                                onRemove();
                            }
                        }}
                        className="absolute top-0 right-0 translate-x-1/2 -translate-y-1/2 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-md hover:bg-red-600 hover:scale-110 z-20"
                        title={tScript("asset.removeFromClip")}
                    >
                        ×
                    </button>
                )}
            </div>
            <div className="p-2 text-center">
                <div className={`text-sm font-bold truncate ${isActive ? 'text-slate-800' : 'text-slate-500'}`}>
                    {char.name}
                </div>
                {appearance?.changeReason && (
                    <div className="text-xs text-slate-400 truncate">{appearance.changeReason}</div>
                )}
                {/* 音频播放按钮 */}
                <button
                    onClick={hasVoice ? handlePlayVoice : undefined}
                    disabled={!hasVoice}
                    className={`mt-1.5 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${!hasVoice
                        ? 'bg-slate-50 text-slate-400 cursor-not-allowed border border-dashed border-slate-200'
                        : isPlaying
                            ? 'bg-blue-500 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-600'
                        }`}
                >
                    {!hasVoice ? (
                        <>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                            </svg>
                            <span>{tScript("asset.noAudio")}</span>
                        </>
                    ) : isPlaying ? (
                        <>
                            <span className="flex gap-0.5">
                                <span className="w-0.5 h-3 bg-white rounded-full animate-pulse"></span>
                                <span className="w-0.5 h-3 bg-white rounded-full animate-pulse" style={{ animationDelay: '0.1s' }}></span>
                                <span className="w-0.5 h-3 bg-white rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></span>
                            </span>
                            <span>{tScript("asset.playing")}</span>
                        </>
                    ) : (
                        <>
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                            <span>{tScript("asset.listen")}</span>
                        </>
                    )}
                </button>
            </div>
        </div>
    )
}



// LocationCard - 场景资产卡片
const SpotlightLocationCard = ({
    location,
    isActive,
    onClick,
    onOpenAssetLibrary,
    onRemove // 新增移除回调
}: {
    location: Location
    isActive: boolean
    onClick: () => void
    onOpenAssetLibrary?: () => void
    onRemove?: () => void
}) => {
    const tScript = useTranslations('scriptView')
    const image = location.images?.find(img => img.isSelected) || location.images?.[0]
    const imageUrl = image?.imageUrl

    return (
        <div
            onClick={onClick}
            className={`
        group relative rounded-xl cursor-pointer transition-all duration-500 ease-out
        ${isActive
                    ? 'opacity-100 scale-100 ring-2 ring-green-500/50 shadow-lg shadow-green-500/20 bg-white'
                    : 'opacity-50 scale-95 grayscale hover:grayscale-0 hover:opacity-100 hover:scale-95 bg-slate-100'
                }
      `}
        >
            <div className="aspect-video relative bg-slate-100">
                {imageUrl ? (
                    <img src={imageUrl} alt={location.name} className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-3">
                        <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center mb-2">
                            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                        </div>
                        {onOpenAssetLibrary && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onOpenAssetLibrary(); }}
                                className="text-[11px] text-slate-700 font-medium hover:text-blue-600 transition-colors text-center leading-tight"
                            >
                                {tScript("asset.generateLocation")}
                            </button>
                        )}
                    </div>
                )}
                {isActive && (
                    <div className="absolute top-2 right-2 w-2 h-2 bg-green-400 rounded-full shadow-[0_0_8px_rgba(74,222,128,0.8)] border border-white"></div>
                )}
                {/* 移除按钮 */}
                {isActive && onRemove && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(tScript('confirm.removeLocation'))) {
                                onRemove();
                            }
                        }}
                        className="absolute top-0 right-0 translate-x-1/2 -translate-y-1/2 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-md hover:bg-red-600 hover:scale-110 z-20"
                        title={tScript("asset.removeFromClip")}
                    >
                        ×
                    </button>
                )}
            </div>
            <div className="p-2 text-center">
                <div className={`text-sm font-bold truncate ${isActive ? 'text-slate-800' : 'text-slate-500'}`}>
                    {location.name}
                </div>
            </div>
        </div>
    )
}

export default function ScriptView({
    projectId,
    episodeId,
    clips,
    storyboards = [],
    // 🔥 V6.5 删除：characters, locations - 现在内部直接订阅
    onClipEdit,
    onClipUpdate,
    onClipDelete,
    onGenerateStoryboard,
    isGenerating = false,
    assetsLoading = false,
    onOpenAssetLibrary
}: ScriptViewProps) {
    const t = useTranslations('smartImport')
    const tAssets = useTranslations('assets')
    const tNP = useTranslations('novelPromotion')
    const tScript = useTranslations('scriptView')

    // 🔥 V6.5 重构：直接订阅缓存，消除 props drilling
    const { data: assets } = useProjectAssets(projectId)
    // 🔧 使用 useMemo 稳定引用，防止 useEffect 无限循环
    // 当 assets 变化时才重新计算，避免每次渲染创建新数组
    const characters: Character[] = useMemo(() => assets?.characters ?? [], [assets?.characters])
    const locations: Location[] = useMemo(() => assets?.locations ?? [], [assets?.locations])

    const [previewImage, setPreviewImage] = useState<string | null>(null)
    const [activeCharIds, setActiveCharIds] = useState<string[]>([])
    const [activeLocationIds, setActiveLocationIds] = useState<string[]>([])
    // 🔥 追踪选中的形象：格式 "角色ID::形象名"，支持一个角色多个形象
    const [selectedAppearanceKeys, setSelectedAppearanceKeys] = useState<Set<string>>(new Set())

    // 🔧 防止竞态条件：当用户手动编辑资产时，阻止 useEffect 覆盖状态
    const isManuallyEditingRef = useRef(false)
    const manualEditTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    // 🔥 资产视图模式：'all' 显示所有片段聚合资产，或具体 clipId 显示单个片段资产
    const [assetViewMode, setAssetViewMode] = useState<'all' | string>('all')
    // 当前选中的 Clip ID（用于编辑资产和左侧高亮）
    const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
    // 自动选择第一个 Clip
    useEffect(() => {
        if (clips.length > 0 && !selectedClipId) {
            setSelectedClipId(clips[0].id)
        }
    }, [clips])

    // 编辑状态管理
    const [editingClipId, setEditingClipId] = useState<string | null>(null)
    const [editContent, setEditContent] = useState<string>('') // 正在编辑的内容（JSON string or plain text）
    const [savingClips, setSavingClips] = useState<Set<string>>(new Set())

    // 资产添加下拉菜单状态
    const [showAddChar, setShowAddChar] = useState(false)
    const [showAddLoc, setShowAddLoc] = useState(false)

    // 模糊匹配场景名称的辅助函数
    const fuzzyMatchLocation = (clipLocName: string, libraryLocName: string): boolean => {
        const clipLower = clipLocName.toLowerCase().trim()
        const libLower = libraryLocName.toLowerCase().trim()

        // 1. 精确匹配
        if (clipLower === libLower) return true

        // 2. Clip 场景名包含库中场景名（如 "神王殿_内景_白天" 包含 "神王殿"）
        if (clipLower.includes(libLower)) return true

        // 3. 库中场景名包含 Clip 场景名
        if (libLower.includes(clipLower)) return true

        // 4. 移除常见后缀后匹配（_内景, _外景, _白天, _夜晚, _黄昏, _清晨 等）
        const suffixPattern = /[_\-·](内景|外景|白天|夜晚|黄昏|清晨|傍晚|雨天|晴天|阴天|室内|室外|日|夜|晨|昏)+$/gi
        const clipClean = clipLower.replace(suffixPattern, '')
        const libClean = libLower.replace(suffixPattern, '')
        if (clipClean === libClean) return true
        if (clipClean.includes(libClean) || libClean.includes(clipClean)) return true

        return false
    }

    // 🔥 辅助函数：从单个 clip 解析角色和场景
    const parseClipAssets = (clip: Clip) => {
        const charNames = new Set<string>()
        const locNames = new Set<string>()
        const charAppearanceSet = new Set<string>()

        // 1. 从 Clip.characters 解析
        if (clip.characters) {
            try {
                const parsed = JSON.parse(clip.characters)
                if (Array.isArray(parsed)) {
                    parsed.forEach((item: any) => {
                        const name = typeof item === 'string' ? item : item.name
                        const appearance = typeof item === 'string' ? null : item.appearance
                        if (name) {
                            const trimmed = name.trim()
                            if (trimmed) {
                                charNames.add(trimmed)
                                if (appearance) {
                                    charAppearanceSet.add(`${trimmed}::${appearance}`)
                                }
                            }
                        }
                    })
                }
            } catch {
                clip.characters.split(',').forEach(name => {
                    const trimmed = name.trim()
                    if (trimmed) charNames.add(trimmed)
                })
            }
        }

        // 2. 从 Clip.location 解析
        if (clip.location) {
            try {
                const parsed = JSON.parse(clip.location)
                if (Array.isArray(parsed)) {
                    parsed.forEach((loc: string) => locNames.add(loc.trim()))
                } else {
                    clip.location.split(',').forEach(loc => {
                        const trimmed = loc.trim()
                        if (trimmed) locNames.add(trimmed)
                    })
                }
            } catch {
                clip.location.split(',').forEach(loc => {
                    const trimmed = loc.trim()
                    if (trimmed) locNames.add(trimmed)
                })
            }
        }

        return { charNames, locNames, charAppearanceSet }
    }

    // 🔥 聚合所有片段的资产（用于全局校验）
    const getAllClipsAssets = () => {
        const allCharNames = new Set<string>()
        const allLocNames = new Set<string>()
        const allCharAppearanceSet = new Set<string>()

        clips.forEach(clip => {
            const { charNames, locNames, charAppearanceSet } = parseClipAssets(clip)
            charNames.forEach(n => allCharNames.add(n))
            locNames.forEach(n => allLocNames.add(n))
            charAppearanceSet.forEach(k => allCharAppearanceSet.add(k))
        })

        return { allCharNames, allLocNames, allCharAppearanceSet }
    }

    // 🔥 根据视图模式更新右侧资产显示
    useEffect(() => {
        // 🔧 防止竞态条件：如果正在手动编辑，跳过这次同步
        if (isManuallyEditingRef.current) {
            console.log('[ScriptView] 跳过 useEffect 同步：用户正在手动编辑资产')
            return
        }

        let charNames = new Set<string>()
        let locNames = new Set<string>()
        let charAppearanceSet = new Set<string>()

        if (assetViewMode === 'all') {
            // 🔥 全局模式：聚合所有片段的资产
            const all = getAllClipsAssets()
            charNames = all.allCharNames
            locNames = all.allLocNames
            charAppearanceSet = all.allCharAppearanceSet
        } else {
            // 单个片段模式
            const clip = clips.find(c => c.id === assetViewMode)
            if (clip) {
                const parsed = parseClipAssets(clip)
                charNames = parsed.charNames
                locNames = parsed.locNames
                charAppearanceSet = parsed.charAppearanceSet
            }
        }

        // 匹配角色 ID 并构建 selectedAppearanceKeys
        const matchedCharIds: string[] = []
        const newSelectedKeys = new Set<string>()

        characters.forEach(c => {
            const aliases = c.name.split('/').map(a => a.trim())
            const matched = aliases.some(alias => charNames.has(alias)) || charNames.has(c.name)
            if (matched) {
                matchedCharIds.push(c.id)
                const matchedAlias = aliases.find(alias =>
                    Array.from(charAppearanceSet).some(key => key.startsWith(`${alias}::`))
                ) || (Array.from(charAppearanceSet).some(key => key.startsWith(`${c.name}::`)) ? c.name : null)

                if (matchedAlias) {
                    charAppearanceSet.forEach(key => {
                        if (key.startsWith(`${matchedAlias}::`)) {
                            const appearanceName = key.split('::')[1]
                            newSelectedKeys.add(`${c.id}::${appearanceName}`)
                        }
                    })
                }
            }
        })

        const matchedLocIds = locations
            .filter(l => Array.from(locNames).some(clipLocName => fuzzyMatchLocation(clipLocName, l.name)))
            .map(l => l.id)

        setActiveCharIds(matchedCharIds)
        setActiveLocationIds(matchedLocIds)
        setSelectedAppearanceKeys(newSelectedKeys)
    }, [clips, assetViewMode, characters, locations]) // 依赖 assetViewMode

    // 处理添加/移除资产 - 🔥 支持多形象独立 toggle
    const handleUpdateClipAssets = async (
        type: 'character' | 'location',
        action: 'add' | 'remove',
        id: string,
        appearanceName?: string  // 指定形象名称（如 "战斗形象"）
    ) => {
        if (!selectedClipId || !onClipUpdate) return

        // 🔧 设置手动编辑锁，防止 useEffect 覆盖乐观更新
        isManuallyEditingRef.current = true
        // 清除之前的定时器
        if (manualEditTimeoutRef.current) {
            clearTimeout(manualEditTimeoutRef.current)
        }
        // 延迟释放锁（等待数据库更新完成后再允许同步）
        manualEditTimeoutRef.current = setTimeout(() => {
            isManuallyEditingRef.current = false
            console.log('[ScriptView] 手动编辑锁已释放')
        }, 1500) // 1.5 秒后释放锁，足够数据库更新完成

        const clip = clips.find(c => c.id === selectedClipId)
        if (!clip) return

        if (type === 'character') {
            // 🔥 解析现有角色列表 - 支持混合格式（对象和字符串）
            let currentItems: Array<string | { name: string; appearance?: string }> = []
            try {
                currentItems = JSON.parse(clip.characters || '[]')
                if (!Array.isArray(currentItems)) throw new Error()
            } catch {
                currentItems = clip.characters ? clip.characters.split(',').map(s => s.trim()).filter(Boolean) : []
            }

            const targetChar = characters.find(c => c.id === id)
            if (!targetChar) return

            // 获取形象名（如果未指定，使用主形象的 changeReason）
            const finalAppearanceName = appearanceName ||
                (targetChar.appearances?.find((a: any) => a.appearanceIndex === 1)?.changeReason || tAssets('character.primary'))

            // 🔥 独立 toggle：检查这个具体的形象是否已存在
            const existingIndex = currentItems.findIndex(item => {
                if (typeof item === 'string') {
                    return item === targetChar.name && !appearanceName  // 旧格式只匹配角色名
                }
                return item.name === targetChar.name && item.appearance === finalAppearanceName
            })

            if (action === 'add') {
                if (existingIndex < 0) {
                    // 不存在，添加这个形象
                    currentItems.push({ name: targetChar.name, appearance: finalAppearanceName })
                }
                // 如果已存在就不重复添加
            } else {
                // 🔥 移除：只移除这个具体形象（不是整个角色）
                if (existingIndex >= 0) {
                    currentItems.splice(existingIndex, 1)
                }
            }

            // 乐观更新 UI
            const appearanceKey = `${id}::${finalAppearanceName}`

            // 🔥 更新 selectedAppearanceKeys
            const newKeys = new Set(selectedAppearanceKeys)
            if (action === 'add') {
                newKeys.add(appearanceKey)
            } else {
                newKeys.delete(appearanceKey)
            }
            setSelectedAppearanceKeys(newKeys)

            // 🔥 更新 activeCharIds（如果角色还有其他形象就保留，否则移除）
            const charStillHasAppearances = currentItems.some(item => {
                const itemName = typeof item === 'string' ? item : item.name
                return itemName === targetChar.name
            })

            if (charStillHasAppearances && !activeCharIds.includes(id)) {
                setActiveCharIds([...activeCharIds, id])
            } else if (!charStillHasAppearances && activeCharIds.includes(id)) {
                setActiveCharIds(activeCharIds.filter(aid => aid !== id))
            }

            onClipUpdate(selectedClipId, { characters: JSON.stringify(currentItems) })

        } else {
            // Location 处理
            let currentNames: string[] = []
            // location 目前是 comma separated string in DB mostly, but let's try to handle smarter
            if (clip.location) {
                currentNames = clip.location.split(',').map(s => s.trim()).filter(Boolean)
            }

            const targetLoc = locations.find(l => l.id === id)
            if (!targetLoc) return

            let newLocationNames: string[] = []
            if (action === 'add') {
                if (!currentNames.some(n => fuzzyMatchLocation(n, targetLoc.name))) { // 避免重复添加相似名字
                    newLocationNames = [...currentNames, targetLoc.name]
                } else {
                    newLocationNames = currentNames
                }
            } else {
                // Remove: filter out names that fuzzy match
                newLocationNames = currentNames.filter(n => !fuzzyMatchLocation(n, targetLoc.name))
            }

            // 乐观更新 UI
            const newActiveIds = action === 'add'
                ? [...activeLocationIds, id]
                : activeLocationIds.filter(lid => lid !== id)
            setActiveLocationIds(newActiveIds)

            onClipUpdate(selectedClipId, { location: newLocationNames.join(',') })
        }
    }

    // 处理剧本编辑保存
    const handleScriptSave = async (clipId: string, newContent: string, isJson: boolean) => {
        if (!onClipUpdate) return
        setSavingClips(prev => new Set(prev).add(clipId))
        try {
            const updateData: Partial<Clip> = isJson
                ? { screenplay: newContent }
                : { content: newContent }
            await onClipUpdate(clipId, updateData)
        } finally {
            setTimeout(() => {
                setSavingClips(prev => {
                    const next = new Set(prev)
                    next.delete(clipId)
                    return next
                })
            }, 500)
        }
    }

    // 可编辑文本组件
    const EditableText = ({
        text,
        onSave,
        className = ''
    }: {
        text: string,
        onSave: (val: string) => void,
        className?: string
    }) => {
        const [isEditing, setIsEditing] = useState(false)
        const [value, setValue] = useState(text)

        useEffect(() => { setValue(text) }, [text])

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
                    onChange={e => setValue(e.target.value)}
                    onBlur={handleBlur}
                    className={`w-full bg-white border border-blue-300 rounded p-1 outline-none focus:ring-2 ring-blue-200 ${className}`}
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
                className={`cursor-text hover:bg-blue-50/50 rounded px-1 -mx-1 transition-colors border border-transparent hover:border-blue-100 ${className}`}
                title={tScript('screenplay.clickToEdit')}
            >
                {text}
            </div>
        )
    }

    // 获取角色的主形象
    const getPrimaryAppearance = (char: Character): CharacterAppearance | undefined => {
        return char.appearances?.find(a => a.appearanceIndex === 1) || char.appearances?.[0]
    }

    // 🔥 获取角色所有选中的形象（支持多形象）
    const getSelectedAppearances = (char: Character): CharacterAppearance[] => {
        const result: CharacterAppearance[] = []
        selectedAppearanceKeys.forEach(key => {
            if (key.startsWith(`${char.id}::`)) {
                const appearanceName = key.split('::')[1]
                const matched = char.appearances?.find(a =>
                    a.changeReason === appearanceName ||
                    a.changeReason?.toLowerCase() === appearanceName.toLowerCase()
                )
                if (matched) result.push(matched)
            }
        })
        // 如果没有选中任何形象，返回主形象
        if (result.length === 0) {
            const primary = getPrimaryAppearance(char)
            if (primary) result.push(primary)
        }
        return result
    }

    // 🔥 获取角色第一个选中的形象（兼容需要单个形象的地方）
    const getSelectedAppearance = (char: Character): CharacterAppearance | undefined => {
        const appearances = getSelectedAppearances(char)
        return appearances[0]
    }

    // 🔥 校验逻辑：始终基于所有片段的聚合资产进行检查
    // 获取所有片段中出现的角色和场景（用于生成前校验）
    const { allCharNames: globalCharNames, allLocNames: globalLocNames } = getAllClipsAssets()

    // 匹配全局角色 ID 列表
    const globalCharIds = characters
        .filter(c => {
            const aliases = c.name.split('/').map(a => a.trim())
            return aliases.some(alias => globalCharNames.has(alias)) || globalCharNames.has(c.name)
        })
        .map(c => c.id)

    // 匹配全局场景 ID 列表
    const globalLocationIds = locations
        .filter(l => Array.from(globalLocNames).some(clipLocName => fuzzyMatchLocation(clipLocName, l.name)))
        .map(l => l.id)

    // 检查所有出场资产是否都有形象（基于全局）
    const globalActiveChars = characters.filter(c => globalCharIds.includes(c.id))
    const globalActiveLocations = locations.filter(l => globalLocationIds.includes(l.id))

    // 检查角色是否都有形象（主形象有图片）
    const charsWithoutImage = globalActiveChars.filter(char => {
        const appearance = getPrimaryAppearance(char)
        const imageUrl = appearance?.imageUrl || appearance?.imageUrls?.[0]
        return !imageUrl
    })

    // 检查场景是否都有图片
    const locationsWithoutImage = globalActiveLocations.filter(loc => {
        const image = loc.images?.find((img: any) => img.isSelected) || loc.images?.[0]
        return !image?.imageUrl
    })

    // 是否所有资产都已生成形象
    const allAssetsHaveImages = charsWithoutImage.length === 0 && locationsWithoutImage.length === 0
    const missingAssetsCount = charsWithoutImage.length + locationsWithoutImage.length


    // 排序：活跃的在前
    const sortedCharacters = [...characters].sort((a, b) => {
        const aActive = activeCharIds.includes(a.id)
        const bActive = activeCharIds.includes(b.id)
        if (aActive === bActive) return 0
        return aActive ? -1 : 1
    })

    const sortedLocations = [...locations].sort((a, b) => {
        const aActive = activeLocationIds.includes(a.id)
        const bActive = activeLocationIds.includes(b.id)
        if (aActive === bActive) return 0
        return aActive ? -1 : 1
    })

    const toggleCharActive = (id: string) => {
        setActiveCharIds(prev =>
            prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
        )
    }

    const toggleLocationActive = (id: string) => {
        setActiveLocationIds(prev =>
            prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
        )
    }

    return (
        <div className="w-full grid grid-cols-12 gap-6 min-h-[400px] lg:h-[calc(100vh-180px)] animate-fadeIn">
            {/* 左侧：剧本拆解 */}
            <div className="col-span-12 lg:col-span-8 flex flex-col min-h-[400px] lg:h-full gap-4">
                <div className="flex justify-between items-end px-2">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <span className="w-1.5 h-6 bg-blue-500 rounded-full" /> {tScript("scriptBreakdown")}
                    </h2>
                    <span className="text-sm text-slate-400">{tScript("splitCount", { count: clips.length })}</span>
                </div>

                <div className="flex-1 bg-white/70 backdrop-blur-xl border border-white/60 rounded-3xl shadow-xl shadow-slate-200/40 overflow-hidden flex flex-col relative w-full min-h-[300px]">
                    <div className="lg:absolute lg:inset-0 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                        {clips.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                <span className="text-4xl mb-2">📝</span>
                                <p>{tScript("noClips")}</p>
                            </div>
                        ) : (
                            clips.map((clip, idx) => {
                                // 尝试解析screenplay JSON
                                let screenplay: any = null
                                if (clip.screenplay) {
                                    try {
                                        screenplay = JSON.parse(clip.screenplay)
                                    } catch (e) {
                                        console.warn('解析剧本JSON失败:', e)
                                    }
                                }

                                return (
                                    <div
                                        key={clip.id}
                                        onClick={() => setSelectedClipId(clip.id)} // 点击选中该 Clip
                                        className={`
                                            group p-4 border rounded-xl transition-all cursor-pointer relative
                                            ${selectedClipId === clip.id
                                                ? 'bg-blue-50/50 border-blue-400 shadow-md'
                                                : 'bg-white/50 border-slate-100 hover:bg-white hover:shadow-md'
                                            }
                                        `}
                                    >
                                        {/* Saving Indicator */}
                                        {savingClips.has(clip.id) && (
                                            <div className="absolute top-2 right-2 text-xs text-blue-500 flex items-center gap-1 animate-pulse">
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                                </svg>
                                                {t("preview.saving")}
                                            </div>
                                        )}

                                        <div className="flex justify-between mb-2">
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${selectedClipId === clip.id ? 'text-blue-700 bg-blue-100' : 'text-blue-600 bg-blue-50'}`}>
                                                {tScript('segment.title', { index: idx + 1 })} {selectedClipId === clip.id && tScript('segment.selected')}
                                            </span>
                                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {onClipEdit && (
                                                    <button
                                                        onClick={() => onClipEdit(clip.id)}
                                                        className="text-slate-400 text-xs cursor-pointer hover:text-blue-500"
                                                    >
                                                        {t("common.edit")}
                                                    </button>
                                                )}
                                                {onClipDelete && (
                                                    <button
                                                        onClick={() => onClipDelete(clip.id)}
                                                        className="text-slate-400 text-xs cursor-pointer hover:text-red-500"
                                                    >
                                                        {t("common.delete")}
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* 如果有剧本格式，则渲染剧本；否则显示原文摘要 */}
                                        {screenplay && screenplay.scenes ? (
                                            <div className="space-y-3">
                                                {screenplay.scenes.map((scene: any, sceneIdx: number) => (
                                                    <div key={sceneIdx} className="border-l-2 border-blue-200 pl-3 space-y-2">
                                                        {/* 场景头 */}
                                                        <div className="flex items-center gap-2 text-xs flex-wrap">
                                                            <span className="font-bold text-blue-700 bg-blue-50/80 px-2 py-0.5 rounded">
                                                                {tScript('screenplay.scene', { number: scene.scene_number })}
                                                            </span>
                                                            <span className="text-slate-500 flex items-center gap-1">
                                                                {scene.heading?.int_ext} ·
                                                                <EditableText
                                                                    text={scene.heading?.location || ''}
                                                                    onSave={(newVal) => {
                                                                        const newScreenplay = JSON.parse(JSON.stringify(screenplay))
                                                                        newScreenplay.scenes[sceneIdx].heading.location = newVal
                                                                        handleScriptSave(clip.id, JSON.stringify(newScreenplay), true)
                                                                    }}
                                                                    className="inline"
                                                                />
                                                                ·
                                                                <EditableText
                                                                    text={scene.heading?.time || ''}
                                                                    onSave={(newVal) => {
                                                                        const newScreenplay = JSON.parse(JSON.stringify(screenplay))
                                                                        newScreenplay.scenes[sceneIdx].heading.time = newVal
                                                                        handleScriptSave(clip.id, JSON.stringify(newScreenplay), true)
                                                                    }}
                                                                    className="inline"
                                                                />
                                                            </span>
                                                        </div>

                                                        {/* 场景描述 - 可编辑 */}
                                                        {scene.description && (
                                                            <div className="text-xs text-slate-500 italic bg-slate-50 px-2 py-1 rounded">
                                                                <EditableText
                                                                    text={scene.description}
                                                                    onSave={(newVal) => {
                                                                        const newScreenplay = { ...screenplay }
                                                                        newScreenplay.scenes[sceneIdx].description = newVal
                                                                        handleScriptSave(clip.id, JSON.stringify(newScreenplay), true)
                                                                    }}
                                                                />
                                                            </div>
                                                        )}

                                                        {/* 出场角色 - 可编辑 */}
                                                        {scene.characters && scene.characters.length > 0 && (
                                                            <div className="flex gap-1 flex-wrap items-center">
                                                                <span className="text-[10px] text-slate-400">{tScript('screenplay.characters')}</span>
                                                                {scene.characters.map((char: string, ci: number) => (
                                                                    <span key={ci} className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors">
                                                                        <EditableText
                                                                            text={char}
                                                                            onSave={(newVal) => {
                                                                                const newScreenplay = JSON.parse(JSON.stringify(screenplay))
                                                                                newScreenplay.scenes[sceneIdx].characters[ci] = newVal
                                                                                handleScriptSave(clip.id, JSON.stringify(newScreenplay), true)
                                                                            }}
                                                                            className="inline"
                                                                        />
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* 剧本内容 */}
                                                        <div className="space-y-1.5">
                                                            {scene.content?.map((item: any, itemIdx: number) => {
                                                                if (item.type === 'action') {
                                                                    return (
                                                                        <div key={itemIdx} className="text-sm text-slate-700 leading-relaxed">
                                                                            <EditableText
                                                                                text={item.text}
                                                                                onSave={(newVal) => {
                                                                                    const newScreenplay = { ...screenplay }
                                                                                    newScreenplay.scenes[sceneIdx].content[itemIdx].text = newVal
                                                                                    handleScriptSave(clip.id, JSON.stringify(newScreenplay), true)
                                                                                }}
                                                                            />
                                                                        </div>
                                                                    )
                                                                } else if (item.type === 'dialogue') {
                                                                    return (
                                                                        <div key={itemIdx} className="bg-amber-50/60 border-l-2 border-amber-300 pl-2 py-1">
                                                                            <span className="text-xs font-medium text-amber-700">
                                                                                {item.character}
                                                                                {item.parenthetical && (
                                                                                    <span className="text-amber-500 ml-1">（{item.parenthetical}）</span>
                                                                                )}
                                                                            </span>

                                                                            <div className="text-sm text-slate-700">
                                                                                <span className="select-none text-slate-400">「</span>
                                                                                <span className="inline-block min-w-[20px]">
                                                                                    <EditableText
                                                                                        text={item.lines}
                                                                                        onSave={(newVal) => {
                                                                                            const newScreenplay = { ...screenplay }
                                                                                            newScreenplay.scenes[sceneIdx].content[itemIdx].lines = newVal
                                                                                            handleScriptSave(clip.id, JSON.stringify(newScreenplay), true)
                                                                                        }}
                                                                                    />
                                                                                </span>
                                                                                <span className="select-none text-slate-400">」</span>
                                                                            </div>
                                                                        </div>
                                                                    )
                                                                } else if (item.type === 'voiceover') {
                                                                    return (
                                                                        <div key={itemIdx} className="bg-purple-50/60 border-l-2 border-purple-300 pl-2 py-1">
                                                                            <span className="text-xs text-purple-600">{tScript('screenplay.narration')}</span>
                                                                            <p className="text-sm text-slate-600 italic">{item.text}</p>
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
                                            // 无剧本格式，显示原文摘要
                                            <p className="text-slate-700 text-sm leading-relaxed">{clip.summary || clip.content}</p>
                                        )}

                                        {/* 角色和场景标签 */}
                                        <div className="mt-3 flex gap-2 flex-wrap">
                                            {clip.characters && clip.characters.split(',').map((name: string, i: number) => {
                                                const trimmed = name.trim()
                                                return trimmed ? (
                                                    <span key={i} className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                                        👤 {trimmed}
                                                    </span>
                                                ) : null
                                            })}
                                            {clip.location && (
                                                <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                                                    📍 {clip.location}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>
                </div>
            </div>

            {/* 右侧：剧中资产 */}
            <div className="col-span-12 lg:col-span-4 flex flex-col min-h-[300px] lg:h-full gap-4">
                <div className="flex flex-col gap-2 px-2">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <span className="w-1.5 h-6 bg-indigo-500 rounded-full" /> {tScript("inSceneAssets")}
                    </h2>
                    {/* 🔥 片段选择器 */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
                        <button
                            onClick={() => setAssetViewMode('all')}
                            className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-all ${assetViewMode === 'all'
                                ? 'bg-indigo-500 text-white shadow-md'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                        >
                            {tScript("assetView.allClips")}
                        </button>
                        {clips.map((clip, idx) => (
                            <button
                                key={clip.id}
                                onClick={() => setAssetViewMode(clip.id)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-all ${assetViewMode === clip.id
                                    ? 'bg-blue-500 text-white shadow-md'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                            >
                                {tScript("segment.title", { index: idx + 1 })}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex-1 bg-white/70 backdrop-blur-xl border border-white/60 rounded-3xl shadow-xl shadow-slate-200/40 overflow-y-auto p-4 custom-scrollbar flex flex-col gap-6">
                    {/* 资产加载中指示器 */}
                    {assetsLoading && characters.length === 0 && locations.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-400 animate-pulse">
                            <svg className="w-10 h-10 mb-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span className="text-sm">{tScript("asset.loadingAssets")}</span>
                        </div>
                    )}

                    {/* 角色 */}
                    <div className="relative">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-sm font-bold text-slate-600 flex items-center gap-2">
                                <span>👤</span> {tScript("asset.activeCharacters")} ({characters.filter(c => activeCharIds.includes(c.id)).reduce((sum, char) => sum + getSelectedAppearances(char).length, 0)})
                            </h3>
                            <button
                                onClick={() => setShowAddChar(!showAddChar)}
                                className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                            >
                                <span className="text-lg leading-none">+</span> {tAssets("character.add")}
                            </button>
                        </div>

                        {/* 添加角色下拉 - 支持子形象选择 */}
                        {showAddChar && (
                            <>
                                {/* 透明遮罩层 - 点击关闭 */}
                                <div
                                    className="fixed inset-0 z-20"
                                    onClick={() => setShowAddChar(false)}
                                />
                                <div className="absolute top-10 right-0 z-30 bg-white border border-slate-200 rounded-xl shadow-2xl w-96 max-h-[500px] overflow-y-auto p-3 animate-fadeIn">
                                    <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-100">
                                        <span className="text-sm font-medium text-slate-700">{tScript("asset.selectCharacter")}</span>
                                        <button onClick={() => setShowAddChar(false)} className="text-slate-800 hover:text-black text-xl font-bold w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 transition-colors">×</button>
                                    </div>
                                    {/* 按角色分组，展示所有形象（含子形象） */}
                                    <div className="space-y-4">
                                        {characters.map(c => {
                                            const isAdded = activeCharIds.includes(c.id)
                                            const appearances = c.appearances || []
                                            const sortedAppearances = [...appearances].sort((a: any, b: any) => a.appearanceIndex - b.appearanceIndex)

                                            return (
                                                <div key={c.id} className="space-y-2">
                                                    {/* 角色名标题 */}
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-semibold text-slate-700">{c.name}</span>
                                                        <span className="text-[10px] text-slate-400">({tScript("asset.appearanceCount", { count: sortedAppearances.length })})</span>
                                                        {isAdded && (
                                                            <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded">{tScript("asset.added")}</span>
                                                        )}
                                                    </div>
                                                    {/* 形象网格 */}
                                                    <div className="grid grid-cols-3 gap-2">
                                                        {sortedAppearances.map((appearance: any) => {
                                                            const isPrimary = appearance.appearanceIndex === 1
                                                            const imageUrl = appearance.selectedIndex !== null && appearance.selectedIndex !== undefined
                                                                ? (appearance.imageUrls?.[appearance.selectedIndex] || appearance.imageUrl)
                                                                : (appearance.imageUrl || appearance.imageUrls?.[0])

                                                            // 🔥 判断这个形象是否选中（使用 selectedAppearanceKeys）
                                                            const currentAppearanceName = appearance.changeReason || tAssets('character.primary')
                                                            const appearanceKey = `${c.id}::${currentAppearanceName}`
                                                            const isThisAppearanceSelected = selectedAppearanceKeys.has(appearanceKey)

                                                            return (
                                                                <div
                                                                    key={`${c.id}-${appearance.appearanceIndex}`}
                                                                    onClick={() => {
                                                                        // 🔥 独立 toggle：点击切换这个形象的选中状态
                                                                        const appearanceName = appearance.changeReason || tAssets('character.primary')
                                                                        if (isThisAppearanceSelected) {
                                                                            handleUpdateClipAssets('character', 'remove', c.id, appearanceName)
                                                                        } else {
                                                                            handleUpdateClipAssets('character', 'add', c.id, appearanceName)
                                                                        }
                                                                    }}
                                                                    title={isThisAppearanceSelected
                                                                        ? tScript('asset.clickToRemove', { name: appearance.changeReason || tAssets("character.primary") })
                                                                        : tScript('asset.clickToAdd', { name: `${c.name} (${appearance.changeReason || tAssets("character.primary")})` })
                                                                    }
                                                                    className={`relative rounded-lg overflow-hidden cursor-pointer transition-all border-2 ${isThisAppearanceSelected
                                                                        ? 'border-green-400 opacity-100 hover:border-red-400'  // 选中的形象：绿色边框
                                                                        : 'border-transparent hover:border-blue-300 hover:shadow-md'  // 未选中：透明边框
                                                                        }`}
                                                                >
                                                                    <div className="aspect-square bg-slate-100 relative">
                                                                        {imageUrl ? (
                                                                            <img src={imageUrl} className="w-full h-full object-cover" alt={appearance.changeReason} />
                                                                        ) : (
                                                                            <div className="w-full h-full flex items-center justify-center text-2xl text-slate-300">👤</div>
                                                                        )}
                                                                        {/* 主形象/子形象标记 */}
                                                                        {isPrimary ? (
                                                                            <div className="absolute bottom-0 left-0 right-0 bg-blue-500/80 text-white text-[8px] text-center py-0.5">{tAssets("character.primary")}</div>
                                                                        ) : (
                                                                            <div className="absolute bottom-0 left-0 right-0 bg-purple-500/80 text-white text-[8px] text-center py-0.5 truncate px-1">
                                                                                {appearance.changeReason || tScript("asset.subAppearance")}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    {/* 🔥 只有选中的形象才显示对号 */}
                                                                    {isThisAppearanceSelected && (
                                                                        <div className="absolute top-1 right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center text-white text-[8px]">✓</div>
                                                                    )}
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            </>
                        )}

                        {activeCharIds.length === 0 ? (
                            <div className="text-center text-slate-400 text-sm py-4">
                                {tScript("screenplay.noCharacter")}
                            </div>
                        ) : (
                            <div className="grid grid-cols-3 gap-3">
                                {/* 🔥 显示所有选中的形象（一个角色可能有多张卡片） */}
                                {characters.filter(c => activeCharIds.includes(c.id)).flatMap(char => {
                                    const selectedApps = getSelectedAppearances(char)
                                    return selectedApps.map(appearance => (
                                        <SpotlightCharCard
                                            key={`${char.id}-${appearance.id}`}
                                            char={char}
                                            appearance={appearance}
                                            isActive={true}
                                            onClick={() => { }}
                                            onOpenAssetLibrary={onOpenAssetLibrary}
                                            onRemove={() => handleUpdateClipAssets('character', 'remove', char.id, appearance.changeReason || '初始形象')}
                                        />
                                    ))
                                })}
                            </div>
                        )}
                    </div>

                    {/* 场景 */}
                    <div className="relative">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-sm font-bold text-slate-600 flex items-center gap-2">
                                <span>🏞️</span> {tScript("asset.activeLocations")} ({activeLocationIds.length})
                            </h3>
                            <button
                                onClick={() => setShowAddLoc(!showAddLoc)}
                                className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                            >
                                <span className="text-lg leading-none">+</span> {tAssets("location.add")}
                            </button>
                        </div>

                        {/* 添加场景下拉 - 加宽版 */}
                        {showAddLoc && (
                            <>
                                {/* 透明遮罩层 - 点击关闭 */}
                                <div
                                    className="fixed inset-0 z-20"
                                    onClick={() => setShowAddLoc(false)}
                                />
                                <div className="absolute top-10 right-0 z-30 bg-white border border-slate-200 rounded-xl shadow-2xl w-80 max-h-96 overflow-y-auto p-3 animate-fadeIn">
                                    <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-100">
                                        <span className="text-sm font-medium text-slate-700">{tScript("asset.selectLocation")}</span>
                                        <button onClick={() => setShowAddLoc(false)} className="text-slate-800 hover:text-black text-xl font-bold w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 transition-colors">×</button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {locations.map(l => {
                                            const isAdded = activeLocationIds.includes(l.id)
                                            const image = l.images?.find((img: any) => img.isSelected) || l.images?.[0]
                                            return (
                                                <div
                                                    key={l.id}
                                                    onClick={() => {
                                                        if (!isAdded) {
                                                            handleUpdateClipAssets('location', 'add', l.id)
                                                        }
                                                    }}
                                                    className={`relative rounded-lg overflow-hidden cursor-pointer transition-all border-2 ${isAdded
                                                        ? 'border-green-400 opacity-60'
                                                        : 'border-transparent hover:border-blue-300 hover:shadow-md'
                                                        }`}
                                                >
                                                    <div className="aspect-square bg-slate-100">
                                                        {image?.imageUrl ? (
                                                            <img src={image.imageUrl} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-2xl text-slate-300">🏞️</div>
                                                        )}
                                                    </div>
                                                    <div className="p-1 text-center bg-white">
                                                        <div className="text-[10px] font-medium text-slate-600 truncate">{l.name}</div>
                                                    </div>
                                                    {isAdded && (
                                                        <div className="absolute top-1 right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center text-white text-[8px]">✓</div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            </>
                        )}

                        {activeLocationIds.length === 0 ? (
                            <div className="text-center text-slate-400 text-sm py-4">
                                {tScript("screenplay.noLocation")}
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-3">
                                {locations.filter(l => activeLocationIds.includes(l.id)).map(loc => (
                                    <SpotlightLocationCard
                                        key={loc.id}
                                        location={loc}
                                        isActive={true}
                                        onClick={() => { }}
                                        onOpenAssetLibrary={onOpenAssetLibrary}
                                        onRemove={() => handleUpdateClipAssets('location', 'remove', loc.id)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* 底部按钮 */}
                <div className="mt-4 mb-4">
                    {!allAssetsHaveImages && (globalCharIds.length + globalLocationIds.length) > 0 && (

                        <div className="mb-3 p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-slate-800">
                                        {tScript('generate.missingAssets', { count: missingAssetsCount })}
                                    </p>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        {tScript('generate.missingAssetsTip')}
                                        <button
                                            onClick={onOpenAssetLibrary}
                                            className="text-blue-600 hover:text-blue-700 font-medium mx-0.5 hover:underline"
                                        >
                                            {tNP("buttons.assetLibrary")}
                                        </button>
                                        {tScript('generate.missingAssetsTipLink')}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                    <button
                        onClick={onGenerateStoryboard}
                        disabled={isGenerating || clips.length === 0 || !allAssetsHaveImages}
                        className="w-full py-4 text-lg font-bold bg-blue-500 text-white rounded-2xl shadow-xl shadow-blue-500/20 hover:bg-blue-600 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                    >
                        {isGenerating ? tScript('generate.generating') : tScript('generate.startGenerate')}
                    </button>
                </div>
            </div>

            {/* 图片预览 */}
            {previewImage && (
                <ImagePreviewModal
                    imageUrl={previewImage}
                    onClose={() => setPreviewImage(null)}
                />
            )}
        </div>
    )
}
