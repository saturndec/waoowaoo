/**
 * BGM/SFX Audio System Types
 *
 * Hệ thống quản lý nhạc nền (BGM) và hiệu ứng âm thanh (SFX)
 * cho video sản xuất từ tiểu thuyết.
 */

// =====================================================
// Audio Track Types
// =====================================================

export type AudioTrackType = 'bgm' | 'sfx' | 'ambient' | 'voice'

export interface AudioTrack {
  id: string
  type: AudioTrackType
  name: string
  audioUrl: string
  duration: number           // seconds
  volume: number             // 0-1
  fadeInDuration: number     // seconds
  fadeOutDuration: number    // seconds
  loop: boolean
  startTime: number          // seconds from video start
  endTime: number            // seconds from video start (0 = auto)
  muted: boolean
}

// =====================================================
// BGM Types
// =====================================================

export type BGMGenre =
  | 'dramatic'
  | 'romantic'
  | 'action'
  | 'mysterious'
  | 'comedy'
  | 'sad'
  | 'epic'
  | 'calm'
  | 'horror'
  | 'fantasy'

export type BGMMood =
  | 'happy'
  | 'sad'
  | 'tense'
  | 'peaceful'
  | 'exciting'
  | 'melancholic'
  | 'dark'
  | 'uplifting'

export interface BGMTrack extends AudioTrack {
  type: 'bgm'
  genre: BGMGenre
  mood: BGMMood
  tempo: 'slow' | 'moderate' | 'fast'
  intensity: number         // 1-10
  linkedClipIds: string[]   // Clips this BGM applies to
}

export interface BGMGenerateRequest {
  projectId: string
  episodeId: string
  genre: BGMGenre
  mood: BGMMood
  tempo: 'slow' | 'moderate' | 'fast'
  duration: number           // seconds
  prompt?: string
  referenceUrl?: string
}

// =====================================================
// SFX Types
// =====================================================

export type SFXCategory =
  | 'nature'        // Rain, wind, thunder, birds
  | 'urban'         // Traffic, crowd, city ambiance
  | 'action'        // Explosion, sword, punch
  | 'emotion'       // Heartbeat, gasp, sigh
  | 'transition'    // Whoosh, ding, chime
  | 'environment'   // Door, footsteps, water
  | 'magic'         // Sparkle, power-up, spell
  | 'ui'            // Click, notification

export interface SFXTrack extends AudioTrack {
  type: 'sfx'
  category: SFXCategory
  linkedPanelId?: string    // Panel this SFX is attached to
  linkedPanelIndex?: number
  triggerTime: number       // seconds into the panel when SFX plays
}

export interface SFXGenerateRequest {
  projectId: string
  episodeId: string
  category: SFXCategory
  description: string
  duration: number          // seconds
  panelId?: string
  panelIndex?: number
}

// =====================================================
// Audio Mix State
// =====================================================

export interface AudioMixState {
  projectId: string
  episodeId: string
  masterVolume: number      // 0-1
  bgmTracks: BGMTrack[]
  sfxTracks: SFXTrack[]
  voiceTracks: AudioTrack[]
  ambientTracks: AudioTrack[]
  totalDuration: number
  updatedAt: number
}

export interface AudioMixAction {
  type:
    | 'ADD_TRACK'
    | 'REMOVE_TRACK'
    | 'UPDATE_TRACK'
    | 'REORDER_TRACKS'
    | 'SET_MASTER_VOLUME'
    | 'MUTE_TRACK'
    | 'UNMUTE_TRACK'
    | 'SOLO_TRACK'
  payload: Record<string, unknown>
}

// =====================================================
// Audio Library
// =====================================================

export interface AudioLibraryItem {
  id: string
  name: string
  type: AudioTrackType
  category?: SFXCategory
  genre?: BGMGenre
  mood?: BGMMood
  audioUrl: string
  duration: number
  tags: string[]
  isBuiltIn: boolean        // true = system library, false = user uploaded
  usageCount: number
  createdAt: number
}

export interface AudioLibraryFilter {
  type?: AudioTrackType
  category?: SFXCategory
  genre?: BGMGenre
  mood?: BGMMood
  search?: string
  builtInOnly?: boolean
}
