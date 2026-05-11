import { describe, expect, it } from 'vitest'
import {
  normalizeEditAssetRequirements,
  normalizeEditScriptBriefQuestions,
  normalizeEditScriptCore,
  resolveEditScriptDefaults,
  withRequiredAspectRatioBriefQuestion,
} from '@/lib/edit-script/normalize'

describe('edit script normalization', () => {
  it('accepts AI generated brief questions with exactly A/B/C options', () => {
    expect(normalizeEditScriptBriefQuestions({
      questions: [
        {
          id: 'visual_direction',
          label: '这条短片更偏向哪种视觉方向？',
          options: [
            { id: 'A', label: '冷峻对称' },
            { id: 'B', label: '神秘留白' },
            { id: 'C', label: '压迫推进' },
          ],
        },
        {
          id: 'ending_tone',
          label: '结尾更需要哪种余味？',
          options: [
            { id: 'A', label: '开放留白' },
            { id: 'B', label: '反转揭示' },
            { id: 'C', label: '冷峻收束' },
          ],
        },
      ],
    })).toEqual({
      questions: [
        {
          id: 'visual_direction',
          label: '这条短片更偏向哪种视觉方向？',
          options: [
            { id: 'A', label: '冷峻对称' },
            { id: 'B', label: '神秘留白' },
            { id: 'C', label: '压迫推进' },
          ],
        },
        {
          id: 'ending_tone',
          label: '结尾更需要哪种余味？',
          options: [
            { id: 'A', label: '开放留白' },
            { id: 'B', label: '反转揭示' },
            { id: 'C', label: '冷峻收束' },
          ],
        },
      ],
    })
  })

  it('rejects AI generated brief questions with invalid option order', () => {
    expect(() => normalizeEditScriptBriefQuestions({
      questions: [
        {
          id: 'visual_direction',
          label: '这条短片更偏向哪种视觉方向？',
          options: [
            { id: 'A', label: '冷峻对称' },
            { id: 'C', label: '压迫推进' },
            { id: 'B', label: '神秘留白' },
          ],
        },
        {
          id: 'ending_tone',
          label: '结尾更需要哪种余味？',
          options: [
            { id: 'A', label: '开放留白' },
            { id: 'B', label: '反转揭示' },
            { id: 'C', label: '冷峻收束' },
          ],
        },
      ],
    })).toThrow('EDIT_SCRIPT_BRIEF_OPTION_ORDER')
  })

  it('prepends required aspect ratio choices when the brief agent omits them', () => {
    const payload = withRequiredAspectRatioBriefQuestion(normalizeEditScriptBriefQuestions({
      questions: [
        {
          id: 'visual_direction',
          label: '这条短片更偏向哪种视觉方向？',
          options: [
            { id: 'A', label: '冷峻对称' },
            { id: 'B', label: '神秘留白' },
            { id: 'C', label: '压迫推进' },
          ],
        },
        {
          id: 'ending_tone',
          label: '结尾更需要哪种余味？',
          options: [
            { id: 'A', label: '开放留白' },
            { id: 'B', label: '反转揭示' },
            { id: 'C', label: '冷峻收束' },
          ],
        },
      ],
    }), 'zh')

    expect(payload.questions[0]).toEqual({
      id: 'aspect_ratio',
      label: '这条视频需要哪种画幅比例？',
      options: [
        { id: 'A', label: '9:16 竖屏短视频' },
        { id: 'B', label: '16:9 横屏视频' },
        { id: 'C', label: '21:9 电影宽银幕' },
      ],
    })
    expect(payload.questions).toHaveLength(3)
  })

  it('deduplicates brief-agent aspect ratio questions and keeps the local copy first', () => {
    const payload = withRequiredAspectRatioBriefQuestion(normalizeEditScriptBriefQuestions({
      questions: [
        {
          id: 'video_ratio',
          label: '画幅？',
          options: [
            { id: 'A', label: '9:16' },
            { id: 'B', label: '16:9' },
            { id: 'C', label: '21:9' },
          ],
        },
        {
          id: 'visual_direction',
          label: 'Visual style?',
          options: [
            { id: 'A', label: 'Clean' },
            { id: 'B', label: 'Mystery' },
            { id: 'C', label: 'Pressure' },
          ],
        },
      ],
    }), 'en')

    expect(payload.questions).toEqual([
      {
        id: 'aspect_ratio',
        label: 'Which aspect ratio should this video use?',
        options: [
          { id: 'A', label: '9:16 vertical short video' },
          { id: 'B', label: '16:9 horizontal video' },
          { id: 'C', label: '21:9 cinematic ultra-wide' },
        ],
      },
      {
        id: 'visual_direction',
        label: 'Visual style?',
        options: [
          { id: 'A', label: 'Clean' },
          { id: 'B', label: 'Mystery' },
          { id: 'C', label: 'Pressure' },
        ],
      },
    ])
  })

  it('keeps the minimum edit table fields and enforces continuous shot numbers', () => {
    const normalized = normalizeEditScriptCore({
      title: 'Orbital Silence',
      durationSec: 60,
      shots: [
        {
          shotNumber: 1,
          durationSec: 5,
          visualAction: 'A pilot crosses a white corridor.',
          charactersAndScene: 'Pilot / White Corridor',
          camera: 'locked wide shot, slow push in',
          videoPrompt: 'A pilot in a sterile white corridor, locked wide shot.',
          sound: 'low air-conditioning hum',
        },
        {
          shotNumber: 2,
          durationSec: 4,
          visualAction: 'The corridor opens to a red observation room.',
          charactersAndScene: 'Pilot / Red Observation Room',
          camera: 'centered medium shot, slow dolly',
          videoPrompt: 'A red observation room revealed with a centered dolly.',
          sound: 'sub-bass pulse',
        },
      ],
    })

    expect(normalized.shotCount).toBe(2)
    expect(normalized.durationSec).toBe(9)
    expect(normalized.shots[0]).toEqual({
      shotNumber: 1,
      durationSec: 5,
      visualAction: 'A pilot crosses a white corridor.',
      charactersAndScene: 'Pilot / White Corridor',
      camera: 'locked wide shot, slow push in',
      videoPrompt: 'A pilot in a sterile white corridor, locked wide shot.',
      sound: 'low air-conditioning hum',
    })
  })

  it('rejects gaps in shot numbering', () => {
    expect(() => normalizeEditScriptCore({
      title: 'Gap',
      durationSec: 60,
      shots: [
        {
          shotNumber: 1,
          durationSec: 4,
          visualAction: 'First.',
          charactersAndScene: 'A / Room',
          camera: 'wide',
          videoPrompt: 'first',
          sound: 'tone',
        },
        {
          shotNumber: 3,
          durationSec: 4,
          visualAction: 'Third.',
          charactersAndScene: 'A / Room',
          camera: 'wide',
          videoPrompt: 'third',
          sound: 'tone',
        },
      ],
    })).toThrow('EDIT_SCRIPT_SHOT_NUMBER_NOT_CONTINUOUS')
  })

  it('rejects edit-first shots longer than five seconds', () => {
    expect(() => normalizeEditScriptCore({
      title: 'Too Long',
      durationSec: 6,
      shots: [
        {
          shotNumber: 1,
          durationSec: 6,
          visualAction: 'One shot holds too long.',
          charactersAndScene: 'A / Room',
          camera: 'wide',
          videoPrompt: 'long shot',
          sound: 'tone',
        },
      ],
    })).toThrow()
  })

  it('extracts only character and location requirements linked to real shots', () => {
    const shots = normalizeEditScriptCore({
      title: 'Assets',
      durationSec: 16,
      shots: [
        {
          shotNumber: 1,
          durationSec: 4,
          visualAction: 'Pilot waits.',
          charactersAndScene: 'Pilot / Dock',
          camera: 'wide',
          videoPrompt: 'pilot at dock',
          sound: 'hum',
        },
        {
          shotNumber: 2,
          durationSec: 4,
          visualAction: 'Pilot enters.',
          charactersAndScene: 'Pilot / Dock',
          camera: 'medium',
          videoPrompt: 'pilot enters dock',
          sound: 'door',
        },
      ],
    }).shots

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

  it('defaults short-film requests to 60 seconds without prescribing shot count', () => {
    expect(resolveEditScriptDefaults('给我一个库布里克风格科幻短片')).toEqual({
      durationSeconds: 60,
    })
    expect(resolveEditScriptDefaults('给我一个一分钟科幻短片')).toEqual({
      durationSeconds: 60,
    })
  })
})
