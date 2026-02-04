import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSignedUrl, generateUniqueKey, downloadAndUploadToCOS } from '@/lib/cos'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * POST /api/novel-promotion/[projectId]/panel/select-candidate
 * 统一的候选图片操作 API
 * 
 * action: 'select' - 选择候选图片作为最终图片
 * action: 'cancel' - 取消选择，清空候选列表
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
  const { panelId, selectedImageUrl, action = 'select' } = body

  if (!panelId) {
    throw new ApiError('INVALID_PARAMS', { message: 'Missing panelId' })
  }

  // === 取消操作 ===
  if (action === 'cancel') {
    await prisma.novelPromotionPanel.update({
      where: { id: panelId },
      data: { candidateImages: null } as any
    })

    return NextResponse.json({
      success: true,
      message: '已取消选择'
    })
  }

  // === 选择操作 ===
  if (!selectedImageUrl) {
    throw new ApiError('INVALID_PARAMS', { message: 'Missing selectedImageUrl for select action' })
  }

  // 获取 Panel
  const panel = await prisma.novelPromotionPanel.findUnique({
    where: { id: panelId }
  })

  if (!panel) {
    throw new ApiError('NOT_FOUND', { message: 'Panel not found' })
  }

  // 验证选择的图片是否在候选列表中
  const candidateImages = (panel as any).candidateImages ? JSON.parse((panel as any).candidateImages) : []

  // 🔥 从签名URL提取COS key进行比较
  const extractCosKey = (url: string): string => {
    if (!url.includes('.cos.')) return url
    try {
      const urlObj = new URL(url)
      return urlObj.pathname.substring(1)
    } catch {
      return url
    }
  }

  const selectedCosKey = extractCosKey(selectedImageUrl)
  const isValidCandidate = candidateImages.some((c: string) => {
    const candidateCosKey = extractCosKey(c)
    return candidateCosKey === selectedCosKey || c === selectedImageUrl
  })

  if (!isValidCandidate) {
    console.log(`[select-candidate] 选择失败: selectedCosKey=${selectedCosKey}, candidateImages=${JSON.stringify(candidateImages)}`)
    throw new ApiError('INVALID_PARAMS', { message: '选择的图片不在候选列表中' })
  }

  // 保存当前图片到历史记录
  const currentHistory = (panel as any).imageHistory ? JSON.parse((panel as any).imageHistory) : []
  if (panel.imageUrl) {
    currentHistory.push({
      url: panel.imageUrl,
      timestamp: new Date().toISOString()
    })
  }

  // 下载选中的图片并上传到 COS
  const cosKey = generateUniqueKey(`panel-${panelId}-selected`, 'png')
  const uploadedKey = await downloadAndUploadToCOS(selectedImageUrl, cosKey)
  const signedUrl = getSignedUrl(uploadedKey, 7 * 24 * 3600)

  // 更新 Panel：设置新图片，清空候选列表
  await prisma.novelPromotionPanel.update({
    where: { id: panelId },
    data: {
      imageUrl: uploadedKey,
      imageHistory: JSON.stringify(currentHistory),
      candidateImages: null
    } as any
  })

  return NextResponse.json({
    success: true,
    imageUrl: signedUrl,
    cosKey: uploadedKey,
    message: '已选择图片'
  })
})
