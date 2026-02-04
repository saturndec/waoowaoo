/**
 * 获取用户的模型列表
 * 
 * 返回用户在个人中心启用的模型，供项目配置下拉框使用
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'

export const GET = apiHandler(async () => {
    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult
    const userId = session.user.id

    const pref = await prisma.userPreference.findUnique({
        where: { userId },
        select: { customModels: true }
    })

    const models = pref?.customModels ? JSON.parse(pref.customModels) : []

    // 按类型分组并去重（防止重复的 modelId 导致 React key 冲突）
    const llmModels = models.filter((m: any) => m.type === 'llm')
    const imageModels = models.filter((m: any) => m.type === 'image')
    const videoModels = models.filter((m: any) => m.type === 'video')

    // 去重函数：按 modelId 去重，保留第一个出现的
    const dedupeByModelId = (arr: any[]) => {
        const seen = new Set<string>()
        return arr.filter((m: any) => {
            if (seen.has(m.modelId)) return false
            seen.add(m.modelId)
            return true
        })
    }

    return NextResponse.json({
        llm: dedupeByModelId(llmModels).map((m: any) => ({ value: m.modelId, label: m.name, provider: m.provider })),
        image: dedupeByModelId(imageModels).map((m: any) => ({ value: m.modelId, label: m.name, provider: m.provider, resolution: m.resolution || '4K' })),
        video: dedupeByModelId(videoModels).map((m: any) => ({ value: m.modelId, label: m.name, provider: m.provider }))
    })
})
