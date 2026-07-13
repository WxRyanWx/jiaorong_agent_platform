import { app, BrowserWindow, clipboard, dialog, ipcMain, screen } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'path'
import { platform } from 'os'
import { createRequire } from 'module'
import { presenter } from '@/presenter'

const require = createRequire(import.meta.url)
const CARD_POPUP_SESSION_PARTITION = 'card-popup-fixed'
const CTRL_KEYCODE = platform() === 'darwin' ? 3675 : 29
const CARD_POPUP_WIDTH = 242
const CARD_POPUP_HEIGHT = 32
const TRANSLATE_POPUP_WIDTH = 320
const TRANSLATE_POPUP_HEIGHT = 360
const CHAT_PC_TRANSLATE_BASE_URL = 'https://c4ai.ccccltd.cn'
const CHAT_PC_TRANSLATE_APP_TOKEN = 'app-1r0huW0p1XuzPhTX7uC8xTTJ'

type UiohookApi = {
  start: () => void
  stop?: () => void
  removeAllListeners?: () => void
  on: (event: string, listener: (payload: any) => void) => void
  keyTap: (key: number, modifiers?: number[]) => void
}

type SelectionRect = { x: number; y: number; width: number; height: number }

// uiohook 是运行时加载的原生模块，避免在不可用环境下直接 import 导致启动失败。
let uIOhook: UiohookApi | null = null
let UiohookKey: Record<string, number> | null = null
let hookStarted = false
let cardPopup: BrowserWindow | null = null
let translatePopup: BrowserWindow | null = null
let cardPopupContentReady = false
let translatePopupContentReady = false
let pendingCardPopupShow: { x: number; y: number; selectedText: string } | null = null
let pendingTranslateText: string | null = null
// 首次创建弹窗时 renderer 监听可能尚未挂载，主进程缓存文本供 renderer 主动拉取。
let currentCardPopupText = ''
let currentTranslatePopupText = ''
// 模拟复制期间需要避开用户真实按键，避免误判或覆盖用户剪贴板。
let ctrlDownLock = false
let copyFlag = false
let dragStartCursorPos: { x: number; y: number } | null = null
let dragStartWindowPos: { x: number; y: number } | null = null
let lastCardPopupPosition = { x: 0, y: 0, height: CARD_POPUP_HEIGHT }
let tokenIpcRegistered = false
let quitCleanupRegistered = false
let uiohookDestroyed = false

const filteredApps = new Set([
  'wps.exe',
  'et.exe',
  'wpspdf.exe',
  'wpp.exe',
  'explorer',
  '文件资源管理器',
  'finder',
  '访达',
  'wps office',
  'wpsoffice',
  'notepad++.exe'
])

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const hasValidContent = (text: string) => /\S/.test(text)

// 延迟加载 uiohook，兼容本地依赖未安装或原生模块加载失败的场景。
function loadUiohook(): boolean {
  if (uIOhook && UiohookKey) return true
  try {
    const mod = require('uiohook-napi') as {
      uIOhook: UiohookApi
      UiohookKey: Record<string, number>
    }
    uIOhook = mod.uIOhook
    UiohookKey = mod.UiohookKey
    return true
  } catch (error) {
    console.warn('[highlightedText] uiohook-napi not available, selection popup disabled:', error)
    return false
  }
}

// 应用退出或辅助功能权限变化时强制释放 uiohook，降低系统卡死风险。
export function destroyHighlightedTextFeature(): void {
  hideCardPopup(true)
  if (translatePopup && !translatePopup.isDestroyed()) {
    translatePopup.close()
  }

  if (!uIOhook || uiohookDestroyed) return
  uiohookDestroyed = true
  hookStarted = false

  try {
    uIOhook.stop?.()
  } catch (error) {
    console.warn('[highlightedText] failed to stop uiohook:', error)
  }

  try {
    uIOhook.removeAllListeners?.()
  } catch (error) {
    console.warn('[highlightedText] failed to remove uiohook listeners:', error)
  }
}

// 退出清理只注册一次，避免重复监听导致 stop/removeAllListeners 多次执行。
function registerQuitCleanup(): void {
  if (quitCleanupRegistered) return
  quitCleanupRegistered = true
  app.on('before-quit', destroyHighlightedTextFeature)
  app.on('will-quit', destroyHighlightedTextFeature)
}

// macOS 用系统脚本读取前台应用名称，用于过滤不适合展示划词条的窗口。
async function getActiveAppName(): Promise<string | null> {
  try {
    if (process.platform === 'darwin') {
      const script =
        'tell application "System Events" to get name of first application process whose frontmost is true'
      const { execFile } = await import('child_process')
      return await new Promise((resolve) => {
        execFile('osascript', ['-e', script], (_err, stdout) =>
          resolve(stdout.trim().toLowerCase() || null)
        )
      })
    }
  } catch {
    return null
  }
  return null
}

// 部分系统窗口或文件管理器里展示划词条容易干扰原生操作，这里统一过滤。
async function shouldShowForActiveApp(): Promise<boolean> {
  const appName = await getActiveAppName()
  if (!appName) return true
  return !filteredApps.has(appName)
}

// macOS 下全局鼠标键盘监听依赖辅助功能权限，初始化前先提醒用户授权。
async function macAccessibilityPermissionCheck(mainWindow: BrowserWindow | null): Promise<boolean> {
  if (process.platform !== 'darwin') return true
  try {
    const macPermissions = require('node-mac-permissions') as {
      getAuthStatus: (name: string) => string
      askForAccessibilityAccess: () => void
    }
    const permissionStatus = macPermissions.getAuthStatus('accessibility')
    if (permissionStatus === 'authorized') return true

    const options: Electron.MessageBoxOptions = {
      type: 'warning',
      title: '需要辅助功能权限',
      message: '本应用需要开启「系统设置-隐私与安全性-辅助功能」权限，才能正常使用划词功能',
      buttons: ['立即去设置', '取消'],
      defaultId: 0,
      cancelId: 1
    }
    const { response } = mainWindow
      ? await dialog.showMessageBox(mainWindow, options)
      : await dialog.showMessageBox(options)
    if (response === 0) macPermissions.askForAccessibilityAccess()
    return false
  } catch (error) {
    console.warn('[highlightedText] macOS accessibility permission check failed:', error)
    return true
  }
}

// uiohook 返回的是屏幕物理坐标，Electron 窗口使用 DIP 坐标，需要按屏幕缩放转换。
function toDipPoint(point: { x: number; y: number }): { x: number; y: number } {
  const display = screen.getDisplayNearestPoint(point)
  const scaleFactor = display.scaleFactor || 1
  return {
    x: Math.round(display.bounds.x + (point.x - display.bounds.x) / scaleFactor),
    y: Math.round(display.bounds.y + (point.y - display.bounds.y) / scaleFactor)
  }
}

// 通过模拟 Cmd/Ctrl+C 读取当前选中文本，并在完成后恢复用户原剪贴板内容。
async function getSelected(): Promise<{ text: string }> {
  if (!uIOhook || !UiohookKey) return { text: '' }
  if (ctrlDownLock) return { text: '' }

  const previousText = clipboard.readText('clipboard') || ''
  const tempEmptyMarker = `__JIAORONG_EMPTY_${Date.now()}__`
  let userCopyFlag = false
  // 先写入临时标记，后续如果还读到标记，说明目标应用没有成功复制选区文本。
  clipboard.writeText(tempEmptyMarker)

  try {
    if (ctrlDownLock) {
      if (copyFlag) {
        userCopyFlag = true
        copyFlag = false
      }
      return { text: '' }
    }

    // uiohook 的 keyTap 用于不聚焦应用窗口的情况下触发当前前台应用复制选区。
    uIOhook.keyTap(UiohookKey.C, [process.platform === 'win32' ? UiohookKey.Ctrl : UiohookKey.Meta])
    await delay(120)

    if (ctrlDownLock) {
      if (copyFlag) {
        userCopyFlag = true
        copyFlag = false
      }
      return { text: '' }
    }

    let copiedText = clipboard.readText('clipboard') || ''
    if (copiedText === tempEmptyMarker) {
      // 某些应用更新剪贴板较慢，第一次没读到时补读一次。
      await delay(120)
      copiedText = clipboard.readText('clipboard') || ''
    }
    return { text: copiedText === tempEmptyMarker ? '' : copiedText }
  } finally {
    if (!userCopyFlag) {
      clipboard.writeText(previousText)
    }
  }
}

// 开发环境走 Vite dev server，生产环境走打包后的 renderer 文件。
function buildRendererUrl(hash: string): string {
  return is.dev && process.env.ELECTRON_RENDERER_URL
    ? `${process.env.ELECTRON_RENDERER_URL}#${hash}`
    : `file://${join(__dirname, '../renderer/index.html')}#${hash}`
}

// 划词弹窗是独立 BrowserWindow，需要从主窗口读取登录 token 并同步给请求链路。
async function getMainWindowToken(): Promise<string | null> {
  const mainWindow = presenter?.windowPresenter?.mainWindow
  if (!mainWindow || mainWindow.isDestroyed()) return null
  try {
    const token = await mainWindow.webContents.executeJavaScript(
      `localStorage.getItem('xkaitoken')`,
      true
    )
    return typeof token === 'string' && token ? token : null
  } catch (error) {
    console.warn('[highlightedText] failed to read auth token:', error)
    return null
  }
}

// chat-pc 翻译应用使用 zh 作为简体中文标识，这里做一次兼容转换。
function normalizeTranslateTargetLang(locale?: string): string {
  if (!locale) return 'en'
  if (locale === 'zh-CN') return 'zh'
  return locale
}

// 迁移 chat-pc 固定翻译应用调用，不走当前会话 agent。
async function translateWithChatPcApp(text: string, locale?: string): Promise<string> {
  const query = text.trim()
  if (!query) return ''

  const fusionAuth = await getMainWindowToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json;charset=utf-8',
    Authorization: `Bearer ${CHAT_PC_TRANSLATE_APP_TOKEN}`
  }
  if (fusionAuth) {
    headers['Fusion-Auth'] = fusionAuth
  }

  const response = await fetch(`${CHAT_PC_TRANSLATE_BASE_URL}/build_agent/v1/chat-messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query,
      response_mode: 'blocking',
      inputs: {
        target_lang: normalizeTranslateTargetLang(locale)
      },
      user: 'wx'
    })
  })
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const message = data?.message || data?.msg || `HTTP ${response.status}`
    throw new Error(message)
  }

  if (data?.code && data.code !== 0 && data.code !== 200) {
    throw new Error(data.message || data.msg || `业务错误 [${data.code}]`)
  }

  const answer = data?.answer
  if (typeof answer !== 'string') {
    throw new Error('翻译服务未返回结果')
  }
  return answer.trim()
}

// CardPopup 单独使用固定 partition，需要同步主窗口 token 供弹窗内逻辑读取。
async function syncCardPopupTokenFromMain(): Promise<void> {
  if (!cardPopup || cardPopup.isDestroyed()) return
  const token = await getMainWindowToken()
  const script = token
    ? `localStorage.setItem('xkaitoken', ${JSON.stringify(token)})`
    : `localStorage.removeItem('xkaitoken')`
  await cardPopup.webContents.executeJavaScript(script, true).catch((error) => {
    console.warn('[highlightedText] sync token failed:', error)
  })
}

// macOS 上主动关闭时移动到屏幕外并透明，减少面板隐藏导致主窗口被带起的概率。
function hideCardPopup(force = false): void {
  if (!cardPopup || cardPopup.isDestroyed()) return
  if (!force && cardPopup.isFocused()) return
  if (force && process.platform === 'darwin') {
    cardPopup.setOpacity(0)
    cardPopup.setBounds(
      { x: -1000, y: -1000, width: CARD_POPUP_WIDTH, height: CARD_POPUP_HEIGHT },
      false
    )
    return
  }
  cardPopup.hide()
}

// 根据当前屏幕工作区限制 CardPopup 位置，防止弹窗出屏。
function clampCardPopupPosition(x: number, y: number): { x: number; y: number } {
  const display = screen.getDisplayNearestPoint({ x, y })
  const { workArea } = display
  return {
    x: Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - CARD_POPUP_WIDTH)),
    y: Math.max(
      workArea.y,
      Math.min(y - CARD_POPUP_HEIGHT - 8, workArea.y + workArea.height - CARD_POPUP_HEIGHT)
    )
  }
}

// CardPopup 页面加载完成后，如果之前已有待显示文本，就立即补一次显示。
function onCardPopupContentReady(): void {
  cardPopupContentReady = true
  void syncCardPopupTokenFromMain()
  const pending = pendingCardPopupShow
  if (pending) {
    pendingCardPopupShow = null
    showCardPopup(pending.x, pending.y, pending.selectedText)
  }
}

// 首次创建 CardPopup 时把文本放进 query，作为 IPC 监听未挂载时的第一层兜底。
function buildCardPopupUrl(): string {
  const query = currentCardPopupText ? `?text=${encodeURIComponent(currentCardPopupText)}` : ''
  return buildRendererUrl(`/card-popup${query}`)
}

// 创建划词操作条窗口；窗口复用，避免每次划词都重建 BrowserWindow。
function createCardPopup(): BrowserWindow {
  if (cardPopup && !cardPopup.isDestroyed()) return cardPopup

  cardPopupContentReady = false
  cardPopup = new BrowserWindow({
    type: process.platform === 'darwin' ? 'panel' : 'toolbar',
    width: CARD_POPUP_WIDTH,
    height: CARD_POPUP_HEIGHT,
    frame: false,
    transparent: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    focusable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      devTools: is.dev,
      webviewTag: false,
      partition: CARD_POPUP_SESSION_PARTITION
    }
  })

  cardPopup.on('closed', () => {
    cardPopup = null
    cardPopupContentReady = false
    currentCardPopupText = ''
  })
  cardPopup.webContents.once('did-finish-load', onCardPopupContentReady)
  void cardPopup.loadURL(buildCardPopupUrl())

  if (process.platform === 'darwin') {
    cardPopup.setVisibleOnAllWorkspaces(true)
    cardPopup.setAlwaysOnTop(true, 'floating')
  } else {
    cardPopup.setAlwaysOnTop(true)
    cardPopup.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }

  return cardPopup
}

// 给 CardPopup 推送当前文本，并延迟补发一次，覆盖首次监听注册较晚的情况。
function sendCardPopupText(selectedText: string): void {
  if (!cardPopup || cardPopup.isDestroyed()) return
  const payload = {
    text: selectedText,
    isWin: process.platform === 'win32' ? 'win' : process.platform
  }
  cardPopup.webContents.send('card-popup-text', payload)
  setTimeout(() => {
    if (!cardPopup || cardPopup.isDestroyed() || !cardPopup.isVisible()) return
    cardPopup.webContents.send('card-popup-text', payload)
  }, 80)
}

// 展示划词操作条，并保存当前文本供 renderer 主动兜底读取。
function showCardPopup(x: number, y: number, selectedText: string): void {
  currentCardPopupText = selectedText
  const popup = createCardPopup()
  if (!cardPopupContentReady) {
    pendingCardPopupShow = { x, y, selectedText }
    return
  }

  const pos = clampCardPopupPosition(x, y)
  lastCardPopupPosition = { x: pos.x, y: pos.y, height: CARD_POPUP_HEIGHT }
  popup.setBounds({ x: pos.x, y: pos.y, width: CARD_POPUP_WIDTH, height: CARD_POPUP_HEIGHT }, false)
  if (process.platform === 'darwin') {
    popup.setOpacity(1)
  }
  sendCardPopupText(selectedText)
  void syncCardPopupTokenFromMain()
  popup.showInactive()
}

// 翻译弹窗默认跟随 CardPopup 下方展示，空间不足时放到上方。
function calculateTranslatePopupPosition(): { x: number; y: number } {
  const display = screen.getDisplayNearestPoint({
    x: lastCardPopupPosition.x,
    y: lastCardPopupPosition.y
  })
  const { workArea } = display
  let y = lastCardPopupPosition.y + lastCardPopupPosition.height + 10
  if (y + TRANSLATE_POPUP_HEIGHT > workArea.y + workArea.height) {
    y = Math.max(workArea.y, lastCardPopupPosition.y - TRANSLATE_POPUP_HEIGHT - 10)
  }
  return {
    x: Math.max(
      workArea.x,
      Math.min(lastCardPopupPosition.x, workArea.x + workArea.width - TRANSLATE_POPUP_WIDTH)
    ),
    y
  }
}

// 创建翻译弹窗；首次打开时通过 query 和 IPC 双通道传递原文。
function createTranslatePopup(text: string): BrowserWindow {
  if (translatePopup && !translatePopup.isDestroyed()) return translatePopup

  const pos = calculateTranslatePopupPosition()
  translatePopupContentReady = false
  pendingTranslateText = text
  translatePopup = new BrowserWindow({
    type: process.platform === 'darwin' ? 'panel' : 'toolbar',
    width: TRANSLATE_POPUP_WIDTH,
    height: TRANSLATE_POPUP_HEIGHT,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    focusable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      devTools: is.dev,
      webviewTag: false
    }
  })

  translatePopup.on('closed', () => {
    translatePopup = null
    translatePopupContentReady = false
    pendingTranslateText = null
    currentTranslatePopupText = ''
  })
  translatePopup.webContents.once('did-finish-load', () => {
    if (!translatePopup || translatePopup.isDestroyed()) return
    translatePopupContentReady = true
    const textToSend = pendingTranslateText ?? text
    pendingTranslateText = null
    translatePopup.webContents.send('update-translation-text', textToSend)
  })
  void translatePopup.loadURL(
    buildRendererUrl(`/selection-translate?text=${encodeURIComponent(text)}`)
  )

  if (process.platform === 'darwin') {
    translatePopup.setVisibleOnAllWorkspaces(true)
    translatePopup.setAlwaysOnTop(true, 'floating')
  } else {
    translatePopup.setAlwaysOnTop(true)
    translatePopup.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }

  return translatePopup
}

// 展示翻译弹窗，并缓存当前文本，解决首次打开时 renderer 监听未就绪的问题。
function showTranslatePopup(text: string): void {
  currentTranslatePopupText = text || ''
  const win = createTranslatePopup(text)
  pendingTranslateText = text
  const pos = calculateTranslatePopupPosition()
  win.setBounds(
    { x: pos.x, y: pos.y, width: TRANSLATE_POPUP_WIDTH, height: TRANSLATE_POPUP_HEIGHT },
    false
  )
  if (translatePopupContentReady && !win.webContents.isLoading()) {
    pendingTranslateText = null
    win.webContents.send('update-translation-text', text)
  }
  win.showInactive()
  hideCardPopup(true)
}

// 仅在确实需要登录时才唤起主窗口；解释按钮不走这个逻辑。
function openLogin(): void {
  const mainWindow = presenter?.windowPresenter?.mainWindow
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  mainWindow.webContents.executeJavaScript(`window.location.hash = '/login'`, true).catch(() => {})
}

// 注册划词相关 IPC，统一给两个弹窗和 preload/runtime 使用。
function registerIpcHandlers(): void {
  if (tokenIpcRegistered) return
  tokenIpcRegistered = true

  ipcMain.handle('highlighted-text:get-token', () => getMainWindowToken())
  // renderer 首次未收到 card-popup-text 时，用这个接口主动拉取当前划词文本。
  ipcMain.handle('highlighted-text:get-current-card-popup-text', () => currentCardPopupText)
  // 翻译弹窗首次未收到 update-translation-text 时，用这个接口主动拉取原文。
  ipcMain.handle(
    'highlighted-text:get-current-translate-popup-text',
    () => currentTranslatePopupText
  )
  ipcMain.handle('highlighted-text:translate', async (_event, text: string, locale?: string) => {
    try {
      return await translateWithChatPcApp(text, locale)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[highlightedText] translate failed:', message)
      throw new Error(message || 'Translate failed')
    }
  })
  ipcMain.on('highlighted-text:show-login', openLogin)
  ipcMain.on('highlighted-text:show-translation', (_event, text: string) =>
    showTranslatePopup(text)
  )
  ipcMain.on('highlighted-text:explain', () => hideCardPopup(true))
  // 划词面板专用复制 IPC，避免复用其它业务的 clipboard-write 带出主窗口。
  ipcMain.on('highlighted-text:copy', (_event, text: string, closedCardPopup?: boolean) => {
    clipboard.writeText(text || '')
    if (closedCardPopup) hideCardPopup(true)
  })
  ipcMain.on('clipboard-write', (_event, text: string, closedCardPopup?: boolean) => {
    clipboard.writeText(text || '')
    if (closedCardPopup) hideCardPopup(true)
  })
  ipcMain.on('close-card-popup', () => hideCardPopup(true))
  ipcMain.on('close-translate', () => {
    if (translatePopup && !translatePopup.isDestroyed()) translatePopup.hide()
  })
  ipcMain.on('drag-window:start', (event, screenX: number, screenY: number) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return
    dragStartCursorPos = { x: screenX, y: screenY }
    const [x, y] = win.getPosition()
    dragStartWindowPos = { x, y }
  })
  ipcMain.on('drag-window:move', (event, screenX: number, screenY: number) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed() || !dragStartCursorPos || !dragStartWindowPos) return
    win.setPosition(
      dragStartWindowPos.x + screenX - dragStartCursorPos.x,
      dragStartWindowPos.y + screenY - dragStartCursorPos.y
    )
  })
  ipcMain.on('drag-window:end', () => {
    dragStartCursorPos = null
    dragStartWindowPos = null
  })
}

// 初始化全局划词功能：权限检查、uiohook 启动、鼠标键盘事件绑定。
export async function initHighlightedTextFeature(
  mainWindow: BrowserWindow | undefined
): Promise<boolean> {
  registerIpcHandlers()
  if (!loadUiohook() || !uIOhook || !UiohookKey) return false
  if (hookStarted) return true
  if (!(await macAccessibilityPermissionCheck(mainWindow ?? null))) return false

  registerQuitCleanup()
  uiohookDestroyed = false
  hookStarted = true
  uIOhook.start()

  const distanceThreshold = 5
  let mouseDownPos = { x: 0, y: 0 }

  // mousedown 记录拖选起点，同时处理双击取词。
  uIOhook.on('mousedown', async (event) => {
    setTimeout(() => {
      hideCardPopup()
      if (
        translatePopup &&
        !translatePopup.isDestroyed() &&
        translatePopup.isVisible() &&
        !translatePopup.isFocused()
      ) {
        translatePopup.hide()
      }
    }, 30)

    if (event.button !== 1 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
      return
    mouseDownPos = { x: event.x, y: event.y }

    if (event.clicks >= 2 && (await shouldShowForActiveApp())) {
      const text = await getSelected()
      if (hasValidContent(text.text)) {
        const dip = toDipPoint({ x: event.x, y: event.y })
        ;(globalThis as any).selectionAnchorRect = {
          x: dip.x,
          y: dip.y,
          width: 1,
          height: 24
        } satisfies SelectionRect
        showCardPopup(event.x, event.y, text.text)
      }
    }
  })

  // mouseup 根据拖动距离判断是否为划词选择，再尝试读取选中文本。
  uIOhook.on('mouseup', async (event) => {
    if (cardPopup?.isVisible()) return
    if (
      event.button !== 1 ||
      event.clicks >= 2 ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey
    )
      return

    const dx = event.x - mouseDownPos.x
    const dy = event.y - mouseDownPos.y
    if (Math.sqrt(dx * dx + dy * dy) <= distanceThreshold) return
    if (!(await shouldShowForActiveApp())) return

    const text = await getSelected()
    if (!hasValidContent(text.text)) return

    const selLeft = Math.min(mouseDownPos.x, event.x)
    const selTop = Math.min(mouseDownPos.y, event.y)
    const selRight = Math.max(mouseDownPos.x, event.x)
    const selBottom = Math.max(mouseDownPos.y, event.y)
    const tl = toDipPoint({ x: selLeft, y: selTop })
    const br = toDipPoint({ x: selRight, y: selBottom })
    ;(globalThis as any).selectionAnchorRect = {
      x: tl.x,
      y: tl.y,
      width: Math.max(1, br.x - tl.x),
      height: Math.max(1, br.y - tl.y)
    } satisfies SelectionRect
    showCardPopup(selLeft, selTop, text.text)
  })

  uIOhook.on('wheel', () => hideCardPopup())

  let downTime = 0
  // 用户真实键盘操作时关闭划词条，避免模拟复制与用户复制/快捷键互相干扰。
  uIOhook.on('keydown', (event) => {
    if (event.keycode === CTRL_KEYCODE) {
      downTime = Date.now()
      ctrlDownLock = true
    }

    const commandFlag = platform() === 'darwin' ? event.metaKey : event.ctrlKey
    if (commandFlag && event.keycode !== CTRL_KEYCODE) {
      if (Date.now() - downTime <= 50) return
      if (event.keycode === 46 || event.keycode === 45) copyFlag = true
      ctrlDownLock = true
      hideCardPopup()
      return
    }

    if (event.keycode !== CTRL_KEYCODE) hideCardPopup()
  })

  // 释放 Ctrl/Command 后允许下一次模拟复制继续执行。
  uIOhook.on('keyup', (event) => {
    if (event.keycode === CTRL_KEYCODE) {
      ctrlDownLock = false
      downTime = 0
    }
  })

  return true
}
