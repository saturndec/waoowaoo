import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { chatCompletion, getCompletionContent } from '@/lib/llm-client'
import { recordText } from '@/lib/pricing'
import fs from 'fs'
import path from 'path'
import { removeCharacterPromptSuffix } from '@/lib/constants'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult
  const session = authResult.session
  const novelData = authResult.novelData

  const body = await request.json()
  const { characterId, appearanceId, currentDescription, modifyInstruction } = body

  if (!characterId || !appearanceId || !currentDescription || !modifyInstruction) {
    throw new ApiError('INVALID_PARAMS', { message: 'Missing required fields' })
  }

  // 读取提示词模板
  const promptPath = path.join(process.cwd(), 'lib/prompts/novel-promotion/character_modify.txt')
  let promptTemplate = fs.readFileSync(promptPath, 'utf-8')

  // 移除当前描述中的系统后缀
  const cleanDescription = removeCharacterPromptSuffix(currentDescription)

  // 替换占位符
  const finalPrompt = promptTemplate
    .replace('{character_input}', cleanDescription)
    .replace('{user_input}', modifyInstruction)

  // 调用AI（开启 reasoning）
  const analysisModel = novelData.analysisModel

  const completion = await chatCompletion(
    session.user.id,
    analysisModel,
    [{ role: 'user', content: finalPrompt }],
    { temperature: 0.7, skipBilling: true }  // 费用通过 recordText 单独处理
  )

  const responseText = getCompletionContent(completion)

  // 解析JSON响应 - 期望格式: {"prompt":"xxxxx"}
  let modifiedDescription: string
  try {
    // 移除可能的markdown代码块标记
    let cleanedResponse = responseText.trim()
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '')
    } else if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '')
    }

    // 尝试提取JSON
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
    console.error('Failed to parse AI response:', responseText)
    throw new ApiError('GENERATION_FAILED', { message: 'AI返回格式错误，请重试', details: responseText })
  }

  // 记录费用
  const usage = (completion as any).usage
  if (usage) {
    await recordText({
      projectId,
      userId: session.user.id,
      model: analysisModel,
      action: 'ai-modify-appearance',
      inputTokens: usage.prompt_tokens || 0,
      outputTokens: usage.completion_tokens || 0
    })
  }

  return NextResponse.json({
    success: true,
    modifiedDescription,
    originalPrompt: finalPrompt,
    rawResponse: responseText
  })
})
