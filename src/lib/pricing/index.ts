/**
 * 💰 HuanAI 计费系统
 * 
 * 统一导出入口（V3.5 简化版）
 */

// ============================================================
// 公共接口（推荐使用）
// ============================================================

// 配置（价格、类型定义）
export * from './config'

// 计算（费用估算）
export { calcImage, calcVideo, calcText, calcTTS, calcVoice, calcVoiceDesign, calcLipSync } from './calculator'

// 余额管理
export {
    getBalance,
    checkBalance,
    freezeBalance,
    confirmChargeWithRecord,
    rollbackFreeze,
    addBalance
} from './balance'

// 计费包装器（新API推荐使用）
export {
    BILLING_ENABLED,
    InsufficientBalanceError,
    withImageBilling,
    withVideoBilling,
    withTextBilling,
    withVoiceBilling,
    withVoiceDesignBilling,
    withLipSyncBilling,
    withTTSBilling,
    handleBillingError
} from './billing-helper'

// ============================================================
// 内部接口（仅供复杂API内部使用，不推荐新代码使用）
// ============================================================

// 记录函数（供已有复杂API内部使用）
export {
    recordText,
    recordImage,
    recordVideo,
    recordLipSync,
    recordImageUsage,
    recordVideoUsage,
    recordTextUsage,
    recordTTSUsage,
    getProjectTotalCost,
    getProjectCostDetails,
    getUserCostSummary,
    getUserCostDetails
} from './recorder'
