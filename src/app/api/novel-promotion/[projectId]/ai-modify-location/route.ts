import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { removeLocationPromptSuffix } from '@/lib/constants'
import { chatCompletion, getCompletionContent } from '@/lib/llm-client'
import { recordText } from '@/lib/pricing'
import fs from 'fs'
import path from 'path'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params
  const { locationId, imageIndex = 0, currentDescription, modifyInstruction } = await request.json()

  if (!locationId || !currentDescription || !modifyInstruction) {
    throw new ApiError('INVALID_PARAMS', { message: '缺少必要参数' })
  }

  // 🔐 统一权限验证
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult
  const session = authResult.session
  const novelData = authResult.novelData

  // 获取场景信息
  const location = await prisma.novelPromotionLocation.findUnique({
    where: { id: locationId }
  })

  if (!location) {
    throw new ApiError('NOT_FOUND', { message: 'Location not found' })
  }

  // 读取提示词模板
  const promptPath = path.join(process.cwd(), 'lib/prompts/novel-promotion/location_modify.txt')
  let promptTemplate = fs.readFileSync(promptPath, 'utf-8')

  // 替换占位符
  const finalPrompt = promptTemplate
    .replace('{location_name}', location.name)
    .replace('{location_input}', currentDescription)
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

  // 解析JSON响应
  let result
  try {
    const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    result = JSON.parse(cleanedText)
  } catch (parseError) {
    console.error('Failed to parse AI response:', responseText)
    throw new ApiError('GENERATION_FAILED', { message: 'AI返回格式错误' })
  }

  if (!result.prompt) {
    throw new ApiError('GENERATION_FAILED', { message: 'AI未返回有效的场景描述' })
  }

  // 更新数据库（移除可能存在的系统后缀，后缀只在生成图片时添加）
  const cleanDescription = removeLocationPromptSuffix(result.prompt)

  // 更新 LocationImage 表中对应的记录
  const locationImage = await prisma.locationImage.findFirst({
    where: { locationId, imageIndex }
  })

  if (!locationImage) {
    throw new ApiError('NOT_FOUND', { message: 'Location image not found' })
  }

  await prisma.locationImage.update({
    where: { id: locationImage.id },
    data: { description: cleanDescription }
  })

  // 返回更新后的完整 location 数据
  const updatedLocation = await prisma.novelPromotionLocation.findUnique({
    where: { id: locationId },
    include: { images: { orderBy: { imageIndex: 'asc' } } }
  })

  // 记录费用
  const usage = (completion as any).usage
  if (usage) {
    await recordText({
      projectId,
      userId: session.user.id,
      model: analysisModel,
      action: 'ai-modify-location',
      inputTokens: usage.prompt_tokens || 0,
      outputTokens: usage.completion_tokens || 0
    })
  }

  return NextResponse.json({
    prompt: result.prompt,
    location: updatedLocation
  })
})
