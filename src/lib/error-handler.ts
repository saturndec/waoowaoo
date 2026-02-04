/**
 * 🚨 统一错误处理工具
 * 
 * 用于处理 API 响应错误，特别是余额不足（402）等常见错误
 * 
 * 🌐 国际化说明：
 * 此工具只返回错误代码（Error Code），不返回翻译后的消息。
 * UI 层应使用 t(`errors.${errorCode}`) 来获取翻译后的错误消息。
 */

// 错误代码常量
export const ERROR_CODES = {
    INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
    OPERATION_FAILED: 'OPERATION_FAILED',
    NETWORK_ERROR: 'NETWORK_ERROR',
} as const

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES]

/**
 * 处理 API 响应错误
 * @param res - fetch 响应对象
 * @param fallbackCode - 后备错误代码
 * @throws Error - 抛出包含错误代码的 Error
 */
export async function handleApiError(res: Response, fallbackCode: ErrorCode = ERROR_CODES.OPERATION_FAILED): Promise<never> {
    let errorData: any = {}

    try {
        errorData = await res.json()
    } catch {
        // 如果无法解析 JSON，使用后备错误代码
    }

    // 💰 余额不足特殊处理（402 Payment Required）
    if (res.status === 402) {
        // 返回错误代码，让 UI 层处理翻译和显示
        throw new Error(ERROR_CODES.INSUFFICIENT_BALANCE)
    }

    // 🔥 优先使用错误代码（error.code），用于前端翻译
    // 例如："SENSITIVE_CONTENT" → "内容可能包含敏感信息..."
    // 如果没有 code，则回退到 message 或通用错误
    const errorMessage = errorData.error?.code || errorData.error?.message || errorData.error || errorData.code || fallbackCode
    throw new Error(errorMessage)
}

/**
 * 检查并处理 API 响应
 * @param res - fetch 响应对象
 * @param fallbackCode - 后备错误代码
 */
export async function checkApiResponse(res: Response, fallbackCode: ErrorCode = ERROR_CODES.OPERATION_FAILED): Promise<void> {
    if (!res.ok) {
        await handleApiError(res, fallbackCode)
    }
}

/**
 * 辅助函数：判断是否是余额不足错误
 */
export function isInsufficientBalanceError(error: Error): boolean {
    return error.message === ERROR_CODES.INSUFFICIENT_BALANCE
}
