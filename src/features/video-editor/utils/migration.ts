import { VideoEditorProject } from '../types/editor.types'

/**
 * 版本迁移函数
 * 将旧版本数据升级到最新版本
 */
export function migrateProjectData(data: unknown): VideoEditorProject {
    const project = data as Record<string, unknown>

    // 检查 schema 版本
    const version = project.schemaVersion as string

    switch (version) {
        case '1.0':
            // 当前最新版本，无需迁移
            return project as unknown as VideoEditorProject

        default:
            // 未知版本或无版本，尝试作为 1.0 处理
            console.warn(`Unknown schema version: ${version}, treating as 1.0`)
            return {
                ...project,
                schemaVersion: '1.0'
            } as VideoEditorProject
    }
}

/**
 * 验证项目数据完整性
 */
export function validateProjectData(data: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = []
    const project = data as Record<string, unknown>

    if (!project.id) errors.push('Missing project id')
    if (!project.episodeId) errors.push('Missing episodeId')
    if (!project.schemaVersion) errors.push('Missing schemaVersion')
    if (!project.config) errors.push('Missing config')
    if (!Array.isArray(project.timeline)) errors.push('Invalid timeline')
    if (!Array.isArray(project.bgmTrack)) errors.push('Invalid bgmTrack')

    return {
        valid: errors.length === 0,
        errors
    }
}
