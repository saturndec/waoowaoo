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

  const body = await request.json()
  const { characterId, appearanceId, newDescription, descriptionIndex } = body

  if (!characterId || !appearanceId || !newDescription) {
    throw new ApiError('INVALID_PARAMS', { message: 'Missing required fields' })
  }

  // 使用 UUID 直接查询
  const appearance = await (prisma as any).characterAppearance.findUnique({
    where: { id: appearanceId }
  })

  if (!appearance) {
    throw new ApiError('NOT_FOUND', { message: 'Appearance not found' })
  }


  const trimmedDescription = newDescription.trim()

  // 解析 descriptions JSON
  let descriptions: string[] = []
  if (appearance.descriptions) {
    try { descriptions = JSON.parse(appearance.descriptions) } catch { }
  }
  if (descriptions.length === 0) {
    descriptions = [appearance.description || '']
  }

  // 更新指定索引的描述
  if (descriptionIndex !== undefined && descriptionIndex !== null) {
    descriptions[descriptionIndex] = trimmedDescription
  } else {
    descriptions[0] = trimmedDescription
  }

  // 直接更新独立表记录
  await (prisma as any).characterAppearance.update({
    where: { id: appearance.id },
    data: {
      descriptions: JSON.stringify(descriptions),
      description: descriptions[0]
    }
  })

  return NextResponse.json({ success: true })
})
