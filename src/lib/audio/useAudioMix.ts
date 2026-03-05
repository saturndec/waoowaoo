'use client'

import { useCallback, useReducer, useRef, useState } from 'react'
import type {
  AudioTrack,
  AudioTrackType,
  BGMTrack,
  SFXTrack,
  AudioMixState,
  AudioMixAction,
} from '@/types/audio'

// =====================================================
// Audio Mix Reducer
// =====================================================

function createInitialState(projectId: string, episodeId: string): AudioMixState {
  return {
    projectId,
    episodeId,
    masterVolume: 0.8,
    bgmTracks: [],
    sfxTracks: [],
    voiceTracks: [],
    ambientTracks: [],
    totalDuration: 0,
    updatedAt: Date.now(),
  }
}

function audioMixReducer(state: AudioMixState, action: AudioMixAction): AudioMixState {
  const now = Date.now()

  switch (action.type) {
    case 'ADD_TRACK': {
      const track = action.payload.track as AudioTrack
      const nextState = { ...state, updatedAt: now }
      switch (track.type) {
        case 'bgm':
          nextState.bgmTracks = [...state.bgmTracks, track as BGMTrack]
          break
        case 'sfx':
          nextState.sfxTracks = [...state.sfxTracks, track as SFXTrack]
          break
        case 'voice':
          nextState.voiceTracks = [...state.voiceTracks, track]
          break
        case 'ambient':
          nextState.ambientTracks = [...state.ambientTracks, track]
          break
      }
      nextState.totalDuration = computeTotalDuration(nextState)
      return nextState
    }

    case 'REMOVE_TRACK': {
      const trackId = action.payload.trackId as string
      return {
        ...state,
        bgmTracks: state.bgmTracks.filter((t) => t.id !== trackId),
        sfxTracks: state.sfxTracks.filter((t) => t.id !== trackId),
        voiceTracks: state.voiceTracks.filter((t) => t.id !== trackId),
        ambientTracks: state.ambientTracks.filter((t) => t.id !== trackId),
        updatedAt: now,
      }
    }

    case 'UPDATE_TRACK': {
      const trackId = action.payload.trackId as string
      const updates = action.payload.updates as Partial<AudioTrack>
      const updateTrack = <T extends AudioTrack>(tracks: T[]): T[] =>
        tracks.map((t) => (t.id === trackId ? { ...t, ...updates } : t))

      return {
        ...state,
        bgmTracks: updateTrack(state.bgmTracks),
        sfxTracks: updateTrack(state.sfxTracks),
        voiceTracks: updateTrack(state.voiceTracks),
        ambientTracks: updateTrack(state.ambientTracks),
        updatedAt: now,
      }
    }

    case 'SET_MASTER_VOLUME':
      return {
        ...state,
        masterVolume: Math.max(0, Math.min(1, action.payload.volume as number)),
        updatedAt: now,
      }

    case 'MUTE_TRACK': {
      const trackId = action.payload.trackId as string
      return {
        ...state,
        bgmTracks: state.bgmTracks.map((t) => (t.id === trackId ? { ...t, muted: true } : t)),
        sfxTracks: state.sfxTracks.map((t) => (t.id === trackId ? { ...t, muted: true } : t)),
        voiceTracks: state.voiceTracks.map((t) => (t.id === trackId ? { ...t, muted: true } : t)),
        ambientTracks: state.ambientTracks.map((t) => (t.id === trackId ? { ...t, muted: true } : t)),
        updatedAt: now,
      }
    }

    case 'UNMUTE_TRACK': {
      const trackId = action.payload.trackId as string
      return {
        ...state,
        bgmTracks: state.bgmTracks.map((t) => (t.id === trackId ? { ...t, muted: false } : t)),
        sfxTracks: state.sfxTracks.map((t) => (t.id === trackId ? { ...t, muted: false } : t)),
        voiceTracks: state.voiceTracks.map((t) => (t.id === trackId ? { ...t, muted: false } : t)),
        ambientTracks: state.ambientTracks.map((t) => (t.id === trackId ? { ...t, muted: false } : t)),
        updatedAt: now,
      }
    }

    case 'SOLO_TRACK': {
      const soloId = action.payload.trackId as string
      const muteOthers = <T extends AudioTrack>(tracks: T[]): T[] =>
        tracks.map((t) => ({ ...t, muted: t.id !== soloId }))
      return {
        ...state,
        bgmTracks: muteOthers(state.bgmTracks),
        sfxTracks: muteOthers(state.sfxTracks),
        voiceTracks: muteOthers(state.voiceTracks),
        ambientTracks: muteOthers(state.ambientTracks),
        updatedAt: now,
      }
    }

    default:
      return state
  }
}

function computeTotalDuration(state: AudioMixState): number {
  const allTracks = [
    ...state.bgmTracks,
    ...state.sfxTracks,
    ...state.voiceTracks,
    ...state.ambientTracks,
  ]
  if (allTracks.length === 0) return 0
  return Math.max(...allTracks.map((t) => (t.endTime > 0 ? t.endTime : t.startTime + t.duration)))
}

// =====================================================
// Audio Playback Controller
// =====================================================

interface PlaybackState {
  isPlaying: boolean
  currentTime: number
  duration: number
}

// =====================================================
// Hook
// =====================================================

export function useAudioMix(projectId: string, episodeId: string) {
  const [state, dispatch] = useReducer(
    audioMixReducer,
    { projectId, episodeId },
    ({ projectId: p, episodeId: e }) => createInitialState(p, e),
  )

  const [playback, setPlayback] = useState<PlaybackState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
  })

  const audioContextRef = useRef<AudioContext | null>(null)
  const animFrameRef = useRef<number>(0)

  // Ensure AudioContext exists
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext()
    }
    return audioContextRef.current
  }, [])

  // Track CRUD
  const addTrack = useCallback((track: AudioTrack) => {
    dispatch({ type: 'ADD_TRACK', payload: { track } })
  }, [])

  const removeTrack = useCallback((trackId: string) => {
    dispatch({ type: 'REMOVE_TRACK', payload: { trackId } })
  }, [])

  const updateTrack = useCallback((trackId: string, updates: Partial<AudioTrack>) => {
    dispatch({ type: 'UPDATE_TRACK', payload: { trackId, updates } })
  }, [])

  const setMasterVolume = useCallback((volume: number) => {
    dispatch({ type: 'SET_MASTER_VOLUME', payload: { volume } })
  }, [])

  const muteTrack = useCallback((trackId: string) => {
    dispatch({ type: 'MUTE_TRACK', payload: { trackId } })
  }, [])

  const unmuteTrack = useCallback((trackId: string) => {
    dispatch({ type: 'UNMUTE_TRACK', payload: { trackId } })
  }, [])

  const soloTrack = useCallback((trackId: string) => {
    dispatch({ type: 'SOLO_TRACK', payload: { trackId } })
  }, [])

  // Quick-add helpers
  const addBGM = useCallback(
    (bgm: Omit<BGMTrack, 'id' | 'type' | 'muted'>) => {
      addTrack({
        ...bgm,
        id: `bgm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'bgm',
        muted: false,
      } as BGMTrack)
    },
    [addTrack],
  )

  const addSFX = useCallback(
    (sfx: Omit<SFXTrack, 'id' | 'type' | 'muted'>) => {
      addTrack({
        ...sfx,
        id: `sfx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'sfx',
        muted: false,
      } as SFXTrack)
    },
    [addTrack],
  )

  // Playback controls
  const play = useCallback(() => {
    getAudioContext()
    setPlayback((prev) => ({ ...prev, isPlaying: true }))
  }, [getAudioContext])

  const pause = useCallback(() => {
    setPlayback((prev) => ({ ...prev, isPlaying: false }))
    cancelAnimationFrame(animFrameRef.current)
  }, [])

  const stop = useCallback(() => {
    setPlayback({ isPlaying: false, currentTime: 0, duration: state.totalDuration })
    cancelAnimationFrame(animFrameRef.current)
  }, [state.totalDuration])

  const seek = useCallback((time: number) => {
    setPlayback((prev) => ({ ...prev, currentTime: Math.max(0, time) }))
  }, [])

  // Get all tracks flat
  const allTracks = [
    ...state.bgmTracks,
    ...state.sfxTracks,
    ...state.voiceTracks,
    ...state.ambientTracks,
  ]

  return {
    // State
    mix: state,
    playback,
    allTracks,
    trackCount: allTracks.length,

    // Track actions
    addTrack,
    removeTrack,
    updateTrack,
    addBGM,
    addSFX,
    muteTrack,
    unmuteTrack,
    soloTrack,
    setMasterVolume,

    // Playback
    play,
    pause,
    stop,
    seek,
  }
}
