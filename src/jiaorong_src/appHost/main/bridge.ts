import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { BrowserWindow, dialog, webContents } from 'electron'
import { isJiaorongBridgeFailure } from '../bridgeErrors'
import type { JiaorongAppOpenInfo, JiaorongAppRuntime, JiaorongMenuAppItem } from '../types'
import { buildHostContext } from './context'
import { handleDialogueInvoke } from './dialogue'
import type { JiaorongAppHostDeps } from './deps'
import { hasPickedDirectory, isAbsoluteGuestPath, rememberPickedDirectory } from './guestBind'
import { buildJiaorongAppEntryUrl } from './guestAppId'
import { getAppPreloadFileUrl, isPathInsideRoot } from './paths'
import { ensureJiaorongAppProtocolSession } from './protocol'
import { buildJiaorongSlashCatalog } from './slashCatalog'
import { buildUserInfoPayload, readAuthToken } from './userIdentity'

export function toMenuAppItem(runtime: JiaorongAppRuntime): JiaorongMenuAppItem {
  const appDir = runtime.appDir
  const iconFile = runtime.icon && appDir ? path.resolve(appDir, runtime.icon) : null
  const iconSafe =
    iconFile &&
    appDir &&
    isPathInsideRoot(path.resolve(appDir), iconFile) &&
    fs.existsSync(iconFile)
      ? pathToFileURL(iconFile).href
      : null
  return {
    id: runtime.id,
    name: runtime.name,
    version: runtime.version,
    installStatus: runtime.installStatus,
    iconSrc: iconSafe
  }
}

export function toOpenInfo(runtime: JiaorongAppRuntime): JiaorongAppOpenInfo | null {
  if (!runtime.appDir || !runtime.entry) return null
  const entry = runtime.entry.trim()
  if (!entry || /^[a-z][a-z0-9+.-]*:/i.test(entry)) return null
  const partition = ensureJiaorongAppProtocolSession(runtime.id)
  return {
    appId: runtime.id,
    src: buildJiaorongAppEntryUrl(runtime.id, entry),
    preload: getAppPreloadFileUrl(),
    partition
  }
}

export async function handleAppBridgeInvoke(
  deps: JiaorongAppHostDeps,
  runtime: JiaorongAppRuntime,
  method: string,
  args: unknown,
  webContentsId: number
): Promise<unknown> {
  const record = args && typeof args === 'object' ? (args as Record<string, unknown>) : {}
  const appId = typeof record.appId === 'string' ? record.appId.trim() : runtime.id
  if (appId !== runtime.id) {
    return { code: 'FORBIDDEN', message: 'appId 与当前打开的应用不一致' }
  }

  try {
    switch (method) {
      case 'context.get':
        return buildHostContext(deps, runtime)
      case 'userinfo.get':
        return buildUserInfoPayload(deps.getAuthSession())
      case 'disconnect':
        return { ok: true }
      case 'dialog.selectDirectory': {
        const contents = webContents.fromId(webContentsId)
        const win = contents ? BrowserWindow.fromWebContents(contents) : null
        const options: Electron.OpenDialogOptions = {
          properties: ['openDirectory', 'createDirectory']
        }
        const picked = win
          ? await dialog.showOpenDialog(win, options)
          : await dialog.showOpenDialog(options)
        if (picked.canceled || !picked.filePaths[0]) return { path: null }
        rememberPickedDirectory(webContentsId, picked.filePaths[0])
        return { path: picked.filePaths[0] }
      }
      case 'dialog.allowProjectDir': {
        const pathValue = typeof record.path === 'string' ? record.path.trim() : ''
        if (!isAbsoluteGuestPath(pathValue)) {
          return { code: 'VALIDATION_ERROR', message: 'path 必须是绝对路径' }
        }
        const dir = pathValue
        if (!hasPickedDirectory(webContentsId, dir)) {
          return {
            code: 'FORBIDDEN',
            message: '目录必须通过文件夹选择器选择'
          }
        }
        rememberPickedDirectory(webContentsId, dir)
        return { ok: true }
      }
      case 'catalog.slash': {
        if (!readAuthToken(deps.getAuthSession())) {
          return { code: 'UNAUTHORIZED', message: '未登录' }
        }
        const sources = deps.listSlashSources
          ? await deps.listSlashSources()
          : { skills: [], tools: [] }
        return buildJiaorongSlashCatalog({
          appId: runtime.id,
          appDir: runtime.appDir ?? null,
          skills: sources.skills,
          tools: sources.tools
        })
      }
      default: {
        const result = await handleDialogueInvoke(deps, runtime, method, args, webContentsId)
        if (result !== undefined) return result
        return { code: 'FORBIDDEN', message: `未知的应用桥方法：${method}` }
      }
    }
  } catch (error) {
    if (isJiaorongBridgeFailure(error)) return error
    const message = error instanceof Error ? error.message : String(error)
    console.warn('[jiaorong-app] bridge invoke failed', method, message)
    if (/not found/i.test(message)) {
      return { code: 'SESSION_NOT_FOUND', message: '未找到会话' }
    }
    return { code: 'GENERATION_FAILED', message: '请求失败' }
  }
}
