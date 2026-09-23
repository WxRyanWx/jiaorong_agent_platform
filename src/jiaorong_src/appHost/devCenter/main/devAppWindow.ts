/** 开发者中心应用独立窗口：每个应用一个 BrowserWindow，纯 UI 侧边栏 + webview，关窗停 Node。 */

import { BrowserWindow, webContents } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { sharedAppsManager } from '../../main/appManagerInstance'
import { getBoundGuestAppId, readOwnerBrowserWindowId } from '../../main/guest'
import { readAppManifest } from '../../main/manifest'

/** appId → 独立窗口；同应用重复打开只聚焦。 */
const devAppWindows = new Map<string, BrowserWindow>()

/**
 * 是否还有别的窗口的 webview 挂着该应用（如主窗口侧栏 menu 入口打开的）。
 * @param appId spawn 用的应用 id
 * @param windowId 即将关闭的窗口 id
 */
function hasGuestInOtherWindows(appId: string, windowId: number): boolean {
  return webContents.getAllWebContents().some((contents) => {
    if (contents.isDestroyed() || contents.getType() !== 'webview') return false
    // 本窗口的 webview 随窗口一起销毁，不算占用
    if (readOwnerBrowserWindowId(contents) === windowId) return false
    return getBoundGuestAppId(contents.id) === appId
  })
}

/**
 * 独立窗口加载地址：hash 路由带 standalone 标记，渲染端据此只渲染侧边栏 + webview。
 * @param appId 应用 id
 */
function resolveDevAppWindowUrl(appId: string): string {
  /** hash 路由与查询。 */
  const hash = `#/apps/${encodeURIComponent(appId)}?standalone=1`
  // 开发态走 vite dev server
  if (process.env.ELECTRON_RENDERER_URL) return `${process.env.ELECTRON_RENDERER_URL}/${hash}`
  /** 打包态渲染入口。 */
  const entry = pathToFileURL(path.join(__dirname, '../renderer/index.html')).toString()
  return `${entry}${hash}`
}

/**
 * 打开 / 聚焦某个开发者应用的独立窗口。
 * @param appId 应用 id
 */
export function openDevAppWindow(appId: string): void {
  /** 已存在的窗口直接聚焦，不重复开。 */
  const existed = devAppWindows.get(appId)
  if (existed && !existed.isDestroyed()) {
    existed.show()
    existed.focus()
    return
  }
  /** 应用管理器：读目录清单拿显示名。 */
  const manager = sharedAppsManager()
  /** 已登记目录；清单 id 才是 spawn 用的 id。 */
  const appDir = manager.getAppDir(appId)
  /** 目录清单；spawn 用清单 id，标题用清单名。 */
  const manifest = appDir ? readAppManifest(appDir) : null
  /** 清单里的真实 id；目录换名时与入参可能不同。 */
  const manifestId = manifest?.id || appId
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    title: manifest?.name || appId,
    show: false,
    autoHideMenuBar: true,
    // 与设置窗口一致：macOS 隐藏式标题栏 + 交通灯内嵌，其余平台用系统标题栏
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : undefined,
    trafficLightPosition: process.platform === 'darwin' ? { x: 12, y: 10 } : undefined,
    roundedCorners: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      // 独立窗口里要挂 <webview> 承载应用
      webviewTag: true,
      // 与主窗口一致：卡片图标走 file://，关掉同源限制才显示得出来
      webSecurity: false,
      devTools: true
    }
  })
  devAppWindows.set(appId, win)
  /** 窗口 id 提前留底，closed 阶段窗口已销毁不能再读。 */
  const windowId = win.id
  // 不给页面开新窗口的能力
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.show()
  })
  win.on('closed', () => {
    devAppWindows.delete(appId)
    // 关窗停 Node；同应用还在别的窗口开着时保留进程，避免误杀共享服务
    if (!hasGuestInOtherWindows(manifestId, windowId)) manager.stopApp(manifestId)
  })
  void win.loadURL(resolveDevAppWindowUrl(appId))
}
