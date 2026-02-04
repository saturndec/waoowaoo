import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logAIAnalysis } from '@/lib/logger'
import { getSignedUrl, uploadToCOS, generateUniqueKey } from '@/lib/cos'
import { fetchWithTimeoutAndRetry } from '@/lib/ark-api'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

// 固定后缀
const PANEL_IMAGE_SUFFIX = '按照参考原素材图片和参考分镜图片生成分镜，注意，分镜仅供参考，可以有略微的区别，而不是完全一模一样，要以高清，符合我们的原素材形象为主'

/**
 * POST /api/novel-promotion/[projectId]/generate-panel-image
 * 使用SeeDream 4.5生成镜头图片
 * 输入：分镜图片 + 角色/场景参考图片 + 文字分镜提示词
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult
  const session = authResult.session
  const project = authResult.project

  const body = await request.json()
  const { storyboardId, panelIndex, all } = body

  // 获取项目及相关数据（包含 panels）
  const fullProject = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      novelPromotionData: {
        include: {
          characters: { include: { appearances: { orderBy: { appearanceIndex: 'asc' } } } },
          locations: { include: { images: { orderBy: { imageIndex: 'asc' } } } },
          episodes: {
            include: {
              storyboards: {
                include: {
                  clip: true,
                  panels: { orderBy: { panelIndex: 'asc' } }
                }
              }
            }
          }
        }
      }
    }
  })

  if (!fullProject?.novelPromotionData) {
    throw new ApiError('NOT_FOUND', { message: 'Project data not found' })
  }

  const novelPromotionData = fullProject.novelPromotionData
  const projectName = project.name

  // 生成单个panel图片的函数（从 panels 表读取）
  async function generatePanelImage(storyboard: any, pIndex: number) {
    const panels = storyboard.panels || []

    if (pIndex < 0 || pIndex >= panels.length) {
      throw new Error(`Invalid panel index: ${pIndex}`)
    }

    const panel = panels[pIndex]
    const panelImageUrl = panel.imageUrl
    const panelData = {
      panel_number: panel.panelNumber,
      shot_type: panel.shotType,
      camera_move: panel.cameraMove,
      description: panel.description,
      location: panel.location,
      characters: panel.characters ? JSON.parse(panel.characters).map((c: any) => typeof c === 'string' ? c : c.name) : [],
      srt_range: panel.srtStart && panel.srtEnd ? [panel.srtStart, panel.srtEnd] : null,
      duration: panel.duration
    }

    if (!panelImageUrl || !panelData) {
      throw new Error(`Panel data not found for index ${pIndex}`)
    }

    // 收集参考图片 URL（角色+场景）
    const referenceImageUrls: string[] = []

    // 先添加分镜图片作为主要参考
    referenceImageUrls.push(panelImageUrl)

    // 获取该panel涉及的角色图片 - 新结构：appearances 是关联数组
    const panelCharacters = panelData.characters || []
    for (const charName of panelCharacters) {
      const character = novelPromotionData.characters.find((c: any) => c.name === charName)
      if (character) {
        const appearances = (character as any).appearances || []
        const firstAppearance = appearances[0]
        if (firstAppearance) {
          // 🔥 优先使用选中的图片（从 imageUrls 数组中根据 selectedIndex 选择）
          let imageKey: string | null = null

          // 解析 imageUrls 数组
          let imageUrls: string[] = []
          if (firstAppearance.imageUrls) {
            try {
              imageUrls = typeof firstAppearance.imageUrls === 'string'
                ? JSON.parse(firstAppearance.imageUrls)
                : firstAppearance.imageUrls
            } catch { }
          }

          // 选择图片：优先使用 selectedIndex 指向的图片
          const selectedIndex = firstAppearance.selectedIndex
          if (selectedIndex !== null && selectedIndex !== undefined && imageUrls[selectedIndex]) {
            imageKey = imageUrls[selectedIndex]
          } else if (imageUrls.length > 0 && imageUrls[0]) {
            imageKey = imageUrls[0]
          } else if (firstAppearance.imageUrl) {
            imageKey = firstAppearance.imageUrl
          }

          if (imageKey) {
            // 🔥 将 COS key 转为签名 URL
            const signedUrl = imageKey.startsWith('images/')
              ? getSignedUrl(imageKey, 3600)
              : imageKey
            referenceImageUrls.push(signedUrl)
          }
        }
      }
    }

    // 获取该panel的场景图片 - 新结构：images 是关联数组
    const panelLocation = panelData.location
    if (panelLocation) {
      const location = novelPromotionData.locations.find((l: any) => l.name === panelLocation)
      if (location) {
        const images = (location as any).images || []
        const selectedImage = images.find((img: any) => img.isSelected) || images[0]
        if (selectedImage?.imageUrl) {
          // 🔥 将 COS key 转为签名 URL
          const signedUrl = selectedImage.imageUrl.startsWith('images/')
            ? getSignedUrl(selectedImage.imageUrl, 3600)
            : selectedImage.imageUrl
          referenceImageUrls.push(signedUrl)
        }
      }
    }

    // 构建提示词：文字分镜描述 + 固定后缀
    const description = panelData.description || ''
    const shotType = panelData.shot_type || ''
    const cameraMove = panelData.camera_move || ''
    const prompt = `${shotType}，${cameraMove}，${description}，${PANEL_IMAGE_SUFFIX}`

    // 记录日志
    logAIAnalysis(session.user.id, session.user.name, projectId, projectName, {
      action: 'GENERATE_STORYBOARD_IMAGES',
      input: {
        分镜序号: pIndex + 1,
        镜头类型: shotType,
        画面描述: description,
        角色: panelCharacters,
        场景: panelLocation,
        参考图片数: referenceImageUrls.length,
        完整提示词: prompt
      },
      model: 'SeeDream 4.5'
    })

    // 🔥 使用统一的 generateImage 接口（原来是直接调用 arkImageGeneration）
    const aspectRatio = novelPromotionData.videoRatio === '9:16' ? '9:16' : '16:9'

    // 动态 import 以避免循环依赖
    const { generateImage } = await import('@/lib/generator-api')

    const result = await generateImage(
      session.user.id,
      'seedream4.5',  // 分镜图片使用 Seedream 4.5
      prompt,
      {
        referenceImages: referenceImageUrls,
        aspectRatio,
        resolution: '4K'  // 分镜使用 4K 分辨率
      }
    )

    if (!result.success) {
      throw new Error(`SeeDream生成失败: ${result.error}`)
    }

    if (!result.imageUrl) {
      throw new Error('SeeDream未返回图片URL')
    }

    // 下载并上传到COS（使用带超时和重试的fetch）
    const imageResponse = await fetchWithTimeoutAndRetry(result.imageUrl, {
      logPrefix: `[下载分镜图片 ${pIndex + 1}]`
    })
    if (!imageResponse.ok) {
      throw new Error('Failed to download generated image')
    }
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer())
    const key = generateUniqueKey(`panel-${storyboard.id}-${pIndex + 1}`, 'png')
    const cosKey = await uploadToCOS(imageBuffer, key)
    const signedUrl = getSignedUrl(cosKey, 7 * 24 * 3600)

    console.log(`✓ Generated panel ${pIndex + 1} image: ${cosKey}`)

    return { panelIndex: pIndex, imageUrl: signedUrl }
  }

  // 从 episodes 中获取所有 storyboards
  const allStoryboards: any[] = []
  for (const episode of novelPromotionData.episodes || []) {
    allStoryboards.push(...(episode.storyboards || []))
  }

  // 如果是生成所有panel（从 panels 表读取）
  if (all) {
    const storyboards = allStoryboards.filter((s: any) => s.panels && s.panels.length > 0)

    const results: any[] = []

    for (const storyboard of storyboards) {
      const panels = (storyboard as any).panels || []

      for (let i = 0; i < panels.length; i++) {
        try {
          const result = await generatePanelImage(storyboard, i)
          results.push({ storyboardId: storyboard.id, ...result, success: true })
        } catch (error: any) {
          console.error(`Failed to generate panel ${i + 1} of storyboard ${storyboard.id}:`, error.message)
          results.push({ storyboardId: storyboard.id, panelIndex: i, success: false, error: error.message })
        }
      }
    }

    return NextResponse.json({
      success: true,
      results,
      total: results.length,
      successCount: results.filter(r => r.success).length
    })
  }

  // 生成单个panel
  if (!storyboardId || panelIndex === undefined) {
    throw new ApiError('INVALID_PARAMS', { message: 'Missing storyboardId or panelIndex' })
  }

  const storyboard = allStoryboards.find((s: any) => s.id === storyboardId)
  if (!storyboard) {
    throw new ApiError('NOT_FOUND', { message: 'Storyboard not found' })
  }

  const result = await generatePanelImage(storyboard, panelIndex)

  return NextResponse.json({
    success: true,
    ...result
  })
})
