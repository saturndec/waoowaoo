/**
 * 🔥 API 性能监控工具
 * 用于诊断系统卡顿问题
 */

// 全局请求计数器
let activeRequests = 0
let peakActiveRequests = 0

// 请求统计
const requestStats: Map<string, { count: number; totalTime: number; maxTime: number }> = new Map()

/**
 * 获取内存使用情况（MB）
 */
function getMemoryUsage() {
    const usage = process.memoryUsage()
    return {
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
        rss: Math.round(usage.rss / 1024 / 1024),
        external: Math.round(usage.external / 1024 / 1024)
    }
}

/**
 * 包装 API 处理函数，添加性能监控
 */
export function withPerformanceMonitor<T extends (...args: any[]) => Promise<any>>(
    apiName: string,
    handler: T
): T {
    return (async (...args: any[]) => {
        const startTime = Date.now()
        activeRequests++
        peakActiveRequests = Math.max(peakActiveRequests, activeRequests)

        const mem = getMemoryUsage()
        console.log(`[性能监控] 📥 ${apiName} 开始 | 并发: ${activeRequests}/${peakActiveRequests} | 内存: ${mem.heapUsed}/${mem.heapTotal}MB`)

        try {
            const result = await handler(...args)
            const duration = Date.now() - startTime

            // 更新统计
            const stats = requestStats.get(apiName) || { count: 0, totalTime: 0, maxTime: 0 }
            stats.count++
            stats.totalTime += duration
            stats.maxTime = Math.max(stats.maxTime, duration)
            requestStats.set(apiName, stats)

            // 标记慢请求
            const isVerySlow = duration > 10000
            const isSlow = duration > 3000
            const icon = isVerySlow ? '🔴' : (isSlow ? '🟡' : '🟢')

            console.log(`[性能监控] ${icon} ${apiName} 完成: ${duration}ms | 并发: ${activeRequests - 1} | 平均: ${Math.round(stats.totalTime / stats.count)}ms`)

            return result
        } catch (error) {
            const duration = Date.now() - startTime
            console.error(`[性能监控] ❌ ${apiName} 失败: ${duration}ms | 错误:`, error)
            throw error
        } finally {
            activeRequests--
        }
    }) as T
}

/**
 * 获取当前性能状态
 */
export function getPerformanceStatus() {
    const mem = getMemoryUsage()
    return {
        activeRequests,
        peakActiveRequests,
        memory: mem,
        stats: Object.fromEntries(requestStats)
    }
}

/**
 * 打印性能报告
 */
export function printPerformanceReport() {
    console.log('\n========== 📊 性能报告 ==========')
    console.log(`当前并发: ${activeRequests} | 峰值: ${peakActiveRequests}`)
    console.log(`内存: ${JSON.stringify(getMemoryUsage())}`)
    console.log('\nAPI 统计:')
    requestStats.forEach((stats, name) => {
        console.log(`  ${name}: 次数=${stats.count}, 平均=${Math.round(stats.totalTime / stats.count)}ms, 最大=${stats.maxTime}ms`)
    })
    console.log('==================================\n')
}

/**
 * 简单的计时器
 */
export function createTimer(label: string) {
    const start = Date.now()
    let lastMark = start

    return {
        mark(step: string) {
            const now = Date.now()
            const fromStart = now - start
            const fromLast = now - lastMark
            console.log(`[计时] ${label} - ${step}: +${fromLast}ms (总计: ${fromStart}ms)`)
            lastMark = now
        },
        end() {
            const total = Date.now() - start
            console.log(`[计时] ${label} - 完成: ${total}ms`)
            return total
        }
    }
}

/**
 * 监控内存变化
 */
export function monitorMemory(intervalMs: number = 5000) {
    let lastHeap = 0

    const timer = setInterval(() => {
        const mem = getMemoryUsage()
        const delta = mem.heapUsed - lastHeap
        const deltaStr = delta > 0 ? `+${delta}` : `${delta}`

        if (Math.abs(delta) > 10) { // 只在变化超过10MB时打印
            console.log(`[内存监控] Heap: ${mem.heapUsed}MB (${deltaStr}MB) | RSS: ${mem.rss}MB | 并发: ${activeRequests}`)
        }
        lastHeap = mem.heapUsed
    }, intervalMs)

    return () => clearInterval(timer)
}
