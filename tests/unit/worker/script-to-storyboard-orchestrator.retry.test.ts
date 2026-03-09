import { afterEach, describe, expect, it, vi } from 'vitest'
import { runScriptToStoryboardOrchestrator } from '@/lib/novel-promotion/script-to-storyboard/orchestrator'

describe('script-to-storyboard orchestrator retry', () => {
  afterEach(() => {
    delete process.env.NP_SCRIPT_TO_STORYBOARD_CONCURRENCY
  })

  it('retries retryable step failures up to 3 attempts', async () => {
    const attemptsByAction = new Map<string, number>()
    const phase1Metas: Array<{ stepId: string; stepAttempt?: number }> = []
    const runStep = vi.fn(async (meta, _prompt, action: string) => {
      attemptsByAction.set(action, (attemptsByAction.get(action) || 0) + 1)

      if (action === 'storyboard_phase1_plan') {
        phase1Metas.push({ stepId: meta.stepId, stepAttempt: meta.stepAttempt })
        const attempt = attemptsByAction.get(action) || 0
        if (attempt < 3) {
          throw new TypeError('terminated')
        }
        return {
          text: JSON.stringify([{ panel_number: 1, description: '镜头', location: '场景A', source_text: '原文', characters: [] }]),
          reasoning: '',
        }
      }

      if (action === 'storyboard_phase2_cinematography') {
        return { text: JSON.stringify([{ panel_number: 1, composition: '居中' }]), reasoning: '' }
      }
      if (action === 'storyboard_phase2_acting') {
        return { text: JSON.stringify([{ panel_number: 1, characters: [] }]), reasoning: '' }
      }
      return {
        text: JSON.stringify([{ panel_number: 1, description: '镜头', location: '场景A', source_text: '原文', characters: [] }]),
        reasoning: '',
      }
    })

    const result = await runScriptToStoryboardOrchestrator({
      clips: [
        {
          id: 'clip-1',
          content: '文本',
          characters: JSON.stringify([{ name: '角色A' }]),
          location: '场景A',
          screenplay: null,
        },
      ],
      novelPromotionData: {
        characters: [{ name: '角色A', appearances: [] }],
        locations: [{ name: '场景A', images: [] }],
      },
      promptTemplates: {
        phase1PlanTemplate: '{clip_content} {clip_json} {characters_lib_name} {locations_lib_name} {characters_introduction} {characters_appearance_list} {characters_full_description}',
        phase2CinematographyTemplate: '{panels_json} {panel_count} {locations_description} {characters_info}',
        phase2ActingTemplate: '{panels_json} {panel_count} {characters_info}',
        phase3DetailTemplate: '{panels_json} {characters_age_gender} {locations_description}',
      },
      runStep,
    })

    expect(result.summary.clipCount).toBe(1)
    expect(runStep).toHaveBeenCalled()
    expect(attemptsByAction.get('storyboard_phase1_plan')).toBe(3)
    expect(phase1Metas).toEqual([
      { stepId: 'clip_clip-1_phase1', stepAttempt: undefined },
      { stepId: 'clip_clip-1_phase1', stepAttempt: 2 },
      { stepId: 'clip_clip-1_phase1', stepAttempt: 3 },
    ])
  })

  it('injects quick manga directive into clip content when enabled', async () => {
    const runStep = vi.fn(async (_meta, prompt, action: string) => {
      if (action === 'storyboard_phase1_plan') {
        expect(prompt).toContain('[QUICK_MANGA_ENTRY]')
      }

      if (action === 'storyboard_phase2_cinematography') {
        return { text: JSON.stringify([{ panel_number: 1, composition: '居中' }]), reasoning: '' }
      }
      if (action === 'storyboard_phase2_acting') {
        return { text: JSON.stringify([{ panel_number: 1, characters: [] }]), reasoning: '' }
      }
      return {
        text: JSON.stringify([{ panel_number: 1, description: '镜头', location: '场景A', source_text: '原文', characters: [] }]),
        reasoning: '',
      }
    })

    await runScriptToStoryboardOrchestrator({
      clips: [
        {
          id: 'clip-1',
          content: '文本',
          characters: JSON.stringify([{ name: '角色A' }]),
          location: '场景A',
          screenplay: null,
        },
      ],
      novelPromotionData: {
        characters: [{ name: '角色A', appearances: [] }],
        locations: [{ name: '场景A', images: [] }],
      },
      promptTemplates: {
        phase1PlanTemplate: '{clip_content} {clip_json} {characters_lib_name} {locations_lib_name} {characters_introduction} {characters_appearance_list} {characters_full_description}',
        phase2CinematographyTemplate: '{panels_json} {panel_count} {locations_description} {characters_info}',
        phase2ActingTemplate: '{panels_json} {panel_count} {characters_info}',
        phase3DetailTemplate: '{panels_json} {characters_age_gender} {locations_description}',
      },
      quickManga: {
        options: {
          enabled: true,
          preset: 'action-battle',
          layout: 'cinematic',
          colorMode: 'black-white',
        },
        style: 'manga ink',
      },
      runStep,
    })

    expect(runStep).toHaveBeenCalled()
  })

  it('does not retry non-retryable step failure', async () => {
    let callCount = 0
    const runStep = vi.fn(async () => {
      callCount += 1
      throw new Error('SENSITIVE_CONTENT: blocked')
    })

    await expect(
      runScriptToStoryboardOrchestrator({
        clips: [
          {
            id: 'clip-1',
            content: '文本',
            characters: JSON.stringify([{ name: '角色A' }]),
            location: '场景A',
            screenplay: null,
          },
        ],
        novelPromotionData: {
          characters: [{ name: '角色A', appearances: [] }],
          locations: [{ name: '场景A', images: [] }],
        },
        promptTemplates: {
          phase1PlanTemplate: '{clip_content} {clip_json} {characters_lib_name} {locations_lib_name} {characters_introduction} {characters_appearance_list} {characters_full_description}',
          phase2CinematographyTemplate: '{panels_json} {panel_count} {locations_description} {characters_info}',
          phase2ActingTemplate: '{panels_json} {panel_count} {characters_info}',
          phase3DetailTemplate: '{panels_json} {characters_age_gender} {locations_description}',
        },
        runStep,
      }),
    ).rejects.toThrow('SENSITIVE_CONTENT')

    expect(callCount).toBe(1)
  })
})
