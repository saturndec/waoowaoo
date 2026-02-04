/**
 * 用户 API 配置管理接口
 * 
 * GET  - 读取用户配置(解密)
 * PUT  - 保存/更新配置(加密)
 * 
 * 统一的 providers 结构：所有类型使用相同格式
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { encryptApiKey, decryptApiKey } from '@/lib/crypto-utils'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'

// 统一 Provider 接口
interface Provider {
    id: string
    name: string
    type: 'llm' | 'image' | 'video' | 'audio'
    baseUrl?: string
    apiKey?: string
}

/**
 * GET - 读取用户 API 配置(解密返回)
 */
export const GET = apiHandler(async () => {
    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult
    const userId = session.user.id

    const pref = await prisma.userPreference.findUnique({
        where: { userId },
        select: {
            customModels: true,
            customProviders: true,
            // 默认模型字段
            analysisModel: true,
            characterModel: true,
            locationModel: true,
            storyboardModel: true,
            editModel: true,
            imageResolution: true,
            videoModel: true
        } as any
    })

    // 解析 providers 列表并解密 API Key
    let providers: Provider[] = []
    if ((pref as any)?.customProviders) {
        try {
            const saved = JSON.parse((pref as any).customProviders)
            providers = saved.map((p: Provider) => ({
                ...p,
                apiKey: p.apiKey ? decryptApiKey(p.apiKey) : ''
            }))
        } catch { }
    }

    return NextResponse.json({
        models: pref?.customModels ? JSON.parse(pref.customModels) : [],
        providers,
        defaultModels: {
            analysisModel: (pref as any)?.analysisModel || '',
            characterModel: (pref as any)?.characterModel || '',
            locationModel: (pref as any)?.locationModel || '',
            storyboardModel: (pref as any)?.storyboardModel || '',
            editModel: (pref as any)?.editModel || '',
            imageResolution: (pref as any)?.imageResolution || '2K',
            videoModel: (pref as any)?.videoModel || ''
        }
    })
})

/**
 * PUT - 保存/更新用户 API 配置(加密)
 */
export const PUT = apiHandler(async (request: NextRequest) => {
    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult
    const userId = session.user.id

    const body = await request.json()
    const { models, providers, defaultModels } = body

    const updateData: any = {}

    if (models !== undefined) {
        updateData.customModels = JSON.stringify(models)
    }

    if (providers !== undefined) {
        // 获取现有数据用于保留未修改的加密 Key
        const existingPref = await prisma.userPreference.findUnique({
            where: { userId },
            select: { customProviders: true } as any
        })

        let existingProviders: Provider[] = []
        if ((existingPref as any)?.customProviders) {
            try {
                existingProviders = JSON.parse((existingPref as any).customProviders)
            } catch { }
        }

        // 合并并加密
        const providersToSave = providers.map((p: Provider) => {
            const existing = existingProviders.find(e => e.id === p.id && e.type === p.type)
            // 区分空字符串（用户主动清空）和 undefined（未修改）
            let finalApiKey: string | undefined
            if (p.apiKey === '') {
                // 用户主动清空，删除 API Key
                finalApiKey = undefined
            } else if (p.apiKey) {
                // 用户输入新的 API Key，加密保存
                finalApiKey = encryptApiKey(p.apiKey)
            } else {
                // 未修改，保留原值
                finalApiKey = existing?.apiKey
            }
            return {
                id: p.id,
                name: p.name,
                type: p.type,
                baseUrl: p.baseUrl,
                apiKey: finalApiKey
            }
        })

        updateData.customProviders = JSON.stringify(providersToSave)
    }

    // 保存默认模型
    if (defaultModels !== undefined) {
        if (defaultModels.analysisModel !== undefined) {
            updateData.analysisModel = defaultModels.analysisModel || null
        }
        if (defaultModels.characterModel !== undefined) {
            updateData.characterModel = defaultModels.characterModel || null
        }
        if (defaultModels.locationModel !== undefined) {
            updateData.locationModel = defaultModels.locationModel || null
        }
        if (defaultModels.storyboardModel !== undefined) {
            updateData.storyboardModel = defaultModels.storyboardModel || null
        }
        if (defaultModels.editModel !== undefined) {
            updateData.editModel = defaultModels.editModel || null
        }
        if (defaultModels.videoModel !== undefined) {
            updateData.videoModel = defaultModels.videoModel || null
        }
        if (defaultModels.imageResolution !== undefined) {
            updateData.imageResolution = defaultModels.imageResolution || '2K'
        }
    }

    await prisma.userPreference.upsert({
        where: { userId },
        update: updateData,
        create: { userId, ...updateData }
    })

    return NextResponse.json({ success: true })
})
