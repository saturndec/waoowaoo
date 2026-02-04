/**
 * 💳 余额管理函数
 * 
 * 用户余额查询、预扣费、确认扣费、回滚
 */

import { prisma } from '../prisma'
import { recordUsageCostOnly } from './recorder'
import type { ApiType, UsageUnit } from './config'

// ============================================================
// 余额查询
// ============================================================

/**
 * 获取用户余额信息
 */
export async function getBalance(userId: string) {
    const balance = await prisma.userBalance.findUnique({
        where: { userId }
    })

    if (!balance) {
        // 自动创建余额记录
        return await prisma.userBalance.create({
            data: { userId, balance: 0, frozenAmount: 0, totalSpent: 0 }
        })
    }

    return balance
}

/**
 * 检查余额是否足够
 */
export async function checkBalance(userId: string, requiredAmount: number): Promise<boolean> {
    const balance = await getBalance(userId)
    return balance.balance >= requiredAmount
}

// ============================================================
// 预扣费机制
// ============================================================

/**
 * 预扣费（冻结金额）
 * @returns freezeId 成功时返回冻结ID，失败返回 null
 */
export async function freezeBalance(userId: string, amount: number): Promise<string | null> {
    try {
        const result = await prisma.$transaction(async (tx) => {
            // 1. 获取当前余额
            let balance = await tx.userBalance.findUnique({ where: { userId } })

            // 2. 如果没有余额记录，创建一个
            if (!balance) {
                balance = await tx.userBalance.create({
                    data: { userId, balance: 0, frozenAmount: 0, totalSpent: 0 }
                })
            }

            // 3. 检查余额是否足够
            if (balance.balance < amount) {
                return null
            }

            // 4. 生成冻结 ID
            const freezeId = `freeze_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

            // 5. 扣减可用余额，增加冻结金额
            await tx.userBalance.update({
                where: { userId },
                data: {
                    balance: { decrement: amount },
                    frozenAmount: { increment: amount },
                }
            })

            // 6. 创建冻结记录
            await tx.balanceFreeze.create({
                data: {
                    id: freezeId,
                    userId,
                    amount,
                    status: 'pending'
                }
            })

            return freezeId
        })

        return result
    } catch (error) {
        console.error('[余额] 预扣费失败:', error)
        return null
    }
}

/**
 * 确认扣费（旧版本，仅确认不记录）
 * @deprecated 建议使用 confirmChargeWithRecord
 */
export async function confirmCharge(freezeId: string): Promise<boolean> {
    try {
        await prisma.$transaction(async (tx) => {
            // 1. 查找冻结记录
            const freeze = await tx.balanceFreeze.findUnique({ where: { id: freezeId } })
            if (!freeze || freeze.status !== 'pending') {
                throw new Error('Invalid freeze record')
            }

            // 2. 减少冻结金额，增加总消费
            await tx.userBalance.update({
                where: { userId: freeze.userId },
                data: {
                    frozenAmount: { decrement: freeze.amount },
                    totalSpent: { increment: freeze.amount },
                }
            })

            // 3. 更新冻结记录状态
            await tx.balanceFreeze.update({
                where: { id: freezeId },
                data: { status: 'confirmed' }
            })
        }, {
            maxWait: 10000,
            timeout: 10000
        })

        return true
    } catch (error) {
        console.error('[余额] 确认扣费失败:', error)
        return false
    }
}

/**
 * 🆕 确认扣费并记录费用（新版本）
 * 扣费和记录在同一个事务中完成，确保原子性
 */
export async function confirmChargeWithRecord(
    freezeId: string,
    recordParams: {
        projectId: string
        action: string
        apiType: ApiType
        model: string
        quantity: number
        unit: UsageUnit
        metadata?: Record<string, any>
    }
): Promise<boolean> {
    try {
        await prisma.$transaction(async (tx) => {
            // 1. 查找冻结记录
            const freeze = await tx.balanceFreeze.findUnique({ where: { id: freezeId } })
            if (!freeze || freeze.status !== 'pending') {
                throw new Error('Invalid freeze record')
            }

            // 2. 减少冻结金额，增加总消费，获取新余额
            const updatedBalance = await tx.userBalance.update({
                where: { userId: freeze.userId },
                data: {
                    frozenAmount: { decrement: freeze.amount },
                    totalSpent: { increment: freeze.amount },
                }
            })

            // 3. 记录费用（调用纯记录函数）
            await recordUsageCostOnly(tx, {
                ...recordParams,
                userId: freeze.userId,
                cost: freeze.amount,
                balanceAfter: updatedBalance.balance  // 传入扣费后的余额
            })

            // 4. 更新冻结记录状态
            await tx.balanceFreeze.update({
                where: { id: freezeId },
                data: { status: 'confirmed' }
            })
        }, {
            maxWait: 10000,
            timeout: 10000
        })

        return true
    } catch (error) {
        console.error('[余额] 确认扣费并记录失败:', error)
        return false
    }
}

/**
 * 回滚冻结（失败时返还）
 */
export async function rollbackFreeze(freezeId: string): Promise<boolean> {
    try {
        await prisma.$transaction(async (tx) => {
            // 1. 查找冻结记录
            const freeze = await tx.balanceFreeze.findUnique({ where: { id: freezeId } })
            if (!freeze || freeze.status !== 'pending') {
                throw new Error('Invalid freeze record')
            }

            // 2. 返还余额
            await tx.userBalance.update({
                where: { userId: freeze.userId },
                data: {
                    balance: { increment: freeze.amount },
                    frozenAmount: { decrement: freeze.amount },
                }
            })

            // 3. 更新冻结记录状态
            await tx.balanceFreeze.update({
                where: { id: freezeId },
                data: { status: 'rolled_back' }
            })
        })

        return true
    } catch (error) {
        console.error('[余额] 回滚失败:', error)
        return false
    }
}

// ============================================================
// 充值（管理员使用）
// ============================================================

/**
 * 增加用户余额
 */
export async function addBalance(userId: string, amount: number, reason?: string): Promise<boolean> {
    try {
        await prisma.userBalance.upsert({
            where: { userId },
            create: { userId, balance: amount, frozenAmount: 0, totalSpent: 0 },
            update: { balance: { increment: amount } }
        })
        console.log(`[余额] 充值成功: userId=${userId}, amount=¥${amount}, reason=${reason || 'N/A'}`)
        return true
    } catch (error) {
        console.error('[余额] 充值失败:', error)
        return false
    }
}
