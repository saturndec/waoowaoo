import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { executeAiTextStep } from '@/lib/ai-runtime'
import { withInternalLLMStreamCallbacks } from '@/lib/llm-observe/internal-stream-context'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import { createWorkerLLMStreamCallbacks, createWorkerLLMStreamContext } from './llm-stream'
import type { TaskJobData } from '@/lib/task/types'
import {
  CHUNK_SIZE,
  chunkContent,
  parseAliases,
  readText,
  safeParseCharactersResponse,
  safeParseLocationsResponse,
  type CharacterBrief,
} from './analyze-global-parse'
import { buildAnalyzeGlobalPrompts, loadAnalyzeGlobalPromptTemplates } from './analyze-global-prompt'
import { createAnalyzeGlobalStats, persistAnalyzeGlobalChunk } from './analyze-global-persist'
import { resolveAnalysisModel } from './resolve-analysis-model'

export async function handleAnalyzeGlobalTask(job: Job<TaskJobData>) {
  const projectId = job.data.projectId
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

  const novelData = await prisma.novelPromotionProject.findUnique({
    where: { projectId },
    include: {
      characters: true,
      locations: true,
      episodes: {
        orderBy: { episodeNumber: 'asc' },
        select: {
          id: true,
          name: true,
          novelText: true,
        },
      },
    },
  })
  if (!novelData) {
    throw new Error('Novel promotion data not found')
  }

  const analysisModel = await resolveAnalysisModel({
    userId: job.data.userId,
    projectAnalysisModel: novelData.analysisModel,
  })

  let allContent = ''
  if (readText(novelData.globalAssetText).trim()) {
    allContent += `【全局设定】\n${readText(novelData.globalAssetText)}\n\n`
  }
  for (const ep of novelData.episodes) {
    const text = readText(ep.novelText)
    if (!text.trim()) continue
    allContent += `【${ep.name}】\n${text}\n\n`
  }
  if (!allContent.trim()) {
    throw new Error('没有可分析的内容，请先添加剧集或全局设定')
  }

  const chunks = chunkContent(allContent, CHUNK_SIZE)
  const templates = loadAnalyzeGlobalPromptTemplates(job.data.locale)
  const existingCharacters: CharacterBrief[] = novelData.characters.map((item) => ({
    id: item.id,
    name: item.name,
    aliases: parseAliases(item.aliases as string | null),
    introduction: readText((item as Record<string, unknown>).introduction),
  }))
  const existingCharacterNames = existingCharacters.flatMap((item) => [item.name, ...item.aliases])
  const existingLocationNames = novelData.locations.map((item) => item.name)
  const existingLocationInfo = novelData.locations.map((item) => {
    const summary = readText(item.summary)
    return summary ? `${item.name}(${summary})` : item.name
  })
  const stats = createAnalyzeGlobalStats(chunks.length)

  await reportTaskProgress(job, 10, {
    stage: 'analyze_global_prepare',
    stageLabel: '准备全局资产分析参数',
    displayMode: 'detail',
    message: `共 ${chunks.length} 个切片`,
  })
  await assertTaskActive(job, 'analyze_global_prepare')

  const streamContext = createWorkerLLMStreamContext(job, 'analyze_global')
  const streamCallbacks = createWorkerLLMStreamCallbacks(job, streamContext)

  try {
    for (let i = 0; i < chunks.length; i += 1) {
      await assertTaskActive(job, `analyze_global_chunk:${i + 1}`)
      const chunk = chunks[i]
      const progress = 15 + Math.min(60, Math.floor(((i + 1) / Math.max(1, chunks.length)) * 60))
      await reportTaskProgress(job, progress, {
        stage: 'analyze_global_chunk',
        stageLabel: '分析全局资产切片',
        displayMode: 'detail',
        message: `切片 ${i + 1}/${chunks.length}`,
        stepId: `analyze_global_chunk_${i + 1}`,
        stepTitle: `全局资产分析 ${i + 1}/${chunks.length}`,
        stepIndex: i + 1,
        stepTotal: chunks.length,
      })

      const { characterPrompt, locationPrompt } = buildAnalyzeGlobalPrompts({
        chunk,
        templates,
        existingCharacters,
        existingLocationInfo,
      })

      const [characterCompletion, locationCompletion] = await withInternalLLMStreamCallbacks(
        streamCallbacks,
        async () =>
          await Promise.all([
            executeAiTextStep({
              userId: job.data.userId,
              model: analysisModel,
              messages: [{ role: 'user', content: characterPrompt }],
              temperature: 0.7,
              projectId,
              action: 'analyze_global_characters',
              meta: {
                stepId: `analyze_global_characters_${i + 1}`,
                stepTitle: `角色分析 ${i + 1}/${chunks.length}`,
                stepIndex: i + 1,
                stepTotal: chunks.length,
              },
            }),
            executeAiTextStep({
              userId: job.data.userId,
              model: analysisModel,
              messages: [{ role: 'user', content: locationPrompt }],
              temperature: 0.7,
              projectId,
              action: 'analyze_global_locations',
              meta: {
                stepId: `analyze_global_locations_${i + 1}`,
                stepTitle: `场景分析 ${i + 1}/${chunks.length}`,
                stepIndex: i + 1,
                stepTotal: chunks.length,
              },
            }),
          ]),
      )

      const characterResponse = characterCompletion.text
      const locationResponse = locationCompletion.text
      const charactersData = safeParseCharactersResponse(characterResponse)
      const locationsData = safeParseLocationsResponse(locationResponse)

      await persistAnalyzeGlobalChunk({
        projectInternalId: novelData.id,
        charactersData,
        locationsData,
        existingCharacters,
        existingCharacterNames,
        existingLocationNames,
        existingLocationInfo,
        stats,
      })

      stats.processedChunks += 1
    }
  } finally {
    await streamCallbacks.flush()
  }

  await reportTaskProgress(job, 96, {
    stage: 'analyze_global_done',
    stageLabel: '全局资产分析完成',
    displayMode: 'detail',
  })

  return {
    success: true,
    stats: {
      totalChunks: stats.totalChunks,
      newCharacters: stats.newCharacters,
      updatedCharacters: stats.updatedCharacters,
      newLocations: stats.newLocations,
      skippedCharacters: stats.skippedCharacters,
      skippedLocations: stats.skippedLocations,
      totalCharacters: existingCharacterNames.length,
      totalLocations: existingLocationNames.length,
    },
  }
}
