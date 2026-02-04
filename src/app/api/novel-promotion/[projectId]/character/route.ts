import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuth, requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

// 更新角色信息（名字或介绍）
export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const { characterId, name, introduction } = body

  if (!characterId) {
    throw new ApiError('INVALID_PARAMS', { message: 'Missing characterId' })
  }

  if (!name && introduction === undefined) {
    throw new ApiError('INVALID_PARAMS', { message: 'Must provide name or introduction' })
  }

  // 构建更新数据
  const updateData: { name?: string; introduction?: string } = {}
  if (name) updateData.name = name.trim()
  if (introduction !== undefined) updateData.introduction = introduction.trim()

  // 更新角色
  const character = await prisma.novelPromotionCharacter.update({
    where: { id: characterId },
    data: updateData
  })

  return NextResponse.json({ success: true, character })
})

// 删除角色（级联删除关联的形象记录）
export const DELETE = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const { searchParams } = new URL(request.url)
  const characterId = searchParams.get('id')

  if (!characterId) {
    throw new ApiError('INVALID_PARAMS', { message: 'Missing character ID' })
  }

  // 删除角色（CharacterAppearance 会级联删除）
  await prisma.novelPromotionCharacter.delete({
    where: { id: characterId }
  })

  return NextResponse.json({ success: true })
})

// 新增角色
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
  const {
    name,
    description,
    referenceImageUrl,
    referenceImageUrls,
    generateFromReference,
    artStyle,
    customDescription  // 🔥 新增：文生图模式使用的自定义描述
  } = body

  if (!name) {
    throw new ApiError('INVALID_PARAMS', { message: 'Missing required fields' })
  }

  // 🔥 支持多张参考图（最多 5 张），兼容单张旧格式
  let allReferenceImages: string[] = []
  if (referenceImageUrls && Array.isArray(referenceImageUrls)) {
    allReferenceImages = referenceImageUrls.slice(0, 5)
  } else if (referenceImageUrl) {
    allReferenceImages = [referenceImageUrl]
  }

  // 创建角色
  const character = await prisma.novelPromotionCharacter.create({
    data: {
      novelPromotionProjectId: novelData.id,
      name: name.trim(),
      aliases: null
    }
  })

  // 创建初始形象（独立表）
  const descText = description?.trim() || `${name.trim()} 的角色设定`
  const appearance = await prisma.characterAppearance.create({
    data: {
      characterId: character.id,
      appearanceIndex: 1,
      changeReason: '初始形象',
      description: descText,
      descriptions: JSON.stringify([descText]),
      // 不预设 generating 状态，让 generate-image API 自己管理（避免竞态条件导致 409）
      generating: false
    }
  })

  if (generateFromReference && allReferenceImages.length > 0) {
    const { getBaseUrl } = await import('@/lib/env')
    const baseUrl = getBaseUrl()
    fetch(`${baseUrl}/api/novel-promotion/${projectId}/reference-to-character`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': request.headers.get('cookie') || ''
      },
      body: JSON.stringify({
        referenceImageUrls: allReferenceImages,
        characterName: name.trim(),
        characterId: character.id,
        appearanceId: appearance.id,
        isBackgroundJob: true,
        artStyle: artStyle || 'american-comic',
        customDescription: customDescription || undefined  // 🔥 传递自定义描述（文生图模式）
      })
    }).catch(err => {
      console.error('[Character API] 参考图后台生成任务触发失败:', err)
    })
  } else if (description?.trim()) {
    // 普通创建：触发后台图片生成
    const { getBaseUrl } = await import('@/lib/env')
    const baseUrl = getBaseUrl()
    fetch(`${baseUrl}/api/novel-promotion/${projectId}/generate-character-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': request.headers.get('cookie') || ''
      },
      body: JSON.stringify({
        characterId: character.id,
        appearanceIndex: 1,
        artStyle: artStyle || 'american-comic'
      })
    }).catch(err => {
      console.error('[Character API] 后台图片生成任务触发失败:', err)
    })
  }

  // 返回包含形象的角色数据
  const characterWithAppearances = await prisma.novelPromotionCharacter.findUnique({
    where: { id: character.id },
    include: { appearances: true }
  })

  return NextResponse.json({ success: true, character: characterWithAppearances })
})
