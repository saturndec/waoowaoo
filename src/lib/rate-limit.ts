/**
 * 🛡️ IP 级别速率限制工具
 *
 * 基于 Redis 滑动窗口实现，适用于登录/注册等敏感接口。
 * 每个 (action, ip) 维度独立计数。超出阈值返回重试等待秒数。
 */

import { redis } from '@/lib/redis'
import { NextRequest } from 'next/server'

// ============================================================
// 类型
// ============================================================

export interface RateLimitConfig {
    /** 限流窗口时长（秒） */
    windowSeconds: number
    /** 窗口内最大请求数 */
    maxRequests: number
}

export interface RateLimitResult {
    /** 是否被限流 */
    limited: boolean
    /** 剩余可用次数 */
    remaining: number
    /** 限流重置时间（秒数，仅 limited=true 时有意义） */
    retryAfterSeconds: number
}

// ============================================================
// 预设配置
// ============================================================

/** 登录：60 秒内最多 5 次 */
export const AUTH_LOGIN_LIMIT: RateLimitConfig = {
    windowSeconds: 60,
    maxRequests: 5,
}

/** 注册：60 秒内最多 3 次 */
export const AUTH_REGISTER_LIMIT: RateLimitConfig = {
    windowSeconds: 60,
    maxRequests: 3,
}

// ============================================================
// 核心逻辑
// ============================================================

/**
 * 检查并递增速率限制计数器。
 *
 * @param action  限流动作名（如 "auth:login"），会拼入 Redis key
 * @param ip      客户端 IP
 * @param config  限流配置
 */
export async function checkRateLimit(
    action: string,
    ip: string,
    config: RateLimitConfig,
): Promise<RateLimitResult> {
    const key = `rate_limit:${action}:${ip}`
    const now = Date.now()
    const windowMs = config.windowSeconds * 1000

    // Lua 脚本：原子地清除过期条目、添加当前请求、返回当前窗口内请求数
    const luaScript = `
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local windowMs = tonumber(ARGV[2])
    local maxRequests = tonumber(ARGV[3])
    local expireSeconds = tonumber(ARGV[4])

    -- 移除窗口之前的条目
    redis.call('ZREMRANGEBYSCORE', key, '-inf', now - windowMs)

    -- 当前窗口内的请求数
    local count = redis.call('ZCARD', key)

    if count < maxRequests then
      -- 未超限，添加当前请求
      redis.call('ZADD', key, now, now .. ':' .. math.random(100000))
      redis.call('EXPIRE', key, expireSeconds)
      return { 0, maxRequests - count - 1, 0 }
    else
      -- 已超限，计算最早条目的过期时间
      local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
      local retryAfterMs = 0
      if #oldest >= 2 then
        retryAfterMs = tonumber(oldest[2]) + windowMs - now
        if retryAfterMs < 0 then retryAfterMs = 0 end
      end
      return { 1, 0, retryAfterMs }
    end
  `

    try {
        const result = await (redis as ReturnType<typeof redis.duplicate>).eval(
            luaScript,
            1,
            key,
            now,
            windowMs,
            config.maxRequests,
            config.windowSeconds + 10, // TTL 略长于窗口以防边界
        ) as [number, number, number]

        return {
            limited: result[0] === 1,
            remaining: result[1],
            retryAfterSeconds: Math.ceil(result[2] / 1000),
        }
    } catch {
        // Redis 不可用时放行，避免 Redis 故障阻塞登录
        return { limited: false, remaining: config.maxRequests, retryAfterSeconds: 0 }
    }
}

// ============================================================
// 辅助：提取客户端 IP
// ============================================================

/**
 * 从 NextRequest 提取客户端真实 IP。
 * 依次检查常见反向代理头，最终回退到 127.0.0.1。
 */
export function getClientIp(req: NextRequest): string {
    // 1. 优先使用 Next.js 提供的 ip 属性
    // 这通常由底层平台（如 Vercel）或正确配置的反向代理填充，相对更可靠
    if (req.ip) return req.ip

    // 2. 其次检查 X-Real-IP，这通常由内部反向代理设置
    const realIp = req.headers.get('x-real-ip')
    if (realIp) return realIp.trim()

    // 3. 最后才考虑 X-Forwarded-For
    // 注意：如果应用直接暴露在公网且没有受信代理，该头部可被伪造
    const forwarded = req.headers.get('x-forwarded-for')
    if (forwarded) {
        const first = forwarded.split(',')[0]?.trim()
        if (first) return first
    }

    return '127.0.0.1'
}
