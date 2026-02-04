#!/usr/bin/env node
/**
 * Cron Worker - 异步任务轮询器
 * 
 * 功能：每 10 秒调用 /api/cron/poll-async-tasks 处理异步任务
 * 
 * 架构说明：
 * - poll-tasks API 只读数据库，快速返回状态
 * - 本脚本负责调用 cron API，实际查询外部 AI 服务
 * - 串行执行，不会导致请求堆积
 * 
 * 启动方式：
 * - npm run dev (自动随 Next.js 一起启动)
 * - node scripts/cron-worker.js (单独启动)
 */

// 🔥 手动加载 .env 文件
const path = require('path')
const fs = require('fs')

const envPath = path.resolve(__dirname, '..', '.env')
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    envContent.split('\n').forEach(line => {
        const trimmed = line.trim()
        if (trimmed && !trimmed.startsWith('#')) {
            const [key, ...valueParts] = trimmed.split('=')
            if (key && valueParts.length > 0) {
                const value = valueParts.join('=').replace(/^["']|["']$/g, '')
                process.env[key] = value
            }
        }
    })
    console.log('[CronWorker] ✅ 已加载 .env 文件')
}

const CRON_INTERVAL_MS = 10000 // 10 秒
const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000'
const CRON_SECRET = process.env.CRON_SECRET

// 等待 Next.js 服务器启动
const STARTUP_DELAY_MS = 5000

// 防止并发执行
let isRunning = false
let successCount = 0
let errorCount = 0

async function pollAsyncTasks() {
    if (isRunning) {
        console.log('[CronWorker] ⏳ 上一个任务还在执行，跳过本次')
        return
    }

    isRunning = true
    const startTime = Date.now()

    try {
        const response = await fetch(`${BASE_URL}/api/cron/poll-async-tasks`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${CRON_SECRET}`,
                'Content-Type': 'application/json'
            }
        })

        const elapsed = Date.now() - startTime

        if (response.ok) {
            const data = await response.json()
            successCount++

            if (data.stats && (data.stats.completed > 0 || data.stats.failed > 0 || data.stats.checked > 0)) {
                console.log(`[CronWorker] ✅ 第${successCount}次轮询 (${elapsed}ms): 检查${data.stats.checked}, 完成${data.stats.completed}, 失败${data.stats.failed}`)
            }
            // 如果没有任务，静默（不打印日志，避免刷屏）
        } else {
            errorCount++
            const text = await response.text()
            console.error(`[CronWorker] ❌ 请求失败 (${response.status}): ${text.substring(0, 200)}`)
        }
    } catch (error) {
        errorCount++
        console.error(`[CronWorker] ❌ 网络错误:`, error.message || error)
    } finally {
        isRunning = false
    }
}

function start() {
    console.log('='.repeat(60))
    console.log('[CronWorker] 🚀 异步任务轮询器启动')
    console.log(`[CronWorker] 📍 目标: ${BASE_URL}/api/cron/poll-async-tasks`)
    console.log(`[CronWorker] ⏱️  间隔: ${CRON_INTERVAL_MS / 1000} 秒`)
    console.log(`[CronWorker] 🔐 密钥: ${CRON_SECRET ? CRON_SECRET.substring(0, 8) + '...' : '未设置!'}`)
    console.log('='.repeat(60))

    if (!CRON_SECRET) {
        console.error('[CronWorker] ⚠️  警告: CRON_SECRET 未设置，请在 .env 中配置')
    }

    // 延迟启动，等待 Next.js 服务器就绪
    console.log(`[CronWorker] ⏳ 等待 ${STARTUP_DELAY_MS / 1000} 秒后开始轮询...`)

    setTimeout(() => {
        console.log('[CronWorker] 🎬 开始轮询')

        // 立即执行一次
        pollAsyncTasks()

        // 定时执行
        setInterval(pollAsyncTasks, CRON_INTERVAL_MS)
    }, STARTUP_DELAY_MS)
}

// 优雅退出
process.on('SIGINT', () => {
    console.log(`\n[CronWorker] 👋 正在退出... (成功: ${successCount}, 错误: ${errorCount})`)
    process.exit(0)
})

process.on('SIGTERM', () => {
    console.log(`\n[CronWorker] 👋 正在退出... (成功: ${successCount}, 错误: ${errorCount})`)
    process.exit(0)
})

// 启动
start()
