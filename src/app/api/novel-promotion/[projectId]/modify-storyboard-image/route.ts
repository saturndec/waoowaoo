import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { downloadAndUploadToCOS, generateUniqueKey, getSignedUrl } from '@/lib/cos'
import { generateImage } from '@/lib/generator-api'
import { getModelResolution } from '@/lib/api-config'
import fs from 'fs'
import path from 'path'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * 基于现有分镜图片进行修改（图生图）
 * 发送当前图片、修改提示词和可选参考图片
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const session = authResult.session

  const { storyboardId, panelIndex, modifyPrompt, extraImageUrls, selectedAssets } = await request.json()

  if (!storyboardId || panelIndex === undefined || !modifyPrompt) {
    throw new ApiError('INVALID_PARAMS', { message: 'Missing required fields' })
  }

  // 获取项目
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      novelPromotionData: {
        include: {
          characters: { include: { appearances: { orderBy: { appearanceIndex: 'asc' } } } },
          locations: { include: { images: { orderBy: { imageIndex: 'asc' } } } }
        }
      }
    }
  })

  if (!project?.novelPromotionData) {
    throw new ApiError('NOT_FOUND', { message: 'Novel promotion data not found' })
  }

  // 获取 Panel 和关联的 Storyboard + Clip
  const panel = await prisma.novelPromotionPanel.findFirst({
    where: {
      storyboardId: storyboardId,
      panelIndex: panelIndex
    },
    include: {
      storyboard: {
        include: { clip: true }
      }
    }
  })

  if (!panel) {
    throw new ApiError('NOT_FOUND', { message: 'Panel not found' })
  }

  // 获取当前分镜图片
  const currentImageKey = panel.imageUrl
  if (!currentImageKey) {
    throw new ApiError('INVALID_PARAMS', { message: 'No storyboard image to modify' })
  }

  // 保存当前版本到历史记录
  const panelAny = panel as any
  const currentHistory = panelAny.imageHistory ? JSON.parse(panelAny.imageHistory) : []
  currentHistory.push({
    imageUrl: currentImageKey,
    timestamp: Date.now()
  })
  // 只保留最近10个版本
  if (currentHistory.length > 10) {
    currentHistory.shift()
  }

  // 读取编辑提示词模板
  const promptPath = path.join(process.cwd(), 'lib', 'prompts', 'novel-promotion', 'storyboard_edit.txt')
  const promptTemplate = fs.readFileSync(promptPath, 'utf-8')
  const prompt = promptTemplate.replace('{user_input}', modifyPrompt)

  const novelPromotionData = project.novelPromotionData as any
  const videoRatio = novelPromotionData.videoRatio || '16:9'

  // editModel 存在于 UserPreference 表中，需要单独查询
  // 🔥 使用统一配置服务获取模型配置
  const { getUserModelConfig } = await import('@/lib/config-service')
  const userConfig = await getUserModelConfig(session.user.id)
  const editModelConfig = userConfig.editModel
  if (!editModelConfig) {
    throw new ApiError('MISSING_CONFIG', { message: '请先在用户设置中配置"修图/编辑模型"' })
  }

  console.log('='.repeat(80))
  console.log('📝 单个分镜图片修改 - 图生图')
  console.log('='.repeat(80))
  console.log(`分镜ID: ${storyboardId}`)
  console.log(`镜头序号: ${panelIndex}`)
  console.log(`用户指令: ${modifyPrompt}`)
  console.log(`完整提示词: ${prompt}`)
  console.log(`原图片: ${currentImageKey}`)
  console.log(`额外参考图: ${extraImageUrls?.length || 0} 张`)
  console.log(`编辑模型: ${editModelConfig}`)
  console.log('='.repeat(80))

  // 收集资产库参考图片
  const assetImageUrls: string[] = []
  const clip = panel.storyboard?.clip

  // 判断用户是否主动操作了资产选择
  // - selectedAssets 是数组（包括空数组）：用户主动选择/清空了资产，使用用户的选择
  // - selectedAssets 是 undefined/null：用户没有操作，自动从 clip 获取
  const userSelectedAssets = Array.isArray(selectedAssets)

  if (userSelectedAssets) {
    // 用户主动选择了资产（可能是空数组，表示用户清空了所有资产）
    for (const asset of selectedAssets) {
      if (asset.imageUrl) {
        const imageUrl = asset.imageUrl.startsWith('images/')
          ? getSignedUrl(asset.imageUrl, 3600)
          : asset.imageUrl
        assetImageUrls.push(imageUrl)
      }
    }
    console.log(`用户选择资产: ${selectedAssets.length} 个`)
  } else {
    // 用户没有操作资产选择，自动从clip获取资产（兼容旧逻辑）
    // 添加角色图片 - 新结构：appearances 是关联数组
    if (clip?.characters) {
      try {
        const characterNames = JSON.parse(clip.characters)
        for (const charName of characterNames) {
          const character = novelPromotionData.characters.find(
            (c: any) => c.name.toLowerCase() === charName.toLowerCase()
          )
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
                const imageUrl = imageKey.startsWith('images/')
                  ? getSignedUrl(imageKey, 3600)
                  : imageKey
                assetImageUrls.push(imageUrl)
              }
            }
          }
        }
      } catch (e) {
        console.error('Failed to parse characters:', e)
      }
    }

    // 添加场景图片 - 新结构：images 是关联数组
    if (clip?.location) {
      const location = novelPromotionData.locations.find(
        (l: any) => l.name.toLowerCase() === clip.location?.toLowerCase()
      )
      if (location) {
        const images = (location as any).images || []
        const selectedImage = images.find((img: any) => img.isSelected) || images[0]
        if (selectedImage?.imageUrl) {
          const imageUrl = selectedImage.imageUrl.startsWith('images/')
            ? getSignedUrl(selectedImage.imageUrl, 3600)
            : selectedImage.imageUrl
          assetImageUrls.push(imageUrl)
        }
      }
    }
  }

  console.log(`资产库参考图: ${assetImageUrls.length} 张`)

  let newImageUrl: string

  if (editModelConfig === 'banana') {
    const signedUrl = getSignedUrl(currentImageKey, 3600)
    // 顺序：原图 + 资产库图片 + 用户上传图片
    const imageUrls = [signedUrl, ...assetImageUrls]
    if (extraImageUrls?.length) {
      imageUrls.push(...extraImageUrls)
    }

    // 使用新架构生成图片
    const result = await generateImage(
      session.user.id,
      'banana',
      prompt,
      {
        referenceImages: imageUrls,
        aspectRatio: videoRatio === '9:16' ? '9:16' : '16:9',
        resolution: await getModelResolution(session.user.id, 'banana')
      }
    )

    if (!result.success) {
      throw new Error(`BananaPro API failed: ${result.error}`)
    }

    // 检测异步返回
    if (result.async && result.externalId) {
      // 🔥 使用生成器返回的标准格式 externalId（不再手动构造）
      await prisma.novelPromotionPanel.update({
        where: { id: panel.id },
        data: {
          candidateImages: JSON.stringify([`PENDING:${result.externalId}`]),
          generatingImage: true
        }
      })

      return NextResponse.json({
        success: true,
        async: true,
        message: '分镜图片修改任务已提交，请稍后查看'
      })
    }

    newImageUrl = result.imageUrl!
  } else {
    // 🔥 使用统一接口调用 Seedream（原来是直接调用 arkImageGeneration）
    const signedUrl = getSignedUrl(currentImageKey, 3600)
    // 顺序：原图 + 资产库图片 + 用户上传图片
    const imageUrls = [signedUrl, ...assetImageUrls]
    if (extraImageUrls?.length) {
      imageUrls.push(...extraImageUrls)
    }

    const seedreamModel = editModelConfig === 'seedream4' ? 'seedream4' : 'seedream4.5'
    // SeeDream 要求最少 3,686,400 像素，所以使用 2560x1440 (QHD/2K+)
    const size = videoRatio === '9:16' ? '1440x2560' : '2560x1440'

    const result = await generateImage(
      session.user.id,
      seedreamModel,
      prompt,
      {
        referenceImages: imageUrls,
        aspectRatio: videoRatio === '9:16' ? '9:16' : '16:9',
        size,
        resolution: '2K'
      }
    )

    if (!result.success) {
      throw new Error(`Seedream API failed: ${result.error}`)
    }

    // Seedream 目前是同步返回
    if (!result.imageUrl) {
      throw new Error('No image URL from Seedream API')
    }
    newImageUrl = result.imageUrl
  }

  // 上传到COS
  const key = generateUniqueKey(`storyboard-modified-${storyboardId}-${panelIndex}`, 'png')
  const cosKey = await downloadAndUploadToCOS(newImageUrl, key)

  // 更新 Panel 的 imageUrl（包含历史记录）
  await prisma.novelPromotionPanel.update({
    where: { id: panel.id },
    data: {
      imageUrl: cosKey,
      imageHistory: JSON.stringify(currentHistory)
    } as any
  })

  // 返回签名URL
  const signedUrl = getSignedUrl(cosKey, 3600)

  return NextResponse.json({ success: true, imageUrl: signedUrl, cosKey })
})
