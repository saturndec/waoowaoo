import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { chatCompletion, getCompletionContent } from '@/lib/llm-client'
import { getProjectModelConfig } from '@/lib/config-service'
import { withInternalLLMStreamCallbacks } from '@/lib/llm-observe/internal-stream-context'
import { buildCharactersIntroduction } from '@/lib/constants'
import { TaskTerminatedError } from '@/lib/task/errors'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import { logAIAnalysis } from '@/lib/logging/semantic'
import { onProjectNameAvailable } from '@/lib/logging/file-writer'
import { createWorkerLLMStreamCallbacks, createWorkerLLMStreamContext } from './llm-stream'
import type { TaskJobData } from '@/lib/task/types'
import {
  type AnyObj,
  parseScreenplayPayload,
  readText,
} from './screenplay-convert-helpers'
import { getPromptTemplate, PROMPT_IDS } from '@/lib/prompt-i18n'

const MAX_SCREENPLAY_ATTEMPTS = 2

export async function handleScreenplayConvertTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  const projectId = job.data.projectId
  const episodeId = readText(payload.episodeId || job.data.episodeId).trim()
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
    include: {
      clips: {
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!episode) {
    throw new Error('Episode not found')
  }
  if (episode.novelPromotionProjectId !== novelData.id) {
    throw new Error('Episode does not belong to this project')
  }
  if (episode.clips.length === 0) {
    throw new Error('No clips found, please split clips first')
  }

  const screenplayPromptTemplate = getPromptTemplate(PROMPT_IDS.NP_SCREENPLAY_CONVERSION, job.data.locale)
  const charactersLibName = novelData.characters.map((item) => item.name).join('、') || '无'
  const locationsLibName = novelData.locations.map((item) => item.name).join('、') || '无'
  const charactersIntroduction = buildCharactersIntroduction(novelData.characters)

  await reportTaskProgress(job, 10, {
    stage: 'screenplay_convert_prepare',
    stageLabel: '准备剧本转换参数',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'screenplay_convert_prepare')

  const streamContext = createWorkerLLMStreamContext(job, 'screenplay_convert')
  const streamCallbacks = createWorkerLLMStreamCallbacks(job, streamContext)
  const total = episode.clips.length
  const results: Array<{
    clipId: string
    success: boolean
    sceneCount?: number
    error?: string
  }> = []

  for (let i = 0; i < total; i += 1) {
    const clip = episode.clips[i]
    const stepIndex = i + 1
    const stepId = `screenplay_clip_${clip.id}`
    const stepTitle = `片段剧本转换 ${stepIndex}/${total}`
    const progress = 15 + Math.min(70, Math.floor((stepIndex / Math.max(1, total)) * 70))

    await assertTaskActive(job, `screenplay_convert_step:${clip.id}`)
    await reportTaskProgress(job, progress, {
      stage: 'screenplay_convert_step',
      stageLabel: '执行剧本转换',
      displayMode: 'detail',
      message: stepTitle,
      stepId,
      stepTitle,
      stepIndex,
      stepTotal: total,
    })

    try {
      const clipContent = readText(clip.content).trim()
      if (!clipContent) {
        throw new Error(`clip ${clip.id} content is empty`)
      }

      const prompt = screenplayPromptTemplate
        .replace('{clip_content}', clipContent)
        .replace('{locations_lib_name}', locationsLibName)
        .replace('{characters_lib_name}', charactersLibName)
        .replace('{characters_introduction}', charactersIntroduction)
        .replace('{clip_id}', clip.id)

      // 记录 prompt 输入
      onProjectNameAvailable(projectId, project.name)
      logAIAnalysis(job.data.userId, 'worker', projectId, project.name, {
        action: `SCREENPLAY_CONVERT_PROMPT`,
        input: { stepId, stepTitle, prompt },
        model: analysisModel,
      })

      let screenplayStored = false
      let stepLastError: Error | null = null
      for (let attempt = 1; attempt <= MAX_SCREENPLAY_ATTEMPTS; attempt += 1) {
        try {
          const completion = await (async () => {
            try {
              return await withInternalLLMStreamCallbacks(
                streamCallbacks,
                async () =>
                  await chatCompletion(
                    job.data.userId,
                    analysisModel,
                    [{ role: 'user', content: prompt }],
                    {
                      reasoning: true,
                      projectId,
                      action: 'screenplay_conversion',
                      streamStepId: attempt === 1 ? stepId : `${stepId}_retry_${attempt}`,
                      streamStepTitle: stepTitle,
                      streamStepIndex: stepIndex,
                      streamStepTotal: total,
                    },
                  ),
              )
            } finally {
              await streamCallbacks.flush()
            }
          })()

          const responseText = getCompletionContent(completion)
          if (!responseText || !responseText.trim()) {
            throw new Error('AI returned empty response')
          }

          // 记录 AI 输出
          logAIAnalysis(job.data.userId, 'worker', projectId, project.name, {
            action: `SCREENPLAY_CONVERT_OUTPUT`,
            output: {
              stepId,
              stepTitle,
              attempt,
              rawText: responseText,
              textLength: responseText.length,
            },
            model: analysisModel,
          })

          const screenplay = parseScreenplayPayload(responseText)
          screenplay.clip_id = clip.id
          screenplay.original_text = clipContent

          await prisma.novelPromotionClip.update({
            where: { id: clip.id },
            data: {
              screenplay: JSON.stringify(screenplay),
            },
          })

          const scenes = Array.isArray(screenplay.scenes) ? screenplay.scenes : []
          results.push({
            clipId: clip.id,
            success: true,
            sceneCount: scenes.length,
          })
          screenplayStored = true
          break
        } catch (error) {
          if (error instanceof TaskTerminatedError) {
            throw error
          }
          stepLastError = error instanceof Error ? error : new Error(String(error))
        }
      }

      if (!screenplayStored) {
        throw stepLastError || new Error(`clip ${clip.id} screenplay conversion failed`)
      }
    } catch (error) {
      if (error instanceof TaskTerminatedError) {
        throw error
      }
      results.push({
        clipId: clip.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const successCount = results.filter((item) => item.success).length
  const failCount = results.length - successCount
  const totalScenes = results.reduce((sum, item) => sum + (item.sceneCount || 0), 0)

  if (failCount > 0) {
    const failedItems = results
      .filter((item) => !item.success)
      .map((item) => `${item.clipId}:${item.error || 'unknown error'}`)
    const preview = failedItems.slice(0, 3).join(' | ')
    throw new Error(
      `SCREENPLAY_CONVERT_PARTIAL_FAILED: ${failCount}/${total} clips failed. ${preview}`,
    )
  }

  await reportTaskProgress(job, 96, {
    stage: 'screenplay_convert_done',
    stageLabel: '剧本转换结果已保存',
    displayMode: 'detail',
    message: `完成 ${successCount}/${total} 个片段`,
  })

  return {
    episodeId,
    total,
    successCount,
    failCount,
    totalScenes,
    results,
  }
}
