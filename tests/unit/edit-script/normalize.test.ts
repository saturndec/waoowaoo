import { describe, expect, it } from 'vitest'
import {
  finalizeEditScriptBriefQuestions,
  normalizeEditAssetRequirements,
  normalizeEditScriptBriefQuestions,
  normalizeEditScriptCore,
  resolveEditScriptDefaults,
} from '@/lib/edit-script/normalize'

describe('edit script normalization', () => {
  it('accepts only the three edit-first brief question categories', () => {
    expect(normalizeEditScriptBriefQuestions({
      questions: [
        {
          id: 'visual_style',
          label: '这条视频需要哪种画风？',
          options: [
            { id: 'A', label: '漫画风' },
            { id: 'B', label: '精致国漫' },
            { id: 'C', label: '日系动漫风' },
            { id: 'D', label: '真人风格' },
          ],
        },
        {
          id: 'duration',
          label: '这条视频需要多长？',
          options: [
            { id: 'A', label: '15秒' },
            { id: 'B', label: '30秒' },
            { id: 'C', label: '60秒' },
          ],
        },
      ],
    })).toEqual({
      questions: [
        {
          id: 'visual_style',
          label: '这条视频需要哪种画风？',
          options: [
            { id: 'A', label: '漫画风' },
            { id: 'B', label: '精致国漫' },
            { id: 'C', label: '日系动漫风' },
            { id: 'D', label: '真人风格' },
          ],
        },
        {
          id: 'duration',
          label: '这条视频需要多长？',
          options: [
            { id: 'A', label: '15秒' },
            { id: 'B', label: '30秒' },
            { id: 'C', label: '60秒' },
          ],
        },
      ],
    })
  })

  it('rejects AI generated brief questions with invalid option order', () => {
    expect(() => normalizeEditScriptBriefQuestions({
      questions: [
        {
          id: 'duration',
          label: '这条视频需要多长？',
          options: [
            { id: 'A', label: '15秒' },
            { id: 'C', label: '60秒' },
            { id: 'B', label: '30秒' },
          ],
        },
      ],
    })).toThrow('EDIT_SCRIPT_BRIEF_OPTION_ORDER')
  })

  it('rejects unsupported brief question categories', () => {
    expect(() => normalizeEditScriptBriefQuestions({
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
      ],
    })).toThrow('EDIT_SCRIPT_BRIEF_UNSUPPORTED_QUESTION:visual_direction')
  })

  it('keeps only missing visual style, aspect ratio, and duration questions', () => {
    const payload = finalizeEditScriptBriefQuestions(normalizeEditScriptBriefQuestions({
      questions: [
        {
          id: 'visual_style',
          label: '画风？',
          options: [
            { id: 'A', label: 'wrong one' },
            { id: 'B', label: 'wrong two' },
            { id: 'C', label: 'wrong three' },
            { id: 'D', label: 'wrong four' },
          ],
        },
        {
          id: 'aspect_ratio',
          label: '画幅？',
          options: [
            { id: 'A', label: '9:16' },
            { id: 'B', label: '16:9' },
            { id: 'C', label: '21:9' },
          ],
        },
        {
          id: 'duration',
          label: '时长？',
          options: [
            { id: 'A', label: '15秒' },
            { id: 'B', label: '30秒' },
            { id: 'C', label: '60秒' },
          ],
        },
      ],
    }), 'zh', '生成一个30秒视频')

    expect(payload.questions).toEqual([
      {
        id: 'visual_style',
        label: '这条视频需要哪种画风？',
        options: [
          { id: 'A', label: '漫画风' },
          { id: 'B', label: '精致国漫' },
          { id: 'C', label: '日系动漫风' },
          { id: 'D', label: '真人风格' },
        ],
      },
      {
        id: 'aspect_ratio',
        label: '这条视频需要哪种画幅比例？',
        options: [
          { id: 'A', label: '9:16 竖屏短视频' },
          { id: 'B', label: '16:9 横屏视频' },
          { id: 'C', label: '21:9 电影宽银幕' },
        ],
      },
    ])
  })

  it('returns no brief questions when the user already states all three basics', () => {
    const payload = finalizeEditScriptBriefQuestions(normalizeEditScriptBriefQuestions({
      questions: [
        {
          id: 'visual_style',
          label: '画风？',
          options: [
            { id: 'A', label: '漫画风' },
            { id: 'B', label: '精致国漫' },
            { id: 'C', label: '日系动漫风' },
            { id: 'D', label: '真人风格' },
          ],
        },
        {
          id: 'aspect_ratio',
          label: '画幅？',
          options: [
            { id: 'A', label: '9:16' },
            { id: 'B', label: '16:9' },
            { id: 'C', label: '21:9' },
          ],
        },
        {
          id: 'duration',
          label: '时长？',
          options: [
            { id: 'A', label: '15秒' },
            { id: 'B', label: '30秒' },
            { id: 'C', label: '60秒' },
          ],
        },
      ],
    }), 'zh', '生成一个30秒9:16真人风格视频')

    expect(payload.questions).toEqual([])
  })

  it('deduplicates brief-agent aspect ratio questions and keeps the local copy first', () => {
    const payload = finalizeEditScriptBriefQuestions(normalizeEditScriptBriefQuestions({
      questions: [
        {
          id: 'aspect_ratio',
          label: '画幅？',
          options: [
            { id: 'A', label: '9:16' },
            { id: 'B', label: '16:9' },
            { id: 'C', label: '21:9' },
          ],
        },
      ],
    }), 'en', 'realistic 30 seconds')

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
      videoBlocks: [
        { type: 'group', shotNumbers: [1, 2], gridMode: '2x2', reason: 'continuous corridor movement', prompt: 'final continuous corridor prompt' },
      ],
    })

    expect(normalized.shotCount).toBe(2)
    expect(normalized.durationSec).toBe(9)
    expect(normalized.videoBlocks).toEqual([
      { kind: 'group', shotNumbers: [1, 2], gridMode: '2x2', reason: 'continuous corridor movement', prompt: 'final continuous corridor prompt' },
    ])
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
      videoBlocks: [
        { type: 'group', shotNumbers: [1, 3], gridMode: '2x2', reason: 'invalid gap should fail earlier', prompt: 'invalid gap prompt' },
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
      videoBlocks: [
        { type: 'single', shotNumbers: [1], reason: 'single long shot', prompt: 'single long prompt' },
      ],
    })).toThrow()
  })

  it('rejects videoBlocks whose grouped duration exceeds Seedance 2.0 limit', () => {
    expect(() => normalizeEditScriptCore({
      title: 'Too Long Group',
      durationSec: 17,
      shots: [
        {
          shotNumber: 1,
          durationSec: 5,
          visualAction: 'First move.',
          charactersAndScene: 'A / Room',
          camera: 'wide',
          videoPrompt: 'first',
          sound: 'tone',
        },
        {
          shotNumber: 2,
          durationSec: 4,
          visualAction: 'Second move.',
          charactersAndScene: 'A / Room',
          camera: 'wide',
          videoPrompt: 'second',
          sound: 'tone',
        },
        {
          shotNumber: 3,
          durationSec: 3,
          visualAction: 'Third move.',
          charactersAndScene: 'A / Room',
          camera: 'wide',
          videoPrompt: 'third',
          sound: 'tone',
        },
        {
          shotNumber: 4,
          durationSec: 5,
          visualAction: 'Fourth move.',
          charactersAndScene: 'A / Room',
          camera: 'wide',
          videoPrompt: 'fourth',
          sound: 'tone',
        },
      ],
      videoBlocks: [
        { type: 'group', shotNumbers: [1, 2, 3, 4], gridMode: '2x2', reason: 'too long for one Seedance segment', prompt: 'too long group prompt' },
      ],
    })).toThrow('VIDEO_BLOCK_PLAN_GROUP_DURATION_UNSUPPORTED:17')
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
      videoBlocks: [
        { type: 'group', shotNumbers: [1, 2], gridMode: '2x2', reason: 'shared dock motion', prompt: 'shared dock prompt' },
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
