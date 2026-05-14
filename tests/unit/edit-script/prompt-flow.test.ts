import { describe, expect, it } from 'vitest'
import { AI_PROMPT_IDS, buildAiPrompt } from '@/lib/ai-prompts'

describe('edit script block-first prompt flow', () => {
  it('builds block-first audio and primary prompts without a per-shot video prompt input', () => {
    const cameraJson = JSON.stringify({
      videoBlocks: [
        {
          blockNumber: 1,
          type: 'group',
          shotNumbers: [1, 2],
          shots: [
            { shotNumber: 1, camera: 'wide shot, slow push in' },
            { shotNumber: 2, camera: 'medium shot, same-direction track' },
          ],
        },
      ],
    })

    const audioPrompt = buildAiPrompt({
      promptId: AI_PROMPT_IDS.EDIT_SCRIPT_AUDIO,
      locale: 'zh',
      variables: {
        user_request: '生成一条连续短片',
        camera_json: cameraJson,
      },
    })

    expect(audioPrompt).toContain('block-first 镜头方式 JSON')
    expect(audioPrompt).toContain(cameraJson)
    expect(audioPrompt).not.toContain('video_prompt_json')

    const primaryPrompt = buildAiPrompt({
      promptId: AI_PROMPT_IDS.EDIT_SCRIPT_PRIMARY,
      locale: 'zh',
      variables: {
        user_request: '生成一条连续短片',
        duration_seconds: '8',
        aspect_ratio: '9:16',
        style_context: 'cinematic',
        timeline_json: JSON.stringify({
          videoBlocks: [
            {
              blockNumber: 1,
              type: 'group',
              shotNumbers: [1, 2],
              gridMode: '2x2',
              durationSec: 8,
              shots: [
                { shotNumber: 1, durationSec: 4, beat: '建立空间' },
                { shotNumber: 2, durationSec: 4, beat: '动作延续' },
              ],
            },
          ],
        }),
        visual_action_json: JSON.stringify({
          videoBlocks: [
            {
              blockNumber: 1,
              type: 'group',
              shotNumbers: [1, 2],
              shots: [
                { shotNumber: 1, visualAction: '人物走入光线', charactersAndScene: '人物 / 房间' },
                { shotNumber: 2, visualAction: '人物顺着光线继续前行', charactersAndScene: '人物 / 房间' },
              ],
            },
          ],
        }),
        camera_json: cameraJson,
        audio_json: JSON.stringify({
          videoBlocks: [
            {
              blockNumber: 1,
              type: 'group',
              shotNumbers: [1, 2],
              shots: [
                { shotNumber: 1, sound: '低频环境声' },
                { shotNumber: 2, sound: '环境声延续' },
              ],
            },
          ],
        }),
      },
    })

    expect(primaryPrompt).toContain('videoBlocks 是视频生成主结构')
    expect(primaryPrompt).toContain('videoBlocks[].prompt 是后续直接发给视频模型的最终提示词')
    expect(primaryPrompt).toContain('不得机械拼接 shots[].videoPrompt')
    expect(primaryPrompt).not.toContain('video_prompt_json')
  })
})
