import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { chatCompletion, getCompletionContent } from '@/lib/llm-client'
import { recordText } from '@/lib/pricing'
import fs from 'fs'
import path from 'path'
import { logAIAnalysis } from '@/lib/logger'
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
  const project = authResult.project
  const novelData = authResult.novelData

  const body = await request.json()
  const { currentPrompt, currentVideoPrompt, modifyInstruction, referencedAssets } = body

  if (!currentPrompt || !modifyInstruction) {
    throw new ApiError('INVALID_PARAMS', { message: 'Missing required fields' })
  }

  // 读取提示词模板
  const promptPath = path.join(process.cwd(), 'lib/prompts/novel-promotion/image_prompt_modify.txt')
  let promptTemplate = fs.readFileSync(promptPath, 'utf-8')

  // 构建用户输入，包含修改指令和引用的资产描述
  let userInput = modifyInstruction

  // 如果有引用的资产，添加到用户输入中
  if (referencedAssets && referencedAssets.length > 0) {
    const assetDescriptions = referencedAssets.map((asset: any) => {
      return `${asset.name}(${asset.description})`
    }).join('，')

    userInput = `${modifyInstruction}\n\n引用的资产描述：${assetDescriptions}`
  }

  // 替换占位符
  const finalPrompt = promptTemplate
    .replace('{prompt_input}', currentPrompt)
    .replace('{video_prompt_input}', currentVideoPrompt || '无')
    .replace('{user_input}', userInput)

  // 调用AI（开启 reasoning）
  const analysisModel = novelData.analysisModel

  // 记录发送给AI的内容
  logAIAnalysis(
    session.user.id,
    session.user.name,
    projectId,
    project.name,
    {
      action: 'AI_MODIFY_SHOT_PROMPT',
      input: {
        currentPrompt,
        currentVideoPrompt,
        modifyInstruction,
        referencedAssets,
        fullPrompt: finalPrompt
      },
      model: analysisModel
    }
  )

  const completion = await chatCompletion(
    session.user.id,
    analysisModel,
    [{ role: 'user', content: finalPrompt }],
    { temperature: 0.7, skipBilling: true }  // 费用通过 recordText 单独处理
  )

  const aiResponse = getCompletionContent(completion)

  if (!aiResponse) {
    logAIAnalysis(
      session.user.id,
      session.user.name,
      projectId,
      project.name,
      {
        action: 'AI_MODIFY_SHOT_PROMPT',
        input: { currentPrompt, modifyInstruction },
        model: analysisModel,
        error: 'AI返回内容为空'
      }
    )
    throw new ApiError('GENERATION_FAILED', { message: 'AI返回内容为空' })
  }

  // 解析JSON响应
  let parsedResponse
  try {
    parsedResponse = JSON.parse(aiResponse)
  } catch (e) {
    console.error('First JSON parse failed:', e)
    console.error('AI raw response:', aiResponse)

    // 尝试提取JSON
    let jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      let extractedJson = jsonMatch[0]
      console.log('Extracted JSON (before cleanup):', extractedJson)

      // 清理可能的问题：
      // 1. 移除JSON中的注释（// 或 /* */）
      extractedJson = extractedJson.replace(/\/\/.*$/gm, '')  // 移除单行注释
      extractedJson = extractedJson.replace(/\/\*[\s\S]*?\*\//g, '')  // 移除多行注释

      // 2. 移除多余的逗号（在}或]前的逗号）
      extractedJson = extractedJson.replace(/,(\s*[}\]])/g, '$1')

      console.log('Extracted JSON (after cleanup):', extractedJson)

      try {
        parsedResponse = JSON.parse(extractedJson)
      } catch (e2) {
        console.error('Second JSON parse failed:', e2)
        console.error('Extracted JSON that failed:', extractedJson)

        logAIAnalysis(
          session.user.id,
          session.user.name,
          projectId,
          project.name,
          {
            action: 'AI_MODIFY_SHOT_PROMPT',
            input: { currentPrompt, modifyInstruction },
            model: analysisModel,
            error: `JSON解析失败: ${e2}`,
            output: { rawResponse: aiResponse, extractedJson }
          }
        )

        throw new ApiError('GENERATION_FAILED', {
          message: 'AI返回格式错误',
          details: `JSON解析失败: ${e2}`,
          rawResponse: aiResponse
        })
      }
    } else {
      console.error('No JSON found in AI response:', aiResponse)

      logAIAnalysis(
        session.user.id,
        session.user.name,
        projectId,
        project.name,
        {
          action: 'AI_MODIFY_SHOT_PROMPT',
          input: { currentPrompt, modifyInstruction },
          model: analysisModel,
          error: '未找到JSON格式',
          output: { rawResponse: aiResponse }
        }
      )

      throw new ApiError('GENERATION_FAILED', {
        message: 'AI返回格式错误',
        details: '未找到JSON格式',
        rawResponse: aiResponse
      })
    }
  }

  // 验证返回格式（支持新旧两种格式）
  let imagePrompt = ''
  let videoPrompt = ''

  if (parsedResponse.image_prompt && parsedResponse.video_prompt) {
    // 新格式：同时返回图片和视频提示词
    imagePrompt = parsedResponse.image_prompt
    videoPrompt = parsedResponse.video_prompt
  } else if (parsedResponse.prompt) {
    // 旧格式：只返回图片提示词（向后兼容）
    imagePrompt = parsedResponse.prompt
    videoPrompt = '' // 视频提示词为空，前端不更新
  } else {
    logAIAnalysis(
      session.user.id,
      session.user.name,
      projectId,
      project.name,
      {
        action: 'AI_MODIFY_SHOT_PROMPT',
        input: { currentPrompt, modifyInstruction },
        model: analysisModel,
        error: 'AI返回格式错误：缺少必要字段',
        output: { rawResponse: aiResponse }
      }
    )
    throw new ApiError('GENERATION_FAILED', { message: 'AI返回格式错误' })
  }

  // 记录成功的AI返回
  logAIAnalysis(
    session.user.id,
    session.user.name,
    projectId,
    project.name,
    {
      action: 'AI_MODIFY_SHOT_PROMPT',
      input: {
        currentPrompt,
        currentVideoPrompt,
        modifyInstruction,
        referencedAssets
      },
      output: {
        modifiedImagePrompt: imagePrompt,
        modifiedVideoPrompt: videoPrompt,
        rawResponse: aiResponse
      },
      model: analysisModel
    }
  )

  // 记录费用
  const usage = (completion as any).usage
  if (usage) {
    await recordText({
      projectId,
      userId: session.user.id,
      model: analysisModel,
      action: 'ai-modify-shot-prompt',
      inputTokens: usage.prompt_tokens || 0,
      outputTokens: usage.completion_tokens || 0
    })
  }

  // 返回修改后的提示词和引用的资产信息
  return NextResponse.json({
    modifiedImagePrompt: imagePrompt,
    modifiedVideoPrompt: videoPrompt,
    referencedAssets: referencedAssets || []
  })
})
