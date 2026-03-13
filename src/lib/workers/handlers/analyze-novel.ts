import type { Job } from 'bullmq'
import { safeParseJsonObject } from '@/lib/json-repair'
import { prisma } from '@/lib/prisma'
import { executeAiTextStep } from '@/lib/ai-runtime'
import { withInternalLLMStreamCallbacks } from '@/lib/llm-observe/internal-stream-context'
import { getArtStylePrompt, removeLocationPromptSuffix } from '@/lib/constants'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import { createWorkerLLMStreamCallbacks, createWorkerLLMStreamContext } from './llm-stream'
import type { TaskJobData } from '@/lib/task/types'
import { buildPrompt, PROMPT_IDS } from '@/lib/prompt-i18n'
import { resolveAnalysisModel } from './resolve-analysis-model'

function readText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

/** 按别名匹配：按 '/' 拆分后任一别名精确匹配即为命中 */
function nameMatchesWithAlias(existingName: string, newName: string): boolean {
  const a = existingName.toLowerCase().trim()
  const b = newName.toLowerCase().trim()
  if (a === b) return true
  const aliasesA = a.split('/').map(s => s.trim()).filter(Boolean)
  const aliasesB = b.split('/').map(s => s.trim()).filter(Boolean)
  return aliasesB.some(alias => aliasesA.includes(alias))
}

function parseJsonResponse(responseText: string): Record<string, unknown> {
  return safeParseJsonObject(responseText)
}

export async function handleAnalyzeNovelTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Record<string, unknown>
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
    },
  })
  if (!novelData) {
    throw new Error('Novel promotion data not found')
  }
  const analysisModel = await resolveAnalysisModel({
    userId: job.data.userId,
    inputModel: payload.model,
    projectAnalysisModel: novelData.analysisModel,
  })

  const firstEpisode = await prisma.novelPromotionEpisode.findFirst({
    where: { novelPromotionProjectId: novelData.id },
    orderBy: { createdAt: 'asc' },
    select: {
      novelText: true,
    },
  })

  let contentToAnalyze = readText(novelData.globalAssetText) || readText(firstEpisode?.novelText)
  if (!contentToAnalyze.trim()) {
    throw new Error('请先填写全局资产设定或剧本内容')
  }

  const maxContentLength = 30000
  if (contentToAnalyze.length > maxContentLength) {
    contentToAnalyze = contentToAnalyze.substring(0, maxContentLength)
  }

  const charactersLibName = (novelData.characters || []).map((item) => item.name).join(', ')
  const locationsLibName = (novelData.locations || []).map((item) => item.name).join(', ')
  const characterPromptTemplate = buildPrompt({
    promptId: PROMPT_IDS.NP_AGENT_CHARACTER_PROFILE,
    locale: job.data.locale,
    variables: {
      input: contentToAnalyze,
      characters_lib_info: charactersLibName || '无',
    },
  })
  const locationPromptTemplate = buildPrompt({
    promptId: PROMPT_IDS.NP_SELECT_LOCATION,
    locale: job.data.locale,
    variables: {
      input: contentToAnalyze,
      locations_lib_name: locationsLibName || '无',
    },
  })

  await reportTaskProgress(job, 20, {
    stage: 'analyze_novel_prepare',
    stageLabel: '准备资产分析参数',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'analyze_novel_prepare')

  const streamContext = createWorkerLLMStreamContext(job, 'analyze_novel')
  const streamCallbacks = createWorkerLLMStreamCallbacks(job, streamContext)
  const [characterCompletion, locationCompletion] = await (async () => {
    try {
      return await withInternalLLMStreamCallbacks(
        streamCallbacks,
        async () =>
          await Promise.all([
            executeAiTextStep({
              userId: job.data.userId,
              model: analysisModel,
              messages: [{ role: 'user', content: characterPromptTemplate }],
              temperature: 0.7,
              projectId,
              action: 'analyze_characters',
              meta: {
                stepId: 'analyze_characters',
                stepTitle: '角色分析',
                stepIndex: 1,
                stepTotal: 2,
              },
            }),
            executeAiTextStep({
              userId: job.data.userId,
              model: analysisModel,
              messages: [{ role: 'user', content: locationPromptTemplate }],
              temperature: 0.7,
              projectId,
              action: 'analyze_locations',
              meta: {
                stepId: 'analyze_locations',
                stepTitle: '场景分析',
                stepIndex: 2,
                stepTotal: 2,
              },
            }),
          ]),
      )
    } finally {
      await streamCallbacks.flush()
    }
  })()

  const characterResponseText = characterCompletion.text
  const locationResponseText = locationCompletion.text

  await reportTaskProgress(job, 60, {
    stage: 'analyze_novel_characters_done',
    stageLabel: '角色分析完成',
    displayMode: 'detail',
    stepId: 'analyze_characters',
    stepTitle: '角色分析',
    stepIndex: 1,
    stepTotal: 2,
    done: true,
    output: characterResponseText,
  })

  await reportTaskProgress(job, 70, {
    stage: 'analyze_novel_locations_done',
    stageLabel: '场景分析完成',
    displayMode: 'detail',
    stepId: 'analyze_locations',
    stepTitle: '场景分析',
    stepIndex: 2,
    stepTotal: 2,
    done: true,
    output: locationResponseText,
  })

  const charactersData = parseJsonResponse(characterResponseText)
  const locationsData = parseJsonResponse(locationResponseText)
  const parsedCharacters = Array.isArray(charactersData.characters)
    ? (charactersData.characters as Array<Record<string, unknown>>)
    : []
  const parsedLocations = Array.isArray(locationsData.locations)
    ? (locationsData.locations as Array<Record<string, unknown>>)
    : []

  await reportTaskProgress(job, 75, {
    stage: 'analyze_novel_persist',
    stageLabel: '保存资产分析结果',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'analyze_novel_persist')

  const charactersToCreate: Parameters<typeof prisma.novelPromotionCharacter.createMany>[0]['data'] = []
  for (const item of parsedCharacters) {
    const name = readText(item.name).trim()
    if (!name) continue

    const existsInLibrary = (novelData.characters || []).some(
      (character) => nameMatchesWithAlias(character.name, name),
    )
    if (existsInLibrary) continue

    const profileData = {
      role_level: item.role_level,
      archetype: item.archetype,
      personality_tags: toStringArray(item.personality_tags),
      era_period: item.era_period,
      social_class: item.social_class,
      occupation: item.occupation,
      costume_tier: item.costume_tier,
      suggested_colors: toStringArray(item.suggested_colors),
      primary_identifier: item.primary_identifier,
      visual_keywords: toStringArray(item.visual_keywords),
      gender: item.gender,
      age_range: item.age_range,
    }

    charactersToCreate.push({
      novelPromotionProjectId: novelData.id,
      name,
      aliases: JSON.stringify(toStringArray(item.aliases)),
      profileData: JSON.stringify(profileData),
      profileConfirmed: false,
    })
  }

  const createdCharacters: Array<{ id: string }> = []
  if (charactersToCreate.length > 0) {
    await prisma.novelPromotionCharacter.createMany({
      data: charactersToCreate,
    })
    const names = (charactersToCreate as any[]).map(c => c.name)
    const created = await prisma.novelPromotionCharacter.findMany({
      where: {
        novelPromotionProjectId: novelData.id,
        name: { in: names },
      },
      select: { id: true },
    })
    createdCharacters.push(...created)
  }

  const locationsToCreate: Array<{
    data: Parameters<typeof prisma.novelPromotionLocation.create>[0]['data']
    descriptions: string[]
  }> = []
  for (const item of parsedLocations) {
    const name = readText(item.name).trim()
    if (!name) continue

    const descriptionsRaw = Array.isArray(item.descriptions)
      ? (item.descriptions as unknown[])
      : (readText(item.description) ? [readText(item.description)] : [])
    const descriptions = descriptionsRaw
      .map((value) => readText(value))
      .filter(Boolean)
    const firstDescription = descriptions[0] || ''
    const invalidKeywords = ['幻想', '抽象', '无明确', '空间锚点', '未说明', '不明确']
    const isInvalid = invalidKeywords.some((keyword) => name.includes(keyword) || firstDescription.includes(keyword))
    if (isInvalid) continue

    const existsInLibrary = (novelData.locations || []).some(
      (location) => nameMatchesWithAlias(location.name, name),
    )
    if (existsInLibrary) continue

    locationsToCreate.push({
      data: {
        novelPromotionProjectId: novelData.id,
        name,
        summary: readText(item.summary) || null,
      },
      descriptions,
    })
  }

  const createdLocations: Array<{ id: string }> = []
  if (locationsToCreate.length > 0) {
    await prisma.novelPromotionLocation.createMany({
      data: locationsToCreate.map(l => l.data as any),
    })

    const names = locationsToCreate.map(l => (l.data as any).name)
    const created = await prisma.novelPromotionLocation.findMany({
      where: {
        novelPromotionProjectId: novelData.id,
        name: { in: names },
      },
      select: { id: true, name: true },
    })

    const locationImagesToCreate: Parameters<typeof prisma.locationImage.createMany>[0]['data'] = []
    for (const createdLoc of created) {
      const original = locationsToCreate.find(l => (l.data as any).name === createdLoc.name)
      if (original) {
        const cleanDescriptions = original.descriptions.map((value: string) => removeLocationPromptSuffix(value || ''))
        for (let j = 0; j < cleanDescriptions.length; j += 1) {
          locationImagesToCreate.push({
            locationId: createdLoc.id,
            imageIndex: j,
            description: cleanDescriptions[j],
          })
        }
      }
      createdLocations.push({ id: createdLoc.id })
    }

    if (locationImagesToCreate.length > 0) {
      await prisma.locationImage.createMany({
        data: locationImagesToCreate,
      })
    }
  }

  await prisma.novelPromotionProject.update({
    where: { id: novelData.id },
    data: {
      artStylePrompt: getArtStylePrompt(novelData.artStyle, job.data.locale) || '',
    },
  })

  await reportTaskProgress(job, 96, {
    stage: 'analyze_novel_done',
    stageLabel: '资产分析已完成',
    displayMode: 'detail',
  })

  return {
    success: true,
    characters: createdCharacters,
    locations: createdLocations,
    characterCount: createdCharacters.length,
    locationCount: createdLocations.length,
  }
}
