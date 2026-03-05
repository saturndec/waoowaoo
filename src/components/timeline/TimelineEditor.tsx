'use client'

import { useCallback, useRef, useState } from 'react'
import { AppIcon } from '@/components/ui/icons'
import type { TimelineTrack, TimelineItem, TimelineTrackType, TimelineDragState } from '@/types/timeline'
import { TRACK_TYPE_COLORS } from '@/types/timeline'

// =====================================================
// Timeline Ruler
// =====================================================

function TimelineRuler({
  totalDuration,
  zoom,
  scrollLeft,
  currentTime,
  onSeek,
}: {
  totalDuration: number
  zoom: number
  scrollLeft: number
  currentTime: number
  onSeek: (time: number) => void
}) {
  const rulerRef = useRef<HTMLDivElement>(null)

  const handleClick = (e: React.MouseEvent) => {
    if (!rulerRef.current) return
    const rect = rulerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left + scrollLeft
    const time = x / zoom
    onSeek(Math.max(0, time))
  }

  // Generate time markers
  const interval = getTimeInterval(zoom)
  const markers: { time: number; label: string; isMajor: boolean }[] = []
  const visibleEnd = (scrollLeft + 2000) / zoom

  for (let t = 0; t <= Math.max(totalDuration, visibleEnd) + interval; t += interval) {
    markers.push({
      time: t,
      label: formatTime(t),
      isMajor: t % (interval * 5) < 0.001 || interval >= 5,
    })
  }

  return (
    <div
      ref={rulerRef}
      className="relative h-6 border-b border-[var(--glass-stroke-base)] cursor-pointer select-none overflow-hidden"
      onClick={handleClick}
    >
      <div
        className="relative h-full"
        style={{ transform: `translateX(${-scrollLeft}px)`, width: `${(totalDuration + 10) * zoom}px` }}
      >
        {markers.map((m, i) => (
          <div
            key={i}
            className="absolute top-0 flex flex-col items-center"
            style={{ left: `${m.time * zoom}px` }}
          >
            <div
              className={`w-px ${m.isMajor ? 'h-4 bg-[var(--glass-stroke-strong)]' : 'h-2 bg-[var(--glass-stroke-base)]'}`}
            />
            {m.isMajor && (
              <span className="text-[9px] text-[var(--glass-text-tertiary)] mt-0.5 font-mono">
                {m.label}
              </span>
            )}
          </div>
        ))}

        {/* Playhead */}
        <div
          className="absolute top-0 h-full w-0.5 bg-[var(--glass-tone-danger-fg)] z-10"
          style={{ left: `${currentTime * zoom}px` }}
        >
          <div className="absolute -top-0.5 -left-1.5 w-3.5 h-3 bg-[var(--glass-tone-danger-fg)] rounded-b-sm" />
        </div>
      </div>
    </div>
  )
}

// =====================================================
// Timeline Track Header
// =====================================================

function TrackHeader({
  track,
  onToggleLock,
  onToggleMute,
}: {
  track: TimelineTrack
  onToggleLock: () => void
  onToggleMute: () => void
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--glass-stroke-base)] h-12 bg-[var(--glass-bg-surface)]">
      <div
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: TRACK_TYPE_COLORS[track.type] }}
      />
      <span className="text-xs font-medium text-[var(--glass-text-primary)] truncate flex-1">
        {track.name}
      </span>
      <button
        type="button"
        onClick={onToggleMute}
        className={`glass-icon-btn-sm ${track.muted ? 'text-[var(--glass-tone-danger-fg)]' : ''}`}
      >
        <AppIcon name={track.muted ? 'volumeOff' : 'audioWave'} className="w-3 h-3" />
      </button>
      <button
        type="button"
        onClick={onToggleLock}
        className={`glass-icon-btn-sm ${track.locked ? 'text-[var(--glass-tone-warning-fg)]' : ''}`}
      >
        <AppIcon name={track.locked ? 'lock' : 'eye'} className="w-3 h-3" />
      </button>
    </div>
  )
}

// =====================================================
// Timeline Item Block
// =====================================================

function TimelineItemBlock({
  item,
  zoom,
  scrollLeft,
  isSelected,
  onSelect,
  onDragStart,
}: {
  item: TimelineItem
  zoom: number
  scrollLeft: number
  isSelected: boolean
  onSelect: (id: string) => void
  onDragStart: (id: string, type: 'move' | 'resize-end', x: number) => void
}) {
  const left = item.startTime * zoom - scrollLeft
  const width = Math.max(4, item.duration * zoom)
  const color = item.color || TRACK_TYPE_COLORS[item.type]

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSelect(item.id)
    onDragStart(item.id, 'move', e.clientX)
  }

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSelect(item.id)
    onDragStart(item.id, 'resize-end', e.clientX)
  }

  return (
    <div
      className={`absolute top-1 h-10 rounded-md cursor-grab active:cursor-grabbing transition-shadow ${
        isSelected ? 'ring-2 ring-[var(--glass-accent-from)] shadow-md' : 'shadow-sm'
      }`}
      style={{
        left: `${left}px`,
        width: `${width}px`,
        backgroundColor: `${color}cc`,
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Item label */}
      <div className="px-1.5 py-1 overflow-hidden h-full flex items-center">
        <span className="text-[10px] font-medium text-white truncate">
          {item.name}
        </span>
      </div>

      {/* Resize handle (right edge) */}
      <div
        className="absolute right-0 top-0 w-1.5 h-full cursor-col-resize hover:bg-white/30 rounded-r-md"
        onMouseDown={handleResizeMouseDown}
      />
    </div>
  )
}

// =====================================================
// Timeline Track Row
// =====================================================

function TrackRow({
  track,
  zoom,
  scrollLeft,
  totalDuration,
  selectedItemIds,
  onSelectItem,
  onDragStart,
}: {
  track: TimelineTrack
  zoom: number
  scrollLeft: number
  totalDuration: number
  selectedItemIds: string[]
  onSelectItem: (id: string) => void
  onDragStart: (id: string, type: 'move' | 'resize-end', x: number) => void
}) {
  return (
    <div
      className="relative h-12 border-b border-[var(--glass-stroke-base)] overflow-hidden"
      style={{ background: track.locked ? 'var(--glass-bg-muted)' : undefined }}
    >
      <div
        className="relative h-full"
        style={{ width: `${(totalDuration + 10) * zoom}px`, transform: `translateX(${-scrollLeft}px)` }}
      >
        {track.items.map((item) => (
          <TimelineItemBlock
            key={item.id}
            item={item}
            zoom={zoom}
            scrollLeft={0}
            isSelected={selectedItemIds.includes(item.id)}
            onSelect={onSelectItem}
            onDragStart={onDragStart}
          />
        ))}
      </div>
    </div>
  )
}

// =====================================================
// Main Timeline Editor
// =====================================================

interface TimelineEditorProps {
  tracks: TimelineTrack[]
  totalDuration: number
  currentTime: number
  zoom: number
  isPlaying: boolean
  selectedItemIds: string[]
  snapEnabled: boolean
  onSeek: (time: number) => void
  onSelectItems: (ids: string[]) => void
  onMoveItem: (id: string, newStartTime: number, newTrackId?: string) => void
  onResizeItem: (id: string, newDuration: number) => void
  onSplitItem: (id: string, splitTime: number) => void
  onTogglePlay: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomToFit: () => void
  onToggleSnap: () => void
  onLockTrack: (trackId: string) => void
  onUnlockTrack: (trackId: string) => void
  onMuteTrack: (trackId: string) => void
  onUnmuteTrack: (trackId: string) => void
}

export default function TimelineEditor({
  tracks,
  totalDuration,
  currentTime,
  zoom,
  isPlaying,
  selectedItemIds,
  snapEnabled,
  onSeek,
  onSelectItems,
  onMoveItem,
  onResizeItem,
  onTogglePlay,
  onZoomIn,
  onZoomOut,
  onZoomToFit,
  onToggleSnap,
  onLockTrack,
  onUnlockTrack,
  onMuteTrack,
  onUnmuteTrack,
}: TimelineEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollLeft, setScrollLeft] = useState(0)

  // Drag state
  const [dragState, setDragState] = useState<TimelineDragState>({
    isDragging: false,
    dragType: null,
    dragItemId: null,
    startX: 0,
    startTime: 0,
    currentX: 0,
  })

  const handleDragStart = useCallback(
    (itemId: string, type: 'move' | 'resize-end', x: number) => {
      const item = tracks.flatMap((t) => t.items).find((i) => i.id === itemId)
      if (!item) return

      setDragState({
        isDragging: true,
        dragType: type,
        dragItemId: itemId,
        startX: x,
        startTime: type === 'move' ? item.startTime : item.duration,
        currentX: x,
      })

      const handleMouseMove = (e: MouseEvent) => {
        const deltaX = e.clientX - x
        const deltaTime = deltaX / zoom

        if (type === 'move') {
          onMoveItem(itemId, Math.max(0, item.startTime + deltaTime))
        } else if (type === 'resize-end') {
          onResizeItem(itemId, Math.max(0.1, item.duration + deltaTime))
        }
      }

      const handleMouseUp = () => {
        setDragState((prev) => ({ ...prev, isDragging: false, dragType: null, dragItemId: null }))
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.body.style.cursor = ''
      }

      document.body.style.cursor = type === 'move' ? 'grabbing' : 'col-resize'
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [zoom, tracks, onMoveItem, onResizeItem],
  )

  const handleSelectItem = useCallback(
    (id: string) => {
      onSelectItems([id])
    },
    [onSelectItems],
  )

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollLeft(e.currentTarget.scrollLeft)
  }

  return (
    <div className="glass-surface rounded-2xl overflow-hidden flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--glass-stroke-base)]">
        <div className="flex items-center gap-2">
          <AppIcon name="film" className="w-4 h-4 text-[var(--glass-accent-from)]" />
          <span className="text-sm font-semibold text-[var(--glass-text-primary)]">Timeline</span>
          <span className="text-[10px] text-[var(--glass-text-tertiary)] font-mono">
            {formatTime(currentTime)} / {formatTime(totalDuration)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onTogglePlay}
            className="glass-btn-base glass-btn-primary rounded-lg w-7 h-7 p-0"
          >
            <AppIcon name={isPlaying ? 'pause' : 'play'} className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-5 bg-[var(--glass-stroke-base)] mx-1" />
          <button type="button" onClick={onZoomOut} className="glass-icon-btn-sm" title="Zoom out">
            <AppIcon name="minus" className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] text-[var(--glass-text-tertiary)] w-8 text-center font-mono">
            {Math.round(zoom)}x
          </span>
          <button type="button" onClick={onZoomIn} className="glass-icon-btn-sm" title="Zoom in">
            <AppIcon name="plus" className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={onZoomToFit} className="glass-icon-btn-sm" title="Zoom to fit">
            <AppIcon name="monitor" className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-5 bg-[var(--glass-stroke-base)] mx-1" />
          <button
            type="button"
            onClick={onToggleSnap}
            className={`glass-icon-btn-sm text-[10px] font-bold ${snapEnabled ? 'text-[var(--glass-tone-info-fg)]' : ''}`}
            title={snapEnabled ? 'Disable snap' : 'Enable snap'}
          >
            Snap
          </button>
        </div>
      </div>

      {/* Timeline body */}
      <div className="flex flex-1 min-h-0">
        {/* Track headers */}
        <div className="w-36 shrink-0 border-r border-[var(--glass-stroke-base)]">
          <div className="h-6 border-b border-[var(--glass-stroke-base)]" />
          {tracks.map((track) => (
            <TrackHeader
              key={track.id}
              track={track}
              onToggleLock={() =>
                track.locked ? onUnlockTrack(track.id) : onLockTrack(track.id)
              }
              onToggleMute={() =>
                track.muted ? onUnmuteTrack(track.id) : onMuteTrack(track.id)
              }
            />
          ))}
        </div>

        {/* Scrollable timeline area */}
        <div
          ref={containerRef}
          className="flex-1 overflow-x-auto overflow-y-hidden"
          onScroll={handleScroll}
        >
          {/* Ruler */}
          <TimelineRuler
            totalDuration={totalDuration}
            zoom={zoom}
            scrollLeft={scrollLeft}
            currentTime={currentTime}
            onSeek={onSeek}
          />

          {/* Track rows */}
          {tracks.map((track) => (
            <TrackRow
              key={track.id}
              track={track}
              zoom={zoom}
              scrollLeft={scrollLeft}
              totalDuration={totalDuration}
              selectedItemIds={selectedItemIds}
              onSelectItem={handleSelectItem}
              onDragStart={handleDragStart}
            />
          ))}

          {/* Empty state */}
          {tracks.length === 0 && (
            <div className="flex items-center justify-center h-32 text-sm text-[var(--glass-text-tertiary)]">
              No tracks. Add video clips, audio, or voice to begin editing.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// =====================================================
// Utilities
// =====================================================

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 100)
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
}

function getTimeInterval(zoom: number): number {
  if (zoom >= 100) return 0.5
  if (zoom >= 50) return 1
  if (zoom >= 25) return 2
  if (zoom >= 10) return 5
  return 10
}
