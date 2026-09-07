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

let installed = false
const pendingAttachByKey = new Map<string, string>()

function pendingAttachKey(hostId: number, appId: string): string {
  return `${hostId}:${guestPartitionForApp(appId)}`
}

function enqueuePendingGuestAppId(hostId: number, appId: string): void {
  pendingAttachByKey.set(pendingAttachKey(hostId, appId), appId)
}

function takePendingGuestAppId(hostId: number, partition: unknown, src: string): string | null {
  const known = readAppIdFromGuestPartition(partition) || readJiaorongAppHostname(src)
  if (known) {
    pendingAttachByKey.delete(pendingAttachKey(hostId, known))
    return known
  }
  const matches: string[] = []
  for (const key of pendingAttachByKey.keys()) {
    const sep = key.indexOf(':')
    if (sep < 0) continue
    if (Number(key.slice(0, sep)) === hostId) matches.push(key)
  }
  if (matches.length !== 1) return null
  const appId = pendingAttachByKey.get(matches[0]) ?? null
  pendingAttachByKey.delete(matches[0])
  return appId
}

function sessionPartitionOf(contents: WebContents): unknown {
  try {
    return readSessionPartition(contents.session)
  } catch {
    return undefined
  }
}

function allowGuestUrl(contents: WebContents, rawUrl: string): boolean {
  const next = readJiaorongAppHostname(rawUrl)
  if (next) {
    const bound = getBoundGuestAppId(contents.id)
    if (!bound) {
      bindGuestAppId(contents.id, next)
      return true
    }
    return bound === next
  }
  if (!isLoopbackHttpEntry(rawUrl)) return false
  const bound = getBoundGuestAppId(contents.id)
  if (bound) return true
  const fromSession = readAppIdFromGuestPartition(sessionPartitionOf(contents))
  if (!fromSession) return false
  bindGuestAppId(contents.id, fromSession)
  return true
}

function attachHostWebviewGuard(contents: WebContents): void {
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    const fromProtocol = readJiaorongAppHostname(params.src)
    const fromPartition = readAppIdFromGuestPartition(params.partition)
    const appId = fromProtocol ?? (isLoopbackHttpEntry(params.src) ? fromPartition : null)
    const expected = appId ? guestPartitionForApp(appId) : ''
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
  })
  contents.on('did-attach-webview', (_event, guest) => {
    const appId = takePendingGuestAppId(contents.id, sessionPartitionOf(guest), guest.getURL())
    if (appId) bindGuestAppId(guest.id, appId)
  })
}

function attachGuestWebviewGuard(contents: WebContents): void {
  contents.on('destroyed', () => {
    unbindGuest(contents.id)
  })
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
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

function watchContents(contents: WebContents): void {
  attachHostWebviewGuard(contents)
  if (contents.getType() !== 'webview') return
  const fromPartition = readAppIdFromGuestPartition(sessionPartitionOf(contents))
  const fromUrl = readJiaorongAppHostname(contents.getURL())
  const appId = fromUrl ?? fromPartition
  if (appId) bindGuestAppId(contents.id, appId)
  attachGuestWebviewGuard(contents)
}

export function installJiaorongAppGuestIsolation(): void {
  if (installed) return
  installed = true

  app.on('web-contents-created', (_event, contents) => {
    watchContents(contents)
  })
  for (const contents of webContents.getAllWebContents()) {
    if (!contents.isDestroyed()) watchContents(contents)
  }
}
