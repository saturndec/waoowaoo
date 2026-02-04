'use client'

import React from 'react'
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core'
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    horizontalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { VideoClip, TimelineState, EditorConfig } from '../../types/editor.types'
import { framesToTime } from '../../utils/time-utils'

interface TimelineProps {
    clips: VideoClip[]
    timelineState: TimelineState
    config: EditorConfig
    onReorder: (fromIndex: number, toIndex: number) => void
    onSelectClip: (clipId: string | null) => void
    onZoomChange: (zoom: number) => void
    onSeek?: (frame: number) => void
}

/**
 * 时间轴主组件
 * 使用 dnd-kit 实现拖拽排序
 */
export const Timeline: React.FC<TimelineProps> = ({
    clips,
    timelineState,
    config,
    onReorder,
    onSelectClip,
    onZoomChange,
    onSeek
}) => {
    // 计算总时长和播放头位置
    const totalDuration = clips.reduce((sum, clip) => sum + clip.durationInFrames, 0)
    const playheadPosition = totalDuration > 0 ? (timelineState.currentFrame / totalDuration) * 100 : 0
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5 // 5px 移动才开始拖拽
            }
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates
        })
    )

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event

        if (over && active.id !== over.id) {
            const oldIndex = clips.findIndex(c => c.id === active.id)
            const newIndex = clips.findIndex(c => c.id === over.id)
            onReorder(oldIndex, newIndex)
        }
    }

    return (
        <div className="timeline" style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            padding: '12px',
            background: '#1a1a1a',
            height: '100%'
        }}>
            {/* 缩放控制 */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
            }}>
                <span style={{ fontSize: '12px', color: '#888' }}>缩放:</span>
                <input
                    type="range"
                    min="0.5"
                    max="3"
                    step="0.1"
                    value={timelineState.zoom}
                    onChange={(e) => onZoomChange(parseFloat(e.target.value))}
                    style={{ width: '100px' }}
                />
                <span style={{ fontSize: '12px', color: '#666' }}>
                    {Math.round(timelineState.zoom * 100)}%
                </span>
            </div>

            {/* 进度条 + 播放头 */}
            <div
                style={{
                    position: 'relative',
                    height: '24px',
                    background: '#2a2a2a',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    marginLeft: '70px'  // 与轨道标签对齐
                }}
                onClick={(e) => {
                    if (!onSeek || totalDuration === 0) return
                    const rect = e.currentTarget.getBoundingClientRect()
                    const x = e.clientX - rect.left
                    const percent = x / rect.width
                    const frame = Math.round(percent * totalDuration)
                    onSeek(Math.max(0, Math.min(totalDuration, frame)))
                }}
            >
                {/* 已播放部分 */}
                <div style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    height: '100%',
                    width: `${playheadPosition}%`,
                    background: 'linear-gradient(90deg, #4a9eff 0%, #6bb3ff 100%)',
                    borderRadius: '4px 0 0 4px',
                    transition: timelineState.playing ? 'none' : 'width 0.1s'
                }} />
                {/* 播放头指示器 */}
                <div style={{
                    position: 'absolute',
                    left: `${playheadPosition}%`,
                    top: '-4px',
                    bottom: '-4px',
                    width: '3px',
                    background: '#fff',
                    borderRadius: '2px',
                    boxShadow: '0 0 4px rgba(0,0,0,0.5)',
                    transform: 'translateX(-50%)',
                    transition: timelineState.playing ? 'none' : 'left 0.1s'
                }} />
                {/* 时间标记 */}
                <div style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '10px',
                    color: '#666'
                }}>
                    {framesToTime(timelineState.currentFrame, config.fps)} / {framesToTime(totalDuration, config.fps)}
                </div>
            </div>

            {/* 视频轨道 */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                height: '56px',
                background: '#242424',
                borderRadius: '6px',
                padding: '0 12px'
            }}>
                <span style={{
                    fontSize: '12px',
                    color: '#888',
                    width: '70px',
                    flexShrink: 0
                }}>
                    🎬 视频
                </span>

                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={clips.map(c => c.id)}
                        strategy={horizontalListSortingStrategy}
                    >
                        <div style={{
                            display: 'flex',
                            gap: '4px',
                            flex: 1,
                            overflowX: 'auto',
                            paddingRight: '12px'
                        }}>
                            {clips.map((clip, index) => (
                                <SortableClip
                                    key={clip.id}
                                    clip={clip}
                                    index={index}
                                    isSelected={timelineState.selectedClipId === clip.id}
                                    zoom={timelineState.zoom}
                                    fps={config.fps}
                                    onClick={() => onSelectClip(clip.id)}
                                />
                            ))}
                            {clips.length === 0 && (
                                <span style={{ fontSize: '12px', color: '#555' }}>
                                    从素材库拖拽视频片段到这里
                                </span>
                            )}
                        </div>
                    </SortableContext>
                </DndContext>
            </div>

            {/* 配音轨道 (显示附属音频) */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                height: '40px',
                background: '#242424',
                borderRadius: '6px',
                padding: '0 12px'
            }}>
                <span style={{
                    fontSize: '12px',
                    color: '#888',
                    width: '70px',
                    flexShrink: 0
                }}>
                    🎤 配音
                </span>
                <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
                    {clips.filter(c => c.attachment?.audio).map((clip, index) => (
                        <div
                            key={`audio-${clip.id}`}
                            style={{
                                width: `${clip.durationInFrames * timelineState.zoom * 2}px`,
                                height: '28px',
                                background: '#3a6a3a',
                                borderRadius: '4px',
                                fontSize: '10px',
                                color: '#fff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                            }}
                        >
                            🎤
                        </div>
                    ))}
                </div>
            </div>

            {/* BGM 轨道 */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                height: '40px',
                background: '#242424',
                borderRadius: '6px',
                padding: '0 12px'
            }}>
                <span style={{
                    fontSize: '12px',
                    color: '#888',
                    width: '70px',
                    flexShrink: 0
                }}>
                    🎵 BGM
                </span>
            </div>
        </div>
    )
}

/**
 * 可拖拽的片段组件
 */
interface SortableClipProps {
    clip: VideoClip
    index: number
    isSelected: boolean
    zoom: number
    fps: number
    onClick: () => void
}

const SortableClip: React.FC<SortableClipProps> = ({
    clip,
    index,
    isSelected,
    zoom,
    fps,
    onClick
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: clip.id })

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        width: `${clip.durationInFrames * zoom * 2}px`,
        minWidth: '60px',
        height: '40px',
        background: isSelected ? '#4a9eff' : isDragging ? '#555' : '#3a3a3a',
        borderRadius: '4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '11px',
        color: '#fff',
        cursor: isDragging ? 'grabbing' : 'grab',
        flexShrink: 0,
        border: isSelected ? '2px solid #fff' : '1px solid #444',
        opacity: isDragging ? 0.8 : 1,
        zIndex: isDragging ? 100 : 1,
        position: 'relative'
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            onClick={onClick}
            {...attributes}
            {...listeners}
        >
            <span style={{ fontWeight: 'bold' }}>{index + 1}</span>
            <span style={{
                position: 'absolute',
                bottom: '2px',
                fontSize: '9px',
                color: 'rgba(255,255,255,0.6)'
            }}>
                {framesToTime(clip.durationInFrames, fps)}
            </span>

            {/* 转场指示器 */}
            {clip.transition && clip.transition.type !== 'none' && (
                <div style={{
                    position: 'absolute',
                    right: '-6px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '12px',
                    height: '12px',
                    background: '#ffaa00',
                    borderRadius: '50%',
                    fontSize: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10
                }}>
                    ⚡
                </div>
            )}
        </div>
    )
}

export default Timeline
