/**
 * Timeline Editor Types
 *
 * Hệ thống timeline editor cho việc chỉnh sửa và sắp xếp
 * video clips, audio tracks, và voice lines theo thời gian.
 */

// =====================================================
// Timeline Core Types
// =====================================================

export type TimelineTrackType = 'video' | 'bgm' | 'sfx' | 'voice' | 'subtitle'

export interface TimelineTrack {
  id: string
  type: TimelineTrackType
  name: string
  locked: boolean
  visible: boolean
  muted: boolean
  order: number           // Track stacking order (0 = top)
  items: TimelineItem[]
}

export interface TimelineItem {
  id: string
  trackId: string
  type: TimelineTrackType
  name: string
  startTime: number       // seconds
  duration: number        // seconds
  endTime: number         // computed: startTime + duration
  sourceUrl?: string
  thumbnailUrl?: string
  color?: string          // Visual color in timeline

  // Clip-specific
  clipId?: string
  panelId?: string
  panelIndex?: number

  // Audio-specific
  volume?: number
  fadeIn?: number
  fadeOut?: number

  // Subtitle-specific
  text?: string
  speaker?: string
}

// =====================================================
// Timeline State
// =====================================================

export interface TimelineState {
  projectId: string
  episodeId: string
  tracks: TimelineTrack[]
  totalDuration: number
  currentTime: number
  zoom: number             // pixels per second
  scrollLeft: number       // horizontal scroll offset in pixels
  isPlaying: boolean
  selectedItemIds: string[]
  snapEnabled: boolean
  snapInterval: number     // seconds
  fps: number
}

export interface TimelineViewport {
  startTime: number
  endTime: number
  visibleDuration: number
  pixelsPerSecond: number
  containerWidth: number
}

// =====================================================
// Timeline Actions
// =====================================================

export type TimelineAction =
  | { type: 'SET_TRACKS'; tracks: TimelineTrack[] }
  | { type: 'ADD_TRACK'; track: TimelineTrack }
  | { type: 'REMOVE_TRACK'; trackId: string }
  | { type: 'ADD_ITEM'; item: TimelineItem }
  | { type: 'REMOVE_ITEM'; itemId: string }
  | { type: 'MOVE_ITEM'; itemId: string; newStartTime: number; newTrackId?: string }
  | { type: 'RESIZE_ITEM'; itemId: string; newDuration: number; fromStart?: boolean }
  | { type: 'SPLIT_ITEM'; itemId: string; splitTime: number }
  | { type: 'SELECT_ITEMS'; itemIds: string[] }
  | { type: 'SET_CURRENT_TIME'; time: number }
  | { type: 'SET_ZOOM'; zoom: number }
  | { type: 'SET_SCROLL'; scrollLeft: number }
  | { type: 'TOGGLE_PLAY' }
  | { type: 'TOGGLE_SNAP' }
  | { type: 'LOCK_TRACK'; trackId: string }
  | { type: 'UNLOCK_TRACK'; trackId: string }
  | { type: 'MUTE_TRACK'; trackId: string }
  | { type: 'UNMUTE_TRACK'; trackId: string }

// =====================================================
// Timeline Interaction Types
// =====================================================

export type TimelineDragType = 'move' | 'resize-start' | 'resize-end' | 'select'

export interface TimelineDragState {
  isDragging: boolean
  dragType: TimelineDragType | null
  dragItemId: string | null
  startX: number
  startTime: number
  currentX: number
}

export interface TimelineMarker {
  id: string
  time: number
  label: string
  color: string
  type: 'clip-boundary' | 'scene-change' | 'custom'
}

// =====================================================
// Track Colors
// =====================================================

export const TRACK_TYPE_COLORS: Record<TimelineTrackType, string> = {
  video: '#3b82f6',
  bgm: '#8b5cf6',
  sfx: '#f59e0b',
  voice: '#10b981',
  subtitle: '#6b7280',
}
