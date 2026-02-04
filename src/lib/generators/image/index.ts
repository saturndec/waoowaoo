/**
 * 图片生成器统一导出
 * 
 * 🔥 FAL 和 Ark 已迁移到根目录的合并文件
 * - FAL: ../fal.ts
 * - Ark: ../ark.ts
 */

// Google 生成器保持原位置
export { GoogleGeminiImageGenerator, GoogleImagenGenerator, GoogleGeminiBatchImageGenerator } from './google'
export { Flow2ApiImageGenerator } from './flow2api'
export { GeminiCompatibleImageGenerator } from './gemini-compatible'

// 向后兼容：从合并文件重新导出
export { FalBananaGenerator, FalImageGenerator } from '../fal'
export { ArkSeedreamGenerator, ArkImageGenerator } from '../ark'
