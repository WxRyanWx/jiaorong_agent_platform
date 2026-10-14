/** 开发者中心应用独立窗口：窗口存活期间临时接管应用运行目录。 */

import { BrowserWindow, dialog, webContents } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { sharedAppsManager } from '../../main/appManagerInstance'
import { getBoundGuestAppId, readOwnerBrowserWindowId } from '../../main/guest'
import { readAppManifest } from '../../main/manifest'
import type { JiaorongAppOpenPrepareResult, JiaorongDevAppOpenResult } from '../../types'
import { JIAORONG_APP_CLOSE_REQUEST_CHANNEL } from '../../channels'
import { getDevApps, inspectDevAppDir } from './devApps'

/** appId → 独立窗口；同应用重复打开只聚焦。 */
const devAppWindows = new Map<string, BrowserWindow>()

/**
 * 运行来源切换前的主进程确认。
 * @param appName 应用显示名
 * @param target 切换目标
 */
async function confirmSwitchRuntime(
  appName: string,
  target: 'debug' | 'production'
): Promise<boolean> {
  /** 弹窗选择结果。 */
  const result = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['取消', '确定'],
    defaultId: 1,
    cancelId: 0,
    message: `切换应用 ${appName} 运行版本`,
    detail:
      target === 'debug'
        ? '当前应用生产进程已启动。切换将停止生产进程并打开本地调试版。'
        : '当前应用正在本地调试。切换将关闭调试窗口并打开生产版。'
  })
  return result.response === 1
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
 * 删除临时调试 link 并恢复扫盘结果；不删除生产安装目录和本地源码目录。
 * @param appId spawn 用的应用 id
 */
function deactivateDevAppLink(appId: string): void {
  /** 应用管理器。 */
  const manager = sharedAppsManager()
  manager.removeExternalAppLink(appId)
}

/**
 * 关闭开发者中心独立窗口；关闭完成后临时 link 已被清理。
 * @param appId 开发者中心记录里的应用 id
 */
export async function closeDevAppWindow(appId: string): Promise<void> {
  /** 已存在的窗口。 */
  const win = devAppWindows.get(appId)
  if (!win || win.isDestroyed()) {
    deactivateDevAppLink(appId)
    return
  }
  await new Promise<void>((resolve) => {
    win.once('closed', resolve)
    win.close()
  })
}

/** 换账号 / 退出登录时关闭全部调试窗口并释放临时 link。 */
export async function closeAllDevAppWindows(): Promise<void> {
  for (const appId of Array.from(devAppWindows.keys())) {
    await closeDevAppWindow(appId)
  }
}

/** 指定开发者应用独立窗口是否仍打开。 */
export function isDevAppWindowOpen(appId: string): boolean {
  /** 已存在的窗口。 */
  const win = devAppWindows.get(appId)
  return Boolean(win && !win.isDestroyed())
}

/** 判断 WebContents 是否属于某个开发者中心独立窗口。 */
export function isDevAppHostContents(contents: { id: number }): boolean {
  for (const win of devAppWindows.values()) {
    if (win.isDestroyed()) continue
    if (win.webContents.id === contents.id) return true
  }
  return false
}

/**
 * 生产版本页面是否仍挂着 guest；无 spawn 的应用也要按“已打开”处理。
 * @param appId spawn 用的应用 id
 */
function hasProductionGuest(appId: string): boolean {
  return webContents.getAllWebContents().some((contents) => {
    if (contents.isDestroyed() || contents.getType() !== 'webview') return false
    return getBoundGuestAppId(contents.id) === appId
  })
}

/**
 * 通知生产 guest 所属窗口移除该应用页面，避免旧 webview 继续占用运行状态。
 * @param appId spawn 用的应用 id
 */
function requestCloseProductionGuests(appId: string): void {
  /** 已通知过的窗口，避免重复发送。 */
  const notifiedWindowIds = new Set<number>()
  for (const contents of webContents.getAllWebContents()) {
    if (contents.isDestroyed() || contents.getType() !== 'webview') continue
    if (getBoundGuestAppId(contents.id) !== appId) continue
    const windowId = readOwnerBrowserWindowId(contents)
    if (windowId === null || notifiedWindowIds.has(windowId)) continue
    notifiedWindowIds.add(windowId)
    const owner = BrowserWindow.fromId(windowId)
    if (!owner || owner.isDestroyed()) continue
    owner.webContents.send(JIAORONG_APP_CLOSE_REQUEST_CHANNEL, { appId })
  }
}

/**
 * 打开 / 聚焦某个开发者应用的独立窗口。
 * @param appId 应用 id
 */
export async function openDevAppWindow(appId: string): Promise<JiaorongDevAppOpenResult> {
  /** 已存在的窗口直接聚焦，不重复开。 */
  const existed = devAppWindows.get(appId)
  if (existed && !existed.isDestroyed()) {
    existed.show()
    existed.focus()
    return { ok: true }
  }
  /** 开发者中心登记记录。 */
  const record = getDevApps().find((item) => item.id === appId)
  if (!record) return { ok: false, message: '应用不存在或已被移除' }
  /** 本地目录校验结果。 */
  const manifestProblem = inspectDevAppDir(record.dir)
  if (manifestProblem) return { ok: false, message: manifestProblem }
  /** 本地目录清单。 */
  const manifest = readAppManifest(record.dir)
  if (!manifest) return { ok: false, message: 'app.json 解析失败' }
  if (manifest.id !== appId) {
    return { ok: false, message: '开发者中心登记 id 与 app.json id 不一致，请重新创建本地应用' }
  }
  /** 应用管理器。 */
  const manager = sharedAppsManager()
  if (manager.isRunning(appId) || hasProductionGuest(appId)) {
    const confirmed = await confirmSwitchRuntime(manifest.name, 'debug')
    if (!confirmed) return { ok: false, cancelled: true }
    // 弹窗期间另一个请求可能已打开调试窗口；此时只聚焦，不能再停进程
    const concurrentWin = devAppWindows.get(appId)
    if (concurrentWin && !concurrentWin.isDestroyed()) {
      concurrentWin.show()
      concurrentWin.focus()
      return { ok: true }
    }
    /** 停止结果；失败时不能继续写调试 link，避免新旧进程同时占端口。 */
    const stopped = manager.stopApp(appId)
    if (!stopped.success) return { ok: false, message: stopped.message }
    requestCloseProductionGuests(appId)
  }
  /** 弹窗等待期间登记目录或清单可能被修改，写 link 前重新校验。 */
  const currentRecord = getDevApps().find((item) => item.id === appId)
  if (!currentRecord || currentRecord.dir !== record.dir) {
    return { ok: false, message: '应用不存在或已被移除' }
  }
  const currentProblem = inspectDevAppDir(currentRecord.dir)
  if (currentProblem) return { ok: false, message: currentProblem }
  const currentManifest = readAppManifest(currentRecord.dir)
  if (!currentManifest || currentManifest.id !== appId) {
    return { ok: false, message: '开发者中心登记 id 与 app.json id 不一致，请重新创建本地应用' }
  }
  /** 临时接管只在调试窗口打开期间存在。 */
  const linked = manager.installAppFromPath(record.dir, {
    mode: 'link',
    overwrite: true
  })
  if (!linked.success) return { ok: false, message: linked.message }
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    title: currentManifest.name,
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
  // 不给页面开新窗口的能力
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.show()
  })
  win.on('closed', () => {
    devAppWindows.delete(appId)
    // 调试窗口关闭即释放该 appId 的运行来源，主窗口若仍挂着旧 webview 也要停服务
    // 运行中清单 id 可能被开发者修改，按源目录停进程比按打开时 id 更稳
    manager.stopAppsInDir(record.dir)
    deactivateDevAppLink(appId)
  })
  void win.loadURL(resolveDevAppWindowUrl(appId))
  return { ok: true }
}

/**
 * 从本地调试切换回生产来源；没有打开中的调试窗口时只清理遗留 link。
 * @param appId 应用 id
 */
export async function switchDevAppToProduction(appId: string): Promise<boolean> {
  /** 开发者中心登记记录。 */
  const record = getDevApps().find((item) => item.id === appId)
  if (!record) {
    deactivateDevAppLink(appId)
    return true
  }
  if (!isDevAppWindowOpen(appId)) {
    deactivateDevAppLink(appId)
    return true
  }
  /** 本地目录清单；只在确有调试窗口、需要弹窗时才读盘。 */
  const manifest = readAppManifest(record.dir)
  const confirmed = await confirmSwitchRuntime(manifest?.name || appId, 'production')
  if (!confirmed) return false
  await closeDevAppWindow(appId)
  return true
}

/**
 * 侧栏打开生产版本前的检查；需要切换时由主进程弹窗确认。
 * @param appId 应用 id
 */
export async function prepareSwitchDevAppToProduction(
  appId: string
): Promise<JiaorongAppOpenPrepareResult> {
  return { ok: await switchDevAppToProduction(appId) }
}
