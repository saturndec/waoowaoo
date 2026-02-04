/**
 * API 权限验证工具函数
 * 统一处理 session 验证和项目所有权检查
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Session 类型（简化版）
export interface AuthSession {
    user: {
        id: string
        name?: string | null
    }
}

// 项目类型（只包含必要字段）
export interface ProjectWithOwner {
    id: string
    userId: string
    name: string
    mode: string | null
    user?: unknown
}

// 验证结果类型
export type AuthResult =
    | { success: true; session: AuthSession; project: ProjectWithOwner }
    | { success: false; response: NextResponse }

/**
 * 验证用户身份和项目所有权
 * 适用于大多数需要 projectId 的 API
 */
export async function withProjectAuth(projectId: string): Promise<AuthResult> {
    const session = await getServerSession(authOptions as any)

    if (!session?.user?.id) {
        return {
            success: false,
            response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
    }

    const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: { user: true }
    })

    if (!project) {
        return {
            success: false,
            response: NextResponse.json({ error: 'Project not found' }, { status: 404 })
        }
    }

    if (project.userId !== session.user.id) {
        return {
            success: false,
            response: NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
    }

    return {
        success: true,
        session: session as AuthSession,
        project: project as ProjectWithOwner
    }
}

/**
 * 仅验证用户身份（不需要项目）
 */
export async function withAuth(): Promise<
    | { success: true; session: AuthSession }
    | { success: false; response: NextResponse }
> {
    const session = await getServerSession(authOptions as any)

    if (!session?.user?.id) {
        return {
            success: false,
            response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
    }

    return {
        success: true,
        session: session as AuthSession
    }
}

/**
 * 验证项目是否为 novel-promotion 模式
 */
export function requireNovelPromotionMode(project: ProjectWithOwner): NextResponse | null {
    if (project.mode !== 'novel-promotion') {
        return NextResponse.json(
            { error: 'Not a novel promotion project' },
            { status: 400 }
        )
    }
    return null
}
