/** guest：分区 / 绑定 / 附件落地 / webview 隔离。 */

import path from 'node:path'
import { app, webContents, type WebContents } from 'electron'
import {
  JIAORONG_KB_CONTEXT_MIME,
  JIAORONG_KB_CONTEXT_PATH
} from '../../knowledgeBase/mcp/knowledgeBaseMcpConstants'
import { JIAORONG_APP_PROTOCOL } from '../channels'
import { getAppPreloadPath } from './paths'

/** persist 分区前缀，后面接 appId。 */
const GUEST_PARTITION_PREFIX = 'persist:jiaorong-app-'

/**
 * 应用独立 session 分区名。
 * @param appId 应用 id
 */
export function guestPartitionForApp(appId: string): string {
  return `${GUEST_PARTITION_PREFIX}${appId}`
}

/**
 * 从分区名解析 appId。
 * @param partition `persist:jiaorong-app-<id>`
 */
export function readAppIdFromGuestPartition(partition: unknown): string | null {
  if (typeof partition !== 'string' || !partition.startsWith(GUEST_PARTITION_PREFIX)) return null
  /** 前缀后的 id。 */
  const id = partition.slice(GUEST_PARTITION_PREFIX.length).trim()
  return id || null
}

/**
 * 读 Session 对象上的 partition 字段。
 * @param session Electron Session
 */
export function readSessionPartition(session: unknown): unknown {
  if (!session || typeof session !== 'object' || !('partition' in session)) return undefined
  return (session as { partition?: unknown }).partition
}

/**
 * 入口是否为本机回环 HTTP（应用自有 Node）。
 * @param entry 页面 URL 或清单 entry
 */
export function isLoopbackHttpEntry(entry: string): boolean {
  try {
    /** 解析后的 URL。 */
    const url = new URL(entry)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    /** 小写 hostname。 */
    const host = url.hostname.toLowerCase()
    return host === '127.0.0.1' || host === 'localhost' || host === '[::1]' || host === '::1'
  } catch {
    return false
  }
}

/**
 * 从 `jiaorong-app://<appId>/...` 读 hostname（即 appId）。
 * @param rawUrl guest 当前 URL
 */
export function readJiaorongAppHostname(rawUrl: string): string | null {
  try {
    /** 解析后的 URL。 */
    const url = new URL(rawUrl)
    if (url.protocol !== `${JIAORONG_APP_PROTOCOL}:`) return null
    /** 协议 hostname = 绑定的 appId。 */
    const appId = url.hostname.trim()
    return appId || null
  } catch {
    return null
  }
}

/**
 * 拼 webview 入口 URL。
 * @param appId 应用 id
 * @param entry 相对入口，如 `web-ui/index.html`
 */
export function buildJiaorongAppEntryUrl(appId: string, entry: string): string {
  /** 去掉开头斜杠、统一为正斜杠。 */
  const relative = entry.replace(/^[/\\]+/, '').replace(/\\/g, '/')
  return `${JIAORONG_APP_PROTOCOL}://${appId}/${relative}`
}

/**
 * 按 senderFrame / 已绑定 appId 判断这次 invoke 属于哪个应用。
 * 无 `senderFrame` 或非主框且未绑定则拒绝。
 */
export function matchGuestInvokeAppId(input: {
  /** 是否有 Electron senderFrame（iframe 伪造时可能没有）。 */
  hasSenderFrame: boolean
  /** 是否主框。 */
  isMainFrame: boolean
  /** 发送框 URL。 */
  frameUrl: string
  /** 已绑定的 appId。 */
  boundAppId: string | null
  /** sender.getURL()。 */
  senderUrl: string
}): string | null {
  /** 框 URL 上的 appId。 */
  const frameHost = readJiaorongAppHostname(input.frameUrl)
  /** sender URL 上的 appId。 */
  const senderHost = readJiaorongAppHostname(input.senderUrl)
  if (input.boundAppId) {
    if (frameHost && frameHost !== input.boundAppId) return null
    if (senderHost && senderHost !== input.boundAppId) return null
    return input.boundAppId
  }
  if (!input.hasSenderFrame || !input.isMainFrame) return null
  return frameHost || senderHost
}

/**
 * 解析 invoke 的 appId：绑定值、partition、URL 依次兜底。
 */
export function resolveGuestInvokeAppId(input: {
  /** 是否有 senderFrame。 */
  hasSenderFrame: boolean
  /** 是否主框。 */
  isMainFrame: boolean
  /** 发送框 URL。 */
  frameUrl: string
  /** 已绑定 appId。 */
  boundAppId: string | null
  /** sender URL。 */
  senderUrl: string
  /** session 的 partition。 */
  partition?: unknown
}): string | null {
  return matchGuestInvokeAppId({
    hasSenderFrame: input.hasSenderFrame,
    isMainFrame: input.isMainFrame,
    frameUrl: input.frameUrl,
    senderUrl: input.senderUrl,
    boundAppId:
      input.boundAppId ||
      readAppIdFromGuestPartition(input.partition) ||
      readJiaorongAppHostname(input.senderUrl)
  })
}

/** webContents.id → appId。 */
const guestAppByContents = new Map<number, string>()
/** webContents.id → 本窗口选过的目录（规范化路径）。 */
const pickedDirsByContents = new Map<number, Set<string>>()
/** sessionId → 归属 appId。 */
const sessionOwner = new Map<string, string>()

/**
 * 是否 Windows 风格绝对路径。
 * @param value 路径
 */
function isWindowsGuestPath(value: string): boolean {
  return /^[A-Za-z]:/.test(value) || value.startsWith('\\\\') || /^\/\/[^/]/.test(value)
}

/**
 * 是否绝对路径（POSIX 或 Windows）。
 * @param value 路径
 */
export function isAbsoluteGuestPath(value: string): boolean {
  /** trim 后的路径。 */
  const pathValue = value.trim()
  return (
    pathValue.startsWith('/') || /^[A-Za-z]:[\\/]/.test(pathValue) || pathValue.startsWith('\\\\')
  )
}

/**
 * 把 webContents 绑到应用。已绑其他 app 则忽略。
 * @param webContentsId Electron id
 * @param appId 应用 id
 */
export function bindGuestAppId(webContentsId: number, appId: string): void {
  /** trim 后的 appId。 */
  const id = appId.trim()
  if (!id) return
  /** 已有绑定。 */
  const existing = guestAppByContents.get(webContentsId)
  if (existing && existing !== id) return
  guestAppByContents.set(webContentsId, id)
}

/**
 * 摘掉绑定并清目录白名单。
 * @param webContentsId Electron id
 */
export function unbindGuest(webContentsId: number): void {
  guestAppByContents.delete(webContentsId)
  pickedDirsByContents.delete(webContentsId)
}

/**
 * 读绑定的 appId。
 * @param webContentsId Electron id
 */
export function getBoundGuestAppId(webContentsId: number): string | null {
  return guestAppByContents.get(webContentsId) ?? null
}

/**
 * 规范化目录路径，便于白名单比较。
 * @param dirPath 用户选中的目录
 */
export function normalizeGuestDir(dirPath: string): string {
  /** trim 后的原值。 */
  const value = dirPath.trim()
  if (!value) return ''
  if (value === '/' || value === '\\') return '/'
  /** 是否 Windows 路径。 */
  const windows = isWindowsGuestPath(value)
  /** 统一分隔符。 */
  const unified = windows ? value.replace(/\//g, '\\') : value.replace(/\\/g, '/')
  if (/^[A-Za-z]:[\\/]?$/.test(unified)) {
    return windows ? `${unified[0].toLowerCase()}:\\` : unified
  }
  /** 去掉末尾分隔符。 */
  const trimmed = unified.replace(/[/\\]+$/, '')
  return windows ? trimmed.toLowerCase() : trimmed
}

/**
 * 解析为规范绝对路径；非绝对路径返回空。
 * @param fsPath 文件系统路径
 */
export function canonicalizeGuestPath(fsPath: string): string {
  /** trim 后的原值。 */
  const value = fsPath.trim()
  if (!value || !isAbsoluteGuestPath(value)) return ''
  /** 是否 Windows。 */
  const windows = isWindowsGuestPath(value)
  /** resolve 后的绝对路径。 */
  const resolved = windows
    ? path.win32.resolve(value.replace(/\//g, '\\'))
    : path.posix.resolve(value.replace(/\\/g, '/'))
  return normalizeGuestDir(resolved)
}

/**
 * target 是否在 root 目录内。
 * @param rootPath 白名单根
 * @param targetPath 待检查路径
 */
export function isGuestPathInsideDir(rootPath: string, targetPath: string): boolean {
  /** 规范化根。 */
  const root = canonicalizeGuestPath(rootPath) || normalizeGuestDir(rootPath)
  /** 规范化目标。 */
  const target = canonicalizeGuestPath(targetPath)
  if (!root || !target) return false
  if (target === root) return true
  /** 是否 Windows 比较。 */
  const windows = isWindowsGuestPath(root)
  /** 相对路径，逃逸以 `..` 开头。 */
  const relative = windows ? path.win32.relative(root, target) : path.posix.relative(root, target)
  return (
    relative === '' ||
    (!!relative &&
      !relative.startsWith('..') &&
      !path.win32.isAbsolute(relative) &&
      !path.posix.isAbsolute(relative))
  )
}

/**
 * 记住本窗口选过的项目目录。
 * @param webContentsId 窗口
 * @param dirPath 目录
 */
export function rememberPickedDirectory(webContentsId: number, dirPath: string): void {
  /** 规范化目录。 */
  const next = canonicalizeGuestPath(dirPath) || normalizeGuestDir(dirPath)
  if (!next) return
  /** 该窗口的目录集合。 */
  const set = pickedDirsByContents.get(webContentsId) ?? new Set<string>()
  set.add(next)
  pickedDirsByContents.set(webContentsId, set)
}

/**
 * 是否已选过该目录。
 * @param webContentsId 窗口
 * @param dirPath 目录
 */
export function hasPickedDirectory(webContentsId: number, dirPath: string): boolean {
  /** 规范化目录。 */
  const next = canonicalizeGuestPath(dirPath) || normalizeGuestDir(dirPath)
  return Boolean(next) && pickedDirsByContents.get(webContentsId)?.has(next) === true
}

/**
 * 附件路径是否落在本窗口选过的目录内。
 * @param webContentsId 窗口
 * @param fsPath 文件路径
 */
export function isGuestPathAllowed(webContentsId: number, fsPath: string): boolean {
  /** 本窗口白名单。 */
  const set = pickedDirsByContents.get(webContentsId)
  if (!set) return false
  /** 白名单里的一个目录。 */
  for (const dir of set) {
    if (isGuestPathInsideDir(dir, fsPath)) return true
  }
  return false
}

/**
 * 记下会话归属应用（官方列表要隐藏）。
 * @param sessionId 会话
 * @param appId 应用
 */
export function rememberSessionOwner(sessionId: string, appId: string): void {
  /** 会话 id。 */
  const id = sessionId.trim()
  /** 应用 id。 */
  const owner = appId.trim()
  if (!id || !owner) return
  sessionOwner.set(id, owner)
}

/**
 * 去掉会话归属。
 * @param sessionId 会话
 */
export function forgetSessionOwner(sessionId: string): void {
  sessionOwner.delete(sessionId.trim())
}

/**
 * 读会话归属应用。
 * @param sessionId 会话
 */
export function getSessionOwner(sessionId: string): string | null {
  return sessionOwner.get(sessionId.trim()) ?? null
}

/** guest 附件落地端口。 */
export type JiaorongGuestFilePort = {
  writeTemp(file: { name: string; content: Buffer | string }): Promise<string>
  writeImageBase64(file: { name: string; content: string }): Promise<string>
  prepareFile(path: string, mimeType?: string): Promise<Record<string, unknown>>
}

/** 把未知值收成对象；否则 null。 */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/** 读附件 name。 */
function readName(row: Record<string, unknown>): string {
  /** 名称。 */
  const name = typeof row.name === 'string' ? row.name.trim() : ''
  return name || 'file'
}

/** 读附件 mime。 */
function readMime(row: Record<string, unknown>): string {
  if (typeof row.mimeType === 'string' && row.mimeType.trim()) return row.mimeType.trim()
  if (typeof row.type === 'string' && row.type.trim()) return row.type.trim()
  return ''
}

/** 读附件 content / dataBase64。 */
function readPayload(row: Record<string, unknown>): string {
  if (typeof row.content === 'string' && row.content.trim()) return row.content.trim()
  if (typeof row.dataBase64 === 'string' && row.dataBase64.trim()) return row.dataBase64.trim()
  return ''
}

/** 去掉 data URL 的 base64, 前缀。 */
function stripDataUrl(value: string): string {
  /** data URL 里的 base64, 标记。 */
  const marker = 'base64,'
  /** 下标。 */
  const index = value.indexOf(marker)
  return index >= 0 ? value.slice(index + marker.length) : value
}

/** 是否图片 data URL。 */
function isImageDataUrl(value: string): boolean {
  return value.startsWith('data:image/')
}

/** 是否图片 MIME。 */
function isImageMime(mime: string, payload: string): boolean {
  return mime.startsWith('image/') || isImageDataUrl(payload)
}

/** 拼图片 data URL。 */
function toImageDataUrl(mime: string, payload: string): string {
  if (isImageDataUrl(payload)) return payload
  return `data:${mime || 'image/png'};base64,${stripDataUrl(payload)}`
}

/** 是否知识库上下文附件。 */
export function isJiaorongGuestKnowledgeBaseContextFile(
  row: Record<string, unknown> | null | undefined
): boolean {
  if (!row) return false
  /** 文件路径。 */
  const filePath = typeof row.path === 'string' ? row.path.trim() : ''
  /** MIME 类型。 */
  const mimeType = readMime(row)
  return filePath === JIAORONG_KB_CONTEXT_PATH || mimeType === JIAORONG_KB_CONTEXT_MIME
}

/** 规范化知识库上下文附件。 */
export function normalizeGuestKnowledgeBaseContextFile(
  row: Record<string, unknown>
): Record<string, unknown> {
  /** 事件或请求负载。 */
  const payload = readPayload(row)
  /** 下一步值。 */
  const next: Record<string, unknown> = {
    ...row,
    name: readName(row) || '知识库',
    path: JIAORONG_KB_CONTEXT_PATH,
    mimeType: JIAORONG_KB_CONTEXT_MIME,
    content: payload
  }
  delete next.dataBase64
  return next
}

/** 与超级智能体一致：落临时文件后走 prepareFile，抽取文档文本 / 图片表示。 */
export async function materializeGuestFiles(
  files: unknown,
  port: JiaorongGuestFilePort | undefined
): Promise<unknown[] | undefined> {
  if (!Array.isArray(files)) return undefined
  /** 下一步值。 */
  const next: unknown[] = []
  /** 一条附件。 */
  for (const file of files) {
    /** 单行对象。 */
    const row = asRecord(file)
    if (!row) continue
    if (isJiaorongGuestKnowledgeBaseContextFile(row)) {
      next.push(normalizeGuestKnowledgeBaseContextFile(row))
      continue
    }
    /** 名称。 */
    const name = readName(row)
    /** MIME 类型。 */
    const mimeType = readMime(row)
    /** 文件路径。 */
    const filePath = typeof row.path === 'string' ? row.path.trim() : ''
    /** 事件或请求负载。 */
    const payload = readPayload(row)

    if (filePath && isAbsoluteGuestPath(filePath)) {
      if (!port) {
        next.push(file)
        continue
      }
      try {
        next.push(await port.prepareFile(filePath, mimeType || undefined))
      } catch (error) {
        console.warn('[jiaorong-app] Failed to prepare guest file', name, error)
        next.push({ name, path: filePath, mimeType: mimeType || undefined })
      }
      continue
    }

    if (filePath && !payload) continue

    if (!payload) continue
    if (!port) {
      /** 去掉 path 后的附件对象。 */
      const rest = { ...row }
      delete rest.dataBase64
      next.push({
        ...rest,
        name,
        mimeType: mimeType || undefined,
        content: payload
      })
      continue
    }
    try {
      /** 临时路径。 */
      const tempPath = isImageMime(mimeType, payload)
        ? await port.writeImageBase64({
            name,
            content: toImageDataUrl(mimeType, payload)
          })
        : await port.writeTemp({
            name,
            content: Buffer.from(stripDataUrl(payload), 'base64')
          })
      /** 已落地的附件。 */
      const prepared = await port.prepareFile(tempPath, mimeType || undefined)
      next.push({ ...prepared, name })
    } catch (error) {
      console.warn('[jiaorong-app] Failed to materialize guest file', name, error)
    }
  }
  return next
}

/** 是否已安装守卫或协议。 */
let installed = false
/** 待 attach 的 guest appId。 */
const pendingAttachByKey = new Map<string, string>()

/** webContents+appId 的待绑定键。 */
function pendingAttachKey(hostId: number, appId: string): string {
  return `${hostId}:${guestPartitionForApp(appId)}`
}

/** 记下即将 attach 的 guest appId。 */
function enqueuePendingGuestAppId(hostId: number, appId: string): void {
  pendingAttachByKey.set(pendingAttachKey(hostId, appId), appId)
}

/** 取出并消费待绑定的 guest appId。 */
function takePendingGuestAppId(hostId: number, partition: unknown, src: string): string | null {
  /** 已知的 appId。 */
  const known = readAppIdFromGuestPartition(partition) || readJiaorongAppHostname(src)
  if (known) {
    pendingAttachByKey.delete(pendingAttachKey(hostId, known))
    return known
  }
  /** 命中的待绑定项。 */
  const matches: string[] = []
  /** Map 键。 */
  for (const key of pendingAttachByKey.keys()) {
    /** 键里的分隔下标。 */
    const sep = key.indexOf(':')
    if (sep < 0) continue
    if (Number(key.slice(0, sep)) === hostId) matches.push(key)
  }
  if (matches.length !== 1) return null
  /** 当前应用 id。 */
  const appId = pendingAttachByKey.get(matches[0]) ?? null
  pendingAttachByKey.delete(matches[0])
  return appId
}

/** 读 webContents 的 session partition。 */
function sessionPartitionOf(contents: WebContents): unknown {
  try {
    return readSessionPartition(contents.session)
  } catch {
    return undefined
  }
}

/** 是否允许该 guest 导航 URL。 */
function allowGuestUrl(contents: WebContents, rawUrl: string): boolean {
  /** 下一步值。 */
  const next = readJiaorongAppHostname(rawUrl)
  if (next) {
    /** 是否已绑定。 */
    const bound = getBoundGuestAppId(contents.id)
    if (!bound) {
      bindGuestAppId(contents.id, next)
      return true
    }
    return bound === next
  }
  if (!isLoopbackHttpEntry(rawUrl)) return false
  /** 是否已绑定。 */
  const bound = getBoundGuestAppId(contents.id)
  if (bound) return true
  /** 从 session 读出的 partition。 */
  const fromSession = readAppIdFromGuestPartition(sessionPartitionOf(contents))
  if (!fromSession) return false
  bindGuestAppId(contents.id, fromSession)
  return true
}

/** 超级智能体侧 webview 导航/权限守卫。 */
function attachHostWebviewGuard(contents: WebContents): void {
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    /** 从协议 URL 读出的 appId。 */
    const fromProtocol = readJiaorongAppHostname(params.src)
    /** 从 partition 读出的 appId。 */
    const fromPartition = readAppIdFromGuestPartition(params.partition)
    /** 当前应用 id。 */
    const appId = fromProtocol ?? (isLoopbackHttpEntry(params.src) ? fromPartition : null)
    /** 期望的 appId。 */
    const expected = appId ? guestPartitionForApp(appId) : ''
    /** Electron session partition。 */
    const partition = typeof params.partition === 'string' ? params.partition : ''
    if (!appId || (partition && partition !== expected)) {
      event.preventDefault()
      return
    }
    enqueuePendingGuestAppId(contents.id, appId)
    webPreferences.partition = expected
    webPreferences.preload = getAppPreloadPath()
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true
    webPreferences.sandbox = false
    webPreferences.webSecurity = true
    webPreferences.allowRunningInsecureContent = true
    webPreferences.webviewTag = false
    webPreferences.devTools = true
  })
  contents.on('did-attach-webview', (_event, guest) => {
    /** 当前应用 id。 */
    const appId = takePendingGuestAppId(contents.id, sessionPartitionOf(guest), guest.getURL())
    if (appId) bindGuestAppId(guest.id, appId)
  })
}

/** guest 页导航/权限守卫。 */
function attachGuestWebviewGuard(contents: WebContents): void {
  contents.on('destroyed', () => {
    unbindGuest(contents.id)
  })
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  /** 非本应用则拒绝。 */
  const denyIfForeign = (url: string, prevent: () => void) => {
    if (!allowGuestUrl(contents, url)) prevent()
  }
  contents.on('will-navigate', (event, url) => {
    denyIfForeign(url, () => event.preventDefault())
  })
  contents.on('will-redirect', (event, url) => {
    denyIfForeign(url, () => event.preventDefault())
  })
  contents.on('will-frame-navigate', (event) => {
    denyIfForeign(event.url, () => event.preventDefault())
  })
  contents.on('did-finish-load', () => {
    allowGuestUrl(contents, contents.getURL())
  })
}

/** 监听 webContents 生命周期并挂守卫。 */
function watchContents(contents: WebContents): void {
  attachHostWebviewGuard(contents)
  if (contents.getType() !== 'webview') return
  /** 从 partition 读出的 appId。 */
  const fromPartition = readAppIdFromGuestPartition(sessionPartitionOf(contents))
  /** fromUrl 地址。 */
  const fromUrl = readJiaorongAppHostname(contents.getURL())
  /** 当前应用 id。 */
  const appId = fromUrl ?? fromPartition
  if (appId) bindGuestAppId(contents.id, appId)
  attachGuestWebviewGuard(contents)
}

/** 安装 webview 隔离：只允许本应用协议/回环，强制应用 preload。 */
export function installJiaorongAppGuestIsolation(): void {
  if (installed) return
  installed = true

  app.on('web-contents-created', (_event, contents) => {
    watchContents(contents)
  })
  /** 一个 webContents。 */
  for (const contents of webContents.getAllWebContents()) {
    if (!contents.isDestroyed()) watchContents(contents)
  }
}
