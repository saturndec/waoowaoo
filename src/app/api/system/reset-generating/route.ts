import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiHandler } from '@/lib/api-errors'

/**
 * POST /api/system/reset-generating
 * 重置所有卡住的生成状态（服务器重启后调用）
 */
export const POST = apiHandler(async () => {
  console.log('[System] Resetting all generating states...')

  // 并行执行所有重置操作
  const results = await Promise.all([
    // 1. CharacterAppearance.generating
    prisma.characterAppearance.updateMany({
      where: { generating: true },
      data: { generating: false }
    }),

    // 2. LocationImage.generating
    prisma.locationImage.updateMany({
      where: { generating: true },
      data: { generating: false }
    }),

    // 3. NovelPromotionPanel.generatingVideo, generatingImage, generatingLipSync
    prisma.novelPromotionPanel.updateMany({
      where: { OR: [{ generatingVideo: true }, { generatingImage: true }, { generatingLipSync: true }] },
      data: { generatingVideo: false, generatingImage: false, generatingLipSync: false }
    }),

    // 4. NovelPromotionShot.generatingImage
    prisma.novelPromotionShot.updateMany({
      where: { generatingImage: true },
      data: { generatingImage: false }
    }),

    // 5. NovelPromotionStoryboard.generating
    prisma.novelPromotionStoryboard.updateMany({
      where: { generating: true },
      data: { generating: false }
    }),

    // 6. NovelPromotionVoiceLine.generating
    prisma.novelPromotionVoiceLine.updateMany({
      where: { generating: true },
      data: { generating: false }
    })
  ])

  const totalReset = results.reduce((sum, r) => sum + r.count, 0)

  console.log(`[System] Reset ${totalReset} generating states:`, {
    characterAppearance: results[0].count,
    locationImage: results[1].count,
    panel: results[2].count,
    shot: results[3].count,
    storyboard: results[4].count,
    voiceLine: results[5].count
  })

  return NextResponse.json({
    success: true,
    message: `Reset ${totalReset} generating states`,
    details: {
      characterAppearance: results[0].count,
      locationImage: results[1].count,
      panel: results[2].count,
      shot: results[3].count,
      storyboard: results[4].count,
      voiceLine: results[5].count
    }
  })
})

/**
 * GET /api/system/reset-generating
 * 查询当前卡住的生成状态数量
 */
export const GET = apiHandler(async () => {
  const [
    characterAppearance,
    locationImage,
    panel,
    shot,
    storyboard,
    voiceLine
  ] = await Promise.all([
    prisma.characterAppearance.count({ where: { generating: true } }),
    prisma.locationImage.count({ where: { generating: true } }),
    prisma.novelPromotionPanel.count({ where: { OR: [{ generatingVideo: true }, { generatingImage: true }] } }),
    prisma.novelPromotionShot.count({ where: { generatingImage: true } }),
    prisma.novelPromotionStoryboard.count({ where: { generating: true } }),
    prisma.novelPromotionVoiceLine.count({ where: { generating: true } })
  ])

  const total = characterAppearance + locationImage + panel + shot + storyboard + voiceLine

  return NextResponse.json({
    total,
    details: {
      characterAppearance,
      locationImage,
      panel,
      shot,
      storyboard,
      voiceLine
    }
  })
})
