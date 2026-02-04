import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSignedUrl } from '@/lib/cos'
import { TASK_STATUS } from '@/lib/async-task-manager'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'

/**
 * 🔥 批量任务轮询API - 纯数据库读取版本 (V3.9.1 Lean Poll)
 * 
 * 架构原则：
 * - 只读取数据库，不调用任何外部 API
 * - 响应时间 < 100ms
 * - 外部 API 查询由 Cron Job 单独处理
 * 
 * 返回格式：
 * {
 *   tasks: [{ id, type, targetId, targetType, status }],
 *   panelCandidates: [{ panelId, pendingCount, completedCount, candidates }],
 *   lipSyncTasks: [{ panelId, status }],
 *   timestamp: number
 * }
 */
export const GET = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ projectId: string }> }
) => {
    const startTime = Date.now()
    const { projectId } = await context.params

    // 🔥 支持 episodeId 参数，只查询指定剧集的任务
    const { searchParams } = new URL(request.url)
    const episodeId = searchParams.get('episodeId')

    // 🔐 统一权限验证
    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult

    // 获取 NovelPromotionProject
    const novelProject = await (prisma as any).novelPromotionProject.findUnique({
        where: { projectId }
    })
    if (!novelProject) {
        return NextResponse.json({ tasks: [], panelCandidates: [], lipSyncTasks: [], timestamp: Date.now() })
    }

    // === 1. ⚡ 并行获取资产的目标 ID ===
    // 🔥 如果传入 episodeId，只查询该剧集的数据
    console.time(`  [poll] 资产ID并行查询`)
    const episodeWhere = episodeId
        ? { id: episodeId, novelPromotionProjectId: novelProject.id }
        : { novelPromotionProjectId: novelProject.id }

    const [characters, locations, episodeData] = await Promise.all([
        (prisma as any).novelPromotionCharacter.findMany({
            where: { novelPromotionProjectId: novelProject.id },
            select: { id: true, appearances: { select: { id: true } } }
        }),
        (prisma as any).novelPromotionLocation.findMany({
            where: { novelPromotionProjectId: novelProject.id },
            select: { id: true, images: { select: { id: true } } }
        }),
        (prisma as any).novelPromotionEpisode.findMany({
            where: episodeWhere,  // 🔥 使用条件查询
            select: {
                id: true,
                storyboards: {
                    select: {
                        id: true,
                        panels: { select: { id: true } }
                    }
                },
                voiceLines: { select: { id: true } }
            }
        })
    ])
    console.timeEnd(`  [poll] 资产ID并行查询`)

    const characterAppearanceIds: string[] = characters.flatMap((c: any) =>
        c.appearances.map((a: any) => a.id)
    )
    const locationImageIds: string[] = locations.flatMap((l: any) =>
        l.images.map((i: any) => i.id)
    )
    const panelIds: string[] = episodeData.flatMap((e: any) =>
        e.storyboards.flatMap((sb: any) => sb.panels.map((p: any) => p.id))
    )
    const voiceLineIds: string[] = episodeData.flatMap((e: any) =>
        e.voiceLines.map((vl: any) => vl.id)
    )
    const storyboardIds: string[] = episodeData.flatMap((e: any) =>
        e.storyboards.map((sb: any) => sb.id)
    )
    const allEpisodeIds: string[] = episodeData.map((e: any) => e.id)

    const allTargetIds = [
        ...characterAppearanceIds,
        ...locationImageIds,
        ...panelIds,
        ...voiceLineIds,
        ...storyboardIds
    ]

    console.log(`  [poll] 目标ID数量: ${allTargetIds.length} (panels: ${panelIds.length})${episodeId ? ` [单剧集: ${episodeId.slice(0, 8)}]` : ' [全项目]'}`)

    if (allTargetIds.length === 0) {
        return NextResponse.json({
            tasks: [],
            panelCandidates: [],
            lipSyncTasks: [],
            timestamp: Date.now()
        })
    }

    // === 2-6. ⚡ 并行获取所有状态数据 ===
    console.time(`  [poll] 状态并行查询`)
    const [
        pendingTasks,
        recentlyCompletedTasks,
        panelsWithPending,
        recentlyCompletedPanels,
        panelsWithLipSync,
        panelsWithVideo,
        // 🔥 V6.5: 新增资产 generating 状态查询
        generatingAppearances,
        generatingLocationImages
    ] = await Promise.all([
        // AsyncTask: pending/processing
        (prisma as any).asyncTask.findMany({
            where: {
                targetId: { in: allTargetIds },
                status: { in: [TASK_STATUS.PENDING, TASK_STATUS.PROCESSING] }
            },
            orderBy: { createdAt: 'asc' }
        }),
        // AsyncTask: recently completed
        (prisma as any).asyncTask.findMany({
            where: {
                targetId: { in: allTargetIds },
                status: { in: [TASK_STATUS.COMPLETED, TASK_STATUS.FAILED] },
                updatedAt: { gte: new Date(Date.now() - 60000) }
            },
            orderBy: { updatedAt: 'desc' },
            take: 50
        }),
        // Panels: generating image
        prisma.novelPromotionPanel.findMany({
            where: {
                storyboard: { episodeId: { in: allEpisodeIds } },
                generatingImage: true
            },
            select: { id: true, candidateImages: true, generatingImage: true, updatedAt: true }
        }),
        // Panels: recently completed
        prisma.novelPromotionPanel.findMany({
            where: {
                storyboard: { episodeId: { in: allEpisodeIds } },
                generatingImage: false,
                candidateImages: { not: null },
                updatedAt: { gte: new Date(Date.now() - 60000) }
            },
            select: { id: true, candidateImages: true, generatingImage: true, updatedAt: true },
            take: 50
        }),
        // Panels: LipSync
        prisma.novelPromotionPanel.findMany({
            where: {
                storyboard: { episodeId: { in: allEpisodeIds } },
                generatingLipSync: true,
                lipSyncTaskId: { not: null }
            },
            select: { id: true, lipSyncTaskId: true, generatingLipSync: true }
        }),
        // Panels: Video
        prisma.novelPromotionPanel.findMany({
            where: {
                storyboard: { episodeId: { in: allEpisodeIds } },
                generatingVideo: true
            },
            select: { id: true, panelIndex: true, storyboardId: true, generatingVideo: true, videoUrl: true }
        }),
        // 🔥 V6.5: 角色形象 generating 状态
        (prisma as any).characterAppearance.findMany({
            where: {
                character: { novelPromotionProjectId: novelProject.id },
                generating: true
            },
            select: { id: true, characterId: true }
        }),
        // 🔥 V6.5: 场景图片 generating 状态
        (prisma as any).locationImage.findMany({
            where: {
                location: { novelPromotionProjectId: novelProject.id },
                generating: true
            },
            select: { id: true, locationId: true }
        })
    ])
    console.timeEnd(`  [poll] 状态并行查询`)

    // 🔥 处理结果数据（纯内存操作，不阻塞连接）
    const taskResults = pendingTasks.map((task: any) => {
        const payload = task.payload as any || {}
        return {
            id: task.id,
            type: task.type,
            targetId: task.targetId,
            targetType: task.targetType,
            status: task.status,
            progress: task.progress,
            externalId: task.externalId,
            phase: payload.phase,
            phaseLabel: payload.phaseLabel,
            clipIndex: payload.clipIndex,
            totalClips: payload.totalClips
        }
    })

    const completedTaskResults = recentlyCompletedTasks.map((task: any) => ({
        id: task.id,
        type: task.type,
        targetId: task.targetId,
        targetType: task.targetType,
        status: task.status,
        result: task.result
    }))

    // 合并Panel列表（去重）
    const allPanels = [...panelsWithPending]
    const panelIdSet = new Set(panelsWithPending.map((p: any) => p.id))
    for (const panel of recentlyCompletedPanels) {
        if (!panelIdSet.has(panel.id)) {
            allPanels.push(panel)
        }
    }

    // 🔥 只读取数据库中的候选图状态
    const panelCandidatesResults = allPanels.map((panel: any) => {
        let candidates: string[] = []
        try {
            candidates = panel.candidateImages ? JSON.parse(panel.candidateImages) : []
        } catch { candidates = [] }

        const pendingItems = candidates
            .map((c: string, idx: number) => ({ value: c, index: idx }))
            .filter((item: any) => item.value.startsWith('PENDING:'))

        const completedUrls = candidates.filter((c: string) => !c.startsWith('PENDING:'))

        return {
            panelId: panel.id,
            status: pendingItems.length > 0 ? 'pending' : 'completed',
            pendingCount: pendingItems.length,
            completedCount: completedUrls.length,
            candidateStatuses: pendingItems.map((item: any) => ({
                index: item.index,
                status: 'pending',
                externalId: item.value
            })),
            candidates: completedUrls.map((url: string) => getSignedUrl(url))
        }
    })

    // 🔥 LipSync 结果
    const lipSyncResults = panelsWithLipSync.map((panel: any) => ({
        panelId: panel.id,
        status: 'pending',
        externalId: panel.lipSyncTaskId
    }))

    // 🔥 Video 结果
    const videoTaskResults = panelsWithVideo.map((panel: any) => ({
        panelId: panel.id,
        storyboardId: panel.storyboardId,
        panelIndex: panel.panelIndex,
        status: panel.videoUrl ? 'completed' : 'pending',
        videoUrl: panel.videoUrl
    }))

    const responseTime = Date.now() - startTime
    console.log(`[poll-tasks] ✅ 纯DB查询完成，耗时 ${responseTime}ms, 任务数: ${taskResults.length}`)

    return NextResponse.json({
        tasks: [...taskResults, ...completedTaskResults],
        panelCandidates: panelCandidatesResults,
        lipSyncTasks: lipSyncResults,
        videoTasks: videoTaskResults,
        // 🔥 V6.5: 新增资产 generating 状态
        generatingAssets: {
            characterAppearances: generatingAppearances.map((a: any) => a.id),
            locationImages: generatingLocationImages.map((i: any) => i.id)
        },
        // 🔥 V6.5: 新增 Panel generating 状态计数
        generatingPanels: {
            videos: panelsWithVideo.length,
            images: panelsWithPending.length,
            lipSyncs: panelsWithLipSync.length
        },
        timestamp: Date.now(),
        _meta: {
            responseTimeMs: responseTime,
            mode: 'lean-poll-v3.12.0'  // 🔥 升级版本号
        }
    })
})
