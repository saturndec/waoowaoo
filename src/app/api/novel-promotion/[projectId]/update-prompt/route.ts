import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const { shotId, field, value } = await request.json()

  // 验证字段
  if (field !== 'imagePrompt' && field !== 'videoPrompt') {
    throw new ApiError('INVALID_PARAMS', { message: '无效的字段名' })
  }

  // 更新shot
  const updatedShot = await prisma.novelPromotionShot.update({
    where: { id: shotId },
    data: { [field]: value }
  })

  return NextResponse.json({ success: true, shot: updatedShot })
})
