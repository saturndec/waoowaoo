import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * POST /api/novel-promotion/[projectId]/panel
 * 新增一个 Panel
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
  const {
    storyboardId,
    shotType,
    cameraMove,
    description,
    location,
    characters,
    srtStart,
    srtEnd,
    duration,
    videoPrompt
  } = body

  if (!storyboardId) {
    throw new ApiError('INVALID_PARAMS', { message: 'Missing storyboardId' })
  }

  // 验证 storyboard 存在，并获取现有 panels 以计算正确的 panelIndex
  const storyboard = await prisma.novelPromotionStoryboard.findUnique({
    where: { id: storyboardId },
    include: {
      panels: {
        orderBy: { panelIndex: 'desc' },
        take: 1
      }
    }
  })

  if (!storyboard) {
    throw new ApiError('NOT_FOUND', { message: 'Storyboard not found' })
  }

  // 自动计算正确的 panelIndex（取最大值 + 1，避免唯一约束冲突）
  const maxPanelIndex = storyboard.panels.length > 0 ? storyboard.panels[0].panelIndex : -1
  const newPanelIndex = maxPanelIndex + 1
  const newPanelNumber = newPanelIndex + 1

  // 创建新的 Panel 记录
  const newPanel = await prisma.novelPromotionPanel.create({
    data: {
      storyboardId,
      panelIndex: newPanelIndex,
      panelNumber: newPanelNumber,
      shotType: shotType ?? null,
      cameraMove: cameraMove ?? null,
      description: description ?? null,
      location: location ?? null,
      characters: characters ?? null,
      srtStart: srtStart ?? null,
      srtEnd: srtEnd ?? null,
      duration: duration ?? null,
      videoPrompt: videoPrompt ?? null
    }
  })

  // 更新 panelCount
  const panelCount = await prisma.novelPromotionPanel.count({
    where: { storyboardId }
  })

  await prisma.novelPromotionStoryboard.update({
    where: { id: storyboardId },
    data: { panelCount }
  })

  return NextResponse.json({ success: true, panel: newPanel })
})

/**
 * DELETE /api/novel-promotion/[projectId]/panel
 * 删除一个 Panel
 */
export const DELETE = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const { searchParams } = new URL(request.url)
  const panelId = searchParams.get('panelId')

  if (!panelId) {
    throw new ApiError('INVALID_PARAMS', { message: 'Missing panelId' })
  }

  // 获取要删除的 Panel 信息
  const panel = await prisma.novelPromotionPanel.findUnique({
    where: { id: panelId }
  })

  if (!panel) {
    throw new ApiError('NOT_FOUND', { message: 'Panel not found' })
  }

  const storyboardId = panel.storyboardId

  // 使用事务确保删除和重新排序的原子性
  // 采用原始 SQL 批量更新以避免循环导致的性能问题
  await prisma.$transaction(async (tx) => {
    // 1. 删除 Panel
    await tx.novelPromotionPanel.delete({
      where: { id: panelId }
    })

    // 2. 使用原始 SQL 批量重新排序所有 panels
    // 先获取已删除 panel 的原始索引，用于确定需要更新的范围
    const deletedPanelIndex = panel.panelIndex

    // 使用原始 SQL 批量更新所有索引大于被删除 panel 的记录
    // 将它们的 panelIndex 和 panelNumber 都减 1
    await tx.$executeRaw`
      UPDATE \`novel_promotion_panels\`
      SET \`panelIndex\` = \`panelIndex\` - 1,
          \`panelNumber\` = \`panelNumber\` - 1
      WHERE \`storyboardId\` = ${storyboardId}
        AND \`panelIndex\` > ${deletedPanelIndex}
    `

    // 3. 获取更新后的 panel 总数
    const panelCount = await tx.novelPromotionPanel.count({
      where: { storyboardId }
    })

    // 4. 更新 storyboard 的 panelCount
    await tx.novelPromotionStoryboard.update({
      where: { id: storyboardId },
      data: { panelCount }
    })
  }, {
    maxWait: 15000, // 等待事务开始的最长时间：15 秒
    timeout: 30000  // 事务执行超时：30 秒 (针对大量 panels 的批量更新)
  })

  return NextResponse.json({ success: true })
})

/**
 * PATCH /api/novel-promotion/[projectId]/panel
 * 更新单个 Panel 的属性（视频提示词、视频模型、imageErrorMessage 等）
 * 支持两种更新方式：
 * 1. 通过 panelId 直接更新（推荐，用于清除错误等操作）
 * 2. 通过 storyboardId + panelIndex 更新（兼容旧接口）
 */
export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const { panelId, storyboardId, panelIndex, videoPrompt, imageErrorMessage } = body

  // 🔥 方式1：通过 panelId 直接更新（优先）
  if (panelId) {
    const panel = await prisma.novelPromotionPanel.findUnique({
      where: { id: panelId }
    })

    if (!panel) {
      throw new ApiError('NOT_FOUND', { message: 'Panel not found' })
    }

    // 构建更新数据
    const updateData: any = {}
    if (videoPrompt !== undefined) updateData.videoPrompt = videoPrompt
    if (imageErrorMessage !== undefined) updateData.imageErrorMessage = imageErrorMessage

    await prisma.novelPromotionPanel.update({
      where: { id: panelId },
      data: updateData
    })

    return NextResponse.json({ success: true })
  }

  // 🔥 方式2：通过 storyboardId + panelIndex 更新（兼容旧接口）
  if (!storyboardId || panelIndex === undefined) {
    throw new ApiError('INVALID_PARAMS', { message: 'Missing panelId or (storyboardId + panelIndex)' })
  }

  // 验证 storyboard 存在
  const storyboard = await prisma.novelPromotionStoryboard.findUnique({
    where: { id: storyboardId }
  })

  if (!storyboard) {
    throw new ApiError('NOT_FOUND', { message: 'Storyboard not found' })
  }

  // 构建更新数据
  const updateData: any = {}
  if (videoPrompt !== undefined) {
    updateData.videoPrompt = videoPrompt
  }
  if (imageErrorMessage !== undefined) {
    updateData.imageErrorMessage = imageErrorMessage
  }

  // 尝试更新 Panel
  const updatedPanel = await prisma.novelPromotionPanel.updateMany({
    where: {
      storyboardId,
      panelIndex
    },
    data: updateData
  })

  // 如果 Panel 不存在，创建它（Panel 表是唯一数据源）
  if (updatedPanel.count === 0) {
    // 创建新的 Panel 记录
    await prisma.novelPromotionPanel.create({
      data: {
        storyboardId,
        panelIndex,
        panelNumber: panelIndex + 1,
        imageUrl: null,
        videoPrompt: videoPrompt ?? null
      }
    })
  }

  return NextResponse.json({ success: true })
})

/**
 * PUT /api/novel-promotion/[projectId]/panel
 * 完整更新单个 Panel 的所有属性（用于文字分镜编辑）
 */
export const PUT = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const {
    storyboardId,
    panelIndex,
    panelNumber,
    shotType,
    cameraMove,
    description,
    location,
    characters,
    srtStart,
    srtEnd,
    duration,
    videoPrompt,
    actingNotes  // 演技指导数据
  } = body

  if (!storyboardId || panelIndex === undefined) {
    throw new ApiError('INVALID_PARAMS', { message: 'Missing storyboardId or panelIndex' })
  }

  // 验证 storyboard 存在
  const storyboard = await prisma.novelPromotionStoryboard.findUnique({
    where: { id: storyboardId }
  })

  if (!storyboard) {
    throw new ApiError('NOT_FOUND', { message: 'Storyboard not found' })
  }

  // 构建更新数据 - 包含所有可编辑字段
  const updateData: any = {}
  if (panelNumber !== undefined) updateData.panelNumber = panelNumber
  if (shotType !== undefined) updateData.shotType = shotType
  if (cameraMove !== undefined) updateData.cameraMove = cameraMove
  if (description !== undefined) updateData.description = description
  if (location !== undefined) updateData.location = location
  if (characters !== undefined) updateData.characters = characters
  if (srtStart !== undefined) updateData.srtStart = srtStart
  if (srtEnd !== undefined) updateData.srtEnd = srtEnd
  if (duration !== undefined) updateData.duration = duration
  if (videoPrompt !== undefined) updateData.videoPrompt = videoPrompt
  // 演技指导存为 JSON 字符串
  if (actingNotes !== undefined) {
    updateData.actingNotes = actingNotes ? JSON.stringify(actingNotes) : null
  }

  // 查找现有 Panel
  const existingPanel = await prisma.novelPromotionPanel.findUnique({
    where: {
      storyboardId_panelIndex: {
        storyboardId,
        panelIndex
      }
    }
  })

  if (existingPanel) {
    // 更新现有 Panel
    await prisma.novelPromotionPanel.update({
      where: { id: existingPanel.id },
      data: updateData
    })
  } else {
    // 创建新的 Panel 记录
    await prisma.novelPromotionPanel.create({
      data: {
        storyboardId,
        panelIndex,
        panelNumber: panelNumber ?? panelIndex + 1,
        shotType: shotType ?? null,
        cameraMove: cameraMove ?? null,
        description: description ?? null,
        location: location ?? null,
        characters: characters ?? null,
        srtStart: srtStart ?? null,
        srtEnd: srtEnd ?? null,
        duration: duration ?? null,
        videoPrompt: videoPrompt ?? null,
        actingNotes: actingNotes ? JSON.stringify(actingNotes) : null
      }
    })
  }

  // Panel 表是唯一数据源，不再同步到 storyboardTextJson
  // 只更新 panelCount 用于快速查询
  const panelCount = await prisma.novelPromotionPanel.count({
    where: { storyboardId }
  })

  await prisma.novelPromotionStoryboard.update({
    where: { id: storyboardId },
    data: { panelCount }
  })

  return NextResponse.json({ success: true })
})
