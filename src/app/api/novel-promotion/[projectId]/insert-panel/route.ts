/**
 * POST /api/novel-promotion/[projectId]/insert-panel
 * 
 * 在两个分镜之间插入新分镜（异步任务模式 + 乐观占位）
 * 
 * 设计：
 * 1. 同步阶段：立即创建占位panel + 重新编号（用户马上看到）
 * 2. 异步阶段：AI生成内容 + 自动生成图片
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { chatCompletion, getCompletionContent } from '@/lib/llm-client'
import { recordText } from '@/lib/pricing'
import { logAIAnalysis } from '@/lib/logger'
import {
    getFilteredFullDescription,
    getFilteredLocationsDescription
} from '@/lib/storyboard-phases'
import {
    createAsyncTask,
    markTaskCompleted,
    markTaskFailed,
    updateTaskProgress,
    TASK_TYPES
} from '@/lib/async-task-manager'
import { after } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import fs from 'fs'
import path from 'path'

// 解析单个 JSON 对象响应
function parseJsonObjectResponse(responseText: string): any {
    let jsonText = responseText.trim()
    jsonText = jsonText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '')

    const firstBrace = jsonText.indexOf('{')
    const lastBrace = jsonText.lastIndexOf('}')

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
        throw new Error('JSON格式错误：未找到有效的JSON对象')
    }

    jsonText = jsonText.substring(firstBrace, lastBrace + 1)
    return JSON.parse(jsonText)
}

// 从 panel 的 characters 字段解析角色名数组
function parsePanelCharacters(panel: any): string[] {
    if (!panel?.characters) return []
    try {
        const chars = JSON.parse(panel.characters)
        if (Array.isArray(chars)) {
            return chars.map((c: any) => typeof c === 'string' ? c : c.name).filter(Boolean)
        }
        return []
    } catch {
        return []
    }
}

// 两阶段重新编号（避免唯一约束冲突）
async function reindexPanels(reorderedPanelIds: string[]) {
    console.log(`[Insert Panel] 重新编号 ${reorderedPanelIds.length} 个分镜`)

    // Phase 1: 设置临时负数
    for (let i = 0; i < reorderedPanelIds.length; i++) {
        await prisma.novelPromotionPanel.update({
            where: { id: reorderedPanelIds[i] },
            data: { panelIndex: -(i + 1) }
        })
    }

    // Phase 2: 设置最终值
    for (let i = 0; i < reorderedPanelIds.length; i++) {
        await prisma.novelPromotionPanel.update({
            where: { id: reorderedPanelIds[i] },
            data: { panelIndex: i, panelNumber: i + 1 }
        })
    }

    console.log(`[Insert Panel] 重新编号完成`)
}

export const POST = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ projectId: string }> }
) => {
    const { projectId } = await context.params

    const body = await request.json()
    const { storyboardId, insertAfterPanelId, userInput, _internal, _taskId, _panelId } = body

    // === 内部调用模式（来自after()）===
    let session: { user: { id: string; name?: string | null } } | null = null
    if (_internal) {
        const task = await prisma.asyncTask.findUnique({ where: { id: _taskId } })
        if (!task) {
            throw new ApiError('NOT_FOUND', { message: 'Task not found' })
        }
        const payload = task.payload as any
        session = { user: { id: payload.userId, name: payload.userName || 'Internal' } }
    } else {
        // 🔐 统一权限验证
        const { requireProjectAuthLight, isErrorResponse } = await import('@/lib/api-auth')
        const authResult = await requireProjectAuthLight(projectId)
        if (isErrorResponse(authResult)) return authResult
        session = authResult.session
    }

    if (!storyboardId || !insertAfterPanelId) {
        throw new ApiError('INVALID_PARAMS', { message: 'Missing required fields: storyboardId, insertAfterPanelId' })
    }

    // 获取项目数据
    const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
            novelPromotionData: {
                include: {
                    characters: { include: { appearances: true } },
                    locations: { include: { images: true } }
                }
            }
        }
    })

    if (!project) {
        throw new ApiError('NOT_FOUND', { message: 'Project not found' })
    }

    if (!_internal && project.userId !== session!.user.id) {
        throw new ApiError('FORBIDDEN')
    }

    const novelPromotionData = project.novelPromotionData
    if (!novelPromotionData) {
        throw new ApiError('NOT_FOUND', { message: 'Project data not found' })
    }

    // 获取前一个 panel
    const prevPanel = await prisma.novelPromotionPanel.findUnique({
        where: { id: insertAfterPanelId }
    })

    if (!prevPanel) {
        throw new ApiError('NOT_FOUND', { message: 'Previous panel not found' })
    }

    if (prevPanel.storyboardId !== storyboardId) {
        throw new ApiError('INVALID_PARAMS', { message: 'Panel does not belong to storyboard' })
    }

    // === 非内部调用：同步创建占位 + 异步AI生成 ===
    if (!_internal) {
        console.log(`[Insert Panel] 开始同步创建占位分镜...`)

        // 1. 创建占位 panel（带 generatingImage: true 标记）
        const tempPanelIndex = prevPanel.panelIndex + 10000 + Math.floor(Math.random() * 1000)
        const placeholderPanel = await prisma.novelPromotionPanel.create({
            data: {
                storyboardId,
                panelIndex: tempPanelIndex,
                panelNumber: 0,
                shotType: '中景',
                cameraMove: '固定',
                description: '正在生成分镜内容...',
                location: prevPanel.location,  // 继承前一个panel的场景
                generatingImage: true  // 标记为生成中
            }
        })

        console.log(`[Insert Panel] 占位分镜已创建: ${placeholderPanel.id}`)

        // 2. 立即重新编号（确保序列一致性）
        const existingPanels = await prisma.novelPromotionPanel.findMany({
            where: { storyboardId, id: { not: placeholderPanel.id } },
            orderBy: { panelIndex: 'asc' },
            select: { id: true, panelIndex: true }
        })

        const insertPosition = existingPanels.findIndex(p => p.panelIndex > prevPanel.panelIndex)
        const actualInsertPos = insertPosition === -1 ? existingPanels.length : insertPosition

        const reorderedPanelIds = [
            ...existingPanels.slice(0, actualInsertPos).map(p => p.id),
            placeholderPanel.id,
            ...existingPanels.slice(actualInsertPos).map(p => p.id)
        ]

        await reindexPanels(reorderedPanelIds)

        // 更新 storyboard 的 panelCount
        await prisma.novelPromotionStoryboard.update({
            where: { id: storyboardId },
            data: { panelCount: reorderedPanelIds.length }
        })

        // 获取更新后的panel编号
        const updatedPlaceholder = await prisma.novelPromotionPanel.findUnique({
            where: { id: placeholderPanel.id }
        })

        console.log(`[Insert Panel] 占位分镜编号: #${updatedPlaceholder?.panelNumber}`)

        // 3. 创建异步任务
        const asyncTask = await createAsyncTask({
            type: TASK_TYPES.INSERT_PANEL,
            targetId: placeholderPanel.id,  // 现在targetId是panel ID
            targetType: 'NovelPromotionPanel',
            payload: {
                projectId,
                storyboardId,
                insertAfterPanelId,
                panelId: placeholderPanel.id,
                userInput,
                userId: session!.user.id,
                userName: session!.user.name
            },
            userId: session!.user.id
        })

        console.log(`[Insert Panel] 异步任务已创建: ${asyncTask.id}`)

        // 4. 使用 after() 触发后台AI生成
        after(async () => {
            try {
                await triggerInsertPanelContent(projectId, asyncTask.id, placeholderPanel.id)
            } catch (error: any) {
                console.error(`[Insert Panel] 后台执行失败:`, error)
                await markTaskFailed(asyncTask.id, error.message)
                // 标记panel生成失败
                await prisma.novelPromotionPanel.update({
                    where: { id: placeholderPanel.id },
                    data: { generatingImage: false, description: '生成失败: ' + error.message }
                })
            }
        })

        return NextResponse.json({
            success: true,
            async: true,
            taskId: asyncTask.id,
            panelId: placeholderPanel.id,
            panelNumber: updatedPlaceholder?.panelNumber,
            message: '分镜已创建，正在生成内容...'
        })
    }

    // === 内部调用: 执行AI生成并填充内容 ===
    console.log(`[Insert Panel] 开始AI生成，任务ID: ${_taskId}，Panel: ${_panelId}`)

    await updateTaskProgress(_taskId, 10)

    // 获取后一个 panel
    const nextPanel = await prisma.novelPromotionPanel.findFirst({
        where: { storyboardId, panelIndex: { gt: prevPanel.panelIndex }, id: { not: _panelId } },
        orderBy: { panelIndex: 'asc' }
    })

    // 读取提示词模板
    const insertPromptPath = path.join(process.cwd(), 'lib', 'prompts', 'novel-promotion', 'agent_storyboard_insert.txt')
    const insertPromptTemplate = fs.readFileSync(insertPromptPath, 'utf-8')

    // 提取相关角色
    const prevCharacters = parsePanelCharacters(prevPanel)
    const nextCharacters = nextPanel ? parsePanelCharacters(nextPanel) : []
    const relevantCharacters = [...new Set([...prevCharacters, ...nextCharacters])]

    const charactersFullDescription = getFilteredFullDescription(
        novelPromotionData.characters as any[],
        relevantCharacters
    )

    const relevantLocations = [prevPanel.location, nextPanel?.location].filter(Boolean) as string[]
    const locationsDescription = [...new Set(relevantLocations)]
        .map(locName => {
            const desc = getFilteredLocationsDescription(novelPromotionData.locations as any[], locName)
            return `【${locName}】${desc}`
        })
        .join('\n') || '无'

    await updateTaskProgress(_taskId, 20)

    // 构建提示词
    const prevPanelJson = JSON.stringify({
        panel_number: prevPanel.panelNumber,
        description: prevPanel.description,
        characters: prevPanel.characters ? JSON.parse(prevPanel.characters) : [],
        location: prevPanel.location,
        shot_type: prevPanel.shotType,
        camera_move: prevPanel.cameraMove,
        video_prompt: prevPanel.videoPrompt,
        source_text: prevPanel.srtSegment || '无'
    }, null, 2)

    const nextPanelJson = nextPanel ? JSON.stringify({
        panel_number: nextPanel.panelNumber,
        description: nextPanel.description,
        characters: nextPanel.characters ? JSON.parse(nextPanel.characters) : [],
        location: nextPanel.location,
        shot_type: nextPanel.shotType,
        camera_move: nextPanel.cameraMove,
        video_prompt: nextPanel.videoPrompt,
        source_text: nextPanel.srtSegment || '无'
    }, null, 2) : '无（这是最后一个镜头，在其后插入）'

    const insertPrompt = insertPromptTemplate
        .replace('{prev_panel_json}', prevPanelJson)
        .replace('{next_panel_json}', nextPanelJson)
        .replace('{user_input}', userInput || '无（请自动分析生成过渡镜头）')
        .replace('{characters_full_description}', charactersFullDescription)
        .replace('{locations_description}', locationsDescription)

    logAIAnalysis(session!.user.id, session!.user.name || 'unknown', projectId, project.name, {
        action: 'INSERT_PANEL_PROMPT',
        input: { 前一镜头: prevPanel.panelNumber, 后一镜头: nextPanel?.panelNumber || '末尾', 用户说明: userInput || '无' },
        model: novelPromotionData.analysisModel || ''
    })

    await updateTaskProgress(_taskId, 30)

    // AI 生成
    let generatedPanel: any = null

    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            console.log(`[Insert Panel] AI 生成尝试 ${attempt}/2`)

            const completion = await chatCompletion(
                session.user.id,
                novelPromotionData.analysisModel,
                [{ role: 'user', content: insertPrompt }],
                { reasoning: true, skipBilling: true }  // 费用通过 recordText 单独处理
            )

            const usage = (completion as any).usage
            if (usage) {
                await recordText({
                    projectId,
                    userId: session!.user.id,
                    model: novelPromotionData.analysisModel || '',
                    action: 'INSERT_PANEL',
                    inputTokens: usage.prompt_tokens || 0,
                    outputTokens: usage.completion_tokens || 0,
                    metadata: { prevPanelId: insertAfterPanelId, attempt, taskId: _taskId }
                })
            }

            const responseText = getCompletionContent(completion)
            if (!responseText) throw new Error('AI 无响应')

            generatedPanel = parseJsonObjectResponse(responseText)

            if (!generatedPanel.description || !generatedPanel.location) {
                throw new Error('生成的分镜缺少必需字段')
            }

            logAIAnalysis(session!.user.id, session!.user.name || 'unknown', projectId, project.name, {
                action: 'INSERT_PANEL_OUTPUT',
                output: { 生成的分镜: generatedPanel },
                model: novelPromotionData.analysisModel || ''
            })

            break
        } catch (error: any) {
            console.error(`[Insert Panel] 第${attempt}次尝试失败:`, error.message)
            if (attempt === 2) throw error
        }
    }

    await updateTaskProgress(_taskId, 70)

    // 更新 panel 内容
    console.log(`[Insert Panel] 更新分镜内容: ${_panelId}`)
    await prisma.novelPromotionPanel.update({
        where: { id: _panelId },
        data: {
            shotType: generatedPanel.shot_type ?? '中景',
            cameraMove: generatedPanel.camera_move ?? '固定',
            description: generatedPanel.description ?? '',
            location: generatedPanel.location ?? prevPanel.location,
            characters: generatedPanel.characters ? JSON.stringify(generatedPanel.characters) : null,
            srtSegment: generatedPanel.source_text ?? null,
            videoPrompt: generatedPanel.video_prompt ?? null
            // generatingImage 保持 true，等图片生成完成后再设为 false
        }
    })

    await updateTaskProgress(_taskId, 80)

    // 触发图片生成
    console.log(`[Insert Panel] 触发图片生成...`)
    try {
        const { getBaseUrl } = await import('@/lib/env')
        const baseUrl = getBaseUrl()

        await fetch(`${baseUrl}/api/novel-promotion/${projectId}/regenerate-panel-image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                panelId: _panelId,
                count: 1,
                _internal: true,
                _userId: session!.user.id,
                _userName: session!.user.name
            })
        })
        console.log(`[Insert Panel] 图片生成已触发`)
    } catch (err: any) {
        console.error(`[Insert Panel] 触发图片生成失败:`, err.message)
        // 不影响主流程
    }

    // 标记任务完成
    await markTaskCompleted(_taskId, {
        success: true,
        panelId: _panelId,
        generatedPanel
    })

    console.log(`[Insert Panel] 完成!`)

    return NextResponse.json({ success: true, panelId: _panelId })
})

// 触发内部AI生成
async function triggerInsertPanelContent(projectId: string, taskId: string, panelId: string) {
    const { getBaseUrl } = await import('@/lib/env')
    const baseUrl = getBaseUrl()

    const task = await prisma.asyncTask.findUnique({ where: { id: taskId } })
    if (!task) throw new Error('Task not found')

    const payload = task.payload as any

    const res = await fetch(`${baseUrl}/api/novel-promotion/${projectId}/insert-panel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            storyboardId: payload.storyboardId,
            insertAfterPanelId: payload.insertAfterPanelId,
            userInput: payload.userInput,
            _internal: true,
            _taskId: taskId,
            _panelId: panelId
        })
    })

    if (!res.ok) {
        const error = await res.text()
        throw new Error(`AI生成执行失败: ${error}`)
    }
}
