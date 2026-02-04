import { NextRequest, NextResponse } from 'next/server'
import { getUserCostSummary } from '@/lib/pricing'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'

/**
 * GET /api/user/costs
 * 获取当前用户所有项目费用汇总
 */
export const GET = apiHandler(async (request: NextRequest) => {
  // 🔐 统一权限验证
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const userId = session.user.id

  // 获取用户费用汇总
  const costSummary = await getUserCostSummary(userId)

  // 获取项目名称
  const projectIds = costSummary.byProject.map(p => p.projectId)
  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: { id: true, name: true }
  })

  const projectMap = new Map(projects.map(p => [p.id, p.name]))

  // 合并项目名称
  const byProjectWithNames = costSummary.byProject.map(p => ({
    projectId: p.projectId,
    projectName: projectMap.get(p.projectId) || '未知项目',
    totalCost: p._sum.cost || 0,
    recordCount: p._count
  }))

  return NextResponse.json({
    userId,
    total: costSummary.total,
    byProject: byProjectWithNames.sort((a, b) => b.totalCost - a.totalCost)
  })
})
