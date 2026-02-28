import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { chatCompletion, getCompletionContent } from '@/lib/llm-client'
import { getProjectModelConfig } from '@/lib/config-service'
import { withInternalLLMStreamCallbacks } from '@/lib/llm-observe/internal-stream-context'
import { getArtStylePrompt, removeLocationPromptSuffix } from '@/lib/constants'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import { createWorkerLLMStreamCallbacks, createWorkerLLMStreamContext } from './llm-stream'
import type { TaskJobData } from '@/lib/task/types'
import { buildPrompt, PROMPT_IDS } from '@/lib/prompt-i18n'

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
  let cleanedText = responseText.trim()
  cleanedText = cleanedText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '')
  const firstBrace = cleanedText.indexOf('{')
  const lastBrace = cleanedText.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleanedText = cleanedText.substring(firstBrace, lastBrace + 1)
  }
  return JSON.parse(cleanedText) as Record<string, unknown>
}

export async function handleAnalyzeNovelTask(job: Job<TaskJobData>) {
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

  const projectModelConfig = await getProjectModelConfig(projectId, job.data.userId)
  const analysisModel = projectModelConfig.analysisModel
  if (!analysisModel) {
    throw new Error('analysisModel is not configured')
  }

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
            chatCompletion(
              job.data.userId,
              analysisModel,
              [{ role: 'user', content: characterPromptTemplate }],
              {
                temperature: 0.7,
                projectId,
                action: 'analyze_characters',
                streamStepId: 'analyze_characters',
                streamStepTitle: '角色分析',
                streamStepIndex: 1,
                streamStepTotal: 2,
              },
            ),
            chatCompletion(
              job.data.userId,
              analysisModel,
              [{ role: 'user', content: locationPromptTemplate }],
              {
                temperature: 0.7,
                projectId,
                action: 'analyze_locations',
                streamStepId: 'analyze_locations',
                streamStepTitle: '场景分析',
                streamStepIndex: 2,
                streamStepTotal: 2,
              },
            ),
          ]),
      )
    } finally {
      await streamCallbacks.flush()
    }
  })()

  const characterResponseText = getCompletionContent(characterCompletion)
  const locationResponseText = getCompletionContent(locationCompletion)

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

  const createdCharacters: Array<{ id: string }> = []
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

    const created = await prisma.novelPromotionCharacter.create({
      data: {
        novelPromotionProjectId: novelData.id,
        name,
        aliases: JSON.stringify(toStringArray(item.aliases)),
        profileData: JSON.stringify(profileData),
        profileConfirmed: false,
      },
      select: { id: true },
    })
    createdCharacters.push(created)
  }

  const createdLocations: Array<{ id: string }> = []
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

    const created = await prisma.novelPromotionLocation.create({
      data: {
        novelPromotionProjectId: novelData.id,
        name,
        summary: readText(item.summary) || null,
      },
      select: { id: true },
    })

    const cleanDescriptions = descriptions.map((value) => removeLocationPromptSuffix(value || ''))
    for (let i = 0; i < cleanDescriptions.length; i += 1) {
      await prisma.locationImage.create({
        data: {
          locationId: created.id,
          imageIndex: i,
          description: cleanDescriptions[i],
        },
      })
    }

    createdLocations.push(created)
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
