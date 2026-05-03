import { mapWithConcurrency } from '@/lib/async/map-with-concurrency'
import type {
  ActingDirection,
  PhotographyRule,
  StoryboardPanel,
} from '@/lib/storyboard-phases'
import { buildClipContext, buildProjectContext } from '@skills/project-workflow/_shared/script-to-storyboard-runtime'
import { executeGenerateVoiceLines } from '@skills/project-workflow/generate-voice-lines/execute'
import { executePlanStoryboardPhase1 } from '@skills/project-workflow/plan-storyboard-phase1/execute'
import { executeRefineActing } from '@skills/project-workflow/refine-acting/execute'
import { executeRefineCinematography } from '@skills/project-workflow/refine-cinematography/execute'
import { executeRefineStoryboardDetail } from '@skills/project-workflow/refine-storyboard-detail/execute'
import type {
  ScriptToStoryboardWorkflowInput,
  ScriptToStoryboardWorkflowResult,
} from './types'

function toRecord<T>(source: Map<string, T>): Record<string, T> {
  const output: Record<string, T> = {}
  for (const [key, value] of source.entries()) {
    output[key] = value
  }
  return output
}

export async function runScriptToStoryboardSkillWorkflow(
  input: ScriptToStoryboardWorkflowInput,
): Promise<ScriptToStoryboardWorkflowResult> {
  if (!Array.isArray(input.clips) || input.clips.length === 0) {
    throw new Error('No clips found')
  }

  const concurrency = Math.max(1, Math.floor(input.concurrency || 1))
  const locale = input.locale || 'zh'
  const totalStepCount = input.clips.length * 4 + 1
  const project = buildProjectContext({
    characters: input.projectData.characters || [],
    locations: input.projectData.locations || [],
    props: input.projectData.props || [],
    directorStyleDoc: input.projectData.directorStyleDoc ?? null,
  })

  const clipContexts = input.clips.map((clip) => ({
    clip,
    clipContext: buildClipContext({
      clip,
      project,
      locale,
    }),
  }))

  const phase1PanelsByClipId = new Map<string, StoryboardPanel[]>()
  await mapWithConcurrency(
    clipContexts,
    concurrency,
    async ({ clip, clipContext }, index) => {
      const phase1Panels = await executePlanStoryboardPhase1({
        clipContext,
        project,
        locale,
        runStep: input.runStep,
        stepIndex: index + 1,
        stepTotal: totalStepCount,
      })
      phase1PanelsByClipId.set(clip.id, phase1Panels)
    },
  )

  const phase2CinematographyByClipId = new Map<string, PhotographyRule[]>()
  await mapWithConcurrency(
    clipContexts,
    concurrency,
    async ({ clip, clipContext }, index) => {
      const phase1Panels = phase1PanelsByClipId.get(clip.id)
      if (!phase1Panels) {
        throw new Error(`Missing phase 1 panels for clip ${clip.id}`)
      }
      const rules = await executeRefineCinematography({
        clipId: clip.id,
        phase1Panels,
        clipContext,
        project,
        locale,
        runStep: input.runStep,
        stepIndex: input.clips.length + index + 1,
        stepTotal: totalStepCount,
      })
      phase2CinematographyByClipId.set(clip.id, rules)
    },
  )

  const phase2ActingByClipId = new Map<string, ActingDirection[]>()
  await mapWithConcurrency(
    clipContexts,
    concurrency,
    async ({ clip, clipContext }, index) => {
      const phase1Panels = phase1PanelsByClipId.get(clip.id)
      if (!phase1Panels) {
        throw new Error(`Missing phase 1 panels for clip ${clip.id}`)
      }
      const directions = await executeRefineActing({
        clipId: clip.id,
        phase1Panels,
        clipContext,
        project,
        locale,
        runStep: input.runStep,
        stepIndex: input.clips.length * 2 + index + 1,
        stepTotal: totalStepCount,
      })
      phase2ActingByClipId.set(clip.id, directions)
    },
  )

  const clipPanels = await mapWithConcurrency(
    clipContexts,
    concurrency,
    async ({ clip, clipContext }, index) => {
      const phase1Panels = phase1PanelsByClipId.get(clip.id)
      const photographyRules = phase2CinematographyByClipId.get(clip.id)
      const actingDirections = phase2ActingByClipId.get(clip.id)
      if (!phase1Panels || !photographyRules || !actingDirections) {
        throw new Error(`Missing phase 2 inputs for clip ${clip.id}`)
      }
      const finalPanels = await executeRefineStoryboardDetail({
        clipId: clip.id,
        phase1Panels,
        clipContext,
        project,
        locale,
        runStep: input.runStep,
        stepIndex: input.clips.length * 3 + index + 1,
        stepTotal: totalStepCount,
        photographyRules,
        actingDirections,
      })
      return {
        clipId: clip.id,
        clipIndex: index + 1,
        finalPanels,
      }
    },
  )

  const phase3PanelsByClipId = new Map<string, StoryboardPanel[]>(
    clipPanels.map((item) => [item.clipId, item.finalPanels]),
  )
  const voiceLineRows = await executeGenerateVoiceLines({
    runStep: input.runStep,
    locale,
    novelText: input.novelText,
    project,
    clipPanels,
    stepIndex: totalStepCount,
    stepTotal: totalStepCount,
  })

  const totalPanelCount = clipPanels.reduce((sum, item) => sum + item.finalPanels.length, 0)

  return {
    clipPanels,
    phase1PanelsByClipId: toRecord(phase1PanelsByClipId),
    phase2CinematographyByClipId: toRecord(phase2CinematographyByClipId),
    phase2ActingByClipId: toRecord(phase2ActingByClipId),
    phase3PanelsByClipId: toRecord(phase3PanelsByClipId),
    voiceLineRows,
    summary: {
      clipCount: input.clips.length,
      totalPanelCount,
      totalStepCount,
    },
  }
}
