import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { deleteCOSObject, extractCOSKey } from '@/lib/cos'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * POST - 确认场景选择并删除未选中的候选图片
 * Body: { locationId }
 * 
 * 工作流程：
 * 1. 验证已经选择了一张图片（有 isSelected 的图片）
 * 2. 删除其他未选中的图片（从 COS 和数据库）
 * 3. 将选中的图片设为唯一图片
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const { locationId } = body

  if (!locationId) {
    throw new ApiError('INVALID_PARAMS', { message: '缺少必要参数' })
  }

  // 获取场景及其图片
  const location = await (prisma as any).novelPromotionLocation.findUnique({
    where: { id: locationId },
    include: { images: { orderBy: { imageIndex: 'asc' } } }
  })

  if (!location) {
    throw new ApiError('NOT_FOUND', { message: '场景不存在' })
  }

  const images = location.images || []

  if (images.length <= 1) {
    // 已经只有一张图片，无需操作
    return NextResponse.json({
      success: true,
      message: '已确认选择',
      deletedCount: 0
    })
  }

  // 找到选中的图片
  const selectedImage = images.find((img: any) => img.isSelected)
  if (!selectedImage) {
    throw new ApiError('INVALID_PARAMS', { message: '请先选择一张图片' })
  }

  // 删除未选中的图片
  const deletedImages: string[] = []
  const imagesToDelete = images.filter((img: any) => !img.isSelected)

  for (const img of imagesToDelete) {
    if (img.imageUrl) {
      const key = extractCOSKey(img.imageUrl)
      if (key) {
        try {
          await deleteCOSObject(key)
          deletedImages.push(key)
        } catch (e) {
          console.warn('Failed to delete COS image:', key)
        }
      }
    }
  }

  // 在事务中更新数据库
  await prisma.$transaction(async (tx) => {
    // 删除未选中的图片记录
    await (tx as any).locationImage.deleteMany({
      where: {
        locationId,
        isSelected: false
      }
    })

    // 更新选中图片的索引为 0
    await (tx as any).locationImage.update({
      where: { id: selectedImage.id },
      data: { imageIndex: 0 }
    })
  })

  console.log(`✓ 场景确认选择: ${location.name}`)
  console.log(`✓ 删除了 ${deletedImages.length} 张未选中的图片`)

  return NextResponse.json({
    success: true,
    message: '已确认选择，其他候选图片已删除',
    deletedCount: deletedImages.length
  })
})
