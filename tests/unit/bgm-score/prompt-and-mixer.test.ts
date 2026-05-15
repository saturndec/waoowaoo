import { describe, expect, it } from 'vitest'
import { buildBgmScoreMixFilter } from '@/lib/bgm-score/mixer'
import { buildBgmScorePlanPrompt } from '@/lib/bgm-score/prompt'

describe('bgm score prompt and mixer', () => {
  it('builds a plan prompt with timeline context and stem constraints', () => {
    const prompt = buildBgmScorePlanPrompt({
      editScript: {
        id: 'edit-1',
        userPrompt: 'A suspense scene.',
        title: 'Suspense',
        logline: 'A character finds a clue.',
        durationSec: 12,
        shots: [{
          shotNumber: 1,
          durationSec: 12,
          visualAction: 'The detective enters the room.',
          charactersAndScene: 'Detective in a dark room',
          camera: 'Slow dolly',
          videoPrompt: 'Dark room investigation',
          sound: 'room tone and footsteps only, no BGM',
        }],
        videoBlocks: [{
          kind: 'single',
          shotNumbers: [1],
          reason: 'Single suspense shot.',
          prompt: 'Dark room investigation video.',
        }],
      },
      projectContext: { videoRatio: '16:9' },
      totalDurationSeconds: 12,
      clips: [{
        panelId: 'panel-1',
        groupId: null,
        sourceKind: 'panel',
        source: '/m/video.mp4',
        durationSeconds: 12,
        order: 1,
        shotNumber: 1,
        shotNumbers: [1],
        description: 'The detective enters the room.',
        sound: 'room tone and footsteps only, no BGM',
      }],
    })

    expect(prompt).toContain('Allowed stem roles')
    expect(prompt).toContain('isolated stem only')
    expect(prompt).toContain('Final rendered media timeline JSON')
    expect(prompt).toContain('The detective enters the room')
  })

  it('builds an ffmpeg filter with delay, fade, gain, amix, and loudnorm', () => {
    const filter = buildBgmScoreMixFilter({
      durationSeconds: 30,
      stems: [
        {
          inputPath: '/tmp/a.mp3',
          startSec: 0,
          durationSec: 30,
          gainDb: -12,
          fadeInSec: 1,
          fadeOutSec: 2,
        },
        {
          inputPath: '/tmp/b.mp3',
          startSec: 5,
          durationSec: 10,
          gainDb: -8,
          fadeInSec: 0.5,
          fadeOutSec: 1,
        },
      ],
    })

    expect(filter).toContain('afade=t=in:st=0:d=1.000')
    expect(filter).toContain('volume=-12.000dB')
    expect(filter).toContain('adelay=5000:all=1')
    expect(filter).toContain('amix=inputs=2')
    expect(filter).toContain('loudnorm=I=-16.000')
  })
})
