/** webview 隔离：强制 preload、分区、拦截跨应用导航。 */

import { app, webContents, type WebContents } from 'electron'
import { bindGuestAppId, getBoundGuestAppId, unbindGuest } from './guestBind'
import {
  guestPartitionForApp,
  isLoopbackHttpEntry,
  readAppIdFromGuestPartition,
  readJiaorongAppHostname,
  readSessionPartition
} from './guestAppId'
import { getAppPreloadPath } from './paths'

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

/** 宿主侧 webview 导航/权限守卫。 */
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

/** 安装 webview 隔离：只允许本应用协议/回环，强制宿主 preload。 */
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
