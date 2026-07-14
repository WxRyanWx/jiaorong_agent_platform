import { appendFileSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs'
import { app } from 'electron'
import path from 'path'
import type { ScreenshotDebugLogLevel } from './screenshot-ipc'

const MAX_SESSION_LOG_FILES = 30

let logFilePath: string | null = null
let logRootDir: string | null = null

function formatTimestamp(): string {
  const now = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
    now.getHours()
  )}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${String(now.getMilliseconds()).padStart(3, '0')}`
}

function formatSessionFileTimestamp(now = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(
    now.getHours()
  )}-${pad(now.getMinutes())}-${pad(now.getSeconds())}-${String(now.getMilliseconds()).padStart(3, '0')}`
}

function sanitizeLogSource(source: string): string {
  const normalized = source
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return normalized || 'unknown'
}

function serializeArg(arg: unknown): string {
  if (arg instanceof Error) {
    return `${arg.name}: ${arg.message}${arg.stack ? `\n${arg.stack}` : ''}`
  }
  if (typeof arg === 'string') return arg
  try {
    return JSON.stringify(arg)
  } catch {
    return String(arg)
  }
}

function serializeArgs(args: unknown[]): string {
  return args.map(serializeArg).join(' ')
}

function getScreenshotLogRootDir(): string {
  if (!logRootDir) {
    logRootDir = path.join(app.getPath('logs'), 'screenshot')
    mkdirSync(logRootDir, { recursive: true })
  }
  return logRootDir
}

function getScreenshotSessionsDir(): string {
  const dir = path.join(getScreenshotLogRootDir(), 'sessions')
  mkdirSync(dir, { recursive: true })
  return dir
}

function writeLatestSessionPointer(sessionLogPath: string): void {
  try {
    writeFileSync(
      path.join(getScreenshotLogRootDir(), 'latest-session.txt'),
      `${sessionLogPath}\n`,
      'utf8'
    )
  } catch (error) {
    console.error('[screenshot] write latest-session pointer failed:', error)
  }
}

function pruneOldSessionLogs(): void {
  const sessionsDir = getScreenshotSessionsDir()
  const files = readdirSync(sessionsDir)
    .filter((name) => name.endsWith('.log'))
    .map((name) => {
      const fullPath = path.join(sessionsDir, name)
      return { fullPath, mtimeMs: statSync(fullPath).mtimeMs }
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)

  for (const file of files.slice(MAX_SESSION_LOG_FILES)) {
    try {
      rmSync(file.fullPath, { force: true })
    } catch {
      // ignore cleanup errors
    }
  }
}

/** 每次截图会话开始时创建独立日志文件 */
export function startScreenshotSessionLog(source = 'unknown'): string {
  const sessionsDir = getScreenshotSessionsDir()
  const fileName = `screenshot-${formatSessionFileTimestamp()}_${sanitizeLogSource(source)}.log`
  logFilePath = path.join(sessionsDir, fileName)

  try {
    writeFileSync(
      logFilePath,
      `[${formatTimestamp()}] [log] [main] session-log path=${logFilePath} source=${source}\n`,
      'utf8'
    )
    writeLatestSessionPointer(logFilePath)
    pruneOldSessionLogs()
  } catch (error) {
    console.error('[screenshot] create session log failed:', error)
  }

  return logFilePath
}

/** 确保日志路径可用（无会话文件时惰性创建 unknown 会话） */
function ensureScreenshotLogFilePath(): string | null {
  if (logFilePath) return logFilePath
  try {
    return startScreenshotSessionLog('unknown')
  } catch (error) {
    console.error('[screenshot] init session log failed:', error)
    return null
  }
}

export function initScreenshotDebugLog(): string {
  const rootDir = getScreenshotLogRootDir()
  const initLogPath = path.join(rootDir, 'app-init.log')
  try {
    appendFileSync(
      initLogPath,
      `[${formatTimestamp()}] [log] [main] screenshot logger initialized root=${rootDir}\n`,
      'utf8'
    )
  } catch (error) {
    console.error('[screenshot] write init marker failed:', error)
  }
  return initLogPath
}

export function getScreenshotDebugLogPath(): string | null {
  return logFilePath ?? ensureScreenshotLogFilePath()
}

export type ScreenshotLogSeparatorKind = 'session' | 'phase'

const SEPARATOR_WIDTH = 60

function separatorLine(kind: ScreenshotLogSeparatorKind): string {
  return kind === 'session' ? '='.repeat(SEPARATOR_WIDTH) : '-'.repeat(SEPARATOR_WIDTH)
}

/** 写入分隔线（会话级 / 阶段级），便于在日志文件中区分两次截图与各流程段 */
export function writeScreenshotLogSeparator(
  kind: ScreenshotLogSeparatorKind,
  label?: string
): void {
  const top = separatorLine(kind)
  const labelLine = label ? `[${formatTimestamp()}] ${label}` : ''

  console.log(top)
  if (labelLine) console.log(labelLine)
  console.log(top)

  const filePath = ensureScreenshotLogFilePath()
  if (!filePath) return

  try {
    let block = `\n${top}\n`
    if (labelLine) block += `${labelLine}\n`
    block += `${top}\n`
    appendFileSync(filePath, block, 'utf8')
  } catch (error) {
    console.error('[screenshot] write separator failed:', error)
  }
}

export function formatScreenshotLogArgs(args: unknown[]): string {
  return serializeArgs(args)
}

export function writeScreenshotLog(
  source: 'renderer' | 'main',
  level: ScreenshotDebugLogLevel,
  tag: string,
  ...args: unknown[]
): void {
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  const prefix = source === 'renderer' ? `[screenshot-renderer] ${tag}` : `[screenshot-main] ${tag}`
  fn(prefix, ...args)

  const filePath = ensureScreenshotLogFilePath()
  if (!filePath) return

  try {
    const line = `[${formatTimestamp()}] [${level}] [${source}] ${tag} ${serializeArgs(args)}\n`
    appendFileSync(filePath, line, 'utf8')
  } catch (error) {
    console.error('[screenshot] write debug log failed:', error)
  }
}
