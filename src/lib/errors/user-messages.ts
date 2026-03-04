import type { UnifiedErrorCode } from './codes'

export const USER_ERROR_MESSAGES_ZH: Record<UnifiedErrorCode, string> = {
  UNAUTHORIZED: '请先登录后再试。',
  FORBIDDEN: '你没有权限执行此操作。',
  NOT_FOUND: '没有找到对应的数据。',
  INVALID_PARAMS: '请求参数不正确，请检查后重试。',
  MISSING_CONFIG: '系统配置不完整，请联系管理员。',
  CONFLICT: '当前状态冲突，请刷新后重试。',
  TASK_NOT_READY: '任务还在处理中，请稍后。',
  NO_RESULT: '任务已完成，但没有可用结果。',
  RATE_LIMIT: '请求过于频繁，请稍后重试。',
  QUOTA_EXCEEDED: '额度已用尽，请稍后再试。',
  EXTERNAL_ERROR: '外部服务暂时不可用，请稍后重试。',
  NETWORK_ERROR: '网络异常，请稍后重试。',
  INSUFFICIENT_BALANCE: '余额不足，请先充值。',
  SENSITIVE_CONTENT: '内容可能涉及敏感信息，请修改后重试。',
  GENERATION_TIMEOUT: '生成超时，请重试。',
  GENERATION_FAILED: '生成失败，请稍后重试。',
  WATCHDOG_TIMEOUT: '任务执行超时，系统已终止该任务。',
  QUEUE_STUCK_TIMEOUT: '任务排队超时，系统已终止该任务。',
  WORKER_EXECUTION_ERROR: '任务执行失败，请稍后重试。',
  WORKER_UNAVAILABLE: '当前没有可用的任务执行器，请启动 worker 后重试。',
  INTERNAL_ERROR: '系统内部错误，请稍后重试。',
}

export function getUserMessageByCode(code: UnifiedErrorCode) {
  return USER_ERROR_MESSAGES_ZH[code]
}
