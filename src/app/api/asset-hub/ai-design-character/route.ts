import { NextRequest, NextResponse } from 'next/server'
import { aiDesign } from '@/lib/asset-utils'
import { getUserModelConfig } from '@/lib/config-service'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * 资产中心 - AI 设计角色
 * POST /api/asset-hub/ai-design-character
 * body: { userInstruction: string }
 */
export const POST = apiHandler(async (request: NextRequest) => {
    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

    const { userInstruction } = await request.json()

    // 🔥 使用统一配置服务获取用户模型配置
    const userConfig = await getUserModelConfig(session.user.id)
    if (!userConfig.analysisModel) {
        throw new ApiError('MISSING_CONFIG', { message: '请先在用户设置中配置"AI分析模型"' })
    }

    const result = await aiDesign({
        userId: session.user.id,
        analysisModel: userConfig.analysisModel,
        userInstruction,
        assetType: 'character',
        projectId: 'asset-hub'
    })

    if (!result.success) {
        throw new ApiError('GENERATION_FAILED', { message: result.error })
    }

    return NextResponse.json({ prompt: result.prompt })
})
