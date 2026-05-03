import type { Job } from 'bullmq'
import { safeParseJsonArray } from '@/lib/json-repair'
import { prisma } from '@/lib/prisma'
import { executeAiTextStep } from '@/lib/ai-exec/engine'
import { withInternalLLMStreamCallbacks } from '@/lib/llm-observe/internal-stream-context'
import { buildCharactersIntroduction } from '@/lib/constants'
import { createClipContentMatcher } from '@/lib/text-processing/clip-matching'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import { createWorkerLLMStreamCallbacks, createWorkerLLMStreamContext } from './llm-stream'
import type { TaskJobData } from '@/lib/task/types'
import { buildAiPrompt as buildPrompt, AI_PROMPT_IDS as PROMPT_IDS } from '@/lib/ai-prompts'
import { resolveAnalysisModel } from './resolve-analysis-model'

function readAssetKind(value: Record<string, unknown>): string {
  return typeof value.assetKind === 'string' ? value.assetKind : 'location'
}

function parseClipArrayResponse(responseText: string): Array<Record<string, unknown>> {
  return safeParseJsonArray(responseText, 'clips')
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
  const clipModel = prisma.projectClip as unknown as {
    update: (args: { where: { id: string }; data: Record<string, unknown>; select: { id: true } }) => Promise<{ id: string }>
    create: (args: { data: Record<string, unknown>; select: { id: true } }) => Promise<{ id: string }>
    findMany: typeof prisma.projectClip.findMany
    deleteMany: typeof prisma.projectClip.deleteMany
  }
  const episodeId = readText(payload.episodeId || job.data.episodeId).trim()
  if (!episodeId) {
    throw new Error('episodeId is required')
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  })
  if (!project) {
    throw new Error('Project not found')
  }

  const projectWorkflow = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      characters: true,
      locations: true,
    },
  })
  if (!projectWorkflow) throw new Error('Project not found')
  const analysisModel = await resolveAnalysisModel({
    userId: job.data.userId,
    inputModel: payload.model,
    projectAnalysisModel: projectWorkflow.analysisModel,
  })

  const episode = await prisma.projectEpisode.findUnique({
    where: { id: episodeId },
    select: {
      id: true,
      name: true,
      novelText: true,
      projectId: true,
    },
  })
  if (!episode) {
    throw new Error('Episode not found')
  }
  if (episode.projectId !== projectId) {
    throw new Error('Episode does not belong to this project')
  }

  const contentToProcess = readText(episode.novelText)
  if (!contentToProcess.trim()) {
    throw new Error('No novel text to process')
  }

  const locationsLibName = projectWorkflow.locations.filter((item) => readAssetKind(item as unknown as Record<string, unknown>) !== 'prop').length > 0
    ? projectWorkflow.locations.filter((item) => readAssetKind(item as unknown as Record<string, unknown>) !== 'prop').map((item) => item.name).join('、')
    : '无'
  const charactersLibName = projectWorkflow.characters.length > 0
    ? projectWorkflow.characters.map((item) => item.name).join('、')
    : '无'
  const propsLibName = projectWorkflow.locations.filter((item) => readAssetKind(item as unknown as Record<string, unknown>) === 'prop').length > 0
    ? projectWorkflow.locations.filter((item) => readAssetKind(item as unknown as Record<string, unknown>) === 'prop').map((item) => item.name).join('、')
    : '无'
  const charactersIntroduction = buildCharactersIntroduction(projectWorkflow.characters)
  const promptTemplateBase = buildPrompt({
    promptId: PROMPT_IDS.SCRIPT_CLIP_SEGMENTS,
    locale: job.data.locale,
    variables: {
      input: contentToProcess,
      locations_lib_name: locationsLibName,
      characters_lib_name: charactersLibName,
      props_lib_name: propsLibName,
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
    props: unknown
    content: string
  }> = []
  let lastBoundaryError: Error | null = null

  try {
    for (let attempt = 1; attempt <= MAX_SPLIT_BOUNDARY_ATTEMPTS; attempt += 1) {
      const completion = await withInternalLLMStreamCallbacks(
        streamCallbacks,
        async () =>
          await executeAiTextStep({
            userId: job.data.userId,
            model: analysisModel,
            messages: [{ role: 'user', content: promptTemplate }],
            projectId,
            action: 'split_clips',
            meta: {
              stepId: 'split_clips',
              stepAttempt: attempt,
              stepTitle: '片段切分',
              stepIndex: 1,
              stepTotal: 1,
            },
          }),
      )

      const responseText = completion.text
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
          props: clipData.props,
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

  const existingClips = await clipModel.findMany({
    where: { episodeId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  const createdClips: Array<{ id: string }> = []
  for (let i = 0; i < resolvedClips.length; i += 1) {
    const clipData = resolvedClips[i]
    const existing = existingClips[i]
    if (existing) {
      const updated = await clipModel.update({
        where: { id: existing.id },
        data: {
          startText: clipData.startText,
          endText: clipData.endText,
          summary: clipData.summary,
          location: clipData.location,
          characters: clipData.characters ? JSON.stringify(clipData.characters) : null,
          props: clipData.props ? JSON.stringify(clipData.props) : null,
          content: clipData.content,
        },
        select: { id: true },
      })
      createdClips.push(updated)
      continue
    }

    const created = await clipModel.create({
      data: {
        episodeId,
        startText: clipData.startText,
        endText: clipData.endText,
        summary: clipData.summary,
        location: clipData.location,
        characters: clipData.characters ? JSON.stringify(clipData.characters) : null,
        props: clipData.props ? JSON.stringify(clipData.props) : null,
        content: clipData.content,
      },
      select: { id: true },
    })
    createdClips.push(created)
  }

  const staleIds = existingClips.slice(resolvedClips.length).map((item) => item.id)
  if (staleIds.length > 0) {
    await clipModel.deleteMany({
      where: {
        id: {
          in: staleIds,
        },
      },
    })
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
