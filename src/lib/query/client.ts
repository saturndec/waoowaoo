import { QueryClient } from '@tanstack/react-query'

/**
 * 全局 QueryClient 配置
 * 用于统一管理所有数据请求的缓存和状态
 */
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // 数据在 5 秒内认为是新鲜的，不会重新请求
            staleTime: 5000,
            // 缓存数据保留 10 分钟
            gcTime: 10 * 60 * 1000,
            // 窗口聚焦时自动刷新
            refetchOnWindowFocus: true,
            // 网络恢复时自动刷新
            refetchOnReconnect: true,
            // 失败后重试 1 次
            retry: 1,
            // 重试延迟
            retryDelay: 1000,
        },
        mutations: {
            // mutation 不重试
            retry: 0,
        },
    },
})

/**
 * 获取全局 QueryClient 实例
 * 用于在非 React 组件中访问缓存
 */
export function getQueryClient() {
    return queryClient
}
