import { describe, expect, it } from 'vitest'
import {
  normalizeEditAssetRequirements,
  normalizeEditScriptCore,
  resolveEditScriptDefaults,
} from '@/lib/edit-script/normalize'

describe('edit script normalization', () => {
  it('keeps the minimum edit table fields and enforces continuous shot numbers', () => {
    const normalized = normalizeEditScriptCore({
      title: 'Orbital Silence',
      durationSec: 60,
      shots: [
        {
          shotNumber: 1,
          durationSec: 8,
          visualAction: 'A pilot crosses a white corridor.',
          charactersAndScene: 'Pilot / White Corridor',
          camera: 'locked wide shot, slow push in',
          videoPrompt: 'A pilot in a sterile white corridor, locked wide shot.',
          sound: 'low air-conditioning hum',
          transition: 'hard cut',
        },
        {
          shotNumber: 2,
          durationSec: 7,
          visualAction: 'The corridor opens to a red observation room.',
          charactersAndScene: 'Pilot / Red Observation Room',
          camera: 'centered medium shot, slow dolly',
          videoPrompt: 'A red observation room revealed with a centered dolly.',
          sound: 'sub-bass pulse',
          transition: 'hard cut',
        },
      ],
    }, 2)

    expect(normalized.shotCount).toBe(2)
    expect(normalized.durationSec).toBe(15)
    expect(normalized.shots[0]).toEqual({
      shotNumber: 1,
      durationSec: 8,
      visualAction: 'A pilot crosses a white corridor.',
      charactersAndScene: 'Pilot / White Corridor',
      camera: 'locked wide shot, slow push in',
      videoPrompt: 'A pilot in a sterile white corridor, locked wide shot.',
      sound: 'low air-conditioning hum',
      transition: 'hard cut',
    })
  })

  it('rejects gaps in shot numbering', () => {
    expect(() => normalizeEditScriptCore({
      title: 'Gap',
      durationSec: 60,
      shots: [
        {
          shotNumber: 1,
          durationSec: 8,
          visualAction: 'First.',
          charactersAndScene: 'A / Room',
          camera: 'wide',
          videoPrompt: 'first',
          sound: 'tone',
          transition: 'hard cut',
        },
        {
          shotNumber: 3,
          durationSec: 8,
          visualAction: 'Third.',
          charactersAndScene: 'A / Room',
          camera: 'wide',
          videoPrompt: 'third',
          sound: 'tone',
          transition: 'hard cut',
        },
      ],
    }, 2)).toThrow('EDIT_SCRIPT_SHOT_NUMBER_NOT_CONTINUOUS')
  })

  it('extracts only character and location requirements linked to real shots', () => {
    const shots = normalizeEditScriptCore({
      title: 'Assets',
      durationSec: 16,
      shots: [
        {
          shotNumber: 1,
          durationSec: 8,
          visualAction: 'Pilot waits.',
          charactersAndScene: 'Pilot / Dock',
          camera: 'wide',
          videoPrompt: 'pilot at dock',
          sound: 'hum',
          transition: 'hard cut',
        },
        {
          shotNumber: 2,
          durationSec: 8,
          visualAction: 'Pilot enters.',
          charactersAndScene: 'Pilot / Dock',
          camera: 'medium',
          videoPrompt: 'pilot enters dock',
          sound: 'door',
          transition: 'hard cut',
        },
      ],
    }, 2).shots

    const assets = normalizeEditAssetRequirements({
      assets: [
        {
          kind: 'character',
          name: 'Pilot',
          description: 'A quiet astronaut in a minimal pressure suit.',
          shotNumbers: [2, 1, 2],
        },
        {
          kind: 'location',
          name: 'Dock',
          description: 'A sterile orbital docking bay with red warning light.',
          shotNumbers: [1, 3],
        },
      ],
    }, shots)

    expect(assets).toEqual([
      {
        kind: 'character',
        name: 'Pilot',
        description: 'A quiet astronaut in a minimal pressure suit.',
        shotNumbers: [1, 2],
        status: 'pending',
        targetId: null,
        errorMessage: null,
      },
      {
        kind: 'location',
        name: 'Dock',
        description: 'A sterile orbital docking bay with red warning light.',
        shotNumbers: [1],
        status: 'pending',
        targetId: null,
        errorMessage: null,
      },
    ])
  })

  it('defaults short-film requests to 60 seconds and 8 shots when no duration is specified', () => {
    expect(resolveEditScriptDefaults('给我一个库布里克风格科幻短片')).toEqual({
      durationSeconds: 60,
      shotCount: 8,
    })
    expect(resolveEditScriptDefaults('给我一个一分钟科幻短片')).toEqual({
      durationSeconds: 60,
      shotCount: 8,
    })
  })
})
