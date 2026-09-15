/** 分发 SDK invoke：上下文、对话框、目录、知识库、对话。 */

import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { BrowserWindow, clipboard, dialog, nativeImage, webContents } from 'electron'
import { isJiaorongBridgeFailure, toJiaorongBridgeInvokeFailure } from '../bridgeErrors'
import type { JiaorongAppOpenInfo, JiaorongAppRuntime, JiaorongMenuAppItem } from '../types'
import { buildHostContext } from './context'
import { handleDialogueInvoke } from './dialogue'
import type { JiaorongAppHostDeps } from './deps'
import {
  getBoundGuestAppId,
  hasPickedDirectory,
  isAbsoluteGuestPath,
  isGuestPathAllowed,
  rememberPickedDirectory
} from './guestBind'
import { buildJiaorongAppEntryUrl, isLoopbackHttpEntry } from './guestAppId'
import { appAgentIds } from './agentMap'
import { queryJiaorongKnowledgeBaseDirectory, queryJiaorongKnowledgeBases } from './knowledgeBase'
import { getAppPreloadFileUrl, isPathInsideRoot } from './paths'
import { ensureJiaorongAppProtocolSession } from './protocol'
import { buildJiaorongSlashCatalog } from './slashCatalog'
import { buildUserInfoPayload, readAuthToken } from './userIdentity'

/** 在 guest 窗口上弹出系统文件/目录对话框。 */
async function openGuestDialog(
  webContentsId: number,
  options: Electron.OpenDialogOptions
): Promise<string[]> {
  /** Electron webContents。 */
  const contents = webContents.fromId(webContentsId)
  /** 所属 BrowserWindow。 */
  const win = contents ? BrowserWindow.fromWebContents(contents) : null
  /** 对话框选中结果。 */
  const picked = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options)
  if (picked.canceled) return []
  return picked.filePaths.filter((filePath) => Boolean(filePath?.trim()))
}

/** 找到该应用 guest 页的 webContents。 */
function findGuestPageWebContents(appId: string, preferredWebContentsId: number) {
  /** 优先使用的 webContents。 */
  const preferred = webContents.fromId(preferredWebContentsId)
  if (preferred && !preferred.isDestroyed() && getBoundGuestAppId(preferred.id) === appId) {
    return preferred
  }
  /** 一个 webContents。 */
  for (const contents of webContents.getAllWebContents()) {
    if (contents.isDestroyed()) continue
    if (getBoundGuestAppId(contents.id) !== appId) continue
    return contents
  }
  return null
}

/** 运行时转成侧栏菜单项。 */
export function toMenuAppItem(runtime: JiaorongAppRuntime): JiaorongMenuAppItem {
  /** 应用安装目录。 */
  const appDir = runtime.appDir
  /** 图标文件绝对路径。 */
  const iconFile = runtime.icon && appDir ? path.resolve(appDir, runtime.icon) : null
  /** 校验通过后的 file:// 图标 URL；否则 null。 */
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

/** 运行时转成打开 webview 所需信息。 */
export function toOpenInfo(runtime: JiaorongAppRuntime): JiaorongAppOpenInfo | null {
  if (!runtime.appDir || !runtime.entry) return null
  /** 目录或列表一项。 */
  const entry = runtime.entry.trim()
  if (!entry) return null
  /** Electron session partition。 */
  const partition = ensureJiaorongAppProtocolSession(runtime.id)
  /** guest preload 地址。 */
  const preload = getAppPreloadFileUrl()
  if (isLoopbackHttpEntry(entry)) {
    return {
      appId: runtime.id,
      src: entry,
      preload,
      partition
    }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(entry)) return null
  return {
    appId: runtime.id,
    src: buildJiaorongAppEntryUrl(runtime.id, entry),
    preload,
    partition
  }
}

/** 分发一条 SDK invoke。appId 必须与当前 guest 绑定一致。 */
export async function handleAppBridgeInvoke(
  deps: JiaorongAppHostDeps,
  runtime: JiaorongAppRuntime,
  method: string,
  args: unknown,
  webContentsId: number
): Promise<unknown> {
  /** 对象形态的入参。 */
  const record = args && typeof args === 'object' ? (args as Record<string, unknown>) : {}
  /** 当前应用 id。 */
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
      case 'devtools.open': {
        /** Electron webContents。 */
        const contents = findGuestPageWebContents(runtime.id, webContentsId)
        if (!contents) {
          return { code: 'FORBIDDEN', message: '找不到本应用页面，请从侧栏打开后再打开调试器' }
        }
        contents.openDevTools({ mode: 'detach' })
        return { ok: true }
      }
      case 'dialog.selectDirectory': {
        /** 对话框选中结果。 */
        const picked = await openGuestDialog(webContentsId, {
          properties: ['openDirectory', 'createDirectory']
        })
        if (!picked[0]) return { path: null }
        rememberPickedDirectory(webContentsId, picked[0])
        return { path: picked[0] }
      }
      case 'dialog.selectFiles': {
        /** 对话框选中结果。 */
        const picked = await openGuestDialog(webContentsId, {
          properties: ['openFile', 'multiSelections']
        })
        /** 附件列表。 */
        const files = picked.flatMap((filePath) => {
          /** 待处理的值。 */
          const value = filePath.trim()
          if (!isAbsoluteGuestPath(value)) return []
          rememberPickedDirectory(webContentsId, value)
          return [{ path: value, name: path.basename(value) }]
        })
        return { files }
      }
      case 'dialog.readFilePreview': {
        /** 文件路径。 */
        const filePath = typeof record.path === 'string' ? record.path.trim() : ''
        if (!isAbsoluteGuestPath(filePath)) {
          return { code: 'VALIDATION_ERROR', message: 'path 必须是绝对路径' }
        }
        if (!isGuestPathAllowed(webContentsId, filePath)) {
          return { code: 'FORBIDDEN', message: '附件路径未授权' }
        }
        if (!fs.existsSync(filePath)) {
          return { code: 'NOT_FOUND', message: '文件不存在' }
        }
        /** 文件 stat。 */
        const stat = fs.statSync(filePath)
        if (!stat?.isFile()) {
          return { code: 'VALIDATION_ERROR', message: '不是文件' }
        }
        /** 扩展名。 */
        const ext = path.extname(filePath).toLowerCase()
        /** 图片 MIME。 */
        const imageMime: Record<string, string> = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
          '.bmp': 'image/bmp'
        }
        /** MIME 类型。 */
        const mimeType = imageMime[ext] || ''
        if (!mimeType || stat.size > 12 * 1024 * 1024) {
          return { mimeType: mimeType || 'application/octet-stream' }
        }
        /** 图片元素。 */
        const image = nativeImage.createFromPath(filePath)
        if (image.isEmpty()) return { mimeType }
        /** 大小。 */
        const size = image.getSize()
        /** 缩略图最长边。 */
        const maxEdge = 1280
        /** 是否需要缩小。 */
        const needsResize = Math.max(size.width, size.height) > maxEdge
        /** 预览数据。 */
        const preview = needsResize
          ? image.resize({
              width: size.width >= size.height ? maxEdge : undefined,
              height: size.height > size.width ? maxEdge : undefined,
              quality: 'best'
            })
          : image
        return {
          mimeType,
          thumbnail: `data:image/png;base64,${preview.toPNG().toString('base64')}`
        }
      }
      case 'dialog.rememberDroppedFiles': {
        /** 多行记录。 */
        const rows = Array.isArray(record.files) ? record.files : []
        /** 附件列表。 */
        const files = rows.flatMap((item) => {
          /** 待处理的值。 */
          const value = typeof item === 'string' ? item.trim() : ''
          if (!isAbsoluteGuestPath(value)) return []
          try {
            if (!fs.statSync(value).isFile()) return []
          } catch {
            return []
          }
          rememberPickedDirectory(webContentsId, value)
          return [value]
        })
        return { files }
      }
      case 'dialog.allowProjectDir': {
        /** 路径字符串。 */
        const pathValue = typeof record.path === 'string' ? record.path.trim() : ''
        if (!isAbsoluteGuestPath(pathValue)) {
          return { code: 'VALIDATION_ERROR', message: 'path 必须是绝对路径' }
        }
        /** 目录。 */
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
      case 'clipboard.writeImage': {
        /** 原始入参。 */
        const raw = typeof record.pngBase64 === 'string' ? record.pngBase64.trim() : ''
        /** PNG 的 base64。 */
        const pngBase64 = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw
        if (!pngBase64) return { code: 'VALIDATION_ERROR', message: '需要 pngBase64' }
        /** 图片元素。 */
        const image = nativeImage.createFromBuffer(Buffer.from(pngBase64, 'base64'))
        if (image.isEmpty()) return { code: 'VALIDATION_ERROR', message: '图片无效' }
        clipboard.writeImage(image)
        return { ok: true }
      }
      case 'capture.pageArea': {
        /** Electron webContents。 */
        const contents = webContents.fromId(webContentsId)
        if (!contents || contents.isDestroyed()) {
          return { code: 'GENERATION_FAILED', message: '无法截图' }
        }
        /** 截图区域 x。 */
        const x = Math.round(Number(record.x))
        /** 截图区域 y。 */
        const y = Math.round(Number(record.y))
        /** 宽度。 */
        const width = Math.round(Number(record.width))
        /** 高度。 */
        const height = Math.round(Number(record.height))
        if (
          ![x, y, width, height].every((value) => Number.isFinite(value)) ||
          width < 1 ||
          height < 1
        ) {
          return { code: 'VALIDATION_ERROR', message: '截图区域无效' }
        }
        /** 图片元素。 */
        const image = await contents.capturePage({ x, y, width, height })
        if (image.isEmpty()) return { code: 'GENERATION_FAILED', message: '截图为空' }
        return { pngBase64: image.toPNG().toString('base64') }
      }
      case 'catalog.slash': {
        if (!readAuthToken(deps.getAuthSession())) {
          return { code: 'UNAUTHORIZED', message: '未登录' }
        }
        /** 可捕获的桌面源。 */
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
      case 'catalog.models': {
        if (!readAuthToken(deps.getAuthSession())) {
          return { code: 'UNAUTHORIZED', message: '未登录' }
        }
        return { models: deps.listEnabledModels ? deps.listEnabledModels() : [] }
      }
      case 'catalog.systemPrompts': {
        if (!readAuthToken(deps.getAuthSession())) {
          return { code: 'UNAUTHORIZED', message: '未登录' }
        }
        return { prompts: deps.listSystemPrompts ? await deps.listSystemPrompts() : [] }
      }
      case 'catalog.agentTools': {
        if (!readAuthToken(deps.getAuthSession())) {
          return { code: 'UNAUTHORIZED', message: '未登录' }
        }
        /** 会话 id。 */
        const sessionId = typeof record.sessionId === 'string' ? record.sessionId.trim() : ''
        if (sessionId) {
          if (!deps.dialogue) {
            return { code: 'FORBIDDEN', message: '当前不能列出工具' }
          }
          /** 会话记录。 */
          const session = await deps.dialogue.getSession(sessionId)
          if (!session) {
            return { code: 'SESSION_NOT_FOUND', message: '未找到会话' }
          }
          if (!appAgentIds(runtime.id).has(session.agentId)) {
            return { code: 'FORBIDDEN', message: '会话不属于本应用' }
          }
        }
        return {
          tools: deps.listConfigurableAgentTools
            ? await deps.listConfigurableAgentTools({
                sessionId: sessionId || undefined
              })
            : []
        }
      }
      case 'knowledgeBase.query':
        return queryJiaorongKnowledgeBases(deps, record)
      case 'knowledgeBase.queryDirectory':
        return queryJiaorongKnowledgeBaseDirectory(deps, record)
      default: {
        /** 调用结果。 */
        const result = await handleDialogueInvoke(deps, runtime, method, args, webContentsId)
        if (result !== undefined) return result
        return { code: 'FORBIDDEN', message: `未知的应用桥方法：${method}` }
      }
    }
  } catch (error) {
    if (isJiaorongBridgeFailure(error)) return error
    /** 桥失败对象。 */
    const failure = toJiaorongBridgeInvokeFailure(error)
    console.warn('[jiaorong-app] bridge invoke failed', method, failure.message)
    return failure
  }
}
