import { buildPreparedStoryContext, summarizeScreenplayResults } from '@skills/project-workflow/_shared/story-to-script-runtime'
import { executeAnalyzeCharacters } from '@skills/project-workflow/analyze-characters/execute'
import { executeAnalyzeLocations } from '@skills/project-workflow/analyze-locations/execute'
import { executeAnalyzeProps } from '@skills/project-workflow/analyze-props/execute'
import { executeGenerateScreenplay } from '@skills/project-workflow/generate-screenplay/execute'
import { executeSplitClips } from '@skills/project-workflow/split-clips/execute'
import type { StoryToScriptWorkflowInput, StoryToScriptWorkflowResult } from './types'

export async function runStoryToScriptSkillWorkflow(
  input: StoryToScriptWorkflowInput,
): Promise<StoryToScriptWorkflowResult> {
  const concurrency = Math.max(1, Math.floor(input.concurrency || 1))
  const locale = input.locale || 'zh'

  const characterResult = await executeAnalyzeCharacters({
    content: input.content,
    baseCharacters: input.baseCharacters,
    baseCharacterIntroductions: input.baseCharacterIntroductions,
    locale,
    directorStyleDoc: input.directorStyleDoc,
    runStep: input.runStep,
  })
  const locationResult = await executeAnalyzeLocations({
    content: input.content,
    baseLocations: input.baseLocations,
    locale,
    directorStyleDoc: input.directorStyleDoc,
    runStep: input.runStep,
  })
  const propResult = await executeAnalyzeProps({
    content: input.content,
    baseProps: input.baseProps || [],
    locale,
    directorStyleDoc: input.directorStyleDoc,
    runStep: input.runStep,
  })

  const prepared = buildPreparedStoryContext({
    characterResult,
    locationResult,
    propResult,
    baseCharacters: input.baseCharacters,
    baseLocations: input.baseLocations,
    baseProps: input.baseProps || [],
    baseCharacterIntroductions: input.baseCharacterIntroductions,
  })

  const { splitStep, clipList } = await executeSplitClips({
    content: input.content,
    locale,
    prepared,
    runStep: input.runStep,
  })

  const screenplayResults = await executeGenerateScreenplay({
    clipList,
    prepared,
    locale,
    runStep: input.runStep,
    concurrency,
    onStepError: input.onStepError,
  })
  const summary = summarizeScreenplayResults(screenplayResults)

  return {
    characterStep: characterResult.stepOutput,
    locationStep: locationResult.stepOutput,
    propStep: propResult.stepOutput,
    splitStep,
    charactersObject: prepared.charactersObject,
    locationsObject: prepared.locationsObject,
    propsObject: prepared.propsObject,
    analyzedCharacters: prepared.analyzedCharacters,
    analyzedLocations: prepared.analyzedLocations,
    analyzedProps: prepared.analyzedProps,
    charactersLibName: prepared.charactersLibName,
    locationsLibName: prepared.locationsLibName,
    propsLibName: prepared.propsLibName,
    charactersIntroduction: prepared.charactersIntroduction,
    clipList,
    screenplayResults,
    summary: {
      characterCount: prepared.analyzedCharacters.length,
      locationCount: prepared.analyzedLocations.length,
      propCount: prepared.analyzedProps.length,
      clipCount: clipList.length,
      screenplaySuccessCount: summary.screenplaySuccessCount,
      screenplayFailedCount: summary.screenplayFailedCount,
      totalScenes: summary.totalScenes,
    },
  }
}
