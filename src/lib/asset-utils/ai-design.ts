/**
 * AI 设计共享工具函数
 * 统一处理 Asset Hub 和 Novel Promotion 的 AI 设计逻辑
 */

import { chatCompletion, getCompletionContent } from '@/lib/llm-client'
import fs from 'fs'
import path from 'path'

export type AssetType = 'character' | 'location'

export interface AIDesignOptions {
    userId: string
    analysisModel: string
    userInstruction: string
    assetType: AssetType
    /** 用于计费的上下文：'asset-hub' 或实际的 projectId */
    projectId?: string
}

export interface AIDesignResult {
    success: boolean
    prompt?: string
    error?: string
}

/**
 * AI 设计通用函数
 * 根据用户指令生成角色或场景的 prompt 描述
 */
export async function aiDesign(options: AIDesignOptions): Promise<AIDesignResult> {
    const { userId, analysisModel, userInstruction, assetType, projectId = 'asset-hub' } = options

    if (!userInstruction?.trim()) {
        return {
            success: false,
            error: assetType === 'character' ? '请输入人物设计需求' : '请输入场景设计需求'
        }
    }

    if (!analysisModel) {
        return {
            success: false,
            error: '请先在用户配置中设置分析模型'
        }
    }

    // 选择提示词模板
    const promptFileName = assetType === 'character' ? 'character_create.txt' : 'location_create.txt'
    const promptPath = path.join(process.cwd(), 'lib/prompts/novel-promotion', promptFileName)

    let promptTemplate: string
    try {
        promptTemplate = fs.readFileSync(promptPath, 'utf-8')
    } catch (err) {
        console.error(`[AI Design] 提示词文件不存在: ${promptPath}`)
        return { success: false, error: '系统配置错误' }
    }

    // 替换占位符
    const finalPrompt = promptTemplate.replace('{user_input}', userInstruction)

    // 调用 LLM
    const action = assetType === 'character' ? 'ai_design_character' : 'ai_design_location'
    const completion = await chatCompletion(
        userId,
        analysisModel,
        [{ role: 'user', content: finalPrompt }],
        { temperature: 0.7, projectId, action }
    )

    const aiResponse = getCompletionContent(completion)

    if (!aiResponse) {
        return { success: false, error: 'AI返回内容为空' }
    }

    // 解析 JSON 响应
    let parsedResponse
    try {
        parsedResponse = JSON.parse(aiResponse)
    } catch (e) {
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
            try {
                parsedResponse = JSON.parse(jsonMatch[0])
            } catch {
                console.error('[AI Design] AI 响应解析失败:', aiResponse)
                return { success: false, error: 'AI返回格式错误' }
            }
        } else {
            console.error('[AI Design] AI 响应解析失败:', aiResponse)
            return { success: false, error: 'AI返回格式错误' }
        }
    }

    if (!parsedResponse.prompt) {
        return { success: false, error: 'AI返回缺少prompt字段' }
    }

    return {
        success: true,
        prompt: parsedResponse.prompt
    }
}
