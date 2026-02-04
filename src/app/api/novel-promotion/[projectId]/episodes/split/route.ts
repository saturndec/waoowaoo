/**
 * AI 分集 API
 * 使用 Gemini 3 Flash 分析文本并自动分集
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logUserAction } from '@/lib/logger'
import { countWords } from '@/lib/word-count'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import fs from 'fs'
import path from 'path'

interface EpisodeSplit {
    number: number
    title: string
    summary: string
    // 新格式：标记匹配
    startMarker?: string
    endMarker?: string
    // 旧格式：索引（向后兼容）
    startIndex?: number
    endIndex?: number
}

interface SplitResponse {
    episodes: EpisodeSplit[]
}

export const POST = apiHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) => {
    console.log('[Split API] ========== 开始处理请求 ==========')

    const { projectId } = await params
    console.log('[Split API] ProjectId:', projectId)

    // 🔐 统一权限验证
    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult
    const session = authResult.session

    const userId = session.user.id
    const username = session.user.name || session.user.email || 'unknown'

    const { content } = await request.json()
    console.log('[Split API] 内容长度:', content?.length || 0)

    if (!content || typeof content !== 'string') {
        throw new ApiError('INVALID_PARAMS', { message: '缺少文本内容' })
    }

    if (content.length < 100) {
        throw new ApiError('INVALID_PARAMS', { message: '文本太短，至少需要 100 字' })
    }

    // 验证项目存在并获取项目信息
    const project = await prisma.novelPromotionProject.findFirst({
        where: { projectId },
        include: {
            project: true  // 获取关联的主项目以获取名称
        }
    })

    if (!project) {
        throw new ApiError('NOT_FOUND', { message: '项目不存在' })
    }

    const projectName = project.project?.name || projectId

    // 🔥 使用统一配置服务获取用户模型配置
    const { getUserModelConfig } = await import('@/lib/config-service')
    const userConfig = await getUserModelConfig(userId)
    const analysisModel = userConfig.analysisModel
    if (!analysisModel) {
        console.log('[Split API] 用户未配置分析模型')
        throw new ApiError('MISSING_CONFIG', { message: '请先在设置页面配置分析模型' })
    }

    console.log('[Split API] 使用分析模型:', analysisModel)

    // 读取提示词模板
    const promptPath = path.join(process.cwd(), 'lib/prompts/novel-promotion/episode_split.txt')
    const promptTemplate = fs.readFileSync(promptPath, 'utf-8')

    // 替换占位符
    const prompt = promptTemplate.replace('{{CONTENT}}', content)

    // 使用统一的 LLM 客户端调用 AI（开启 thinking 模式）
    const { chatCompletion, getCompletionContent } = await import('@/lib/llm-client')

    const completion = await chatCompletion(
        userId,
        analysisModel,  // 使用用户配置的模型
        [{ role: 'user', content: prompt }],
        {
            temperature: 0.3,
            reasoning: true,  // 开启 thinking 模式
            reasoningEffort: 'high',
            projectId,
            action: 'episode_split'
        }
    )

    const aiResponse = getCompletionContent(completion)

    if (!aiResponse) {
        // 🔍 诊断：打印 completion 结构以定位问题
        console.error('[Split API] AI 返回为空，诊断信息:')
        console.error('[Split API] completion.choices:', JSON.stringify(completion?.choices, null, 2))
        console.error('[Split API] message.content 类型:', typeof completion?.choices?.[0]?.message?.content)
        console.error('[Split API] message.content 值:', JSON.stringify(completion?.choices?.[0]?.message?.content, null, 2)?.slice(0, 500))

        logUserAction(
            'EPISODE_SPLIT_EMPTY_RESPONSE',
            userId,
            username,
            `AI 分集失败 - AI 返回为空`,
            {
                choicesCount: completion?.choices?.length,
                messageContent: JSON.stringify(completion?.choices?.[0]?.message?.content)?.slice(0, 1000),
                finishReason: completion?.choices?.[0]?.finish_reason
            },
            projectId,
            projectName
        )

        throw new ApiError('AI_ERROR', { message: 'AI 返回为空，请稍后重试' })
    }

    // ========== 记录 AI 原始响应到项目日志 ==========
    logUserAction(
        'EPISODE_SPLIT_AI_RESPONSE',
        userId,
        username,
        `AI 分集响应 - 原文长度: ${content.length} 字`,
        {
            inputLength: content.length,
            inputPreview: content.slice(0, 200) + '...',
            aiRawResponse: aiResponse
        },
        projectId,
        projectName
    )

    // 解析 JSON 响应
    let splitResult: SplitResponse
    try {
        // 尝试提取 JSON
        const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/) ||
            aiResponse.match(/\{[\s\S]*\}/)

        if (!jsonMatch) {
            logUserAction(
                'EPISODE_SPLIT_ERROR',
                userId,
                username,
                `AI 分集失败 - 无法解析 AI 响应（无 JSON 匹配）`,
                { error: '无 JSON 匹配', aiResponse },
                projectId,
                projectName
            )
            throw new Error('无法解析 AI 响应')
        }

        const jsonStr = jsonMatch[1] || jsonMatch[0]

        // 清理 JSON 字符串中的特殊字符（AI 可能在字符串值内返回未转义的换行符等）
        const cleanJsonString = (str: string): string => {
            // 匹配 JSON 字符串值内容，处理未转义的特殊字符
            return str.replace(/"([^"\\]|\\.)*"/g, (match) => {
                return match
                    .replace(/(?<!\\)\n/g, '\\n')   // 未转义的换行符
                    .replace(/(?<!\\)\r/g, '\\r')   // 未转义的回车符
                    .replace(/(?<!\\)\t/g, '\\t')   // 未转义的制表符
            })
        }

        const cleanedJsonStr = cleanJsonString(jsonStr)
        splitResult = JSON.parse(cleanedJsonStr)

        // 记录解析后的 JSON
        logUserAction(
            'EPISODE_SPLIT_PARSED',
            userId,
            username,
            `AI 分集解析成功 - 共 ${splitResult.episodes.length} 集`,
            { parsedResult: splitResult },
            projectId,
            projectName
        )
    } catch (parseError: any) {
        logUserAction(
            'EPISODE_SPLIT_ERROR',
            userId,
            username,
            `AI 分集失败 - JSON 解析失败: ${parseError.message}`,
            { error: parseError.message, aiResponse },
            projectId,
            projectName
        )
        console.error('[Split API] Parse error:', parseError, aiResponse)
        throw new ApiError('AI_ERROR', { message: '解析 AI 响应失败' })
    }
    // 标点符号统一化（中英文标点转换）
    const normalizePunctuation = (str: string): string => {
        return str
            .replace(/[""]/g, '"')  // 中文引号 → 英文
            .replace(/['']/g, "'")
            .replace(/[，]/g, ',')
            .replace(/[。]/g, '.')
            .replace(/[！]/g, '!')
            .replace(/[？]/g, '?')
            .replace(/[：]/g, ':')
            .replace(/[；]/g, ';')
            .replace(/[（]/g, '(')
            .replace(/[）]/g, ')')
            .replace(/[【]/g, '[')
            .replace(/[】]/g, ']')
            .replace(/[、]/g, ',')
            .replace(/[—]+/g, '-')
            .replace(/[…]+/g, '...')
    }

    // 去除所有标点和空白
    const stripPunctuationAndSpace = (str: string): string => {
        return str.replace(/[\s\p{P}]/gu, '')
    }

    // 模糊匹配函数：容错查找标记位置
    const fuzzyFindMarker = (text: string, marker: string, searchStart: number = 0): number => {
        // 1. 精确匹配
        let pos = text.indexOf(marker, searchStart)
        if (pos !== -1) return pos

        // 2. 去除首尾空白后匹配
        const trimmedMarker = marker.trim()
        pos = text.indexOf(trimmedMarker, searchStart)
        if (pos !== -1) return pos

        // 3. 标点符号统一化后匹配
        const normalizedText = normalizePunctuation(text)
        const normalizedMarker = normalizePunctuation(marker.trim())
        pos = normalizedText.indexOf(normalizedMarker, searchStart)
        if (pos !== -1) return pos

        // 4. 取前 10 个字符模糊匹配（LLM 可能截断不精确）
        if (marker.length > 10) {
            const shortMarker = marker.slice(0, 10)
            pos = text.indexOf(shortMarker, searchStart)
            if (pos !== -1) return pos

            // 标点统一化后的前缀匹配
            const normalizedShort = normalizePunctuation(shortMarker)
            pos = normalizedText.indexOf(normalizedShort, searchStart)
            if (pos !== -1) return pos
        }

        // 5. 只保留汉字和字母数字，忽略所有标点空白
        const pureMarker = stripPunctuationAndSpace(marker)
        if (pureMarker.length >= 5) {
            const searchText = text.slice(searchStart)
            // 滑动窗口查找
            for (let i = 0; i < searchText.length - pureMarker.length; i++) {
                const window = stripPunctuationAndSpace(searchText.slice(i, i + pureMarker.length + 20))
                if (window.startsWith(pureMarker)) {
                    return searchStart + i
                }
            }
        }

        return -1
    }

    // 处理分集结果 - 使用标记匹配定位内容
    const episodes = []
    const matchingLogs: string[] = []

    // 日志辅助函数
    const addLog = (msg: string) => {
        console.log(msg)
        matchingLogs.push(msg)
    }

    addLog('[MATCHING] ========== 分集匹配开始 ==========')
    addLog(`[MATCHING] 原文总长度: ${content.length} 字`)
    addLog(`[MATCHING] AI 返回剧集数: ${splitResult.episodes.length}`)

    for (let idx = 0; idx < splitResult.episodes.length; idx++) {
        const ep = splitResult.episodes[idx]

        addLog(`\n[MATCHING] --- 第 ${idx + 1} 集 ---`)
        addLog(`[MATCHING]   标题: ${ep.title}`)
        addLog(`[MATCHING]   startMarker: "${ep.startMarker}"`)
        addLog(`[MATCHING]   endMarker: "${ep.endMarker}"`)

        // 查找开始位置
        let startPos = 0
        if (ep.startMarker) {
            const markerPos = fuzzyFindMarker(content, ep.startMarker)
            if (markerPos !== -1) {
                startPos = markerPos
                addLog(`[MATCHING]   startPos 匹配成功: ${startPos}`)
            } else {
                addLog(`[MATCHING]   ⚠️ startMarker 匹配失败，使用默认值 0`)
            }
        } else if (ep.startIndex !== undefined) {
            // 兼容旧格式
            startPos = ep.startIndex
        }

        // 查找结束位置
        let endPos = content.length
        if (ep.endMarker) {
            const markerPos = fuzzyFindMarker(content, ep.endMarker, startPos)
            if (markerPos !== -1) {
                endPos = markerPos + ep.endMarker.length
                addLog(`[MATCHING]   endPos 匹配成功: ${endPos}`)
            } else {
                addLog(`[MATCHING]   ⚠️ endMarker 匹配失败，使用默认值 ${content.length}`)
            }
        } else if (ep.endIndex !== undefined) {
            // 兼容旧格式
            endPos = ep.endIndex
        }

        // 如果不是最后一集，用下一集的开始位置作为结束
        if (idx < splitResult.episodes.length - 1) {
            const nextEp = splitResult.episodes[idx + 1]
            if (nextEp.startMarker) {
                const nextStart = fuzzyFindMarker(content, nextEp.startMarker, startPos)
                if (nextStart !== -1 && nextStart < endPos) {
                    addLog(`[MATCHING]   使用下一集 startMarker 调整 endPos: ${endPos} -> ${nextStart}`)
                    endPos = nextStart
                }
            }
        }

        const episodeContent = content.slice(startPos, endPos).trim()

        addLog(`[MATCHING]   最终范围: [${startPos}, ${endPos}], 内容长度: ${episodeContent.length}`)
        addLog(`[MATCHING]   内容开头: "${episodeContent.slice(0, 30)}..."`)
        addLog(`[MATCHING]   内容结尾: "...${episodeContent.slice(-30)}"`)

        episodes.push({
            number: idx + 1,
            title: ep.title || `第 ${idx + 1} 集`,
            summary: ep.summary || '',
            content: episodeContent,
            wordCount: countWords(episodeContent)
        })
    }

    // 检查是否覆盖了全部内容
    const totalExtracted = episodes.reduce((sum, ep) => sum + ep.wordCount, 0)
    addLog('\n[MATCHING] ========== 分集匹配结束 ==========')
    addLog(`[MATCHING] 提取总字数: ${totalExtracted}, 原文总字数: ${content.length}`)

    const coveragePercent = (totalExtracted / content.length * 100).toFixed(1)
    if (totalExtracted < content.length * 0.9) {
        addLog(`[MATCHING] ⚠️ 警告: 可能丢失内容! 提取比例: ${coveragePercent}%`)
    }

    // 记录匹配结果到项目日志
    logUserAction(
        'EPISODE_SPLIT_MATCHING',
        userId,
        username,
        `AI 分集匹配完成 - ${episodes.length} 集，覆盖率: ${coveragePercent}%`,
        {
            matchingLog: matchingLogs.join('\n'),
            episodeCount: episodes.length,
            totalExtracted,
            originalLength: content.length,
            coveragePercent
        },
        projectId,
        projectName
    )

    return NextResponse.json({
        success: true,
        episodes
    })
})
