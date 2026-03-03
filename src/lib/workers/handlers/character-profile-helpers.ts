import { prisma } from '@/lib/prisma'

export type AnyObj = Record<string, unknown>
type ResolvedProjectModel = {
  id: string
  novelPromotionData: {
    id: string
    analysisModel: string
  }
}

export function readText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function readRequiredString(value: unknown, field: string): string {
  const text = readText(value).trim()
  if (!text) {
    throw new Error(`${field} is required`)
  }
  return text
}

export function parseVisualResponse(responseText: string): AnyObj {
  let cleaned = responseText.trim()
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '')
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1)
  }
  return JSON.parse(cleaned) as AnyObj
}

export async function resolveProjectModel(
  projectId: string,
  fallbackAnalysisModel?: string,
): Promise<ResolvedProjectModel> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      novelPromotionData: {
        select: {
          id: true,
          analysisModel: true,
        },
      },
    },
  })
  if (!project) throw new Error('Project not found')
  if (!project.novelPromotionData) throw new Error('Novel promotion data not found')
  const fallbackModel = readText(fallbackAnalysisModel).trim()
  const analysisModel = project.novelPromotionData.analysisModel || fallbackModel
  if (!analysisModel) throw new Error('请先在项目设置中配置分析模型')
  return {
    id: project.id,
    novelPromotionData: {
      id: project.novelPromotionData.id,
      analysisModel,
    },
  }
}
