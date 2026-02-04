import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { chatCompletion, getCompletionContent } from '@/lib/llm-client'
import { removeCharacterPromptSuffix } from '@/lib/constants'
import fs from 'fs'
import path from 'path'
import { getUserModelConfig } from '@/lib/config-service'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * 资产中心 - AI 修改角色形象描述
 * POST /api/asset-hub/ai-modify-character
 * body: { characterId, appearanceIndex, currentDescription, modifyInstruction }
 */
export const POST = apiHandler(async (request: NextRequest) => {
    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

    const { characterId, appearanceIndex, currentDescription, modifyInstruction } = await request.json()

    if (!characterId || !appearanceIndex || !currentDescription || !modifyInstruction) {
        throw new ApiError('INVALID_PARAMS', { message: 'Missing required fields' })
    }

    // 验证角色所有权
    const character = await prisma.globalCharacter.findUnique({
        where: { id: characterId }
    })

    if (!character || character.userId !== session.user.id) {
        throw new ApiError('NOT_FOUND')
    }

    // 🔥 使用统一配置服务获取用户模型配置
    const userConfig = await getUserModelConfig(session.user.id)
    if (!userConfig.analysisModel) {
        throw new ApiError('MISSING_CONFIG', { message: '请先在用户配置中设置分析模型' })
    }
    const analysisModel = userConfig.analysisModel

    // 读取提示词模板
    const promptPath = path.join(process.cwd(), 'lib/prompts/novel-promotion/character_modify.txt')
    let promptTemplate = fs.readFileSync(promptPath, 'utf-8')

    // 移除当前描述中的系统后缀
    const cleanDescription = removeCharacterPromptSuffix(currentDescription)

    // 替换占位符
    const finalPrompt = promptTemplate
        .replace('{character_input}', cleanDescription)
        .replace('{user_input}', modifyInstruction)

    // 调用 AI
    const completion = await chatCompletion(
        session.user.id,
        analysisModel,
        [{ role: 'user', content: finalPrompt }],
        { temperature: 0.7, projectId: 'asset-hub', action: 'ai_modify_character' }
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
