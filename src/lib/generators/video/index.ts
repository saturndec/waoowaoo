/**
 * 视频生成器统一导出
 * 
 * 🔥 FAL 和 Ark 已迁移到根目录的合并文件
 * - FAL: ../fal.ts
 * - Ark: ../ark.ts
 */

// 向后兼容：从合并文件重新导出
export { FalVideoGenerator } from '../fal'
export { ArkSeedanceVideoGenerator, ArkVideoGenerator } from '../ark'
