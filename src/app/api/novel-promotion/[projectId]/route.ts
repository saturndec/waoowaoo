import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { addSignedUrlsToProject } from '@/lib/cos'
import { logProjectAction, logError } from '@/lib/logger'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

// PATCH - 更新小说推文项目配置
export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const session = authResult.session
  const project = authResult.project

  const body = await request.json()

  if (project.mode !== 'novel-promotion') {
    throw new ApiError('INVALID_PARAMS', { message: 'Not a novel promotion project' })
  }

  // 🔥 artStylePrompt 已改为实时从常量获取，不再在数据库同步

  // 🔥 白名单模式：只允许更新明确列出的字段
  const allowedProjectFields = [
    'analysisModel', 'characterModel', 'locationModel', 'storyboardModel',
    'editModel', 'videoModel', 'videoRatio', 'videoResolution', 'artStyle',
    'ttsRate', 'ttsVoice', 'lipSyncEnabled', 'lipSyncMode'
  ] as const

  const updateData: Record<string, any> = {}
  for (const field of allowedProjectFields) {
    if (body[field] !== undefined) {
      updateData[field] = body[field]
    }
  }

  const updatedNovelPromotionData = await prisma.novelPromotionProject.update({
    where: { projectId },
    data: updateData
  })

  // 同步更新用户偏好配置（如果更新了配置相关字段）
  const preferenceFields = ['analysisModel', 'characterModel', 'locationModel', 'storyboardModel', 'editModel', 'videoModel', 'videoRatio', 'videoResolution', 'artStyle', 'ttsRate', 'ttsVoice']
  const preferenceUpdate: Record<string, any> = {}
  for (const field of preferenceFields) {
    if (body[field] !== undefined) {
      preferenceUpdate[field] = body[field]
    }
  }
  if (Object.keys(preferenceUpdate).length > 0) {
    await prisma.userPreference.upsert({
      where: { userId: session.user.id },
      update: preferenceUpdate,
      create: {
        userId: session.user.id,
        ...preferenceUpdate
      }
    })
  }

  // 将所有COS Key转换为签名URL
  const novelPromotionDataWithSignedUrls = addSignedUrlsToProject(updatedNovelPromotionData)

  // 合并基础项目信息和小说推文数据
  const fullProject = {
    ...project,
    novelPromotionData: novelPromotionDataWithSignedUrls
  }

  logProjectAction(
    'UPDATE_NOVEL_PROMOTION',
    session.user.id,
    session.user.name,
    projectId,
    project.name,
    { changes: body }
  )

  return NextResponse.json({ project: fullProject })
})
