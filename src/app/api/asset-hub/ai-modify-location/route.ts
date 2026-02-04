import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { chatCompletion, getCompletionContent } from '@/lib/llm-client'
import { removeLocationPromptSuffix } from '@/lib/constants'
import fs from 'fs'
import path from 'path'
import { getUserModelConfig } from '@/lib/config-service'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * 资产中心 - AI 修改场景描述
 * POST /api/asset-hub/ai-modify-location
 * body: { locationId, imageIndex, currentDescription, modifyInstruction }
 */
export const POST = apiHandler(async (request: NextRequest) => {
    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

    const { locationId, imageIndex, currentDescription, modifyInstruction } = await request.json()

    if (!locationId || imageIndex === undefined || !currentDescription || !modifyInstruction) {
        throw new ApiError('INVALID_PARAMS', { message: 'Missing required fields' })
    }

    // 验证场景所有权
    const location = await prisma.globalLocation.findUnique({
        where: { id: locationId }
    })

    if (!location || location.userId !== session.user.id) {
        throw new ApiError('NOT_FOUND')
    }

    // 🔥 使用统一配置服务获取用户模型配置
    const userConfig = await getUserModelConfig(session.user.id)
    if (!userConfig.analysisModel) {
        throw new ApiError('MISSING_CONFIG', { message: '请先在用户配置中设置分析模型' })
    }
    const analysisModel = userConfig.analysisModel

    // 读取提示词模板
    const promptPath = path.join(process.cwd(), 'lib/prompts/novel-promotion/location_modify.txt')
    let promptTemplate = fs.readFileSync(promptPath, 'utf-8')

    // 移除当前描述中的系统后缀
    const cleanDescription = removeLocationPromptSuffix(currentDescription)

    // 替换占位符
    const finalPrompt = promptTemplate
        .replace('{location_name}', location.name)
        .replace('{location_input}', cleanDescription)
        .replace('{user_input}', modifyInstruction)

    // 调用 AI
    const completion = await chatCompletion(
        session.user.id,
        analysisModel,
        [{ role: 'user', content: finalPrompt }],
        { temperature: 0.7, projectId: 'asset-hub', action: 'ai_modify_location' }
    )

    const responseText = getCompletionContent(completion)

    // 解析 JSON 响应
    let modifiedDescription: string
    try {
        let cleanedResponse = responseText.trim()
        if (cleanedResponse.startsWith('```json')) {
            cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '')
        } else if (cleanedResponse.startsWith('```')) {
            cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '')
        }

        const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
            throw new Error('No JSON found in response')
        }

        const parsed = JSON.parse(jsonMatch[0])
        modifiedDescription = parsed.prompt

        if (!modifiedDescription) {
            throw new Error('No prompt field in response')
        }
    } catch (parseError) {
        console.error('[资产中心] AI 响应解析失败:', responseText)
        throw new ApiError('GENERATION_FAILED', { message: 'AI返回格式错误，请重试', details: responseText })
    }

    return NextResponse.json({
        success: true,
        modifiedDescription
    })
})
