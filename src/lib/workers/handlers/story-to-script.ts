import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { chatCompletion, getCompletionParts } from '@/lib/llm-client'
import { getProjectModelConfig, resolveProjectModelCapabilityGenerationOptions } from '@/lib/config-service'
import { withInternalLLMStreamCallbacks } from '@/lib/llm-observe/internal-stream-context'
import { logAIAnalysis } from '@/lib/logging/semantic'
import { onProjectNameAvailable } from '@/lib/logging/file-writer'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import {
  runStoryToScriptOrchestrator,
  type StoryToScriptStepMeta,
  type StoryToScriptStepOutput,
} from '@/lib/novel-promotion/story-to-script/orchestrator'
import { createWorkerLLMStreamCallbacks, createWorkerLLMStreamContext } from './llm-stream'
import type { TaskJobData } from '@/lib/task/types'
import {
  asString,
  type AnyObj,
  parseEffort,
  parseTemperature,
  persistAnalyzedCharacters,
  persistAnalyzedLocations,
  persistClips,
  resolveClipRecordId,
} from './story-to-script-helpers'
import { getPromptTemplate, PROMPT_IDS } from '@/lib/prompt-i18n'

function isReasoningEffort(value: unknown): value is 'minimal' | 'low' | 'medium' | 'high' {
  return value === 'minimal' || value === 'low' || value === 'medium' || value === 'high'
}

export async function handleStoryToScriptTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  const projectId = job.data.projectId
  const episodeIdRaw = asString(payload.episodeId || job.data.episodeId || '')
  const episodeId = episodeIdRaw.trim()
  const contentRaw = asString(payload.content)
  const inputModel = asString(payload.model).trim()
  const reasoning = payload.reasoning !== false
  const requestedReasoningEffort = parseEffort(payload.reasoningEffort)
  const temperature = parseTemperature(payload.temperature)

  if (!episodeId) {
    throw new Error('episodeId is required')
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      mode: true,
    },
  })
  if (!project) {
    throw new Error('Project not found')
  }
  if (project.mode !== 'novel-promotion') {
    throw new Error('Not a novel promotion project')
  }

  // Register project name for per-project log file routing
  onProjectNameAvailable(projectId, project.name)

  const novelData = await prisma.novelPromotionProject.findUnique({
    where: { projectId },
    include: {
      characters: true,
      locations: true,
    },
  })
  if (!novelData) {
    throw new Error('Novel promotion data not found')
  }

  const episode = await prisma.novelPromotionEpisode.findUnique({
    where: { id: episodeId },
    select: {
      id: true,
      novelPromotionProjectId: true,
      novelText: true,
    },
  })
  if (!episode || episode.novelPromotionProjectId !== novelData.id) {
    throw new Error('Episode not found')
  }

  const projectModelConfig = await getProjectModelConfig(projectId, job.data.userId)
  const model = inputModel || projectModelConfig.analysisModel || ''
  if (!model) {
    throw new Error('analysisModel is not configured')
  }
  const llmCapabilityOptions = await resolveProjectModelCapabilityGenerationOptions({
    projectId,
    userId: job.data.userId,
    modelType: 'llm',
    modelKey: model,
  })
  const capabilityReasoningEffort = llmCapabilityOptions.reasoningEffort
  const reasoningEffort = requestedReasoningEffort
    || (isReasoningEffort(capabilityReasoningEffort) ? capabilityReasoningEffort : 'high')

  const mergedContent = contentRaw.trim() || (episode.novelText || '')
  if (!mergedContent.trim()) {
    throw new Error('content is required')
  }
  const maxLength = 30000
  const content = mergedContent.length > maxLength ? mergedContent.slice(0, maxLength) : mergedContent

  await reportTaskProgress(job, 10, {
    stage: 'story_to_script_prepare',
    stageLabel: 'progress.stage.storyToScriptPrepare',
    displayMode: 'detail',
  })

  const characterPromptTemplate = getPromptTemplate(PROMPT_IDS.NP_AGENT_CHARACTER_PROFILE, job.data.locale)
  const locationPromptTemplate = getPromptTemplate(PROMPT_IDS.NP_SELECT_LOCATION, job.data.locale)
  const clipPromptTemplate = getPromptTemplate(PROMPT_IDS.NP_AGENT_CLIP, job.data.locale)
  const screenplayPromptTemplate = getPromptTemplate(PROMPT_IDS.NP_SCREENPLAY_CONVERSION, job.data.locale)

  const streamContext = createWorkerLLMStreamContext(job, 'story_to_script')
  const callbacks = createWorkerLLMStreamCallbacks(job, streamContext)

  const runStep = async (
    meta: StoryToScriptStepMeta,
    prompt: string,
    action: string,
    _maxOutputTokens: number,
  ): Promise<StoryToScriptStepOutput> => {
    void _maxOutputTokens
    await assertTaskActive(job, `story_to_script_step:${meta.stepId}`)
    const progress = 15 + Math.min(55, Math.floor((meta.stepIndex / Math.max(1, meta.stepTotal)) * 55))
    await reportTaskProgress(job, progress, {
      stage: 'story_to_script_step',
      stageLabel: 'progress.stage.storyToScriptStep',
      displayMode: 'detail',
      message: meta.stepTitle,
      stepId: meta.stepId,
      stepAttempt: meta.stepAttempt || 1,
      stepTitle: meta.stepTitle,
      stepIndex: meta.stepIndex,
      stepTotal: meta.stepTotal,
    })

    // Log prompt input
    logAIAnalysis(job.data.userId, 'worker', projectId, project.name, {
      action: `STORY_TO_SCRIPT_PROMPT:${action}`,
      input: { stepId: meta.stepId, stepTitle: meta.stepTitle, prompt },
      model,
    })

    const completion = await chatCompletion(
      job.data.userId,
      model,
      [{ role: 'user', content: prompt }],
      {
        temperature,
        reasoning,
        reasoningEffort,
        projectId,
        action,
        streamStepId: meta.stepId,
        streamStepAttempt: meta.stepAttempt || 1,
        streamStepTitle: meta.stepTitle,
        streamStepIndex: meta.stepIndex,
        streamStepTotal: meta.stepTotal,
      },
    )

    const parts = getCompletionParts(completion)

    // Log AI response output (full raw text included for debugging)
    logAIAnalysis(job.data.userId, 'worker', projectId, project.name, {
      action: `STORY_TO_SCRIPT_OUTPUT:${action}`,
      output: {
        stepId: meta.stepId,
        stepTitle: meta.stepTitle,
        rawText: parts.text,
        textLength: parts.text.length,
        reasoningLength: parts.reasoning.length,
      },
      model,
    })

    return {
      text: parts.text,
      reasoning: parts.reasoning,
    }
  }

  const result = await (async () => {
    try {
      return await withInternalLLMStreamCallbacks(
        callbacks,
        async () =>
          await runStoryToScriptOrchestrator({
            content,
            baseCharacters: (novelData.characters || []).map((item) => item.name),
            baseLocations: (novelData.locations || []).map((item) => item.name),
            baseCharacterIntroductions: (novelData.characters || []).map((item) => ({
              name: item.name,
              introduction: item.introduction || '',
            })),
            promptTemplates: {
              characterPromptTemplate,
              locationPromptTemplate,
              clipPromptTemplate,
              screenplayPromptTemplate,
            },
            runStep,
          }),
      )
    } finally {
      await callbacks.flush()
    }
  })()

  if (result.summary.screenplayFailedCount > 0) {
    const failed = result.screenplayResults.filter((item) => !item.success)
    const preview = failed
      .slice(0, 3)
      .map((item) => `${item.clipId}:${item.error || 'unknown error'}`)
      .join(' | ')
    throw new Error(
      `STORY_TO_SCRIPT_PARTIAL_FAILED: ${result.summary.screenplayFailedCount}/${result.summary.clipCount} screenplay steps failed. ${preview}`,
    )
  }

  await reportTaskProgress(job, 80, {
    stage: 'story_to_script_persist',
    stageLabel: 'progress.stage.storyToScriptPersist',
    displayMode: 'detail',
  })

  await assertTaskActive(job, 'story_to_script_persist')

  // Re-verify episode still exists before persisting — it may have been deleted
  // while AI steps were running, which would cause a Prisma foreign key error.
  const episodeStillExists = await prisma.novelPromotionEpisode.findUnique({
    where: { id: episodeId },
    select: { id: true },
  })
  if (!episodeStillExists) {
    throw new Error(`NOT_FOUND: Episode ${episodeId} was deleted while the task was running`)
  }

  const existingCharacterNames = new Set<string>(
    (novelData.characters || []).map((item) => String(item.name || '').toLowerCase()),
  )
  const existingLocationNames = new Set<string>(
    (novelData.locations || []).map((item) => String(item.name || '').toLowerCase()),
  )

  const createdCharacters = await persistAnalyzedCharacters({
    projectInternalId: novelData.id,
    existingNames: existingCharacterNames,
    analyzedCharacters: result.analyzedCharacters,
  })

  const createdLocations = await persistAnalyzedLocations({
    projectInternalId: novelData.id,
    existingNames: existingLocationNames,
    analyzedLocations: result.analyzedLocations,
  })

  const createdClipRows = await persistClips({
    episodeId,
    clipList: result.clipList,
  })
  const clipIdMap = new Map(createdClipRows.map((item) => [item.clipKey, item.id]))

  for (const screenplayResult of result.screenplayResults) {
    if (!screenplayResult.success || !screenplayResult.screenplay) continue
    const clipRecordId = resolveClipRecordId(clipIdMap, screenplayResult.clipId)
    if (!clipRecordId) continue
    await prisma.novelPromotionClip.update({
      where: { id: clipRecordId },
      data: {
        screenplay: JSON.stringify(screenplayResult.screenplay),
      },
    })
  }

  await reportTaskProgress(job, 96, {
    stage: 'story_to_script_persist_done',
    stageLabel: 'progress.stage.storyToScriptPersistDone',
    displayMode: 'detail',
  })

  return {
    episodeId,
    clipCount: result.summary.clipCount,
    screenplaySuccessCount: result.summary.screenplaySuccessCount,
    screenplayFailedCount: result.summary.screenplayFailedCount,
    persistedCharacters: createdCharacters.length,
    persistedLocations: createdLocations.length,
    persistedClips: createdClipRows.length,
  }
}
