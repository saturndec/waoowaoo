import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { chatCompletion, getCompletionContent } from '@/lib/llm-client'
import { getProjectModelConfig } from '@/lib/config-service'
import { withInternalLLMStreamCallbacks } from '@/lib/llm-observe/internal-stream-context'
import { buildCharactersIntroduction } from '@/lib/constants'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import { createWorkerLLMStreamCallbacks, createWorkerLLMStreamContext } from './llm-stream'
import type { TaskJobData } from '@/lib/task/types'
import {
  buildStoryboardJson,
  parseVoiceLinesJson,
  type VoiceLinePayload,
} from './voice-analyze-helpers'
import { buildPrompt, PROMPT_IDS } from '@/lib/prompt-i18n'

const MAX_VOICE_ANALYZE_ATTEMPTS = 2

export async function handleVoiceAnalyzeTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Record<string, unknown>
  const projectId = job.data.projectId
  const episodeIdRaw =
    typeof payload.episodeId === 'string'
      ? payload.episodeId
      : typeof job.data.episodeId === 'string'
        ? job.data.episodeId
        : ''
  const episodeId = episodeIdRaw.trim()

  if (!episodeId) {
    throw new Error('episodeId is required')
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      mode: true,
    },
  })
  if (!project) {
    throw new Error('Project not found')
  }
  if (project.mode !== 'novel-promotion') {
    throw new Error('Not a novel promotion project')
  }

  const novelPromotionData = await prisma.novelPromotionProject.findUnique({
    where: { projectId },
    include: {
      characters: true,
    },
  })
  if (!novelPromotionData) {
    throw new Error('Novel promotion data not found')
  }

  const episode = await prisma.novelPromotionEpisode.findUnique({
    where: { id: episodeId },
    include: {
      storyboards: {
        include: {
          clip: true,
          panels: {
            orderBy: { panelIndex: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!episode) {
    throw new Error('Episode not found')
  }
  if (episode.novelPromotionProjectId !== novelPromotionData.id) {
    throw new Error('Episode does not belong to this project')
  }

  const novelText = episode.novelText
  if (!novelText) {
    throw new Error('No novel text to analyze')
  }

  const projectModelConfig = await getProjectModelConfig(projectId, job.data.userId)
  const analysisModel = projectModelConfig.analysisModel
  if (!analysisModel) {
    throw new Error('analysisModel is not configured')
  }

  const charactersLibName = novelPromotionData.characters.length > 0
    ? novelPromotionData.characters.map((c) => c.name).join('、')
    : '无'
  const charactersIntroduction = buildCharactersIntroduction(novelPromotionData.characters)
  const storyboardJson = buildStoryboardJson(episode.storyboards || [])
  const promptTemplate = buildPrompt({
    promptId: PROMPT_IDS.NP_VOICE_ANALYSIS,
    locale: job.data.locale,
    variables: {
      input: novelText,
      characters_lib_name: charactersLibName,
      characters_introduction: charactersIntroduction,
      storyboard_json: storyboardJson,
    },
  })

  await reportTaskProgress(job, 20, {
    stage: 'voice_analyze_prepare',
    stageLabel: '准备台词分析参数',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'voice_analyze_prepare')

  const streamContext = createWorkerLLMStreamContext(job, 'voice_analyze')
  const streamCallbacks = createWorkerLLMStreamCallbacks(job, streamContext)
  const panelIdByStoryboardPanel = new Map<string, string>()
  for (const storyboard of episode.storyboards || []) {
    for (const panel of storyboard.panels || []) {
      panelIdByStoryboardPanel.set(`${storyboard.id}:${panel.panelIndex}`, panel.id)
    }
  }
  if (panelIdByStoryboardPanel.size === 0) {
    throw new Error('No storyboard panels found for voice matching')
  }

  type StrictVoiceLine = {
    lineIndex: number
    speaker: string
    content: string
    emotionStrength: number
    matchedPanelId: string | null
    matchedStoryboardId: string | null
    matchedPanelIndex: number | null
  }
  let voiceLinesData: StrictVoiceLine[] | null = null
  let lastAnalyzeError: Error | null = null

  try {
    for (let attempt = 1; attempt <= MAX_VOICE_ANALYZE_ATTEMPTS; attempt += 1) {
      try {
        const completion = await withInternalLLMStreamCallbacks(
          streamCallbacks,
          async () =>
            await chatCompletion(
              job.data.userId,
              analysisModel,
              [{ role: 'user', content: promptTemplate }],
              {
                projectId,
                action: 'voice_analyze',
                streamStepId: attempt === 1 ? 'voice_analyze' : `voice_analyze_retry_${attempt}`,
                streamStepTitle: '台词分析',
                streamStepIndex: 1,
                streamStepTotal: 1,
              },
            ),
        )

        const responseText = getCompletionContent(completion)
        if (!responseText) {
          throw new Error('No response from AI')
        }

        const parsedLines = parseVoiceLinesJson(responseText)
        const strictLines: StrictVoiceLine[] = parsedLines.map((lineData: VoiceLinePayload, index: number) => {
          if (typeof lineData.lineIndex !== 'number' || !Number.isFinite(lineData.lineIndex)) {
            throw new Error(`voice line ${index + 1} is missing valid lineIndex`)
          }
          const lineIndex = Math.floor(lineData.lineIndex)
          if (lineIndex <= 0) {
            throw new Error(`voice line ${index + 1} has invalid lineIndex`)
          }
          if (typeof lineData.speaker !== 'string' || !lineData.speaker.trim()) {
            throw new Error(`voice line ${index + 1} is missing valid speaker`)
          }
          if (typeof lineData.content !== 'string' || !lineData.content.trim()) {
            throw new Error(`voice line ${index + 1} is missing valid content`)
          }
          if (typeof lineData.emotionStrength !== 'number' || !Number.isFinite(lineData.emotionStrength)) {
            throw new Error(`voice line ${index + 1} is missing valid emotionStrength`)
          }

          const matchedPanel = lineData.matchedPanel
          if (!matchedPanel) {
            return {
              lineIndex,
              speaker: lineData.speaker.trim(),
              content: lineData.content,
              emotionStrength: Math.min(1, Math.max(0.1, lineData.emotionStrength)),
              matchedPanelId: null,
              matchedStoryboardId: null,
              matchedPanelIndex: null,
            }
          }

          const storyboardId = typeof matchedPanel.storyboardId === 'string' ? matchedPanel.storyboardId.trim() : ''
          const panelIndex = typeof matchedPanel.panelIndex === 'number' && Number.isFinite(matchedPanel.panelIndex)
            ? Math.floor(matchedPanel.panelIndex)
            : null
          if (!storyboardId || panelIndex === null || panelIndex < 0) {
            throw new Error(`voice line ${index + 1} has invalid matchedPanel`)
          }

          const panelKey = `${storyboardId}:${panelIndex}`
          const panelId = panelIdByStoryboardPanel.get(panelKey)
          if (!panelId) {
            throw new Error(`voice line ${index + 1} references non-existent panel ${panelKey}`)
          }

          return {
            lineIndex,
            speaker: lineData.speaker.trim(),
            content: lineData.content,
            emotionStrength: Math.min(1, Math.max(0.1, lineData.emotionStrength)),
            matchedPanelId: panelId,
            matchedStoryboardId: storyboardId,
            matchedPanelIndex: panelIndex,
          }
        })

        voiceLinesData = strictLines
        break
      } catch (error) {
        lastAnalyzeError = error instanceof Error ? error : new Error(String(error))
      }
    }
  } finally {
    await streamCallbacks.flush()
  }

  if (!voiceLinesData) {
    throw lastAnalyzeError || new Error('voice analyze failed')
  }

  await reportTaskProgress(job, 82, {
    stage: 'voice_analyze_persist',
    stageLabel: '保存台词分析结果',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'voice_analyze_persist')

  const createdVoiceLines = await prisma.$transaction(async (tx) => {
    await tx.novelPromotionVoiceLine.deleteMany({
      where: { episodeId },
    })

    const created: Array<{
      id: string
      speaker: string
      matchedStoryboardId: string | null
    }> = []

    for (let i = 0; i < voiceLinesData.length; i += 1) {
      const lineData = voiceLinesData[i]

      const voiceLine = await tx.novelPromotionVoiceLine.create({
        data: {
          episodeId,
          lineIndex: lineData.lineIndex,
          speaker: lineData.speaker,
          content: lineData.content,
          emotionStrength: lineData.emotionStrength,
          matchedPanelId: lineData.matchedPanelId,
          matchedStoryboardId: lineData.matchedStoryboardId,
          matchedPanelIndex: lineData.matchedPanelIndex,
        },
        select: {
          id: true,
          speaker: true,
          matchedStoryboardId: true,
        },
      })
      created.push(voiceLine)
    }

    return created
  })

  const speakerStats: Record<string, number> = {}
  for (const line of createdVoiceLines) {
    speakerStats[line.speaker] = (speakerStats[line.speaker] || 0) + 1
  }
  const matchedCount = createdVoiceLines.filter((line) => line.matchedStoryboardId).length

  await reportTaskProgress(job, 96, {
    stage: 'voice_analyze_persist_done',
    stageLabel: '台词分析结果已保存',
    displayMode: 'detail',
  })

  return {
    episodeId,
    count: createdVoiceLines.length,
    matchedCount,
    speakerStats,
  }
}
