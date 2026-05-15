import type {
  FinalRenderClipPlan,
  FinalRenderEditScriptInput,
  FinalRenderProjectContextInput,
} from '@/lib/video-compose/final-render-plan'
import { BGM_STEM_ROLES } from './types'

function safeJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? 'null'
}

function normalizeString(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

function buildEditScriptPayload(editScript: FinalRenderEditScriptInput | null): unknown {
  if (!editScript) return null
  return {
    id: editScript.id,
    title: editScript.title,
    logline: editScript.logline ?? null,
    durationSec: editScript.durationSec,
    shots: editScript.shots.map((shot) => ({
      shotNumber: shot.shotNumber,
      durationSec: shot.durationSec,
      visualAction: shot.visualAction,
      charactersAndScene: shot.charactersAndScene ?? '',
      camera: shot.camera,
      videoPrompt: shot.videoPrompt,
      sound: shot.sound,
    })),
    videoBlocks: editScript.videoBlocks.map((block, index) => ({
      blockNumber: index + 1,
      kind: block.kind,
      shotNumbers: block.shotNumbers,
      gridMode: block.gridMode ?? null,
      reason: block.reason,
      prompt: block.prompt,
    })),
  }
}

function buildProjectContextPayload(projectContext: FinalRenderProjectContextInput | null | undefined): unknown {
  if (!projectContext) return {}
  return {
    videoRatio: normalizeString(projectContext.videoRatio) || null,
    artStyle: normalizeString(projectContext.artStyle) || null,
    artStylePrompt: normalizeString(projectContext.artStylePrompt) || null,
    visualStylePresetSource: normalizeString(projectContext.visualStylePresetSource) || null,
    visualStylePresetId: normalizeString(projectContext.visualStylePresetId) || null,
    directorStylePresetSource: normalizeString(projectContext.directorStylePresetSource) || null,
    directorStylePresetId: normalizeString(projectContext.directorStylePresetId) || null,
    directorStyleDoc: normalizeString(projectContext.directorStyleDoc) || null,
  }
}

function buildTimelinePayload(clips: readonly FinalRenderClipPlan[]): unknown {
  return clips.map((clip) => ({
    order: clip.order,
    sourceKind: clip.sourceKind,
    panelId: clip.panelId,
    groupId: clip.groupId ?? null,
    shotNumber: clip.shotNumber,
    shotNumbers: clip.shotNumbers,
    durationSeconds: clip.durationSeconds,
    visualSummary: clip.description,
    videoSoundDirection: clip.sound,
  }))
}

export function buildBgmScorePlanPrompt(input: {
  readonly editScript: FinalRenderEditScriptInput | null
  readonly projectContext?: FinalRenderProjectContextInput | null
  readonly clips: readonly FinalRenderClipPlan[]
  readonly totalDurationSeconds: number
}): string {
  return [
    'You are a professional film composer designing only the continuous BGM score for an AI-generated video.',
    'The video model already produces dialogue, character sounds, environment sounds, and event sound effects. Do not design Foley, voice, ambience replacement, or literal sound effects.',
    'Your task is to create a structured multi-stem BGM plan. The final BGM must be continuous across the whole timeline, but internally split into isolated musical stems.',
    'Critical workflow: first design one shared Score Blueprint, then derive every stem from that same blueprint. Do not let each stem independently compose its own cue.',
    '',
    'Allowed stem roles:',
    '- atmosphere: continuous musical bed, drones, pads, long strings, air-like score texture.',
    '- low_end: sub, bass swells, low brass/strings, weight, danger, pressure.',
    '- harmony: chordal emotional direction, strings/brass/synth/piano harmonic color.',
    '- motif: sparse recognizable short theme or melodic identity.',
    '- music_transition: musical risers, crescendos, swells, cadences, score hits, rests tied to edit or emotion transitions.',
    'Do not use a pulse role. Rhythmic motion is only allowed as a restricted technique inside low_end, harmony, atmosphere, or music_transition when the blueprint explicitly allows it.',
    '',
    'Rules:',
    '1. Choose only necessary stems from the allowed roles. Use 2-3 stems by default; 1 is acceptable for minimal scenes; 4-5 only when strongly justified.',
    '2. Do not duplicate roles. Every stem must have a distinct musical function and reason.',
    '3. The Score Blueprint must define tempoMap, keyMap, chordMap, hitPoints, motif, orchestrationMap, and stemRules before stems.',
    '4. Every stem prompt must explicitly obey the same tempoMap, keyMap, chordMap, hitPoints, motif usage, orchestrationMap, and its own stemRules.',
    '5. Each stem prompt must ask for an isolated stem only, not a full soundtrack.',
    '6. Each stem prompt must leave room for video dialogue and native sound.',
    '7. Do not include vocals, lyrics, Foley, literal ambience, whoosh SFX, object sounds, footsteps, or dialogue.',
    '8. Return strict JSON only. No markdown, no comments, no prose outside JSON.',
    '',
    'Blueprint requirements:',
    '- tempoMap: BPM, time signature, downbeat, and bar ranges. Avoid vague words such as "fast" without BPM.',
    '- keyMap: tonal center and any modulation point.',
    '- chordMap: exact chord progression by time/bar ranges. This is the harmonic source of truth for all stems.',
    '- hitPoints: picture moments that need musical emphasis, rest, cadence, swell, or restraint.',
    '- motif: scale-degree and rhythm description such as "1-b3-5-4, long-short-short-long"; use null only if no theme should exist.',
    '- orchestrationMap: register, instruments, density, and frequency responsibilities by section.',
    '- stemRules: for each selected stem role, define allowedMaterial, forbiddenMaterial, register, rhythmicRule, and chordRule. These rules prevent stems from fighting each other.',
    '',
    'Required JSON shape:',
    safeJson({
      durationSeconds: input.totalDurationSeconds,
      global: {
        mood: 'string',
        genre: 'string',
        bpm: 72,
        key: 'D minor',
        intensityCurve: [{ timeSec: 0, intensity: 20 }],
      },
      blueprint: {
        tempoMap: [{
          startSec: 0,
          endSec: input.totalDurationSeconds,
          bpm: 72,
          timeSignature: '4/4',
          barStart: 1,
          barEnd: 18,
          downbeatSec: 0,
          feel: 'steady cinematic underscore, no independent groove',
        }],
        keyMap: [{
          startSec: 0,
          endSec: input.totalDurationSeconds,
          key: 'D minor',
          mode: 'natural minor with restrained modal color',
          function: 'single tonal center for all stems',
        }],
        chordMap: [{
          startSec: 0,
          endSec: input.totalDurationSeconds,
          bars: '1-18',
          chords: ['Dm', 'Bb', 'F', 'C'],
          harmonicRhythm: 'one chord every 2 bars',
        }],
        hitPoints: [{
          timeSec: 13,
          label: 'major visual transition',
          musicalAction: 'shared crescendo into restrained cadence, no literal whoosh',
        }],
        motif: {
          description: 'short unresolved discovery motif',
          scaleDegrees: '1-b3-5-4',
          rhythm: 'half, quarter, quarter, whole',
          usage: 'only motif stem plays this; other stems avoid melodic fragments',
        },
        orchestrationMap: [{
          startSec: 0,
          endSec: input.totalDurationSeconds,
          registerPlan: 'low_end below 120 Hz, harmony in low-mid, atmosphere high sustained air',
          instrumentation: 'sub strings, restrained synth pad, soft brass color',
          frequencyFocus: 'separate low, mid, high layers; avoid full-range stems',
          density: 30,
        }],
        stemRules: [{
          role: BGM_STEM_ROLES[0],
          allowedMaterial: 'sustained non-melodic tones from chordMap only',
          forbiddenMaterial: 'no independent chords, no melody, no percussion, no full arrangement',
          register: 'mid-high sustained texture',
          rhythmicRule: 'no rhythmic pulse; slow modulation only',
          chordRule: 'follow chordMap exactly without substitutions',
        }],
      },
      stems: [{
        role: BGM_STEM_ROLES[0],
        reason: 'string',
        startSec: 0,
        durationSec: input.totalDurationSeconds,
        gainDb: -10,
        fadeInSec: 1,
        fadeOutSec: 2,
        density: 20,
        tension: 40,
        brightness: 30,
        motion: 25,
        prompt: 'Generate an isolated cinematic atmosphere music stem only, not a full soundtrack. Follow the Score Blueprint exactly: tempoMap, keyMap, chordMap, hitPoints, orchestrationMap, and this role stemRules...',
        negativePrompt: 'no vocals, no lyrics, no dialogue, no foley, no literal sound effects, no full mix, no independent harmony, no off-grid rhythm',
      }],
    }),
    '',
    'Edit script JSON:',
    safeJson(buildEditScriptPayload(input.editScript)),
    '',
    'Project visual/director context JSON:',
    safeJson(buildProjectContextPayload(input.projectContext)),
    '',
    'Final rendered media timeline JSON:',
    safeJson(buildTimelinePayload(input.clips)),
  ].join('\n')
}
