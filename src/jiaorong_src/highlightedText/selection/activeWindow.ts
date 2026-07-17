import { app } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type ActiveWindowInfo = {
  platform: string
  appName: string
  title: string
  id?: number
  processId?: number
  bounds?: { x: number; y: number; width: number; height: number }
}

type WinInfoResponse = {
  title: string
  id: number
  bounds: ActiveWindowInfo['bounds']
  owner: { name: string; processId: number }
}

/** 找到当前平台的前台窗口查询程序。 */
const resolveWinInfoBinary = (): string | null => {
  const binary = process.platform === 'win32' ? 'win-info-win32.exe' : 'win-info-darwin'
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, 'bin', binary)]
    : [
        join(process.cwd(), 'bin', binary),
        join(app.getAppPath(), 'bin', binary),
        join(__dirname, '../../bin', binary)
      ]
  return candidates.find(existsSync) ?? null
}

/** 读取当前前台窗口信息，用于应用过滤和排除拖动窗口误触。 */
export const getActiveApp = async (): Promise<ActiveWindowInfo | undefined> => {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return undefined
  const command = resolveWinInfoBinary()
  if (!command) return undefined
  try {
    const { stdout } = await execFileAsync(command, ['active'], {
      encoding: 'utf8',
      env: process.env
    })
    const data = JSON.parse(stdout.replace(/(?<!\\)\\(?![\\"])/g, '\\\\')) as WinInfoResponse
    return {
      platform: process.platform,
      appName: data.owner?.name || '',
      title: data.title || '',
      id: data.id,
      processId: data.owner?.processId,
      bounds: data.bounds
    }
  } catch (error) {
    console.warn('[highlightedText] failed to read active window:', error)
    return undefined
  }
}
