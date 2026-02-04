import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { TASK_STATUS } from '@/lib/async-task-manager'

/**
 * POST - 清除生成状态
 * 
 * 用于用户点击"取消"按钮时，清除数据库中的generating字段
 * 注意：不会取消外部任务，只是清除UI状态让用户可以重新操作
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
    const { type, targetId } = body as {
        type:
            | 'character_image'
            | 'character_appearance'
            | 'location_image'
            | 'panel_image'
            | 'panel_video'
            | 'panel_lip_sync'
            | 'shot_image'
            | 'voice_line'
            | 'storyboard_text'
        targetId: string
    }

    const normalizedType = type === 'character_image' ? 'character_appearance' : type

    console.log('[clear-generating] 清除状态:', { type: normalizedType, targetId })

    try {
        switch (normalizedType) {
            case 'character_appearance': {
                // 清除角色外观图片生成状态
                await prisma.characterAppearance.update({
                    where: { id: targetId },
                    data: { generating: false }
                })
                console.log('[clear-generating] ✅ 已清除角色图片生成状态')
                break
            }

            case 'location_image': {
                // 清除场景图片生成状态
                await prisma.locationImage.update({
                    where: { id: targetId },
                    data: { generating: false }
                })
                console.log('[clear-generating] ✅ 已清除场景图片生成状态')
                break
            }

            case 'panel_image': {
                // 清除分镜面板图片生成状态
                await prisma.novelPromotionPanel.update({
                    where: { id: targetId },
                    data: { generatingImage: false, candidateImages: null }
                })
                console.log('[clear-generating] ✅ 已清除分镜图片生成状态')
                break
            }

            case 'panel_video': {
                // 清除分镜面板视频生成状态
                await prisma.novelPromotionPanel.update({
                    where: { id: targetId },
                    data: { generatingVideo: false }
                })
                console.log('[clear-generating] ✅ 已清除分镜视频生成状态')
                break
            }

            case 'panel_lip_sync': {
                // 清除分镜面板口型同步生成状态
                await prisma.novelPromotionPanel.update({
                    where: { id: targetId },
                    data: { generatingLipSync: false, lipSyncTaskId: null }
                })
                console.log('[clear-generating] ✅ 已清除口型同步生成状态')
                break
            }

            case 'shot_image': {
                // 清除镜头图片生成状态
                await prisma.novelPromotionShot.update({
                    where: { id: targetId },
                    data: { generatingImage: false }
                })
                console.log('[clear-generating] ✅ 已清除镜头图片生成状态')
                break
            }

            case 'voice_line': {
                // 清除配音行生成状态
                await prisma.novelPromotionVoiceLine.update({
                    where: { id: targetId },
                    data: { generating: false }
                })
                console.log('[clear-generating] ✅ 已清除配音生成状态')
                break
            }

            case 'storyboard_text': {
                await prisma.novelPromotionStoryboard.update({
                    where: { id: targetId },
                    data: { generating: false, candidateImages: null, lastError: null }
                })
                console.log('[clear-generating] ✅ 已清除分镜文本生成状态')
                break
            }

            default:
                console.error('[clear-generating] ❌ 未知类型:', normalizedType)
                return NextResponse.json(
                    { error: `未知的类型: ${normalizedType}` },
                    { status: 400 }
                )
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
    } catch (error: any) {
        console.error('[clear-generating] ❌ 数据库更新失败:', error)
        return NextResponse.json(
            { error: `清除状态失败: ${error.message}` },
            { status: 500 }
        )
    }

    return NextResponse.json({ success: true })
})
