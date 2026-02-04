import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { aiDesign } from '@/lib/asset-utils'
import { getProjectModelConfig } from '@/lib/config-service'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params
  const { userInstruction } = await request.json()

  // 🔐 统一权限验证
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult
  const session = authResult.session

  // 🔥 使用统一配置服务获取模型配置
  const modelConfig = await getProjectModelConfig(projectId, session.user.id)
  if (!modelConfig.analysisModel) {
    throw new ApiError('MISSING_CONFIG', { message: '请先在项目设置中配置"AI分析模型"' })
  }

  // 调用共享函数
  const result = await aiDesign({
    userId: session.user.id,
    analysisModel: modelConfig.analysisModel,
    userInstruction,
    assetType: 'character',
    projectId
  })

  if (!result.success) {
    throw new ApiError('GENERATION_FAILED', { message: result.error })
  }

  return NextResponse.json({ prompt: result.prompt })
})
