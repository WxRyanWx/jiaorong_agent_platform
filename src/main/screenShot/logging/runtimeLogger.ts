import { app } from 'electron'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ScreenshotStartupSource } from '../contracts/ipc'

let currentSessionLogPath: string | null = null
let currentSessionStartedAt = 0

/** 将任意日志参数安全地序列化为文本。 */
export const formatLogValue = (value: unknown): string => {
  if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack ?? ''}`
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/** 获取截图日志根目录，应用未就绪时回退到工作目录。 */
export const getScreenshotLogRoot = (): string => {
  try {
    return join(app.getPath('logs'), 'screenshot')
  } catch {
    return join(process.cwd(), 'logs', 'screenshot')
  }
}

/** 获取截图调试日志文件路径。 */
const getScreenshotDebugLogPath = (): string => join(getScreenshotLogRoot(), 'screenshot-debug.log')
/** 获取截图功能初始化日志文件路径。 */
export const getScreenshotInitLogPath = (): string => join(getScreenshotLogRoot(), 'app-init.log')

/** 同时向公共日志和当前截图会话日志追加一条记录。 */
export const writeScreenshotLog = (
  level: 'log' | 'warn' | 'error',
  tag: string,
  ...args: unknown[]
): void => {
  const root = getScreenshotLogRoot()
  const source = tag.startsWith('renderer') ? 'renderer' : 'main'
  const normalizedTag = tag.startsWith('renderer:') ? tag.slice('renderer:'.length) : tag
  const line = `[${formatTimestamp()}] [${level}] [${source}] ${normalizedTag} ${args.map(formatLogValue).join(' ')}\n`
  try {
    mkdirSync(root, { recursive: true })
    appendFileSync(getScreenshotDebugLogPath(), line)
    if (currentSessionLogPath) {
      appendFileSync(currentSessionLogPath, line)
    }
  } catch (error) {
    console.error('[screenShot] failed to write screenshot log:', error)
  }
}

/** 生成适合日志正文展示的本地时间。 */
export const formatTimestamp = (): string => {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(
    now.getMinutes()
  )}:${pad(now.getSeconds())}.${String(now.getMilliseconds()).padStart(3, '0')}`
}

/** 生成可安全用于会话日志文件名的时间。 */
const formatSessionTimestamp = (): string => {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(
    now.getMinutes()
  )}-${pad(now.getSeconds())}-${String(now.getMilliseconds()).padStart(3, '0')}`
}

/** 写入会话或流程阶段分隔符，方便定位截图链路。 */
export const writeScreenshotLogSeparator = (kind: 'session' | 'phase', label: string): void => {
  const line = kind === 'session' ? '='.repeat(60) : '-'.repeat(60)
  const block = `\n${line}\n[${formatTimestamp()}] ${label}\n${line}\n`
  try {
    mkdirSync(getScreenshotLogRoot(), { recursive: true })
    appendFileSync(getScreenshotDebugLogPath(), block)
    if (currentSessionLogPath) appendFileSync(currentSessionLogPath, block)
  } catch (error) {
    console.error('[screenShot] failed to write screenshot separator:', error)
  }
}

/** 为一次截图启动创建独立的会话日志。 */
export const startScreenshotLogSession = (source: ScreenshotStartupSource): void => {
  const root = getScreenshotLogRoot()
  const stamp = formatSessionTimestamp()
  currentSessionLogPath = join(root, 'sessions', `screenshot-${stamp}_${source}.log`)
  currentSessionStartedAt = Date.now()
  try {
    mkdirSync(join(root, 'sessions'), { recursive: true })
    writeFileSync(join(root, 'latest-session.txt'), `${currentSessionLogPath}\n`)
  } catch (error) {
    console.error('[screenShot] failed to start screenshot log session:', error)
  }
  writeScreenshotLog('log', 'session-log', `path=${currentSessionLogPath}`, `source=${source}`)
  writeScreenshotLogSeparator('session', `SESSION START  source=${source}`)
  writeScreenshotLogSeparator('phase', 'PHASE  window')
}

/** 返回当前截图会话从启动至今的耗时。 */
export const getSessionCost = (): string =>
  currentSessionStartedAt ? `${Date.now() - currentSessionStartedAt}ms` : 'n/a'
