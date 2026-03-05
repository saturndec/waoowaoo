'use client'

import { useCallback, useReducer, useRef } from 'react'
import type {
  TimelineState,
  TimelineAction,
  TimelineTrack,
  TimelineItem,
  TimelineViewport,
} from '@/types/timeline'

// =====================================================
// Timeline Reducer
// =====================================================

function createInitialState(projectId: string, episodeId: string): TimelineState {
  return {
    projectId,
    episodeId,
    tracks: [],
    totalDuration: 0,
    currentTime: 0,
    zoom: 50,            // 50px per second
    scrollLeft: 0,
    isPlaying: false,
    selectedItemIds: [],
    snapEnabled: true,
    snapInterval: 0.5,   // snap to 0.5 second grid
    fps: 30,
  }
}

function computeTotalDuration(tracks: TimelineTrack[]): number {
  let maxEnd = 0
  for (const track of tracks) {
    for (const item of track.items) {
      const end = item.startTime + item.duration
      if (end > maxEnd) maxEnd = end
    }
  }
  return maxEnd
}

function timelineReducer(state: TimelineState, action: TimelineAction): TimelineState {
  switch (action.type) {
    case 'SET_TRACKS': {
      const totalDuration = computeTotalDuration(action.tracks)
      return { ...state, tracks: action.tracks, totalDuration }
    }

    case 'ADD_TRACK':
      return {
        ...state,
        tracks: [...state.tracks, action.track],
        totalDuration: computeTotalDuration([...state.tracks, action.track]),
      }

    case 'REMOVE_TRACK':
      return {
        ...state,
        tracks: state.tracks.filter((t) => t.id !== action.trackId),
        totalDuration: computeTotalDuration(state.tracks.filter((t) => t.id !== action.trackId)),
      }

    case 'ADD_ITEM': {
      const newTracks = state.tracks.map((track) => {
        if (track.id !== action.item.trackId) return track
        return { ...track, items: [...track.items, action.item] }
      })
      return { ...state, tracks: newTracks, totalDuration: computeTotalDuration(newTracks) }
    }

    case 'REMOVE_ITEM': {
      const newTracks = state.tracks.map((track) => ({
        ...track,
        items: track.items.filter((item) => item.id !== action.itemId),
      }))
      return { ...state, tracks: newTracks, totalDuration: computeTotalDuration(newTracks) }
    }

    case 'MOVE_ITEM': {
      const snappedTime = state.snapEnabled
        ? snapToGrid(action.newStartTime, state.snapInterval)
        : action.newStartTime

      const newTracks = state.tracks.map((track) => {
        // Remove from current track if moving to different track
        if (action.newTrackId && track.id !== action.newTrackId) {
          return {
            ...track,
            items: track.items.filter((item) => item.id !== action.itemId),
          }
        }

        return {
          ...track,
          items: track.items.map((item) => {
            if (item.id !== action.itemId) return item
            return {
              ...item,
              startTime: Math.max(0, snappedTime),
              endTime: Math.max(0, snappedTime) + item.duration,
              ...(action.newTrackId ? { trackId: action.newTrackId } : {}),
            }
          }),
        }
      })

      // If moving to a different track, add the item there
      if (action.newTrackId) {
        const movedItem = state.tracks
          .flatMap((t) => t.items)
          .find((i) => i.id === action.itemId)

        if (movedItem) {
          const targetTrackIndex = newTracks.findIndex((t) => t.id === action.newTrackId)
          if (targetTrackIndex >= 0 && !newTracks[targetTrackIndex].items.find((i) => i.id === action.itemId)) {
            newTracks[targetTrackIndex] = {
              ...newTracks[targetTrackIndex],
              items: [
                ...newTracks[targetTrackIndex].items,
                { ...movedItem, startTime: Math.max(0, snappedTime), trackId: action.newTrackId! },
              ],
            }
          }
        }
      }

      return { ...state, tracks: newTracks, totalDuration: computeTotalDuration(newTracks) }
    }

    case 'RESIZE_ITEM': {
      const newTracks = state.tracks.map((track) => ({
        ...track,
        items: track.items.map((item) => {
          if (item.id !== action.itemId) return item
          const newDuration = Math.max(0.1, action.newDuration)
          if (action.fromStart) {
            const oldEnd = item.startTime + item.duration
            const newStart = oldEnd - newDuration
            return { ...item, startTime: Math.max(0, newStart), duration: newDuration, endTime: oldEnd }
          }
          return { ...item, duration: newDuration, endTime: item.startTime + newDuration }
        }),
      }))
      return { ...state, tracks: newTracks, totalDuration: computeTotalDuration(newTracks) }
    }

    case 'SPLIT_ITEM': {
      const newTracks = state.tracks.map((track) => {
        const itemIndex = track.items.findIndex((i) => i.id === action.itemId)
        if (itemIndex === -1) return track

        const item = track.items[itemIndex]
        const splitOffset = action.splitTime - item.startTime

        if (splitOffset <= 0 || splitOffset >= item.duration) return track

        const firstHalf: TimelineItem = {
          ...item,
          duration: splitOffset,
          endTime: action.splitTime,
        }
        const secondHalf: TimelineItem = {
          ...item,
          id: `${item.id}-split-${Date.now()}`,
          startTime: action.splitTime,
          duration: item.duration - splitOffset,
          endTime: item.startTime + item.duration,
        }

        const newItems = [...track.items]
        newItems.splice(itemIndex, 1, firstHalf, secondHalf)
        return { ...track, items: newItems }
      })
      return { ...state, tracks: newTracks }
    }

    case 'SELECT_ITEMS':
      return { ...state, selectedItemIds: action.itemIds }

    case 'SET_CURRENT_TIME':
      return { ...state, currentTime: Math.max(0, action.time) }

    case 'SET_ZOOM':
      return { ...state, zoom: Math.max(10, Math.min(200, action.zoom)) }

    case 'SET_SCROLL':
      return { ...state, scrollLeft: Math.max(0, action.scrollLeft) }

    case 'TOGGLE_PLAY':
      return { ...state, isPlaying: !state.isPlaying }

    case 'TOGGLE_SNAP':
      return { ...state, snapEnabled: !state.snapEnabled }

    case 'LOCK_TRACK':
      return {
        ...state,
        tracks: state.tracks.map((t) => (t.id === action.trackId ? { ...t, locked: true } : t)),
      }

    case 'UNLOCK_TRACK':
      return {
        ...state,
        tracks: state.tracks.map((t) => (t.id === action.trackId ? { ...t, locked: false } : t)),
      }

    case 'MUTE_TRACK':
      return {
        ...state,
        tracks: state.tracks.map((t) => (t.id === action.trackId ? { ...t, muted: true } : t)),
      }

    case 'UNMUTE_TRACK':
      return {
        ...state,
        tracks: state.tracks.map((t) => (t.id === action.trackId ? { ...t, muted: false } : t)),
      }

    default:
      return state
  }
}

function snapToGrid(time: number, interval: number): number {
  return Math.round(time / interval) * interval
}

// =====================================================
// Hook
// =====================================================

export function useTimeline(projectId: string, episodeId: string) {
  const [state, dispatch] = useReducer(
    timelineReducer,
    { projectId, episodeId },
    ({ projectId: p, episodeId: e }) => createInitialState(p, e),
  )

  const containerRef = useRef<HTMLDivElement>(null)

  // Viewport computation
  const getViewport = useCallback((): TimelineViewport => {
    const containerWidth = containerRef.current?.offsetWidth || 800
    const startTime = state.scrollLeft / state.zoom
    const visibleDuration = containerWidth / state.zoom
    return {
      startTime,
      endTime: startTime + visibleDuration,
      visibleDuration,
      pixelsPerSecond: state.zoom,
      containerWidth,
    }
  }, [state.scrollLeft, state.zoom])

  // Time <-> pixel conversion
  const timeToPixel = useCallback(
    (time: number) => time * state.zoom - state.scrollLeft,
    [state.zoom, state.scrollLeft],
  )

  const pixelToTime = useCallback(
    (pixel: number) => (pixel + state.scrollLeft) / state.zoom,
    [state.zoom, state.scrollLeft],
  )

  // Actions
  const addTrack = useCallback((track: TimelineTrack) => {
    dispatch({ type: 'ADD_TRACK', track })
  }, [])

  const removeTrack = useCallback((trackId: string) => {
    dispatch({ type: 'REMOVE_TRACK', trackId })
  }, [])

  const addItem = useCallback((item: TimelineItem) => {
    dispatch({ type: 'ADD_ITEM', item })
  }, [])

  const removeItem = useCallback((itemId: string) => {
    dispatch({ type: 'REMOVE_ITEM', itemId })
  }, [])

  const moveItem = useCallback((itemId: string, newStartTime: number, newTrackId?: string) => {
    dispatch({ type: 'MOVE_ITEM', itemId, newStartTime, newTrackId })
  }, [])

  const resizeItem = useCallback((itemId: string, newDuration: number, fromStart?: boolean) => {
    dispatch({ type: 'RESIZE_ITEM', itemId, newDuration, fromStart })
  }, [])

  const splitItem = useCallback((itemId: string, splitTime: number) => {
    dispatch({ type: 'SPLIT_ITEM', itemId, splitTime })
  }, [])

  const selectItems = useCallback((itemIds: string[]) => {
    dispatch({ type: 'SELECT_ITEMS', itemIds })
  }, [])

  const setCurrentTime = useCallback((time: number) => {
    dispatch({ type: 'SET_CURRENT_TIME', time })
  }, [])

  const setZoom = useCallback((zoom: number) => {
    dispatch({ type: 'SET_ZOOM', zoom })
  }, [])

  const togglePlay = useCallback(() => {
    dispatch({ type: 'TOGGLE_PLAY' })
  }, [])

  const toggleSnap = useCallback(() => {
    dispatch({ type: 'TOGGLE_SNAP' })
  }, [])

  // Zoom in/out helpers
  const zoomIn = useCallback(() => {
    dispatch({ type: 'SET_ZOOM', zoom: state.zoom * 1.25 })
  }, [state.zoom])

  const zoomOut = useCallback(() => {
    dispatch({ type: 'SET_ZOOM', zoom: state.zoom / 1.25 })
  }, [state.zoom])

  // Zoom to fit
  const zoomToFit = useCallback(() => {
    const containerWidth = containerRef.current?.offsetWidth || 800
    if (state.totalDuration > 0) {
      dispatch({ type: 'SET_ZOOM', zoom: (containerWidth - 40) / state.totalDuration })
      dispatch({ type: 'SET_SCROLL', scrollLeft: 0 })
    }
  }, [state.totalDuration])

  return {
    state,
    containerRef,

    // Viewport
    getViewport,
    timeToPixel,
    pixelToTime,

    // Track actions
    addTrack,
    removeTrack,

    // Item actions
    addItem,
    removeItem,
    moveItem,
    resizeItem,
    splitItem,
    selectItems,

    // Playback
    setCurrentTime,
    togglePlay,

    // Zoom
    setZoom,
    zoomIn,
    zoomOut,
    zoomToFit,
    toggleSnap,
  }
}
