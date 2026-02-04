/**
 * POST /api/cancel-generation
 * 统一取消生成 API
 * 
 * 用于用户手动取消正在进行中的生成任务
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { TASK_STATUS } from '@/lib/async-task-manager'

// 支持的取消类型
const CANCEL_TYPES = {
    character_appearance: 'character_appearance',
    location_image: 'location_image',
    panel_image: 'panel_image',
    panel_video: 'panel_video',
    panel_lip_sync: 'panel_lip_sync',
    voice_line: 'voice_line',
    storyboard_text: 'storyboard_text',
    shot_image: 'shot_image',
    global_character: 'global_character',
    global_location: 'global_location'
} as const

type CancelType = typeof CANCEL_TYPES[keyof typeof CANCEL_TYPES]

export const POST = apiHandler(async (request: NextRequest) => {
    // 🔐 权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult

    const body = await request.json()
    const { type, targetId } = body as { type: CancelType; targetId: string }

    if (!type || !targetId) {
        throw new ApiError('INVALID_PARAMS', { message: '缺少 type 或 targetId' })
    }

    if (!Object.values(CANCEL_TYPES).includes(type)) {
        throw new ApiError('INVALID_PARAMS', { message: `不支持的取消类型: ${type}` })
    }

    console.log(`[CancelGeneration] 取消生成: type=${type}, targetId=${targetId}`)

    try {
        // 根据类型重置不同实体的生成状态
        switch (type) {
            case 'character_appearance':
                await prisma.characterAppearance.update({
                    where: { id: targetId },
                    data: { generating: false }
                })
                break

            case 'location_image':
                await prisma.locationImage.update({
                    where: { id: targetId },
                    data: { generating: false }
                })
                break

            case 'panel_image':
                await prisma.novelPromotionPanel.update({
                    where: { id: targetId },
                    data: { generatingImage: false, candidateImages: null }
                })
                break

            case 'panel_video':
                await prisma.novelPromotionPanel.update({
                    where: { id: targetId },
                    data: { generatingVideo: false }
                })
                break

            case 'panel_lip_sync':
                await prisma.novelPromotionPanel.update({
                    where: { id: targetId },
                    data: { generatingLipSync: false, lipSyncTaskId: null }
                })
                break

            case 'voice_line':
                await prisma.novelPromotionVoiceLine.update({
                    where: { id: targetId },
                    data: { generating: false }
                })
                break

            case 'storyboard_text':
                await prisma.novelPromotionStoryboard.update({
                    where: { id: targetId },
                    data: { generating: false, lastError: null, candidateImages: null }
                })
                break

            case 'shot_image':
                await prisma.novelPromotionShot.update({
                    where: { id: targetId },
                    data: { generatingImage: false }
                })
                break

            case 'global_character':
                await prisma.globalCharacterAppearance.update({
                    where: { id: targetId },
                    data: { generating: false }
                })
                break

            case 'global_location':
                await prisma.globalLocationImage.update({
                    where: { id: targetId },
                    data: { generating: false }
                })
                break
        }

        // 同时取消关联的 AsyncTask（如果存在）
        await prisma.asyncTask.updateMany({
            where: {
                targetId,
                status: { in: [TASK_STATUS.PENDING, TASK_STATUS.PROCESSING] }
            },
            data: {
                status: TASK_STATUS.FAILED,
                error: '用户取消'
            }
        })

        console.log(`[CancelGeneration] ✅ 取消成功: type=${type}, targetId=${targetId}`)

        return NextResponse.json({
            success: true,
            message: '已取消生成'
        })

    } catch (error: any) {
        console.error(`[CancelGeneration] ❌ 取消失败:`, error.message)

        // 如果是记录不存在，返回友好错误
        if (error.code === 'P2025') {
            throw new ApiError('NOT_FOUND', { message: '找不到要取消的任务' })
        }

        throw error
    }
})
