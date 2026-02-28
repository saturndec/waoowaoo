import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { chatCompletion, getCompletionContent } from '@/lib/llm-client'
import { getProjectModelConfig } from '@/lib/config-service'
import { withInternalLLMStreamCallbacks } from '@/lib/llm-observe/internal-stream-context'
import { buildCharactersIntroduction } from '@/lib/constants'
import { createClipContentMatcher } from '@/lib/novel-promotion/story-to-script/clip-matching'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import { createWorkerLLMStreamCallbacks, createWorkerLLMStreamContext } from './llm-stream'
import type { TaskJobData } from '@/lib/task/types'
import { buildPrompt, PROMPT_IDS } from '@/lib/prompt-i18n'

function parseClipArrayResponse(responseText: string): Array<Record<string, unknown>> {
  let cleaned = responseText.trim()
  cleaned = cleaned
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/\s*```$/g, '')
    .trim()

  const firstBracket = cleaned.indexOf('[')
  const lastBracket = cleaned.lastIndexOf(']')
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    const parsed = JSON.parse(cleaned.slice(firstBracket, lastBracket + 1))
    if (Array.isArray(parsed)) return parsed as Array<Record<string, unknown>>
  }

  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as { clips?: unknown }
    if (Array.isArray(parsed.clips)) return parsed.clips as Array<Record<string, unknown>>
  }

  throw new Error('Invalid clip JSON format')
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

const MAX_SPLIT_BOUNDARY_ATTEMPTS = 2
const CLIP_BOUNDARY_SUFFIX = `

[Boundary Constraints]
1. The "start" and "end" anchors must come from the original text and be locatable.
2. Allow punctuation/whitespace differences, but do not rewrite key entities or events.
3. If anchors cannot be located reliably, return [] directly.`

export async function handleClipsBuildTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Record<string, unknown>
  const projectId = job.data.projectId
  const episodeId = readText(payload.episodeId || job.data.episodeId).trim()
  if (!episodeId) {
    throw new Error('episodeId is required')
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, mode: true },
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

  const episode = await prisma.novelPromotionEpisode.findUnique({
    where: { id: episodeId },
    select: {
      id: true,
      name: true,
      novelText: true,
      novelPromotionProjectId: true,
    },
  })
  if (!episode) {
    throw new Error('Episode not found')
  }
  if (episode.novelPromotionProjectId !== novelData.id) {
    throw new Error('Episode does not belong to this project')
  }

  const contentToProcess = readText(episode.novelText)
  if (!contentToProcess.trim()) {
    throw new Error('No novel text to process')
  }

  const locationsLibName = novelData.locations.length > 0
    ? novelData.locations.map((item) => item.name).join('、')
    : '无'
  const charactersLibName = novelData.characters.length > 0
    ? novelData.characters.map((item) => item.name).join('、')
    : '无'
  const charactersIntroduction = buildCharactersIntroduction(novelData.characters)
  const promptTemplateBase = buildPrompt({
    promptId: PROMPT_IDS.NP_AGENT_CLIP,
    locale: job.data.locale,
    variables: {
      input: contentToProcess,
      locations_lib_name: locationsLibName,
      characters_lib_name: charactersLibName,
      characters_introduction: charactersIntroduction,
    },
  })
  const promptTemplate = `${promptTemplateBase}${CLIP_BOUNDARY_SUFFIX}`

  await reportTaskProgress(job, 20, {
    stage: 'clips_build_prepare',
    stageLabel: '准备片段切分参数',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'clips_build_prepare')

  const streamContext = createWorkerLLMStreamContext(job, 'clips_build')
  const streamCallbacks = createWorkerLLMStreamCallbacks(job, streamContext)
  const resolvedClips: Array<{
    startText: string
    endText: string
    summary: string
    location: string | null
    characters: unknown
    content: string
  }> = []
  let lastBoundaryError: Error | null = null

  try {
    for (let attempt = 1; attempt <= MAX_SPLIT_BOUNDARY_ATTEMPTS; attempt += 1) {
      const completion = await withInternalLLMStreamCallbacks(
        streamCallbacks,
        async () =>
          await chatCompletion(
            job.data.userId,
            analysisModel,
            [{ role: 'user', content: promptTemplate }],
            {
              projectId,
              action: 'split_clips',
              streamStepId: attempt === 1 ? 'split_clips' : `split_clips_retry_${attempt}`,
              streamStepTitle: '片段切分',
              streamStepIndex: 1,
              streamStepTotal: 1,
            },
          ),
      )

      const responseText = getCompletionContent(completion)
      if (!responseText) {
        lastBoundaryError = new Error('No response from AI')
        continue
      }

      const parsed = parseClipArrayResponse(responseText)
      if (parsed.length === 0) {
        lastBoundaryError = new Error('Invalid clips data structure')
        continue
      }

      const matcher = createClipContentMatcher(contentToProcess)
      const currentResolved: typeof resolvedClips = []
      let searchFrom = 0
      let failedAt: { index: number; startText: string; endText: string } | null = null
      for (let i = 0; i < parsed.length; i += 1) {
        const clipData = parsed[i]
        const startText = readText(clipData.start)
        const endText = readText(clipData.end)
        const match = matcher.matchBoundary(startText, endText, searchFrom)
        if (!match) {
          failedAt = { index: i + 1, startText, endText }
          break
        }
        currentResolved.push({
          startText,
          endText,
          summary: readText(clipData.summary),
          location: readText(clipData.location) || null,
          characters: clipData.characters,
          content: contentToProcess.slice(match.startIndex, match.endIndex),
        })
        searchFrom = match.endIndex
      }

      if (!failedAt) {
        resolvedClips.push(...currentResolved)
        break
      }

      lastBoundaryError = new Error(
        `split_clips boundary matching failed at clip_${failedAt.index}: start="${failedAt.startText}" end="${failedAt.endText}"`,
      )
    }
  } finally {
    await streamCallbacks.flush()
  }

  if (resolvedClips.length === 0) {
    throw lastBoundaryError || new Error('split_clips boundary matching failed')
  }

  await reportTaskProgress(job, 75, {
    stage: 'clips_build_persist',
    stageLabel: '保存片段切分结果',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'clips_build_persist')

  await prisma.novelPromotionClip.deleteMany({
    where: { episodeId },
  })

  const createdClips: Array<{ id: string }> = []
  for (let i = 0; i < resolvedClips.length; i += 1) {
    const clipData = resolvedClips[i]

    const created = await prisma.novelPromotionClip.create({
      data: {
        episodeId,
        startText: clipData.startText,
        endText: clipData.endText,
        summary: clipData.summary,
        location: clipData.location,
        characters: clipData.characters ? JSON.stringify(clipData.characters) : null,
        content: clipData.content,
      },
      select: { id: true },
    })
    createdClips.push(created)
  }

  await reportTaskProgress(job, 96, {
    stage: 'clips_build_done',
    stageLabel: '片段切分已完成',
    displayMode: 'detail',
  })

  return {
    episodeId,
    count: createdClips.length,
  }
}
