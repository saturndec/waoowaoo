import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'
import { toFetchableUrl } from '@/lib/cos'
import LRUCache from 'lru-cache'
/**
 * 🔥 图片下载缓存系统
 * 
 * 解决问题：批量生成分镜时，每个请求都重复下载相同的参考图片
 * 
 * 实现方式：
 * - 使用 LRU 缓存正在进行的下载 Promise
 * - 同一 URL 的并发请求共享同一个 Promise
 * - 缓存有 TTL，避免内存泄漏
 */

// 缓存条目类型
interface CacheEntry {
    promise: Promise<string>  // Base64 结果的 Promise
    expiresAt: number         // 过期时间戳
    size?: number             // 图片大小（字节）
}

// 缓存配置
const CACHE_TTL_MS = 5 * 60 * 1000  // 5 分钟 TTL
const MAX_CACHE_SIZE = 100          // 最多缓存 100 张图片
const CLEANUP_INTERVAL_MS = 60 * 1000  // 每分钟清理一次

// 全局缓存
const imageCache = new LRUCache<string, CacheEntry>({
    max: MAX_CACHE_SIZE,
    ttl: CACHE_TTL_MS,
    ttlAutopurge: true,
})

// 统计信息
let cacheHits = 0
let cacheMisses = 0
let totalDownloadTime = 0

/**
 * 获取图片的 Base64（带缓存）
 * 
 * @param imageUrl 图片 URL（http/https）或已经是 base64
 * @param options 选项
 * @returns Base64 格式的图片数据（data:image/...;base64,...）
 */
export async function getImageBase64Cached(
    imageUrl: string,
    options: {
        logPrefix?: string
        forceRefresh?: boolean
    } = {}
): Promise<string> {
    const { logPrefix = '[图片缓存]', forceRefresh = false } = options

    // 如果已经是 base64，直接返回
    if (imageUrl.startsWith('data:')) {
        return imageUrl
    }

    let fullUrl = imageUrl
    if (!imageUrl.startsWith('http') && !imageUrl.startsWith('/')) {
        throw new Error(`无效的图片 URL: ${imageUrl.substring(0, 50)}...`)
    }
    fullUrl = toFetchableUrl(fullUrl)

    const cacheKey = imageUrl

    // 检查缓存
    if (!forceRefresh) {
        const cached = imageCache.get(cacheKey)
        if (cached && cached.expiresAt > Date.now()) {
            cacheHits++
            _ulogInfo(`${logPrefix} ✅ 缓存命中 (${cacheHits}/${cacheHits + cacheMisses})`)
            return cached.promise
        }
    }

    cacheMisses++

    // 创建下载 Promise（共享给所有并发请求）
    const downloadPromise = downloadImageAsBase64(fullUrl, logPrefix)

    // 存入缓存
    imageCache.set(cacheKey, {
        promise: downloadPromise,
        expiresAt: Date.now() + CACHE_TTL_MS
    })

    // 下载完成后更新大小
    downloadPromise.then(base64 => {
        const entry = imageCache.get(cacheKey)
        if (entry) {
            entry.size = base64.length
        }
    }).catch(() => {
        // 下载失败，从缓存中移除
        imageCache.delete(cacheKey)
    })

    return downloadPromise
}

/**
 * 实际下载图片并转换为 Base64
 */
async function downloadImageAsBase64(imageUrl: string, logPrefix: string): Promise<string> {
    const startTime = Date.now()
    _ulogInfo(`${logPrefix} 开始下载: ${imageUrl.substring(0, 80)}...`)

    try {
        const response = await fetch(toFetchableUrl(imageUrl), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; ImageDownloader/1.0)'
            }
        })

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const buffer = await response.arrayBuffer()
        const base64 = Buffer.from(buffer).toString('base64')
        const contentType = response.headers.get('content-type') || 'image/png'

        const duration = Date.now() - startTime
        totalDownloadTime += duration
        const sizeKB = Math.round(buffer.byteLength / 1024)

        _ulogInfo(`${logPrefix} ✅ 下载完成: ${sizeKB}KB, ${duration}ms`)

        return `data:${contentType};base64,${base64}`
    } catch (error: unknown) {
        const duration = Date.now() - startTime
        const message =
            error instanceof Error
                ? error.message
                : (typeof error === 'object' && error !== null && typeof (error as { message?: unknown }).message === 'string')
                    ? (error as { message: string }).message
                    : '未知错误'
        _ulogError(`${logPrefix} ❌ 下载失败 (${duration}ms): ${message}`)
        throw error
    }
}

/**
 * 批量预加载图片（并行下载，共享缓存）
 * 
 * @param imageUrls 图片 URL 列表
 * @param options 选项
 * @returns Base64 图片数组（按原顺序）
 */
export async function preloadImagesParallel(
    imageUrls: string[],
    options: {
        logPrefix?: string
        maxConcurrency?: number
    } = {}
): Promise<string[]> {
    const { logPrefix = '[批量预加载]' } = options

    // 去重（支持 http URL 和本地相对路径 /api/files/...）
    const uniqueUrls = [...new Set(imageUrls.filter(url => url && (url.startsWith('http') || url.startsWith('/'))))]

    if (uniqueUrls.length === 0) {
        return imageUrls.map(url => url?.startsWith('data:') ? url : '')
    }

    _ulogInfo(`${logPrefix} 开始预加载 ${uniqueUrls.length} 张唯一图片 (原始: ${imageUrls.length} 张)`)

    const startTime = Date.now()

    // 并行下载所有唯一图片
    const downloadPromises = uniqueUrls.map(url =>
        getImageBase64Cached(url, { logPrefix })
    )

    // 等待所有下载完成
    const results = await Promise.allSettled(downloadPromises)

    // 构建 URL -> Base64 映射
    const urlToBase64 = new Map<string, string>()
    results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
            urlToBase64.set(uniqueUrls[index], result.value)
        }
    })

    const duration = Date.now() - startTime
    const successCount = results.filter(r => r.status === 'fulfilled').length
    _ulogInfo(`${logPrefix} 预加载完成: ${successCount}/${uniqueUrls.length} 成功, ${duration}ms`)

    // 按原顺序返回
    return imageUrls.map(url => {
        if (!url) return ''
        if (url.startsWith('data:')) return url
        return urlToBase64.get(url) || ''
    })
}

/**
 * 清理过期缓存
 */
function cleanupExpiredCache() {
    const before = imageCache.size
    if (typeof imageCache.purgeStale === 'function') {
        imageCache.purgeStale()
    } else if (typeof (imageCache as unknown as { prune: () => void }).prune === 'function') {
        (imageCache as unknown as { prune: () => void }).prune()
    }
    const cleaned = before - imageCache.size

    if (cleaned > 0) {
        _ulogInfo(`[图片缓存] 清理 ${cleaned} 个过期条目，剩余 ${imageCache.size} 个`)
    }
}

/**
 * 获取缓存统计信息
 */
export function getImageCacheStats() {
    const now = Date.now()
    let validCount = 0
    let totalSize = 0

    for (const entry of imageCache.values()) {
        if (entry.expiresAt > now) {
            validCount++
            totalSize += entry.size || 0
        }
    }

    return {
        cacheSize: imageCache.size,
        validEntries: validCount,
        totalSizeKB: Math.round(totalSize / 1024),
        cacheHits,
        cacheMisses,
        hitRate: cacheHits + cacheMisses > 0
            ? Math.round(cacheHits / (cacheHits + cacheMisses) * 100)
            : 0,
        totalDownloadTimeMs: totalDownloadTime
    }
}

/**
 * 清空缓存
 */
export function clearImageCache() {
    imageCache.clear()
    cacheHits = 0
    cacheMisses = 0
    totalDownloadTime = 0
    _ulogInfo('[图片缓存] 已清空')
}

// 定期清理
setInterval(cleanupExpiredCache, CLEANUP_INTERVAL_MS)
