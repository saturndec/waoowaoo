import { NextRequest, NextResponse } from 'next/server'
import { getBalance } from '@/lib/pricing'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'

/**
 * GET /api/user/balance
 * 获取当前用户余额
 */
export const GET = apiHandler(async (request: NextRequest) => {
    // 🔐 统一权限验证
    const authResult = await requireUserAuth()
    if (isErrorResponse(authResult)) return authResult
    const { session } = authResult

    const balance = await getBalance(session.user.id)

    return NextResponse.json({
        success: true,
        balance: balance.balance,
        frozenAmount: balance.frozenAmount,
        totalSpent: balance.totalSpent
    })
})
