import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { removeLocationPromptSuffix } from '@/lib/constants'
import { requireProjectAuth, requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

// 删除场景（级联删除关联的图片记录）
export const DELETE = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const { searchParams } = new URL(request.url)
  const locationId = searchParams.get('id')

  if (!locationId) {
    throw new ApiError('INVALID_PARAMS', { message: 'Missing location ID' })
  }

  // 删除场景（LocationImage 会级联删除）
  await prisma.novelPromotionLocation.delete({
    where: { id: locationId }
  })

  return NextResponse.json({ success: true })
})

// 新增场景
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult
  const { novelData } = authResult

  const body = await request.json()
  const { name, description, artStyle } = body

  if (!name || !description) {
    throw new ApiError('INVALID_PARAMS', { message: 'Missing required fields' })
  }

  // 如果传入了 artStyle，更新项目的 artStylePrompt
  if (artStyle) {
    const ART_STYLES = [
      { value: 'american-comic', prompt: '美式漫画风格' },
      { value: 'chinese-comic', prompt: '精致国漫风格' },
      { value: 'anime', prompt: '日系动漫风格' },
      { value: 'realistic', prompt: '真人照片写实风格' }
    ]
    const style = ART_STYLES.find(s => s.value === artStyle)
    if (style) {
      await prisma.novelPromotionProject.update({
        where: { id: novelData.id },
        data: { artStylePrompt: style.prompt }
      })
    }
  }

  // 创建场景
  const cleanDescription = removeLocationPromptSuffix(description.trim())
  const location = await prisma.novelPromotionLocation.create({
    data: {
      novelPromotionProjectId: novelData.id,
      name: name.trim(),
      summary: body.summary?.trim() || null
    }
  })

  // 创建初始图片记录（不设置 generating，让 generate-image API 自己管理状态）
  await prisma.locationImage.create({
    data: {
      locationId: location.id,
      imageIndex: 0,
      description: cleanDescription,
      generating: false
    }
  })

  // 触发后台图片生成
  const { getBaseUrl } = await import('@/lib/env')
  const baseUrl = getBaseUrl()
  fetch(`${baseUrl}/api/novel-promotion/${projectId}/generate-image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': request.headers.get('cookie') || ''
    },
    body: JSON.stringify({
      type: 'location',
      id: location.id
    })
  }).catch(err => {
    console.error('[Location API] 后台图片生成任务触发失败:', err)
  })

  // 返回包含图片的场景数据
  const locationWithImages = await prisma.novelPromotionLocation.findUnique({
    where: { id: location.id },
    include: { images: true }
  })

  return NextResponse.json({ success: true, location: locationWithImages })
})

// 更新场景（名字或图片描述）
export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const { locationId, imageIndex, description, name } = body

  if (!locationId) {
    throw new ApiError('INVALID_PARAMS', { message: 'Missing location ID' })
  }

  // 如果提供了 name 或 summary，更新场景信息
  if (name !== undefined || body.summary !== undefined) {
    const updateData: any = {}
    if (name !== undefined) updateData.name = name.trim()
    if (body.summary !== undefined) updateData.summary = body.summary?.trim() || null

    const location = await prisma.novelPromotionLocation.update({
      where: { id: locationId },
      data: updateData
    })
    return NextResponse.json({ success: true, location })
  }

  // 如果提供了 description 和 imageIndex，更新图片描述
  if (imageIndex !== undefined && description) {
    const cleanDescription = removeLocationPromptSuffix(description.trim())
    const image = await prisma.locationImage.update({
      where: {
        locationId_imageIndex: { locationId, imageIndex }
      },
      data: { description: cleanDescription }
    })
    return NextResponse.json({ success: true, image })
  }

  throw new ApiError('INVALID_PARAMS', { message: 'Missing required fields' })
})
