/** 子应用通过 window.jiaorong.window.open 打开的独立窗口。 */

import { BrowserWindow, webContents } from 'electron'
import { bridgeError, type JiaorongBridgeError } from '../bridgeErrors'
import { appHasBoundGuest, buildJiaorongAppEntryUrl, bindGuestAppId, unbindGuest } from './guest'
import { getAppPreloadPath } from './paths'
import { ensureJiaorongAppProtocolSession } from './protocol'

const DEFAULT_WIDTH = 1100
const DEFAULT_HEIGHT = 760
const MIN_WIDTH = 480
const MIN_HEIGHT = 360
const MAX_WIDTH = 3840
const MAX_HEIGHT = 2160
/** 每个应用同时存在的这类窗口上限，避免页面循环打开。 */
const MAX_WINDOWS_PER_APP = 8

const windowsByApp = new Map<string, Set<BrowserWindow>>()
/** 窗口 id → 打开时的地址，用来把「打开应用」聚焦回入口窗口。 */
const windowUrlById = new Map<number, string>()
/** 某个应用已经没有任何页面时通知宿主停 Node。 */
let onWindowsEmpty: ((appId: string) => void) | null = null

/**
 * 最后一个页面关掉后的回调。传 null 表示卸掉。
 * @param listener 回调
 */
export function setAppWindowsEmptyListener(listener: ((appId: string) => void) | null): void {
  onWindowsEmpty = listener
}

/**
 * 解析子应用要求打开的地址。
 * @param appId 调用方应用 id
 * @param rawUrl 页面传入的 url
 * @param callerUrl 调用页当前地址，用来解析相对路径
 */
export function resolveAppWindowUrl(
  appId: string,
  rawUrl: unknown,
  callerUrl: string
): { url: string } | JiaorongBridgeError {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return bridgeError('VALIDATION_ERROR', 'url 不能为空')
  }
  const value = rawUrl.trim()
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x20 || code === 0x7f) {
      return bridgeError('VALIDATION_ERROR', 'url 含有非法字符')
    }
  }
  try {
    return acceptWindowUrl(appId, new URL(value))
  } catch {
    return resolveRelativeWindowUrl(appId, value, callerUrl)
  }
}

/**
 * 判断绝对地址能不能进新窗口。
 * @param appId 调用方应用 id
 * @param url 已解析的绝对地址
 */
function acceptWindowUrl(appId: string, url: URL): { url: string } | JiaorongBridgeError {
  if (url.protocol === 'http:' || url.protocol === 'https:') {
    if (!url.hostname) return bridgeError('VALIDATION_ERROR', 'url 缺少主机名')
    return { url: url.href }
  }
  if (url.protocol === 'jiaorong-app:') {
    if (url.hostname !== appId) {
      return bridgeError('FORBIDDEN', '不能打开其他应用的页面')
    }
    return { url: url.href }
  }
  return bridgeError('VALIDATION_ERROR', '只允许 http、https 或本应用页面')
}

/**
 * 相对地址：调用页是网页或本应用协议时按其解析，否则当作包内路径。
 * @param appId 调用方应用 id
 * @param value 相对地址
 * @param callerUrl 调用页地址
 */
function resolveRelativeWindowUrl(
  appId: string,
  value: string,
  callerUrl: string
): { url: string } | JiaorongBridgeError {
  try {
    const caller = new URL(callerUrl)
    const usable =
      caller.protocol === 'http:' ||
      caller.protocol === 'https:' ||
      (caller.protocol === 'jiaorong-app:' && caller.hostname === appId)
    if (usable) return acceptWindowUrl(appId, new URL(value, caller))
  } catch {
    // 调用页地址不可用，退回包内路径
  }
  return { url: buildJiaorongAppEntryUrl(appId, value) }
}

/**
 * 读窗口宽或高。缺省用默认值，超出范围则夹紧。
 * @param value 页面传入的数值
 * @param fallback 缺省值
 * @param min 最小值
 * @param max 最大值
 * @param label 错误文案里的字段名
 */
function readWindowLength(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  label: string
): number | JiaorongBridgeError {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return bridgeError('VALIDATION_ERROR', `${label} 必须是数字`)
  }
  return Math.min(max, Math.max(min, Math.round(value)))
}

/**
 * 读窗口标题。缺省用应用名。
 * @param value 页面传入的标题
 * @param fallback 应用名
 */
function readWindowTitle(value: unknown, fallback: string): string | JiaorongBridgeError {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value !== 'string') return bridgeError('VALIDATION_ERROR', 'title 必须是字符串')
  const title = value.trim().slice(0, 120)
  return title || fallback
}

/** 丢掉已经关掉的窗口，返回仍开着的集合。 */
function liveWindows(appId: string): Set<BrowserWindow> {
  const current = windowsByApp.get(appId) ?? new Set<BrowserWindow>()
  for (const win of current) {
    if (win.isDestroyed()) current.delete(win)
  }
  if (current.size === 0) windowsByApp.delete(appId)
  else windowsByApp.set(appId, current)
  return current
}

/**
 * 新窗口只允许继续打开网页或本应用协议，挡住 file: 等跳转。
 * @param appId 窗口所属应用
 * @param rawUrl 即将导航到的地址
 */
function allowAppWindowNavigation(appId: string, rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    if (url.protocol === 'http:' || url.protocol === 'https:') return Boolean(url.hostname)
    return url.protocol === 'jiaorong-app:' && url.hostname === appId
  } catch {
    return false
  }
}

/**
 * 创建子应用窗口。
 * @param input 调用方、地址和窗口参数
 */
export async function openAppWindow(input: {
  appId: string
  appName: string
  rawUrl: unknown
  callerUrl: string
  width: unknown
  height: unknown
  title: unknown
}): Promise<{ id: number; url: string } | JiaorongBridgeError> {
  const resolved = resolveAppWindowUrl(input.appId, input.rawUrl, input.callerUrl)
  if ('code' in resolved) return resolved
  const width = readWindowLength(input.width, DEFAULT_WIDTH, MIN_WIDTH, MAX_WIDTH, 'width')
  if (typeof width !== 'number') return width
  const height = readWindowLength(input.height, DEFAULT_HEIGHT, MIN_HEIGHT, MAX_HEIGHT, 'height')
  if (typeof height !== 'number') return height
  const title = readWindowTitle(input.title, input.appName)
  if (typeof title !== 'string') return title

  const openWindows = liveWindows(input.appId)
  if (openWindows.size >= MAX_WINDOWS_PER_APP) {
    return bridgeError('RATE_LIMITED', '打开的窗口过多，请先关闭已有窗口')
  }

  const partition = ensureJiaorongAppProtocolSession(input.appId)
  const win = new BrowserWindow({
    width,
    height,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    title,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      partition,
      preload: getAppPreloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webviewTag: false,
      webSecurity: true,
      devTools: true
    }
  })
  const contentsId = win.webContents.id
  bindGuestAppId(contentsId, input.appId)
  openWindows.add(win)
  windowsByApp.set(input.appId, openWindows)
  windowUrlById.set(win.id, resolved.url)
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  // 只拦顶层跳到 file: 等地址。子框架仍放行，否则百度这类页面里的 iframe 出不来。
  const blockForeign = (event: { preventDefault: () => void }, nextUrl: string) => {
    if (!allowAppWindowNavigation(input.appId, nextUrl)) event.preventDefault()
  }
  win.webContents.on('will-navigate', (event, nextUrl) => blockForeign(event, nextUrl))
  win.webContents.on('will-redirect', (event, nextUrl) => blockForeign(event, nextUrl))
  const reveal = () => {
    if (win.isDestroyed()) return
    win.show()
    win.focus()
  }
  win.once('ready-to-show', reveal)
  // 主框架加载失败时 ready-to-show 不一定来，不展示的话窗口会一直藏着
  win.webContents.on('did-fail-load', (_event, _code, _desc, _url, isMainFrame) => {
    if (isMainFrame !== false) reveal()
  })
  win.on('closed', () => {
    unbindGuest(contentsId)
    openWindows.delete(win)
    windowUrlById.delete(win.id)
    if (openWindows.size === 0) windowsByApp.delete(input.appId)
    // 应用内 webview 还在时不要停；只有这个应用一个页面都不剩才停 Node
    if (!appHasBoundGuest(input.appId)) onWindowsEmpty?.(input.appId)
  })
  void win.loadURL(resolved.url).catch((error) => {
    console.warn('[jiaorong-app] window load failed', resolved.url, error)
    reveal()
  })
  return { id: win.id, url: resolved.url }
}

/**
 * 打开应用入口窗口。同一地址已经开着就聚焦，不再叠一个。
 * @param input 调用方和入口地址
 */
export async function openInstalledAppWindow(input: {
  appId: string
  appName: string
  rawUrl: unknown
  callerUrl: string
  width: unknown
  height: unknown
  title: unknown
}): Promise<{ id: number; url: string } | JiaorongBridgeError> {
  const resolved = resolveAppWindowUrl(input.appId, input.rawUrl, input.callerUrl)
  if ('code' in resolved) return resolved
  for (const win of liveWindows(input.appId)) {
    if (windowUrlById.get(win.id) !== resolved.url || win.isDestroyed()) continue
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    return { id: win.id, url: resolved.url }
  }
  return openAppWindow(input)
}

/**
 * 取调用页地址。调用方不是仍活着的页面时返回空串。
 * @param webContentsId 发起调用的 WebContents id
 */
export function readCallerWindowUrl(webContentsId: number): string {
  const contents = webContents.fromId(webContentsId)
  if (!contents || contents.isDestroyed()) return ''
  try {
    return contents.getURL()
  } catch {
    return ''
  }
}
