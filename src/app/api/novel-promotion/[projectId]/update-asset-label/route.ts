import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { uploadToCOS, generateUniqueKey, getSignedUrl } from '@/lib/cos'
import sharp from 'sharp'
import { initializeFonts, createLabelSVG } from '@/lib/fonts'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * POST /api/novel-promotion/[projectId]/update-asset-label
 * 更新资产图片上的黑边标识符（修改名字后调用）
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 初始化字体（在 Vercel 环境中需要）
  await initializeFonts()

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const { type, id, newName, appearanceIndex } = body
  // type: 'character' | 'location'
  // id: characterId 或 locationId
  // newName: 新名字
  // appearanceIndex: 角色形象索引（仅角色需要）

  if (!type || !id || !newName) {
    throw new ApiError('INVALID_PARAMS', { message: 'Missing required fields' })
  }

  if (type === 'character') {
    // 获取角色的所有形象
    const character = await prisma.novelPromotionCharacter.findUnique({
      where: { id: id },
      include: { appearances: true }
    })

    if (!character) {
      throw new ApiError('NOT_FOUND', { message: 'Character not found' })
    }

    // 更新每个形象的图片标签
    const updatePromises = character.appearances.map(async (appearance) => {
      // 如果指定了 appearanceIndex，只更新该形象
      if (appearanceIndex !== undefined && appearance.appearanceIndex !== appearanceIndex) {
        return null
      }

      // 获取图片 URLs
      let imageUrls: string[] = []
      if (appearance.imageUrls) {
        try {
          imageUrls = JSON.parse(appearance.imageUrls)
        } catch { }
      } else if (appearance.imageUrl) {
        imageUrls = [appearance.imageUrl]
      }

      if (imageUrls.length === 0) return null

      // 更新每张图片的标签
      const newLabelText = `${newName} - ${appearance.changeReason}`
      const newImageUrls = await Promise.all(
        imageUrls.map(async (url, i) => {
          if (!url) return null
          try {
            return await updateImageLabel(url, newLabelText, `char-${id}-${appearance.appearanceIndex}-v${i}`)
          } catch (e) {
            console.error(`Failed to update label for image ${i}:`, e)
            return url // 保留原 URL
          }
        })
      )

      const firstUrl = newImageUrls.find(u => u !== null) || null

      // 更新数据库
      await prisma.characterAppearance.update({
        where: { id: appearance.id },
        data: {
          imageUrls: JSON.stringify(newImageUrls),
          imageUrl: firstUrl
        }
      })

      return { appearanceIndex: appearance.appearanceIndex, imageUrls: newImageUrls }
    })

    const results = await Promise.all(updatePromises)
    return NextResponse.json({ success: true, results: results.filter(r => r !== null) })

  } else if (type === 'location') {
    // 获取场景
    const location = await prisma.novelPromotionLocation.findUnique({
      where: { id: id },
      include: { images: true }
    })

    if (!location) {
      throw new ApiError('NOT_FOUND', { message: 'Location not found' })
    }

    // 更新每张图片的标签
    const updatePromises = location.images.map(async (image) => {
      if (!image.imageUrl) return null

      const newLabelText = newName
      try {
        const newImageUrl = await updateImageLabel(
          image.imageUrl,
          newLabelText,
          `loc-${id}-${image.imageIndex}`
        )

        // 更新数据库
        await prisma.locationImage.update({
          where: { id: image.id },
          data: { imageUrl: newImageUrl }
        })

        return { imageIndex: image.imageIndex, imageUrl: newImageUrl }
      } catch (e) {
        console.error(`Failed to update label for location image ${image.imageIndex}:`, e)
        return null
      }
    })

    const results = await Promise.all(updatePromises)
    return NextResponse.json({ success: true, results: results.filter(r => r !== null) })
  }

  throw new ApiError('INVALID_PARAMS', { message: 'Invalid type' })
})

/**
 * 更新图片的黑边标签
 * 🔥 修复：使用原始 COS key 覆盖上传，而不是生成新 key
 *    这样 previousImageUrl 仍然指向正确的历史版本
 */
async function updateImageLabel(imageUrl: string, newLabelText: string, keyPrefix: string): Promise<string> {
  // 获取原始 COS key（用于覆盖上传）
  // imageUrl 可能是完整URL或COS key
  let originalKey: string
  if (imageUrl.startsWith('http')) {
    // 从URL中提取key，例如 https://xxx.cos.xxx/images/xxx.jpg?signature... -> images/xxx.jpg
    const urlObj = new URL(imageUrl)
    originalKey = urlObj.pathname.startsWith('/') ? urlObj.pathname.slice(1) : urlObj.pathname
  } else if (imageUrl.startsWith('/api/files/')) {
    // 🔧 本地模式修复：从 /api/files/xxx 提取 key
    originalKey = decodeURIComponent(imageUrl.replace('/api/files/', ''))
  } else {
    originalKey = imageUrl
  }

  // 获取签名 URL 用于下载
  let signedUrl: string
  if (imageUrl.startsWith('http')) {
    signedUrl = imageUrl
  } else if (imageUrl.startsWith('/')) {
    // 🔧 本地模式修复：相对路径需要补全完整 URL
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
    signedUrl = `${baseUrl}${imageUrl}`
  } else {
    signedUrl = getSignedUrl(imageUrl, 3600)
    // 🔧 本地模式修复：如果返回的是相对路径，需要补全
    if (signedUrl.startsWith('/')) {
      const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
      signedUrl = `${baseUrl}${signedUrl}`
    }
  }

  // 下载图片
  const response = await fetch(signedUrl)
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())

  // 获取图片元数据
  const meta = await sharp(buffer).metadata()
  const w = meta.width || 2160
  const h = meta.height || 2160

  // 计算标签条高度（与生成时一致：高度的 4%）
  const fontSize = Math.floor(h * 0.04)
  const pad = Math.floor(fontSize * 0.5)
  const barH = fontSize + pad * 2

  // 裁剪掉顶部的旧标签条
  const croppedBuffer = await sharp(buffer)
    .extract({ left: 0, top: barH, width: w, height: h - barH })
    .toBuffer()

  // 创建新的 SVG 标签条
  const svg = await createLabelSVG(w, barH, fontSize, pad, newLabelText)

  // 添加新标签条到图片顶部
  const processed = await sharp(croppedBuffer)
    .extend({ top: barH, bottom: 0, left: 0, right: 0, background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .composite([{ input: svg, top: 0, left: 0 }])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer()

  // 🔥 使用原始 key 覆盖上传，保持 URL 不变
  // 这样 previousImageUrl 仍然可以正确撤回
  await uploadToCOS(processed, originalKey)
  return originalKey
}

/**
 * 转义 XML 特殊字符
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
