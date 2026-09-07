import { app, webContents, type WebContents } from 'electron'
import { bindGuestAppId, getBoundGuestAppId, unbindGuest } from './guestBind'
import { guestPartitionForApp, readJiaorongAppHostname } from './guestAppId'
import { getAppPreloadPath } from './paths'

let installed = false

function allowGuestUrl(contents: WebContents, rawUrl: string): boolean {
  const next = readJiaorongAppHostname(rawUrl)
  if (!next) return false
  const bound = getBoundGuestAppId(contents.id)
  if (!bound) {
    bindGuestAppId(contents.id, next)
    return true
  }
  return bound === next
}

function attachHostWebviewGuard(contents: WebContents): void {
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    const appId = readJiaorongAppHostname(params.src)
    if (!appId || params.partition !== guestPartitionForApp(appId)) {
      event.preventDefault()
      return
    }
    webPreferences.preload = getAppPreloadPath()
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true
    webPreferences.sandbox = false
    webPreferences.webSecurity = true
    webPreferences.allowRunningInsecureContent = true
    webPreferences.webviewTag = false
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
  const appId = readJiaorongAppHostname(contents.getURL())
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
