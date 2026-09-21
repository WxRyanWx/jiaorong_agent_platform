/** 开发者中心独立窗口：与设置窗口同思路，单独 BrowserWindow 加载主渲染入口的 standalone 模式。 */

import { BrowserWindow } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { sharedAppsManager } from '../../main/appManagerInstance'
import { listGuestAppIdsForWindow, takeWindowSpawns } from '../../main/guest'
import { readAppManifest } from '../../main/manifest'

/** 独立窗口单例。 */
let devCenterWindow: BrowserWindow | null = null

/**
 * 关掉独立窗口时停掉它打开过的 Node。
 * @param win 即将关闭的窗口
 */
function stopAppsOpenedInWindow(win: BrowserWindow): void {
  const manager = sharedAppsManager()
  const ids = new Set([...takeWindowSpawns(win.id), ...listGuestAppIdsForWindow(win)])
  for (const appId of ids) {
    const appDir = manager.getAppDir(appId)
    manager.stopApp((appDir && readAppManifest(appDir)?.id) || appId)
  }
}

/** 独立窗口加载地址：hash 路由带 standalone 标记，渲染端据此去掉主壳。 */
function resolveDevCenterWindowUrl(): string {
  /** hash 路由与查询。 */
  const hash = '#/dev-center?standalone=1'
  // 开发态走 vite dev server
  if (process.env.ELECTRON_RENDERER_URL) return `${process.env.ELECTRON_RENDERER_URL}/${hash}`
  /** 打包态渲染入口。 */
  const entry = pathToFileURL(path.join(__dirname, '../renderer/index.html')).toString()
  return `${entry}${hash}`
}

/** 打开 / 聚焦开发者中心独立窗口。 */
export function openDevCenterWindow(): void {
  if (devCenterWindow && !devCenterWindow.isDestroyed()) {
    devCenterWindow.show()
    devCenterWindow.focus()
    return
  }
  devCenterWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: '开发者中心',
    show: false,
    autoHideMenuBar: true,
    // 与设置窗口一致：macOS 隐藏式标题栏 + 交通灯内嵌，其余平台用系统标题栏
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : undefined,
    trafficLightPosition: process.platform === 'darwin' ? { x: 12, y: 10 } : undefined,
    frame: process.platform === 'darwin',
    roundedCorners: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      // 与主窗口一致：独立窗口里点「打开」也要能挂 <webview>
      webviewTag: true,
      // 与主窗口一致：卡片图标走 file://，关掉同源限制才显示得出来
      webSecurity: false,
      devTools: true
    }
  })
  // 不给页面开新窗口的能力
  devCenterWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  devCenterWindow.once('ready-to-show', () => {
    devCenterWindow?.show()
  })
  devCenterWindow.on('close', () => {
    if (devCenterWindow && !devCenterWindow.isDestroyed()) {
      stopAppsOpenedInWindow(devCenterWindow)
    }
  })
  devCenterWindow.on('closed', () => {
    devCenterWindow = null
  })
  void devCenterWindow.loadURL(resolveDevCenterWindowUrl())
}
