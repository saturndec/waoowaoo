import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { removeLocationPromptSuffix } from '@/lib/constants'
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

  const body = await request.json()
  const { locationId, imageIndex = 0, newDescription } = body

  if (!locationId || !newDescription) {
    throw new ApiError('INVALID_PARAMS', { message: 'Missing required fields' })
  }

  // 更新场景描述（移除可能存在的系统后缀，后缀只在生成图片时添加）
  const cleanDescription = removeLocationPromptSuffix(newDescription.trim())

  // 更新 LocationImage 表中对应的记录
  const locationImage = await prisma.locationImage.findFirst({
    where: { locationId, imageIndex }
  })

  if (!locationImage) {
    throw new ApiError('NOT_FOUND', { message: 'Location image not found' })
  }

  await prisma.locationImage.update({
    where: { id: locationImage.id },
    data: { description: cleanDescription }
  })

  return NextResponse.json({ success: true })
})
