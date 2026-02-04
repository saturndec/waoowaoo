// Next.js Instrumentation - 在应用启动时执行
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  // 只在服务端运行
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { prisma } = await import('@/lib/prisma')
    
    try {
      // 清除所有遗留的生成中状态（后端重启后恢复）
      const result = await prisma.novelPromotionPanel.updateMany({
        where: {
          generatingVideo: true
        },
        data: {
          generatingVideo: false
        }
      })

      if (result.count > 0) {
        console.log(`[Instrumentation] Cleared ${result.count} stale generating status on startup`)
      }
    } catch (error) {
      console.error('[Instrumentation] Failed to clear generating status:', error)
    }
  }
}

