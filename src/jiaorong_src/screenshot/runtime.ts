import { app, ipcMain } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import logger from '@shared/logger'
import { SCREENSHOT_OPEN_CHANNEL } from './contracts'

let initialized = false

function bundledExecutablePath(): string {
  const runtimeRoot = app.isPackaged
    ? join(process.resourcesPath, 'screenshot-runtime')
    : join(app.getAppPath(), 'build', 'screenshot-runtime')

  if (process.platform === 'darwin') {
    return join(runtimeRoot, 'JiaorongScreenshot.app', 'Contents', 'MacOS', 'JiaorongScreenshot')
  }
  return join(
    runtimeRoot,
    process.platform === 'win32' ? 'jiaorong-screenshot.exe' : 'jiaorong-screenshot'
  )
}

export function resolveScreenshotExecutable(): string {
  const override = process.env.JIAORONG_SCREENSHOT_EXECUTABLE
  return override ? resolve(override) : bundledExecutablePath()
}

export function launchScreenshot(): boolean {
  const executable = resolveScreenshotExecutable()
  if (!existsSync(executable)) {
    logger.error(`[jiaorong:screenshot] executable not found: ${executable}`)
    return false
  }

  try {
    const child = spawn(executable, ['--clipboard'], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: false
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.once('error', (error) => logger.error('[jiaorong:screenshot] launch failed', error))
    child.once('close', (exitCode) => {
      const resultLine = stdout
        .trim()
        .split(/\r?\n/)
        .findLast((line) => line.startsWith('{'))
      if (!resultLine) {
        logger.warn(
          `[jiaorong:screenshot] no CLI result, exitCode=${exitCode}, stderr=${stderr.trim()}`
        )
        return
      }
      try {
        logger.info('[jiaorong:screenshot] CLI result', JSON.parse(resultLine))
      } catch (error) {
        logger.error('[jiaorong:screenshot] invalid CLI result', error)
      }
    })
    return true
  } catch (error) {
    logger.error('[jiaorong:screenshot] launch failed', error)
    return false
  }
}

export function initScreenshotRuntime(): void {
  if (initialized) return
  initialized = true
  ipcMain.handle(SCREENSHOT_OPEN_CHANNEL, () => launchScreenshot())
  app.once('before-quit', () => {
    ipcMain.removeHandler(SCREENSHOT_OPEN_CHANNEL)
    initialized = false
  })
}
