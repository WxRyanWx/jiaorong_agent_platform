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
  // 非字符串或前缀不对，不是应用分区
  if (typeof partition !== 'string' || !partition.startsWith(GUEST_PARTITION_PREFIX)) return null
  /** 前缀后的 id。 */
  const id = partition.slice(GUEST_PARTITION_PREFIX.length).trim()
  // 只有前缀没有 id
  return id || null
}

/**
 * 读 Session 对象上的 partition 字段。
 * @param session Electron Session
 */
export function readSessionPartition(session: unknown): unknown {
  // session 缺失或没有 partition 字段
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
    // 只放行 http / https
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    /** 小写 hostname。 */
    const host = url.hostname.toLowerCase()
    // 只放行本机回环地址
    return host === '127.0.0.1' || host === 'localhost' || host === '[::1]' || host === '::1'
  } catch {
    // 不是合法 URL（如相对入口）
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
    // 不是本应用协议
    if (url.protocol !== `${JIAORONG_APP_PROTOCOL}:`) return null
    /** 协议 hostname = 绑定的 appId。 */
    const appId = url.hostname.trim()
    return appId || null
  } catch {
    // URL 非法
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
 * @param input 判定所需的框与绑定信息
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
  // 已经绑定过：只校验 URL 没有冒充别的应用
  if (input.boundAppId) {
    // 发送框 URL 属于别的应用
    if (frameHost && frameHost !== input.boundAppId) return null
    // sender URL 属于别的应用
    if (senderHost && senderHost !== input.boundAppId) return null
    return input.boundAppId
  }
  // 未绑定：没有 senderFrame（可能是 iframe 伪造）或不是主框，一律拒绝
  if (!input.hasSenderFrame || !input.isMainFrame) return null
  // 首次判定：以框 URL 为准，退化到 sender URL
  return frameHost || senderHost
}

/**
 * 解析 invoke 的 appId：绑定值、partition、URL 依次兜底。
 * @param input 判定所需的框、绑定与分区信息
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
  // boundAppId 依次取：已绑定值 → 分区名 → sender URL
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
  // 盘符开头、UNC 反斜杠、UNC 正斜杠三种形态
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
  // 空 id 不绑定
  if (!id) return
  /** 已有绑定。 */
  const existing = guestAppByContents.get(webContentsId)
  // 已绑到别的应用，不允许改绑
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

/** 读 BrowserWindow.id；Electron 类型声明里不一定带 getOwnerBrowserWindow。 */
type WindowOwnerContents = {
  getOwnerBrowserWindow?: () => { id: number; isDestroyed: () => boolean } | null
}

/**
 * 从 webContents 取所属窗口 id。
 * @param contents Electron WebContents
 */
export function readOwnerBrowserWindowId(contents: unknown): number | null {
  if (!contents || typeof contents !== 'object') return null
  const getOwner = (contents as WindowOwnerContents).getOwnerBrowserWindow
  if (typeof getOwner !== 'function') return null
  try {
    const win = getOwner.call(contents)
    if (!win || win.isDestroyed()) return null
    return typeof win.id === 'number' ? win.id : null
  } catch {
    return null
  }
}

/** 哪个 BrowserWindow 打开过哪些应用的 spawn。独立窗口关掉时用来停 Node。 */
const spawnedByWindow = new Map<number, Set<string>>()

/**
 * 记下该窗口打开时拉起的应用。
 * @param windowId BrowserWindow.id
 * @param appId spawn 用的应用 id
 */
export function rememberWindowSpawn(windowId: number, appId: string): void {
  const id = appId.trim()
  if (!windowId || !id) return
  let ids = spawnedByWindow.get(windowId)
  if (!ids) {
    ids = new Set()
    spawnedByWindow.set(windowId, ids)
  }
  ids.add(id)
}

/**
 * 该窗口主动 leave 后不再由窗口关闭来停。
 * @param windowId BrowserWindow.id
 * @param appId spawn 用的应用 id
 */
export function forgetWindowSpawn(windowId: number, appId: string): void {
  const ids = spawnedByWindow.get(windowId)
  if (!ids) return
  ids.delete(appId)
  if (ids.size === 0) spawnedByWindow.delete(windowId)
}

/**
 * 取出并清空该窗口打开过的应用 id。
 * @param windowId BrowserWindow.id
 */
export function takeWindowSpawns(windowId: number): string[] {
  const ids = spawnedByWindow.get(windowId)
  spawnedByWindow.delete(windowId)
  return ids ? [...ids] : []
}

/** 进程退出时丢掉窗口 spawn 记录。 */
export function clearWindowSpawns(): void {
  spawnedByWindow.clear()
}

/**
 * 仍挂在该窗口下的 guest 应用 id。
 * @param win 目标窗口
 */
export function listGuestAppIdsForWindow(win: { id: number }): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  const all =
    typeof webContents.getAllWebContents === 'function' ? webContents.getAllWebContents() : []
  for (const contents of all) {
    if (contents.isDestroyed()) continue
    const ownerId = readOwnerBrowserWindowId(contents)
    if (ownerId !== win.id) continue
    const appId = getBoundGuestAppId(contents.id) ?? readJiaorongAppHostname(contents.getURL())
    if (!appId || seen.has(appId)) continue
    seen.add(appId)
    ids.push(appId)
  }
  return ids
}

/**
 * 规范化目录路径，便于白名单比较。
 * @param dirPath 用户选中的目录
 */
export function normalizeGuestDir(dirPath: string): string {
  /** trim 后的原值。 */
  const value = dirPath.trim()
  // 空串
  if (!value) return ''
  // 根目录统一成 `/`
  if (value === '/' || value === '\\') return '/'
  /** 是否 Windows 路径。 */
  const windows = isWindowsGuestPath(value)
  /** 统一分隔符。 */
  const unified = windows ? value.replace(/\//g, '\\') : value.replace(/\\/g, '/')
  // 只有盘符（如 `C:` / `C:\`）时补成带分隔符的根
  if (/^[A-Za-z]:[\\/]?$/.test(unified)) {
    // Windows 盘符统一小写，避免 `C:` 与 `c:` 判成两个目录
    return windows ? `${unified[0].toLowerCase()}:\\` : unified
  }
  /** 去掉末尾分隔符。 */
  const trimmed = unified.replace(/[/\\]+$/, '')
  // Windows 整体转小写，文件系统大小写不敏感
  return windows ? trimmed.toLowerCase() : trimmed
}

/**
 * 解析为规范绝对路径；非绝对路径返回空。
 * @param fsPath 文件系统路径
 */
export function canonicalizeGuestPath(fsPath: string): string {
  /** trim 后的原值。 */
  const value = fsPath.trim()
  // 空串或相对路径都不给规范化结果
  if (!value || !isAbsoluteGuestPath(value)) return ''
  /** 是否 Windows。 */
  const windows = isWindowsGuestPath(value)
  /** resolve 后的绝对路径。 */
  const resolved = windows
    ? path.win32.resolve(value.replace(/\//g, '\\'))
    : path.posix.resolve(value.replace(/\\/g, '/'))
  // 再走一遍目录规范化，保证比较口径一致
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
  // 任一侧无法规范化
  if (!root || !target) return false
  // 目标就是根本身
  if (target === root) return true
  /** 是否 Windows 比较。 */
  const windows = isWindowsGuestPath(root)
  /** 相对路径，逃逸以 `..` 开头。 */
  const relative = windows ? path.win32.relative(root, target) : path.posix.relative(root, target)
  // 相对路径为空、或以 `..` 开头、或本身是绝对路径（跨盘）都算逃逸
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
  // 规范化后为空，不记
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
  // 该窗口一个目录都没选过
  if (!set) return false
  /** 白名单里的一个目录。 */
  for (const dir of set) {
    // 命中任一白名单目录即可
    if (isGuestPathInsideDir(dir, fsPath)) return true
  }
  // 全都不命中
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
  // 会话或应用为空，无法归属
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
  /**
   * 写临时文件，返回落地路径。
   * @param file `name` 文件名，`content` 文本或二进制内容
   */
  writeTemp(file: { name: string; content: Buffer | string }): Promise<string>
  /**
   * 写图片 base64，返回落地路径。
   * @param file `name` 文件名，`content` data URL 或 base64 正文
   */
  writeImageBase64(file: { name: string; content: string }): Promise<string>
  /**
   * 准备超级智能体可读的附件元数据。
   * @param path 本机绝对路径
   * @param mimeType 可选 MIME，缺省按扩展名推断
   */
  prepareFile(path: string, mimeType?: string): Promise<Record<string, unknown>>
}

/**
 * 把未知值收成对象；否则 null。
 * @param value 附件原始值
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  // null、非对象、数组都不算附件对象
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/**
 * 读附件 name，缺省给 `file`。
 * @param row 附件对象
 */
function readName(row: Record<string, unknown>): string {
  /** 名称。 */
  const name = typeof row.name === 'string' ? row.name.trim() : ''
  // 没给名字时兜底，避免落地文件名是空串
  return name || 'file'
}

/**
 * 读附件 mime：优先 `mimeType`，退化到浏览器给的 `type`。
 * @param row 附件对象
 */
function readMime(row: Record<string, unknown>): string {
  // 应用显式给的 mimeType
  if (typeof row.mimeType === 'string' && row.mimeType.trim()) return row.mimeType.trim()
  // 页面 File / Blob 上的 type
  if (typeof row.type === 'string' && row.type.trim()) return row.type.trim()
  return ''
}

/**
 * 读附件正文：优先 `content`，退化到 `dataBase64`。
 * @param row 附件对象
 */
function readPayload(row: Record<string, unknown>): string {
  // 直接给的正文
  if (typeof row.content === 'string' && row.content.trim()) return row.content.trim()
  // 页面拖拽常见的 base64 字段
  if (typeof row.dataBase64 === 'string' && row.dataBase64.trim()) return row.dataBase64.trim()
  return ''
}

/**
 * 去掉 data URL 的 `base64,` 前缀，只留纯 base64。
 * @param value 正文或 data URL
 */
function stripDataUrl(value: string): string {
  /** data URL 里的 base64, 标记。 */
  const marker = 'base64,'
  /** 下标。 */
  const index = value.indexOf(marker)
  // 命中标记就截掉前半段，否则原样返回
  return index >= 0 ? value.slice(index + marker.length) : value
}

/**
 * 是否图片 data URL。
 * @param value 附件正文
 */
function isImageDataUrl(value: string): boolean {
  return value.startsWith('data:image/')
}

/**
 * 是否图片 MIME。
 * @param mime 附件 MIME
 * @param payload 附件正文，可能是 data URL
 */
function isImageMime(mime: string, payload: string): boolean {
  // MIME 是 image/*，或正文本身就是图片 data URL
  return mime.startsWith('image/') || isImageDataUrl(payload)
}

/**
 * 拼图片 data URL，供 writeImageBase64 使用。
 * @param mime 附件 MIME
 * @param payload base64 正文或已有 data URL
 */
function toImageDataUrl(mime: string, payload: string): string {
  // 已经是 data URL 就不用再拼
  if (isImageDataUrl(payload)) return payload
  // MIME 缺失时按 PNG 兜底
  return `data:${mime || 'image/png'};base64,${stripDataUrl(payload)}`
}

/**
 * 是否知识库上下文附件；这类附件不落盘，直接透传给智能体。
 * @param row 附件对象
 */
export function isJiaorongGuestKnowledgeBaseContextFile(
  row: Record<string, unknown> | null | undefined
): boolean {
  // 空值
  if (!row) return false
  /** 文件路径。 */
  const filePath = typeof row.path === 'string' ? row.path.trim() : ''
  /** MIME 类型。 */
  const mimeType = readMime(row)
  // 约定的路径或 MIME 命中其一即算
  return filePath === JIAORONG_KB_CONTEXT_PATH || mimeType === JIAORONG_KB_CONTEXT_MIME
}

/**
 * 规范化知识库上下文附件：固定路径与 MIME，正文只留一份。
 * @param row 附件对象
 */
export function normalizeGuestKnowledgeBaseContextFile(
  row: Record<string, unknown>
): Record<string, unknown> {
  /** 事件或请求负载。 */
  const payload = readPayload(row)
  /** 下一步值。 */
  const next: Record<string, unknown> = {
    ...row,
    // 名称缺失时给「知识库」
    name: readName(row) || '知识库',
    path: JIAORONG_KB_CONTEXT_PATH,
    mimeType: JIAORONG_KB_CONTEXT_MIME,
    content: payload
  }
  // 正文已挪到 content，去掉重复的 base64 字段
  delete next.dataBase64
  return next
}

/**
 * 与超级智能体一致：落临时文件后走 prepareFile，抽取文档文本 / 图片表示。
 * @param files 应用传来的附件数组
 * @param port 文件落地端口，缺省时只做轻量规范化
 */
export async function materializeGuestFiles(
  files: unknown,
  port: JiaorongGuestFilePort | undefined
): Promise<unknown[] | undefined> {
  // 不是数组就没有附件
  if (!Array.isArray(files)) return undefined
  /** 下一步值。 */
  const next: unknown[] = []
  /** 一条附件。 */
  for (const file of files) {
    /** 单行对象。 */
    const row = asRecord(file)
    // 非对象附件丢掉
    if (!row) continue
    // 知识库上下文附件不落盘，规范化后直接透传
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

    // 已有本机绝对路径：直接交给 prepareFile 抽取内容
    if (filePath && isAbsoluteGuestPath(filePath)) {
      // 没有落地端口，原样透传由上层处理
      if (!port) {
        next.push(file)
        continue
      }
      try {
        next.push(await port.prepareFile(filePath, mimeType || undefined))
      } catch (error) {
        // 抽取失败也要让消息发出去，退化成只带路径的附件
        console.warn('[jiaorong-app] Failed to prepare guest file', name, error)
        next.push({ name, path: filePath, mimeType: mimeType || undefined })
      }
      continue
    }

    // 给了路径但不是绝对路径，又没有正文，无法落地
    if (filePath && !payload) continue

    // 既没路径也没正文
    if (!payload) continue
    // 没有落地端口：只把正文规范化后透传
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
      // 图片走 writeImageBase64，其它按 base64 解码成二进制落盘
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
      // 用应用给的名字覆盖推断名，保持界面一致
      next.push({ ...prepared, name })
    } catch (error) {
      // 单条附件失败只告警，不影响其它附件与消息本身
      console.warn('[jiaorong-app] Failed to materialize guest file', name, error)
    }
  }
  return next
}

/** 是否已安装守卫或协议。 */
let installed = false
/** 待 attach 的 guest appId。 */
const pendingAttachByKey = new Map<string, string>()

/**
 * webContents+appId 的待绑定键。
 * @param hostId 宿主 WebContents id
 * @param appId 应用 id
 */
function pendingAttachKey(hostId: number, appId: string): string {
  return `${hostId}:${guestPartitionForApp(appId)}`
}

/**
 * 记下即将 attach 的 guest appId，供 did-attach 时取回。
 * @param hostId 宿主 WebContents id
 * @param appId 应用 id
 */
function enqueuePendingGuestAppId(hostId: number, appId: string): void {
  pendingAttachByKey.set(pendingAttachKey(hostId, appId), appId)
}

/**
 * 取出并消费待绑定的 guest appId。
 * @param hostId 宿主 WebContents id
 * @param partition guest 的 session 分区
 * @param src guest 当前 URL
 */
function takePendingGuestAppId(hostId: number, partition: unknown, src: string): string | null {
  /** 已知的 appId。 */
  const known = readAppIdFromGuestPartition(partition) || readJiaorongAppHostname(src)
  // 能从分区或 URL 直接读出来，顺手清掉待绑定记录
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
    // 键格式不对
    if (sep < 0) continue
    // 只统计同一宿主的待绑定项
    if (Number(key.slice(0, sep)) === hostId) matches.push(key)
  }
  // 0 条没得取；多条无法确定是哪一个，宁可不绑
  if (matches.length !== 1) return null
  /** 当前应用 id。 */
  const appId = pendingAttachByKey.get(matches[0]) ?? null
  // 消费掉，避免下次误用
  pendingAttachByKey.delete(matches[0])
  return appId
}

/**
 * 读 webContents 的 session partition。
 * @param contents 目标 WebContents
 */
function sessionPartitionOf(contents: WebContents): unknown {
  try {
    return readSessionPartition(contents.session)
  } catch {
    // WebContents 已销毁等情况
    return undefined
  }
}

/**
 * 是否允许该 guest 导航到该 URL，并顺手完成首次绑定。
 * @param contents guest 的 WebContents
 * @param rawUrl 目标 URL
 */
function allowGuestUrl(contents: WebContents, rawUrl: string): boolean {
  /** 下一步值。 */
  const next = readJiaorongAppHostname(rawUrl)
  // 走本应用协议
  if (next) {
    /** 是否已绑定。 */
    const bound = getBoundGuestAppId(contents.id)
    // 首次导航，直接绑定
    if (!bound) {
      bindGuestAppId(contents.id, next)
      return true
    }
    // 已绑定则只允许本应用协议 URL
    return bound === next
  }
  // 非协议 URL 只放行本机回环（开发态应用自有 Node）
  if (!isLoopbackHttpEntry(rawUrl)) return false
  /** 是否已绑定。 */
  const bound = getBoundGuestAppId(contents.id)
  // 已绑定的 guest 允许访问本机服务
  if (bound) return true
  /** 从 session 读出的 partition。 */
  const fromSession = readAppIdFromGuestPartition(sessionPartitionOf(contents))
  // 连分区都读不出来，无法确认归属
  if (!fromSession) return false
  // 用分区补上绑定
  bindGuestAppId(contents.id, fromSession)
  return true
}

/**
 * 超级智能体侧 webview 导航/权限守卫：强制分区、preload 与安全开关。
 * @param contents 宿主 WebContents（承载 webview 标签的那个）
 */
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
    // 认不出应用，或页面自己写了别的分区，一律拒绝 attach
    if (!appId || (partition && partition !== expected)) {
      event.preventDefault()
      return
    }
    // 记下待绑定，等 did-attach-webview 拿到 guest id 再绑
    enqueuePendingGuestAppId(contents.id, appId)
    // 下面强制覆盖页面给的 webPreferences，不让应用自行放宽
    webPreferences.partition = expected
    // 只允许用应用平台自己的 preload
    webPreferences.preload = getAppPreloadPath()
    // 不给 guest Node 能力
    webPreferences.nodeIntegration = false
    // 保持上下文隔离
    webPreferences.contextIsolation = true
    // preload 需要 require electron，不能开沙箱
    webPreferences.sandbox = false
    // 同源策略照常生效
    webPreferences.webSecurity = true
    // 允许加载本机 http 资源（开发态应用自有 Node）
    webPreferences.allowRunningInsecureContent = true
    // 禁止 guest 里再套 webview
    webPreferences.webviewTag = false
    // 允许通过隐藏快捷键打开 DevTools
    webPreferences.devTools = true
  })
  contents.on('did-attach-webview', (_event, guest) => {
    /** 当前应用 id。 */
    const appId = takePendingGuestAppId(contents.id, sessionPartitionOf(guest), guest.getURL())
    // 取到了就绑定，后续 invoke 靠这个判定归属
    if (appId) bindGuestAppId(guest.id, appId)
  })
}

/**
 * guest 页导航/权限守卫：只允许本应用协议或本机回环。
 * @param contents guest 的 WebContents
 */
function attachGuestWebviewGuard(contents: WebContents): void {
  // 销毁时解绑并清目录白名单
  contents.on('destroyed', () => {
    unbindGuest(contents.id)
  })
  // 禁止 guest 另开窗口
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  /** 非本应用则拒绝。 */
  const denyIfForeign = (url: string, prevent: () => void) => {
    // allowGuestUrl 不通过就取消这次导航
    if (!allowGuestUrl(contents, url)) prevent()
  }
  // 主框导航
  contents.on('will-navigate', (event, url) => {
    denyIfForeign(url, () => event.preventDefault())
  })
  // 服务端重定向
  contents.on('will-redirect', (event, url) => {
    denyIfForeign(url, () => event.preventDefault())
  })
  // iframe 等子框导航
  contents.on('will-frame-navigate', (event) => {
    denyIfForeign(event.url, () => event.preventDefault())
  })
  // 加载完成后再确认一次绑定（首次进入时 partition 可能还读不到）
  contents.on('did-finish-load', () => {
    allowGuestUrl(contents, contents.getURL())
  })
}

/**
 * 监听 webContents 生命周期并挂守卫。
 * @param contents 新建或已存在的 WebContents
 */
function watchContents(contents: WebContents): void {
  // 所有 WebContents 都要挂宿主侧守卫（主窗口也可能承载 webview）
  attachHostWebviewGuard(contents)
  // 只有 webview 类型的才是 guest
  if (contents.getType() !== 'webview') return
  /** 从 partition 读出的 appId。 */
  const fromPartition = readAppIdFromGuestPartition(sessionPartitionOf(contents))
  /** fromUrl 地址。 */
  const fromUrl = readJiaorongAppHostname(contents.getURL())
  /** 当前应用 id。 */
  const appId = fromUrl ?? fromPartition
  // 能确认归属就先绑上，补上 did-attach 之外的创建路径
  if (appId) bindGuestAppId(contents.id, appId)
  attachGuestWebviewGuard(contents)
}

/** 安装 webview 隔离：只允许本应用协议/回环，强制应用 preload。 */
export function installJiaorongAppGuestIsolation(): void {
  // 幂等：只装一次
  if (installed) return
  installed = true

  // 之后新建的 WebContents 都挂守卫
  app.on('web-contents-created', (_event, contents) => {
    watchContents(contents)
  })
  /** 一个 webContents。 */
  for (const contents of webContents.getAllWebContents()) {
    // 已存在的补挂，跳过已销毁的
    if (!contents.isDestroyed()) watchContents(contents)
  }
}
