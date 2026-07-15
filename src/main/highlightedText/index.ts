import { app, BrowserWindow, clipboard, ipcMain, screen } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'path'
import { presenter } from '@/presenter'
import type { UiohookApi } from './contracts/types'
import { checkAccessibilityPermission } from './input/accessibility'
import { registerSelectionListeners } from './input/registerSelectionListeners'
import { loadUiohookRuntime } from './input/uiohookRuntime'
import { toDipPoint } from './windows/windowUtils'

const CARD_POPUP_SESSION_PARTITION = 'card-popup-fixed'
const CARD_POPUP_WIDTH = 242
const CARD_POPUP_HEIGHT = 32
const TRANSLATE_POPUP_WIDTH = 320
const TRANSLATE_POPUP_HEIGHT = 360
const CHAT_PC_TRANSLATE_BASE_URL = 'https://c4ai.ccccltd.cn'
const TRANSLATE_AGENT_ID = 'ctzvuyfju16txq4iie9e'
const TRANSLATE_PRODUCT_ID = 'f5831af6faf190db5f9818a1ab71d68c'
// const CHAT_PC_TRANSLATE_APP_TOKEN = 'app-1r0huW0p1XuzPhTX7uC8xTTJ'

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
// 每个弹窗独立保存拖拽起点和完整边界；移动时固定宽高，避免 Windows DPI 校正导致尺寸漂移。
const windowDragStates = new Map<
  number,
  { startCursor: { x: number; y: number }; startBounds: Electron.Rectangle }
>()
let lastCardPopupPosition = { x: 0, y: 0, height: CARD_POPUP_HEIGHT }
let tokenIpcRegistered = false
let quitCleanupRegistered = false
let uiohookDestroyed = false
let highlightInputSuspendDepth = 0

// 应用退出或辅助功能权限变化时强制释放 uiohook，降低系统卡死风险。
export function destroyHighlightedTextFeature(): void {
  if (cardPopup && !cardPopup.isDestroyed()) {
    cardPopup.close()
  }
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

/** Windows 系统模态对话框打开期间暂停划词监听。 */
export const setHighlightInputSuspended = (suspended: boolean): void => {
  if (process.platform !== 'win32') return
  highlightInputSuspendDepth = suspended
    ? highlightInputSuspendDepth + 1
    : Math.max(0, highlightInputSuspendDepth - 1)
}

/** 在 Windows 系统模态操作期间临时暂停划词，支持嵌套调用。 */
export const withHighlightInputSuspended = async <T>(fn: () => Promise<T>): Promise<T> => {
  if (process.platform !== 'win32') return fn()
  setHighlightInputSuspended(true)
  try {
    return await fn()
  } finally {
    setHighlightInputSuspended(false)
  }
}

const isHighlightInputSuspended = (): boolean =>
  process.platform === 'win32' && highlightInputSuspendDepth > 0

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

/* 旧版 Dify 翻译接口暂时停用，保留代码方便需要时快速回退。
async function translateWithChatPcAppLegacy(text: string, locale?: string): Promise<string> {
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
*/

/** 从创建会话接口的兼容响应结构中读取会话 ID。 */
function getCreatedSessionId(payload: any): string {
  const data = payload?.data ?? payload
  const sessionId =
    data?.chatSessionId ?? data?.conversation_id ?? data?.conversationId ?? data?.sessionId
  return typeof sessionId === 'string' ? sessionId : ''
}

/** 解析 streamChat 返回的 SSE 数据，并拼接模型的 cmpl 增量内容。 */
async function readTranslationStream(response: Response): Promise<string> {
  if (!response.body) throw new Error('翻译服务未返回数据流')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let answer = ''

  const consumeEvent = (rawEvent: string): void => {
    const data = rawEvent
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
    if (!data || data === '[DONE]') return

    let message: any
    try {
      message = JSON.parse(data)
    } catch {
      return
    }
    if (message?.event === 'cmpl' && message?.service !== 'recommend_question') {
      answer += message?.choices?.[0]?.delta?.content || ''
    } else if (message?.event === 'stop' && !answer) {
      answer = message?.message || ''
    } else if (message?.event === 'error') {
      throw new Error(message?.message || message?.text || '翻译流返回错误')
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const events = buffer.split(/\r?\n\r?\n/)
    buffer = events.pop() || ''
    events.forEach(consumeEvent)
    if (done) break
  }
  if (buffer.trim()) consumeEvent(buffer)
  if (!answer.trim()) throw new Error('翻译服务未返回结果')
  return answer.trim()
}

/** 创建翻译智能体会话，再通过 streamChat 获取完整译文。 */
async function translateWithChatPcApp(text: string, locale?: string): Promise<string> {
  const query = text.trim()
  if (!query) return ''
  const fusionAuth = await getMainWindowToken()
  if (!fusionAuth) throw new Error('登录状态已失效，请重新登录')

  const commonHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'Fusion-Auth': fusionAuth
  }
  const prompt = `请将以下内容翻译成 ${normalizeTranslateTargetLang(locale)}，只返回译文：\n${query}`
  const createResponse = await fetch(
    `${CHAT_PC_TRANSLATE_BASE_URL}/api/fusion-ai/chatSession/create`,
    {
      method: 'POST',
      headers: {
        ...commonHeaders,
        Accept: 'application/json, text/plain, */*',
        'Product-Id': TRANSLATE_PRODUCT_ID
      },
      body: JSON.stringify({
        chatSessionName: query.slice(0, 25) || '翻译一段文字',
        agentId: TRANSLATE_AGENT_ID
      })
    }
  )
  const createData = await createResponse.json().catch(() => null)
  if (!createResponse.ok) {
    throw new Error(
      createData?.message || createData?.msg || `创建翻译会话失败 [${createResponse.status}]`
    )
  }
  const conversationId = getCreatedSessionId(createData)
  if (!conversationId) throw new Error('创建翻译会话后未返回会话 ID')

  const streamResponse = await fetch(
    `${CHAT_PC_TRANSLATE_BASE_URL}/api/fusion-ai/chat/streamChat`,
    {
      method: 'POST',
      headers: { ...commonHeaders, Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        conversation_id: conversationId,
        messages: [{ content: prompt, role: 'user' }],
        services: {
          use_filechat: false,
          use_recommend: false,
          use_cot: false,
          use_search: false,
          use_stream: true
        },
        userInfo: {
          status: 0,
          career: null,
          businessArea: null,
          age: null,
          flats: null,
          sex: null,
          position: null,
          degree: null,
          hobby: null,
          description: null
        },
        agentId: TRANSLATE_AGENT_ID
      })
    }
  )
  if (!streamResponse.ok) {
    const message = await streamResponse.text().catch(() => '')
    throw new Error(message || `翻译请求失败 [${streamResponse.status}]`)
  }
  return readTranslationStream(streamResponse)
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
  const dipPoint = toDipPoint({ x, y })
  const display = screen.getDisplayNearestPoint(dipPoint)
  const { workArea } = display
  const right = workArea.x + workArea.width
  const bottom = workArea.y + workArea.height
  const gapAbove = 20
  const gapBelowWhenNoRoomAbove = 10
  let popupX = dipPoint.x
  let popupY = dipPoint.y - CARD_POPUP_HEIGHT - gapAbove
  if (popupY < workArea.y) popupY = dipPoint.y + gapBelowWhenNoRoomAbove
  return {
    x: Math.round(Math.max(workArea.x, Math.min(popupX, right - CARD_POPUP_WIDTH))),
    y: Math.round(Math.max(workArea.y, Math.min(popupY, bottom - CARD_POPUP_HEIGHT)))
  }
}

/** 固定划词工具条 zoom，避免与同源主窗口共享缩放状态。 */
function lockCardPopupRender(): void {
  if (!cardPopup || cardPopup.isDestroyed()) return
  try {
    cardPopup.webContents.setVisualZoomLevelLimits(1, 1)
  } catch {
    // ignore unsupported zoom limit errors
  }
  cardPopup.webContents.setZoomFactor(1)
}

/** 延迟重设尺寸，抵消窗口显示后由系统 DPI 引起的边界变化。 */
function scheduleCardPopupBoundsSync(bounds: Electron.Rectangle): void {
  const sync = (): void => {
    if (!cardPopup || cardPopup.isDestroyed()) return
    cardPopup.setBounds(bounds, false)
    lockCardPopupRender()
  }
  setImmediate(sync)
  setTimeout(sync, 50)
}

// CardPopup 页面加载完成后，如果之前已有待显示文本，就立即补一次显示。
function onCardPopupContentReady(): void {
  cardPopupContentReady = true
  lockCardPopupRender()
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
    useContentSize: true,
    width: CARD_POPUP_WIDTH,
    height: CARD_POPUP_HEIGHT,
    x: -1000,
    y: -1000,
    minWidth: CARD_POPUP_WIDTH,
    maxWidth: CARD_POPUP_WIDTH,
    minHeight: CARD_POPUP_HEIGHT,
    maxHeight: CARD_POPUP_HEIGHT,
    frame: false,
    transparent: process.platform !== 'win32',
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    show: false,
    focusable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      devTools: is.dev,
      webviewTag: false,
      partition: CARD_POPUP_SESSION_PARTITION,
      zoomFactor: 1
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
    cardPopup.setAlwaysOnTop(true, 'pop-up-menu')
  } else {
    cardPopup.setAlwaysOnTop(true)
    cardPopup.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }

  return cardPopup
}

// 给已就绪的 CardPopup 推送当前文本；首次加载由 pending/query/cache 三层机制兜底。
function sendCardPopupText(selectedText: string): void {
  if (!cardPopup || cardPopup.isDestroyed()) return
  const payload = {
    text: selectedText,
    isWin: process.platform === 'win32' ? 'win' : process.platform
  }
  cardPopup.webContents.send('card-popup-text', payload)
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
  const bounds = { x: pos.x, y: pos.y, width: CARD_POPUP_WIDTH, height: CARD_POPUP_HEIGHT }
  popup.setBounds(bounds, false)
  lockCardPopupRender()
  if (process.platform === 'darwin') {
    popup.setOpacity(1)
  }
  sendCardPopupText(selectedText)
  void syncCardPopupTokenFromMain()
  popup.showInactive()
  if (process.platform === 'win32') {
    popup.setOpacity(0)
    setTimeout(() => {
      if (!popup.isDestroyed()) popup.moveTop()
    }, 50)
    popup.setOpacity(1)
  }
  scheduleCardPopupBoundsSync(bounds)
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
    windowDragStates.set(win.id, {
      startCursor: { x: screenX, y: screenY },
      startBounds: win.getBounds()
    })
  })
  ipcMain.on('drag-window:move', (event, screenX: number, screenY: number) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return
    const state = windowDragStates.get(win.id)
    if (!state) return
    win.setBounds(
      {
        x: Math.round(state.startBounds.x + screenX - state.startCursor.x),
        y: Math.round(state.startBounds.y + screenY - state.startCursor.y),
        width: state.startBounds.width,
        height: state.startBounds.height
      },
      false
    )
  })
  ipcMain.on('drag-window:end', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    windowDragStates.delete(win.id)
  })
}

/** 点击其它位置时关闭未聚焦的关联翻译窗口。 */
const handleAssociatedWindowClose = (): void => {
  if (
    translatePopup &&
    !translatePopup.isDestroyed() &&
    translatePopup.isVisible() &&
    !translatePopup.isFocused()
  ) {
    translatePopup.hide()
  }
}

// 初始化全局划词功能：权限检查、uiohook 启动、鼠标键盘事件绑定。
export async function initHighlightedTextFeature(
  mainWindow: BrowserWindow | undefined
): Promise<boolean> {
  const initStartedAt = Date.now()
  console.info(`[highlightedText] initialization begin platform=${process.platform}`)
  registerIpcHandlers()

  const runtimeStartedAt = Date.now()
  console.info('[highlightedText] runtime load begin')
  const runtime = loadUiohookRuntime()
  console.info(`[highlightedText] runtime load done elapsed=${Date.now() - runtimeStartedAt}ms`)
  if (!runtime) {
    console.warn('[highlightedText] initialization skipped: runtime unavailable')
    return false
  }
  uIOhook = runtime.hook
  UiohookKey = runtime.keys
  const hook = uIOhook
  const keys = UiohookKey
  if (hookStarted) {
    console.info('[highlightedText] initialization skipped: hook already started')
    return true
  }

  const permissionStartedAt = Date.now()
  console.info('[highlightedText] accessibility permission check begin')
  const hasPermission = await checkAccessibilityPermission(mainWindow ?? null)
  console.info(
    `[highlightedText] accessibility permission check done allowed=${hasPermission} elapsed=${Date.now() - permissionStartedAt}ms`
  )
  if (!hasPermission) {
    console.warn('[highlightedText] initialization skipped: accessibility permission denied')
    return false
  }

  registerQuitCleanup()
  uiohookDestroyed = false
  hookStarted = true

  const hookStartedAt = Date.now()
  console.info('[highlightedText] uiohook start begin')
  uIOhook.start()
  console.info(`[highlightedText] uiohook start done elapsed=${Date.now() - hookStartedAt}ms`)

  console.info('[highlightedText] selection listener registration begin')
  registerSelectionListeners({
    hook,
    keys,
    isInputSuspended: isHighlightInputSuspended,
    isCardPopupVisible: () => Boolean(cardPopup?.isVisible()),
    hideCardPopup,
    closeAssociatedWindows: handleAssociatedWindowClose,
    showCardPopup
  })
  console.info('[highlightedText] selection listener registration done')
  console.info(`[highlightedText] initialization done elapsed=${Date.now() - initStartedAt}ms`)

  return true
}
