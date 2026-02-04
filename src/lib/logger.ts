import fs from 'fs'
import path from 'path'

// 检测是否在 Vercel serverless 环境中（文件系统只读）
const IS_VERCEL = process.env.VERCEL === '1' || process.env.VERCEL === 'true'

const LOG_DIR = path.join(process.cwd(), 'logs')

// 只在非 Vercel 环境（本地开发）创建日志目录
if (!IS_VERCEL) {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true })
    }
  } catch {
    // 忽略创建目录失败的错误
  }
}

/**
 * 日志级别
 */
export enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  DEBUG = 'DEBUG',
  API = 'API',
  USER = 'USER'
}

/**
 * 日志条目接口
 */
interface LogEntry {
  timestamp: string
  level: LogLevel
  userId?: string
  username?: string
  projectId?: string
  projectName?: string
  action: string
  message: string  // 中文自然语言描述
  details?: any
  request?: {
    method?: string
    url?: string
    body?: any
    headers?: any
  }
  response?: {
    status?: number
    data?: any
    error?: any
  }
}

/**
 * 格式化时间戳 (北京时间)
 */
function getTimestamp(): string {
  const now = new Date()
  // 转换为北京时间 (UTC+8)
  const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  return beijingTime.toISOString().replace('Z', '+08:00')
}

/**
 * 获取北京时间的日期字符串 (YYYY-MM-DD_HH-mm-ss)
 */
function getBeijingDateString(): string {
  const now = new Date()
  const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  return beijingTime.toISOString()
    .replace(/T/, '_')
    .replace(/:/g, '-')
    .replace(/\..+/, '')
}

/**
 * 获取项目日志文件路径
 * 格式: 用户名_项目名.log
 */
function getProjectLogFilePath(username: string, projectName: string): string {
  const safeUsername = username.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_')
  const safeProjectName = projectName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_')
  return path.join(LOG_DIR, `${safeUsername}_${safeProjectName}.log`)
}

/**
 * 获取全局日志文件路径
 */
function getGlobalLogFilePath(): string {
  return path.join(LOG_DIR, 'global.log')
}

/**
 * 获取内部系统日志文件路径
 * 格式: Internal_系统模块.log 或 Internal_项目名.log
 */
function getInternalLogFilePath(module: string): string {
  const safeModule = module.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_')
  return path.join(LOG_DIR, `Internal_${safeModule}.log`)
}

/**
 * 写入内部系统日志（Cron、Gemini Batch 等）
 * 不输出到控制台，只写入文件
 * 
 * @param module 模块名称（如 GeminiBatch, Cron）
 * @param level 日志级别
 * @param message 日志消息
 * @param details 详细信息（可选）
 * @param projectName 项目名称（可选，如果提供则写入项目专属日志）
 */
export function logInternal(
  module: string,
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG',
  message: string,
  details?: any,
  projectName?: string
): void {
  // Vercel 环境使用 console.log
  if (IS_VERCEL) {
    console.log(`[${module}] ${level}: ${message}`, details ? JSON.stringify(details) : '')
    return
  }

  try {
    const timestamp = getReadableTimestamp()
    const logLine = JSON.stringify({
      timestamp,
      module,
      level,
      message,
      details
    }) + '\n'

    // 🔥 如果有项目名称，写入项目专属日志
    if (projectName) {
      const projectLogFile = getInternalLogFilePath(projectName)
      fs.appendFileSync(projectLogFile, logLine, 'utf8')
    } else {
      // 写入模块日志
      const logFile = getInternalLogFilePath(module)
      fs.appendFileSync(logFile, logLine, 'utf8')
    }
  } catch (error) {
    // 静默失败，避免日志函数本身抛出异常
  }
}

/**
 * 格式化可读的时间戳
 */
function getReadableTimestamp(): string {
  const now = new Date()
  const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  const year = beijingTime.getUTCFullYear()
  const month = String(beijingTime.getUTCMonth() + 1).padStart(2, '0')
  const day = String(beijingTime.getUTCDate()).padStart(2, '0')
  const hour = String(beijingTime.getUTCHours()).padStart(2, '0')
  const minute = String(beijingTime.getUTCMinutes()).padStart(2, '0')
  const second = String(beijingTime.getUTCSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

/**
 * 写入日志
 */
function writeLog(entry: LogEntry): void {
  // 在 Vercel 环境中，只使用 console.log（文件系统只读）
  if (IS_VERCEL) {
    console.log(JSON.stringify(entry))
    return
  }

  try {
    // 如果有projectId、username和projectName,写入项目专属日志
    if (entry.projectId && entry.username && entry.projectName) {
      const projectLogFile = getProjectLogFilePath(entry.username, entry.projectName)
      const logLine = JSON.stringify(entry) + '\n'
      fs.appendFileSync(projectLogFile, logLine, 'utf8')
    }

    // 同时写入全局日志
    const globalLogFile = getGlobalLogFilePath()
    const logLine = JSON.stringify(entry) + '\n'
    fs.appendFileSync(globalLogFile, logLine, 'utf8')
  } catch (error) {
    console.error('Failed to write log:', error)
  }
}

/**
 * 通用日志函数
 */
export function log(
  level: LogLevel,
  action: string,
  message: string,
  details?: any,
  userId?: string,
  username?: string,
  projectId?: string,
  projectName?: string
): void {
  const entry: LogEntry = {
    timestamp: getReadableTimestamp(),
    level,
    userId,
    username,
    projectId,
    projectName,
    action,
    message,
    details
  }
  writeLog(entry)
}

/**
 * 记录用户操作
 */
export function logUserAction(
  action: string,
  userId: string,
  username: string,
  message: string,
  details?: any,
  projectId?: string,
  projectName?: string
): void {
  log(LogLevel.USER, action, message, details, userId, username, projectId, projectName)
}

/**
 * 记录API请求
 */
export function logAPIRequest(
  action: string,
  message: string,
  request: {
    method: string
    url: string
    body?: any
    headers?: any
  },
  userId?: string,
  username?: string,
  projectId?: string
): void {
  const entry: LogEntry = {
    timestamp: getReadableTimestamp(),
    level: LogLevel.API,
    userId,
    username,
    projectId,
    action,
    message,
    request: {
      method: request.method,
      url: request.url,
      body: request.body,
      headers: request.headers
    }
  }
  writeLog(entry)
}

/**
 * 记录API响应
 */
export function logAPIResponse(
  action: string,
  message: string,
  response: {
    status: number
    data?: any
    error?: any
  },
  userId?: string,
  username?: string,
  projectId?: string
): void {
  const entry: LogEntry = {
    timestamp: getReadableTimestamp(),
    level: response.error ? LogLevel.ERROR : LogLevel.API,
    userId,
    username,
    projectId,
    action,
    message,
    response: {
      status: response.status,
      data: response.data,
      error: response.error
    }
  }
  writeLog(entry)
}

/**
 * 记录图片生成
 */
export function logImageGeneration(
  userId: string,
  username: string,
  projectId: string,
  projectName: string,
  details: {
    shotId?: string
    characterId?: string
    locationId?: string
    characterName?: string
    locationName?: string
    prompt: string
    referenceImages?: string[]
    model: string
    result?: {
      imageUrl?: string
      error?: string
    }
  }
): void {
  let message = ''

  if (details.result?.error) {
    // 失败
    if (details.shotId) {
      message = `生成镜头图片失败: ${details.result.error}`
    } else if (details.characterId) {
      message = `生成角色"${details.characterName || details.characterId}"图片失败: ${details.result.error}`
    } else if (details.locationId) {
      message = `生成场景"${details.locationName || details.locationId}"图片失败: ${details.result.error}`
    }
  } else if (details.result?.imageUrl) {
    // 成功
    if (details.shotId) {
      message = `生成镜头图片成功`
    } else if (details.characterId) {
      message = `生成角色"${details.characterName || details.characterId}"图片成功`
    } else if (details.locationId) {
      message = `生成场景"${details.locationName || details.locationId}"图片成功`
    }
  } else {
    // 开始生成
    if (details.shotId) {
      message = `开始生成镜头图片`
    } else if (details.characterId) {
      message = `开始生成角色"${details.characterName || details.characterId}"图片`
    } else if (details.locationId) {
      message = `开始生成场景"${details.locationName || details.locationId}"图片`
    }
  }

  logUserAction('IMAGE_GENERATION', userId, username, message, details, projectId, projectName)
}

/**
 * 记录视频生成
 */
export function logVideoGeneration(
  userId: string,
  username: string,
  projectId: string,
  projectName: string,
  details: {
    shotId: string
    prompt: string
    imageUrl: string
    model: string
    firstLastFrame?: {
      firstImage: string
      lastImage: string
    }
    result?: {
      videoUrl?: string
      error?: string
      asyncTaskId?: string
      status?: string
    }
  }
): void {
  let message = ''

  if (details.result?.error) {
    message = `生成镜头视频失败: ${details.result.error}`
  } else if (details.result?.videoUrl) {
    message = `生成镜头视频成功`
  } else if (details.result?.asyncTaskId) {
    message = `视频任务已提交: ${details.result.asyncTaskId}`
  } else {
    message = `开始生成镜头视频`
  }

  logUserAction('VIDEO_GENERATION', userId, username, message, details, projectId, projectName)
}

/**
 * 记录AI分析 - 简洁格式：时间：阶段：信息
 */
export function logAIAnalysis(
  userId: string,
  username: string,
  projectId: string,
  projectName: string,
  details: {
    action:
    // 基础分析阶段
    | 'ANALYZE_SCRIPT' | 'SPLIT_CLIPS' | 'GENERATE_SCRIPTS' | 'GENERATE_SHOTS'
    | 'GENERATE_SHOTS_CLIP' | 'OPTIMIZE_PROMPTS' | 'AI_MODIFY_SHOT_PROMPT'
    | 'ANALYZE_NOVEL_SRT'
    // 分镜生成阶段
    | 'GENERATE_STORYBOARD_TEXT' | 'GENERATE_STORYBOARD_IMAGES'
    | 'GENERATE_STORYBOARD_PLAN' | 'GENERATE_STORYBOARD_DETAIL'
    | 'STORYBOARD_PHASE1_PROMPT' | 'STORYBOARD_PHASE1_OUTPUT'
    | 'STORYBOARD_PHASE2_ACTING_PROMPT' | 'STORYBOARD_PHASE2_ACTING_OUTPUT'
    | 'STORYBOARD_PHASE3_PROMPT' | 'STORYBOARD_PHASE3_OUTPUT' | 'STORYBOARD_FINAL_OUTPUT'
    | 'CINEMATOGRAPHER_PLAN' | 'ACTING_DIRECTION_PLAN'
    // 重新生成阶段
    | 'REGENERATE_PANEL_IMAGE'
    | 'REGENERATE_STORYBOARD_TEXT'
    | 'REGENERATE_STORYBOARD_PHASE1_PROMPT' | 'REGENERATE_STORYBOARD_PHASE1_OUTPUT'
    | 'REGENERATE_STORYBOARD_PHASE2_PROMPT' | 'REGENERATE_STORYBOARD_PHASE2_OUTPUT'
    | 'REGENERATE_STORYBOARD_FINAL_OUTPUT'
    // 剧本转换
    | 'SCREENPLAY_CONVERSION_START'
    // 允许其他字符串以保持灵活性
    | string
    input?: any
    output?: any
    model: string
    error?: string
  }
): void {
  // 阶段中文名称映射
  const stageNames: Record<string, string> = {
    'ANALYZE_SCRIPT': '剧本分析',
    'ANALYZE_NOVEL_SRT': '资产分析',
    'SPLIT_CLIPS': '片段切分',
    'GENERATE_SCRIPTS': '剧本生成',
    'GENERATE_SHOTS': '镜头生成',
    'GENERATE_SHOTS_CLIP': '镜头片段生成',
    'OPTIMIZE_PROMPTS': '提示词优化',
    'AI_MODIFY_SHOT_PROMPT': '镜头提示词修改',
    'GENERATE_STORYBOARD_TEXT': '文字分镜生成',
    'GENERATE_STORYBOARD_IMAGES': '图片分镜生成',
    'GENERATE_STORYBOARD_PLAN': '分镜规划',
    'GENERATE_STORYBOARD_DETAIL': '分镜细节生成',
    'REGENERATE_PANEL_IMAGE': '单镜头重新生成'
  }

  const stageName = stageNames[details.action] || details.action
  let message = ''

  if (details.error) {
    message = `失败: ${details.error}`
  } else if (details.output) {
    // 完成
    if (details.action === 'ANALYZE_SCRIPT' || details.action === 'ANALYZE_NOVEL_SRT') {
      const chars = details.output.characters || 0
      const locs = details.output.locations || 0
      message = `完成: 识别${chars}个角色, ${locs}个场景`
    } else if (details.action === 'SPLIT_CLIPS') {
      const count = details.output.clipsCount || 0
      message = `完成: 生成${count}个片段`
    } else if (details.action === 'GENERATE_STORYBOARD_TEXT') {
      const count = details.output.panelCount || 0
      message = `完成: 生成${count}个分镜`
    } else if (details.action === 'GENERATE_STORYBOARD_IMAGES') {
      message = `完成: 图片生成成功`
    } else {
      message = `完成`
    }
  } else {
    message = `开始`
  }

  logUserAction('AI_ANALYSIS', userId, username, message, { 阶段: stageName, ...details }, projectId, projectName)
}

/**
 * 记录项目操作
 */
export function logProjectAction(
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'STAGE_CHANGE' | 'GENERATE_TTS' | 'UPDATE_NOVEL_PROMOTION' | 'UPDATE_DYNAMIC_COMIC',
  userId: string,
  username: string,
  projectId: string,
  projectName: string,
  details?: any
): void {
  let message = ''

  if (action === 'CREATE') {
    message = `创建项目"${projectName}"`
  } else if (action === 'UPDATE' || action === 'UPDATE_NOVEL_PROMOTION' || action === 'UPDATE_DYNAMIC_COMIC') {
    message = `更新项目"${projectName}"`
  } else if (action === 'DELETE') {
    message = `删除项目"${projectName}"`
  } else if (action === 'STAGE_CHANGE') {
    const from = details?.from || '未知'
    const to = details?.to || '未知'
    const stageNames: Record<string, string> = {
      'config': '配置',
      'assets': '资产',
      'text-storyboard': '文字分镜',
      'storyboard': '分镜面板',
      'videos': '视频'
    }
    message = `项目阶段从"${stageNames[from] || from}"切换到"${stageNames[to] || to}"`
  }

  logUserAction(`PROJECT_${action}`, userId, username, message, details, projectId, projectName)
}

/**
 * 记录认证操作
 */
export function logAuthAction(
  action: 'LOGIN' | 'LOGOUT' | 'REGISTER',
  username: string,
  details?: any
): void {
  let message = ''

  if (action === 'LOGIN') {
    message = `用户"${username}"登录`
  } else if (action === 'LOGOUT') {
    message = `用户"${username}"登出`
  } else if (action === 'REGISTER') {
    message = `用户"${username}"注册`
  }

  log(LogLevel.USER, `AUTH_${action}`, message, details, undefined, username)
}

/**
 * 记录错误
 */
export function logError(
  action: string,
  error: any,
  userId?: string,
  username?: string,
  projectId?: string
): void {
  const message = `操作"${action}"发生错误: ${error.message || error}`

  log(
    LogLevel.ERROR,
    action,
    message,
    {
      error: error.message || error,
      stack: error.stack
    },
    userId,
    username,
    projectId
  )
}

/**
 * 读取项目日志文件
 */
export function readProjectLogs(username: string, projectName: string): LogEntry[] {
  // Vercel 环境没有本地日志文件
  if (IS_VERCEL) {
    return []
  }

  try {
    const logFile = getProjectLogFilePath(username, projectName)
    if (!fs.existsSync(logFile)) {
      return []
    }
    const content = fs.readFileSync(logFile, 'utf8')
    return content
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line))
  } catch (error) {
    console.error('Failed to read project logs:', error)
    return []
  }
}

/**
 * 读取全局日志文件
 */
export function readGlobalLogs(): LogEntry[] {
  // Vercel 环境没有本地日志文件
  if (IS_VERCEL) {
    return []
  }

  try {
    const logFile = getGlobalLogFilePath()
    if (!fs.existsSync(logFile)) {
      return []
    }
    const content = fs.readFileSync(logFile, 'utf8')
    return content
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line))
  } catch (error) {
    console.error('Failed to read global logs:', error)
    return []
  }
}

/**
 * 获取所有日志文件列表
 */
export function getLogFiles(): string[] {
  // Vercel 环境没有本地日志文件
  if (IS_VERCEL) {
    return []
  }

  try {
    return fs.readdirSync(LOG_DIR)
      .filter(file => file.endsWith('.log'))
      .sort()
      .reverse()
  } catch (error) {
    console.error('Failed to list log files:', error)
    return []
  }
}

