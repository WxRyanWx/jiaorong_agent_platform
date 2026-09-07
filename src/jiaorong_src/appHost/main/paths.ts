import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { app } from 'electron'
import { getAppHomeDir } from '@jiaorong/brand/appIdentity'

export function getUserAppsRoot(homeDir = os.homedir()): string {
  return path.join(getAppHomeDir(homeDir), 'apps')
}

export function getUserAppDir(appId: string, homeDir = os.homedir()): string {
  return path.join(getUserAppsRoot(homeDir), appId)
}

export function getBuiltinAppsRoot(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'jiaorong-apps')
  }
  return path.join(app.getAppPath(), 'src', 'jiaorong_src', 'apps')
}

export function getBuiltinAppDir(builtinDir: string): string {
  return path.join(getBuiltinAppsRoot(), builtinDir)
}

export function getAppPreloadPath(): string {
  return path.join(__dirname, '../preload/jiaorongApp.mjs')
}

/** `<webview preload>` 只接受 file: URL，不能传裸文件系统路径。 */
export function getAppPreloadFileUrl(): string {
  return pathToFileURL(getAppPreloadPath()).href
}

export function isPathInsideRoot(rootPath: string, targetPath: string): boolean {
  const relativePath = path.relative(rootPath, targetPath)
  return (
    relativePath === '' ||
    (!!relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath))
  )
}

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true })
}

export function shouldCopyAppPath(sourceRoot: string, filePath: string): boolean {
  const relative = path.relative(sourceRoot, filePath)
  if (!relative || relative.startsWith('..')) return false
  const parts = relative.split(path.sep)
  if (parts.includes('node_modules') || parts.includes('.git')) return false
  if (parts[0] === 'web') return false
  return true
}
