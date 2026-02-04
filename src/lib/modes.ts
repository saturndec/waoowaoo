import { ProjectMode } from '@/types/project'

// 重新导出 ProjectMode 类型，方便其他文件使用
export type { ProjectMode }

export interface ModeConfig {
  id: ProjectMode
  name: string
  description: string
  icon: string
  color: string
  available: boolean
}

export const PROJECT_MODE: ModeConfig = {
  id: 'novel-promotion',
  name: '小说推文',
  description: '从小说生成推广短视频',
  icon: '📚',
  color: 'purple',
  available: true
}

// 为了兼容性保留
export const PROJECT_MODES: ModeConfig[] = [PROJECT_MODE]

export function getModeConfig(mode: ProjectMode): ModeConfig | undefined {
  return mode === 'novel-promotion' ? PROJECT_MODE : undefined
}
