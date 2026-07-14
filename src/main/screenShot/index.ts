import {
  app,
  BrowserWindow,
  clipboard,
  globalShortcut,
  ipcMain,
  nativeImage,
  screen
} from 'electron'
import { is } from '@electron-toolkit/utils'
import { createRequire } from 'node:module'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  SCREENSHOT_IPC,
  type ExportSelectionBaseRequest,
  type ScreenshotStartupSource
} from './screenshot-ipc'
import { systemShortcutKey } from '../presenter/configPresenter/shortcutKeySettings'
import {
  clearSessionCaptureCache,
  getSessionCaptureCache,
  setSessionCaptureCache,
  type SessionCaptureCachePayload
} from './sessionCaptureCache'
import { exportSelectionBaseFromCache } from './sessionExport'

const require = createRequire(import.meta.url)
const NodeScreenshots = require('node-screenshots') as {
  Monitor: {
    all: () => NodeScreenshotMonitor[]
  }
}
const { createWorker } = require('tesseract.js') as {
  createWorker: (...args: unknown[]) => Promise<{
    recognize: (image: Buffer | Uint8Array | string) => Promise<{ data?: { text?: string } }>
    terminate: () => Promise<void>
  }>
}

type NodeScreenshotMonitor = {
  id: () => number
  name: () => string
  captureImage: () => Promise<{
    width: number
    height: number
    toRaw: () => Promise<Uint8Array | Buffer>
  }>
}

type ScreenCaptureConfig = {
  x: string
  y: string
  width: string
  height: string
}

type ScreenshotPayload = {
  uint8?: number[] | Uint8Array
  width?: number
  height?: number
  x?: number
  y?: number
  anchorRect?: { x: number; y: number; width: number; height: number }
  selectionRect?: { x: number; y: number; width: number; height: number }
}

type ScreenshotRect = NonNullable<ScreenshotPayload['selectionRect']>

type RgbaFrame = {
  uint8: Uint8Array
  width: number
  height: number
}

type CapturedDisplayFrame = {
  display: Electron.Display
  frame: RgbaFrame
}

type ScreenshotAction =
  | 'ocr-rec'
  | 'ask-by-pic'
  | 'ask-by-pic-new'
  | 'pin-by-pic'
  | 'summary'
  | 'extract-table'
  | 'solve-problem'

type MainWindowTokenReader = () => Promise<string | null>
type ScreenshotShortcutReader = () => string | undefined
type OcrResultWindowPayload = {
  imageBase64: string
  text: string
  empty: boolean
  message: string
  loading?: boolean
}
type PinByPicImagePayload = {
  imageBase64: string
}

let screenshotWindow: BrowserWindow | null = null
let screenshotWindowReady = false
let screenshotActivationStarted = false
let currentSessionLogPath: string | null = null
let currentSessionStartedAt = 0
let tokenReader: MainWindowTokenReader | null = null
let screenshotShortcutReader: ScreenshotShortcutReader | null = null
let ipcRegistered = false
const ocrResultPayloads = new Map<number, OcrResultWindowPayload>()
const pinByPicPayloads = new Map<number, PinByPicImagePayload>()
const ocrResultWindows = new Set<BrowserWindow>()
const pinByPicWindows = new Set<BrowserWindow>()

export const DEFAULT_SCREENSHOT_SHORTCUT = systemShortcutKey.Screenshot
const OCR_RESULT_WINDOW_WIDTH = 665
const OCR_RESULT_WINDOW_HEIGHT = 520
const OCR_EMPTY_MESSAGE = '未识别到文字，当前仅支持中文或英文内容。'

const formatLogValue = (value: unknown): string => {
  if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack ?? ''}`
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

const getScreenshotLogRoot = (): string => {
  try {
    return join(app.getPath('logs'), 'screenshot')
  } catch {
    return join(process.cwd(), 'logs', 'screenshot')
  }
}

const getScreenshotDebugLogPath = (): string => join(getScreenshotLogRoot(), 'screenshot-debug.log')
const getScreenshotInitLogPath = (): string => join(getScreenshotLogRoot(), 'app-init.log')

const writeScreenshotLog = (
  level: 'log' | 'warn' | 'error',
  tag: string,
  ...args: unknown[]
): void => {
  const root = getScreenshotLogRoot()
  const source = tag.startsWith('renderer') ? 'renderer' : 'main'
  const normalizedTag = tag.startsWith('renderer:') ? tag.slice('renderer:'.length) : tag
  const line = `[${formatTimestamp()}] [${level}] [${source}] ${normalizedTag} ${args.map(formatLogValue).join(' ')}\n`
  try {
    mkdirSync(root, { recursive: true })
    appendFileSync(getScreenshotDebugLogPath(), line)
    if (currentSessionLogPath) {
      appendFileSync(currentSessionLogPath, line)
    }
  } catch (error) {
    console.error('[screenShot] failed to write screenshot log:', error)
  }
}

const formatTimestamp = (): string => {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(
    now.getMinutes()
  )}:${pad(now.getSeconds())}.${String(now.getMilliseconds()).padStart(3, '0')}`
}

const formatSessionTimestamp = (): string => {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(
    now.getMinutes()
  )}-${pad(now.getSeconds())}-${String(now.getMilliseconds()).padStart(3, '0')}`
}

const writeScreenshotLogSeparator = (kind: 'session' | 'phase', label: string): void => {
  const line = kind === 'session' ? '='.repeat(60) : '-'.repeat(60)
  const block = `\n${line}\n[${formatTimestamp()}] ${label}\n${line}\n`
  try {
    mkdirSync(getScreenshotLogRoot(), { recursive: true })
    appendFileSync(getScreenshotDebugLogPath(), block)
    if (currentSessionLogPath) appendFileSync(currentSessionLogPath, block)
  } catch (error) {
    console.error('[screenShot] failed to write screenshot separator:', error)
  }
}

const startScreenshotLogSession = (source: ScreenshotStartupSource): void => {
  const root = getScreenshotLogRoot()
  const stamp = formatSessionTimestamp()
  currentSessionLogPath = join(root, 'sessions', `screenshot-${stamp}_${source}.log`)
  currentSessionStartedAt = Date.now()
  try {
    mkdirSync(join(root, 'sessions'), { recursive: true })
    writeFileSync(join(root, 'latest-session.txt'), `${currentSessionLogPath}\n`)
  } catch (error) {
    console.error('[screenShot] failed to start screenshot log session:', error)
  }
  writeScreenshotLog('log', 'session-log', `path=${currentSessionLogPath}`, `source=${source}`)
  writeScreenshotLogSeparator('session', `SESSION START  source=${source}`)
  writeScreenshotLogSeparator('phase', 'PHASE  window')
}

const getSessionCost = (): string =>
  currentSessionStartedAt ? `${Date.now() - currentSessionStartedAt}ms` : 'n/a'

const getAllDisplayBounds = () => {
  const displays = screen.getAllDisplays().sort((a, b) => {
    if (a.bounds.x !== b.bounds.x) return a.bounds.x - b.bounds.x
    return a.bounds.y - b.bounds.y
  })
  const x = Math.min(...displays.map((display) => display.bounds.x))
  const y = Math.min(...displays.map((display) => display.bounds.y))
  const maxX = Math.max(...displays.map((display) => display.bounds.x + display.bounds.width))
  const maxY = Math.max(...displays.map((display) => display.bounds.y + display.bounds.height))
  return { x, y, width: maxX - x, height: maxY - y, displays }
}

const getDisplayCaptureScale = (display: Electron.Display): number =>
  Math.min(Math.max(display.scaleFactor || 1, 1), 3)

// 单屏场景用原生像素 backing，避免 Retina 屏截图蒙版被 DIP 画布放大后发糊。
const shouldUseNativePixelCanvas = (union: ReturnType<typeof getAllDisplayBounds>): boolean =>
  union.displays.length <= 1 && (process.platform === 'darwin' || process.platform === 'win32')

const getPreviewCanvasSize = (union: ReturnType<typeof getAllDisplayBounds>) => {
  if (!shouldUseNativePixelCanvas(union)) {
    return { canvasWidth: union.width, canvasHeight: union.height }
  }
  const display = union.displays[0]
  const scale = display ? getDisplayCaptureScale(display) : 1
  return {
    canvasWidth: Math.max(1, Math.round(union.width * scale)),
    canvasHeight: Math.max(1, Math.round(union.height * scale))
  }
}

const resolveFramePlacement = (
  display: Electron.Display,
  union: ReturnType<typeof getAllDisplayBounds>
) => {
  const relX = display.bounds.x - union.x
  const relY = display.bounds.y - union.y
  if (!shouldUseNativePixelCanvas(union)) {
    return {
      x: relX,
      y: relY,
      destWidth: display.bounds.width,
      destHeight: display.bounds.height
    }
  }
  const scale = getDisplayCaptureScale(display)
  return {
    x: Math.round(relX * scale),
    y: Math.round(relY * scale),
    destWidth: Math.round(display.bounds.width * scale),
    destHeight: Math.round(display.bounds.height * scale)
  }
}

// tools-gui 后续需要从本次截图会话导出选区底图，所以这里保存每个屏幕 tile。
const storeSessionCaptureCache = (
  union: ReturnType<typeof getAllDisplayBounds>,
  canvasWidth: number,
  canvasHeight: number,
  frames: CapturedDisplayFrame[]
): void => {
  const scaleFactor = Math.max(...union.displays.map(getDisplayCaptureScale), 1)
  const payload: SessionCaptureCachePayload = {
    canvasWidth,
    canvasHeight,
    union: {
      x: union.x,
      y: union.y,
      width: union.width,
      height: union.height,
      scaleFactor
    },
    layoutMode: shouldUseNativePixelCanvas(union) ? 'packed-native' : 'union-dip',
    frames: frames.map(({ display, frame }) => {
      const placement = resolveFramePlacement(display, union)
      return {
        displayId: display.id,
        x: placement.x,
        y: placement.y,
        width: frame.width,
        height: frame.height,
        destWidth: placement.destWidth,
        destHeight: placement.destHeight,
        uint8: frame.uint8
      }
    }),
    capturedAt: Date.now()
  }
  setSessionCaptureCache(payload)
  writeScreenshotLog('log', 'session-cache', 'stored capture tiles', {
    tiles: payload.frames.length,
    canvas: `${canvasWidth}x${canvasHeight}`,
    layoutMode: payload.layoutMode,
    union: payload.union
  })
}

const serializeSessionCaptureCache = (cache: SessionCaptureCachePayload) => ({
  canvasWidth: cache.canvasWidth,
  canvasHeight: cache.canvasHeight,
  union: cache.union,
  layoutMode: cache.layoutMode,
  capturedAt: cache.capturedAt,
  frames: cache.frames.map((tile) => ({
    ...tile,
    uint8: Buffer.from(tile.uint8)
  }))
})

const getDisplayMetricsPayload = () => {
  const union = getAllDisplayBounds()
  const scaleFactor = Math.max(...union.displays.map(getDisplayCaptureScale), 1)
  const { canvasWidth, canvasHeight } = getPreviewCanvasSize(union)
  return {
    x: union.x,
    y: union.y,
    width: union.width,
    height: union.height,
    canvasWidth,
    canvasHeight,
    scaleFactor,
    layoutMode: shouldUseNativePixelCanvas(union)
      ? ('packed-native' as const)
      : ('union-dip' as const),
    mixedDpiExport: false,
    displays: union.displays.map((display) => ({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      captureScale: getDisplayCaptureScale(display)
    }))
  }
}

const getScreenshotHtmlPath = (): string => {
  if (is.dev) {
    return join(app.getAppPath(), 'resources/screen-shot/index.html')
  }
  return join(process.resourcesPath, 'app.asar.unpacked/resources/screen-shot/index.html')
}

const getPreloadPath = (): string => join(__dirname, '../preload/index.mjs')

const getRendererHtmlPath = (): string => join(__dirname, '../renderer/index.html')

// OCR 和钉图复用当前应用 renderer 路由；dev/prod 的加载路径和主窗口保持一致。
const loadRendererRoute = (win: BrowserWindow, hash: string): void => {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${hash}`).catch((error) => {
      writeScreenshotLog('error', 'window', `load renderer route failed ${hash}`, error)
    })
    return
  }
  win.loadFile(getRendererHtmlPath(), { hash }).catch((error) => {
    writeScreenshotLog('error', 'window', `load renderer route failed ${hash}`, error)
  })
}

const getTessdataPath = (): string => {
  if (is.dev) {
    return join(app.getAppPath(), 'resources')
  }
  return join(process.resourcesPath, 'app.asar.unpacked/resources')
}

const alignScreenshotWindow = (): void => {
  if (!screenshotWindow || screenshotWindow.isDestroyed()) return
  const { x, y, width, height } = getAllDisplayBounds()
  screenshotWindow.setBounds({ x, y, width, height }, false)
  screenshotWindow.setResizable(false)
  screenshotWindow.setMovable(false)
}

// 截图 dist 初始化依赖这条 mark：renderer 收到后才开始抓屏、布局和绘制蒙版。
const pushStartupMark = (source: ScreenshotStartupSource): void => {
  if (!screenshotWindow || screenshotWindow.isDestroyed()) return
  const payload = {
    wallMs: Date.now(),
    source,
    metrics: getDisplayMetricsPayload()
  }
  screenshotWindow.webContents.send(SCREENSHOT_IPC.STARTUP_MARK, payload)
  writeScreenshotLog('log', 'startup', 'startup-mark sent', {
    source,
    cost: getSessionCost(),
    metrics: payload.metrics
  })
}

// 先隐藏且 opacity=0，等 renderer 回报 ready/reveal 后再显示，避免用户看到半成品蒙版。
const prepareScreenshotWindow = (): void => {
  if (!screenshotWindow || screenshotWindow.isDestroyed()) return
  alignScreenshotWindow()
  if (process.platform === 'darwin') {
    screenshotWindow.setVisibleOnAllWorkspaces(true)
  } else {
    screenshotWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }
  screenshotWindow.setAlwaysOnTop(true, 'screen-saver')
  screenshotWindow.setOpacity(0)
  writeScreenshotLog('log', 'window', 'prepared hidden window', {
    cost: getSessionCost(),
    bounds: screenshotWindow.getBounds(),
    visible: screenshotWindow.isVisible()
  })
}

const startScreenshotSession = (source: ScreenshotStartupSource): void => {
  if (!screenshotWindow || screenshotWindow.isDestroyed()) return
  clearSessionCaptureCache()
  prepareScreenshotWindow()
  writeScreenshotLog('log', 'startup', 'schedule startup-mark', { source, cost: getSessionCost() })
  setTimeout(() => pushStartupMark(source), 100)
}

// chat-pc 的截图页在 session-ready 后先展示透明窗口，让 renderer 有一帧时间稳定布局。
const presentScreenshotWindow = (): void => {
  if (!screenshotWindow || screenshotWindow.isDestroyed()) return
  prepareScreenshotWindow()
  if (process.platform === 'darwin') {
    screenshotWindow.showInactive()
  } else {
    screenshotWindow.show()
  }
  screenshotWindow.focus()
  writeScreenshotLog('log', 'window', 'presented after renderer ready', {
    cost: getSessionCost(),
    bounds: screenshotWindow.getBounds(),
    opacity: screenshotWindow.getOpacity()
  })
}

// renderer 确认首帧绘制完成后再恢复 opacity，减少截图窗口闪白或工具栏先露出的问题。
const revealScreenshotWindow = (): void => {
  if (!screenshotWindow || screenshotWindow.isDestroyed()) return
  screenshotWindow.setOpacity(1)
  screenshotWindow.focus()
  writeScreenshotLog('log', 'window', 'revealed', {
    cost: getSessionCost(),
    bounds: screenshotWindow.getBounds(),
    opacity: screenshotWindow.getOpacity()
  })
}

export const openScreenShotWindow = (source: ScreenshotStartupSource = 'ipc'): void => {
  startScreenshotLogSession(source)
  writeScreenshotLog('log', 'trigger', 'openScreenShotWindow called', {
    source,
    hasWindow: !!screenshotWindow && !screenshotWindow.isDestroyed(),
    ready: screenshotWindowReady
  })
  if (screenshotWindow && !screenshotWindow.isDestroyed() && screenshotWindowReady) {
    // 复用已加载的截图 dist，避免每次快捷键都重新加载 preload 和 tools-gui bundle。
    screenshotWindow.hide()
    screenshotActivationStarted = false
    writeScreenshotLog('log', 'window', 'reuse existing window', { cost: getSessionCost() })
    startScreenshotSession(source)
    return
  }

  const { x, y, width, height } = getAllDisplayBounds()
  screenshotWindowReady = false
  screenshotActivationStarted = false
  writeScreenshotLog('log', 'window', 'create BrowserWindow', {
    source,
    bounds: { x, y, width, height },
    html: getScreenshotHtmlPath(),
    preload: getPreloadPath()
  })
  screenshotWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    fullscreen: false,
    fullscreenable: false,
    enableLargerThanScreen: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: getPreloadPath(),
      sandbox: false,
      contextIsolation: true,
      zoomFactor: 1
    }
  })

  const activateWhenLoaded = (): void => {
    if (!screenshotWindow || screenshotWindow.isDestroyed() || screenshotActivationStarted) return
    screenshotActivationStarted = true
    screenshotWindowReady = true
    writeScreenshotLog('log', 'window', 'activate loaded screenshot window', {
      cost: getSessionCost(),
      url: screenshotWindow.webContents.getURL()
    })
    startScreenshotSession(source)
  }

  screenshotWindow.webContents.setVisualZoomLevelLimits(1, 1)
  screenshotWindow.once('ready-to-show', () => {
    writeScreenshotLog('log', 'window', 'ready-to-show', { cost: getSessionCost() })
  })
  screenshotWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const logLevel = level >= 2 ? 'error' : level === 1 ? 'warn' : 'log'
    writeScreenshotLog(logLevel, 'renderer:console', { message, line, sourceId })
  })
  screenshotWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    writeScreenshotLog('error', 'window', 'preload-error', { preloadPath, error })
  })
  screenshotWindow.webContents.once('did-finish-load', () => {
    writeScreenshotLog('log', 'window', 'did-finish-load', {
      cost: getSessionCost(),
      url: screenshotWindow?.webContents.getURL()
    })
    activateWhenLoaded()
  })
  screenshotWindow.webContents.once('did-fail-load', (_event, errorCode, errorDescription) => {
    writeScreenshotLog('error', 'window', 'did-fail-load', { errorCode, errorDescription })
    console.error('[screenShot] failed to load screenshot UI:', errorCode, errorDescription)
  })
  screenshotWindow.webContents.once('render-process-gone', (_event, details) => {
    writeScreenshotLog('error', 'window', 'render-process-gone', details)
    console.error('[screenShot] screenshot UI render process gone:', details)
  })
  screenshotWindow.on('closed', () => {
    writeScreenshotLog('log', 'window', 'closed', { cost: getSessionCost() })
    screenshotWindow = null
    screenshotWindowReady = false
    screenshotActivationStarted = false
  })
  screenshotWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      event.preventDefault()
      closeScreenshotWindow()
    }
  })
  screenshotWindow.loadFile(getScreenshotHtmlPath(), { hash: '/screen-shot' }).catch((error) => {
    writeScreenshotLog('error', 'window', 'loadFile rejected', error)
    console.error('[screenShot] failed to load screenshot UI:', error)
  })
}

const closeScreenshotWindow = (): void => {
  if (!screenshotWindow || screenshotWindow.isDestroyed()) return
  writeScreenshotLog('log', 'window', 'closeScreenshotWindow', { cost: getSessionCost() })
  screenshotWindow.webContents.send(SCREENSHOT_IPC.SESSION_DISMISS)
  if (process.platform === 'darwin') {
    // macOS 截图窗口跨桌面显示后要恢复 Dock，否则应用图标可能从 Dock/任务切换里消失。
    screenshotWindow.setVisibleOnAllWorkspaces(false)
    app.dock?.show()
  }
  screenshotWindow.setOpacity(0)
  screenshotWindow.hide()
  screenshotActivationStarted = false
}

const rgbaToNativeImage = (
  rgba: Uint8Array,
  width: number,
  height: number
): Electron.NativeImage => {
  const bgra = Buffer.allocUnsafe(rgba.length)
  for (let i = 0; i < rgba.length; i += 4) {
    bgra[i] = rgba[i + 2]
    bgra[i + 1] = rgba[i + 1]
    bgra[i + 2] = rgba[i]
    bgra[i + 3] = rgba[i + 3]
  }
  return nativeImage.createFromBitmap(bgra, { width, height })
}

const sortDisplaysByPosition = (displays: Electron.Display[]): Electron.Display[] =>
  [...displays].sort((a, b) => {
    if (a.bounds.x !== b.bounds.x) return a.bounds.x - b.bounds.x
    return a.bounds.y - b.bounds.y
  })

const findMonitorForDisplay = (
  monitors: NodeScreenshotMonitor[],
  display: Electron.Display,
  displayIndex: number
): NodeScreenshotMonitor | undefined => {
  return (
    monitors.find((monitor) => monitor.id() === display.id) ??
    monitors.find((monitor) => monitor.name().startsWith(`screen:${display.id}:`)) ??
    monitors[displayIndex]
  )
}

const captureMonitorFrame = async (monitor: NodeScreenshotMonitor): Promise<RgbaFrame> => {
  const startedAt = Date.now()
  writeScreenshotLog('log', 'capture', 'capture monitor start', {
    id: monitor.id(),
    name: monitor.name(),
    cost: getSessionCost()
  })
  const image = await monitor.captureImage()
  const raw = await image.toRaw()
  const bytes = raw as Uint8Array
  const frame = {
    uint8: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    width: image.width,
    height: image.height
  }
  writeScreenshotLog('log', 'capture', 'capture monitor done', {
    id: monitor.id(),
    raw: `${image.width}x${image.height}`,
    frame: `${frame.width}x${frame.height}`,
    duration: `${Date.now() - startedAt}ms`,
    cost: getSessionCost()
  })
  return frame
}

const captureDisplayTiles = async () => {
  const startedAt = Date.now()
  const wasVisible =
    screenshotWindow && !screenshotWindow.isDestroyed() && screenshotWindow.isVisible()
  writeScreenshotLog('log', 'capture', 'captureDisplayTiles start', {
    wasVisible,
    cost: getSessionCost()
  })
  if (wasVisible) {
    // 截屏前临时隐藏截图窗口，避免把当前蒙版和工具栏截进底图。
    screenshotWindow?.hide()
    await new Promise((resolve) => setTimeout(resolve, 80))
  }

  const union = getAllDisplayBounds()
  const monitors = NodeScreenshots.Monitor.all()
  writeScreenshotLog('log', 'capture', 'display/monitor snapshot', {
    union: {
      x: union.x,
      y: union.y,
      width: union.width,
      height: union.height,
      displayCount: union.displays.length
    },
    displays: union.displays.map((display) => ({
      id: display.id,
      bounds: display.bounds,
      scaleFactor: display.scaleFactor
    })),
    monitors: monitors.map((monitor) => ({ id: monitor.id(), name: monitor.name() }))
  })
  const sortedDisplays = sortDisplaysByPosition(union.displays)
  const capturedFrames = await Promise.all(
    sortedDisplays.map(async (display, displayIndex) => {
      const monitor = findMonitorForDisplay(monitors, display, displayIndex)
      if (!monitor) return null
      const frame = await captureMonitorFrame(monitor)
      return { display, frame }
    })
  )

  if (wasVisible) {
    screenshotWindow?.show()
    screenshotWindow?.focus()
  }

  const frames: CapturedDisplayFrame[] = []
  for (const item of capturedFrames) {
    if (item?.frame?.uint8?.length) {
      frames.push(item)
    }
  }

  writeScreenshotLog('log', 'capture', 'captureDisplayTiles done', {
    frameCount: frames.length,
    duration: `${Date.now() - startedAt}ms`,
    cost: getSessionCost()
  })
  return { union, frames }
}

const captureFrame = async (_config?: ScreenCaptureConfig) => {
  const capture = await captureDisplayTiles()
  if (!capture.frames.length) return null

  const { canvasWidth, canvasHeight } = getPreviewCanvasSize(capture.union)
  const canvas = new Uint8Array(canvasWidth * canvasHeight * 4)
  for (const { display, frame } of capture.frames) {
    const {
      x: destX,
      y: destY,
      destWidth,
      destHeight
    } = resolveFramePlacement(display, capture.union)
    const source =
      frame.width === destWidth && frame.height === destHeight
        ? frame
        : (() => {
            const resized = rgbaToNativeImage(frame.uint8, frame.width, frame.height).resize({
              width: destWidth,
              height: destHeight
            })
            const bitmap = resized.getBitmap()
            const rgba = new Uint8Array(destWidth * destHeight * 4)
            for (let i = 0; i < destWidth * destHeight; i += 1) {
              const offset = i * 4
              rgba[offset] = bitmap[offset + 2]
              rgba[offset + 1] = bitmap[offset + 1]
              rgba[offset + 2] = bitmap[offset]
              rgba[offset + 3] = bitmap[offset + 3]
            }
            return { uint8: rgba, width: destWidth, height: destHeight }
          })()

    for (let y = 0; y < destHeight; y += 1) {
      const srcRow = y * source.width * 4
      const dstRow = ((destY + y) * canvasWidth + destX) * 4
      canvas.set(source.uint8.subarray(srcRow, srcRow + destWidth * 4), dstRow)
    }
  }

  return { uint8: canvas, width: canvasWidth, height: canvasHeight }
}

const ensureLoggedIn = async (): Promise<boolean> => {
  const token = await tokenReader?.()
  if (token) return true
  return false
}

const getPayloadBytes = (payload: ScreenshotPayload): Uint8Array => {
  if (payload.uint8 instanceof Uint8Array) return payload.uint8
  return Uint8Array.from(payload.uint8 || [])
}

const writeImageToClip = (uint8: number[] | Uint8Array): boolean => {
  const bytes = uint8 instanceof Uint8Array ? uint8 : Uint8Array.from(uint8 || [])
  if (!bytes.length) return false
  const image = nativeImage.createFromBuffer(Buffer.from(bytes))
  if (image.isEmpty()) return false
  clipboard.writeImage(image)
  return true
}

const imageBase64FromPayload = (payload: ScreenshotPayload): string => {
  const bytes = getPayloadBytes(payload)
  if (!bytes.length) return ''
  const image = nativeImage.createFromBuffer(Buffer.from(bytes))
  return image.isEmpty() ? Buffer.from(bytes).toString('base64') : image.toPNG().toString('base64')
}

const rectApproxEquals = (a: number, b: number): boolean => Math.abs(a - b) <= 2

const rectCenter = (rect: ScreenshotRect): Electron.Point => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2
})

const displayNativeBounds = (display: Electron.Display): ScreenshotRect => {
  const scale = display.scaleFactor || 1
  return {
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width * scale,
    height: display.bounds.height * scale
  }
}

const pointInRect = (point: Electron.Point, rect: ScreenshotRect): boolean =>
  point.x >= rect.x &&
  point.x <= rect.x + rect.width &&
  point.y >= rect.y &&
  point.y <= rect.y + rect.height

const normalizePinRect = (
  rect: ScreenshotRect | undefined,
  payload: ScreenshotPayload,
  fallbackSize: Electron.Size
): ScreenshotRect | undefined => {
  if (!rect) return undefined

  // tools-gui 在高分屏上可能回传 native pixel rect；钉图窗口需要 DIP bounds 才能贴回原位置。
  const imageWidth = payload.width || fallbackSize.width
  const imageHeight = payload.height || fallbackSize.height
  const rawDisplay = screen.getDisplayMatching({
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height))
  })
  const scale = rawDisplay.scaleFactor || 1
  if (
    scale <= 1 ||
    !imageWidth ||
    !imageHeight ||
    !rectApproxEquals(rect.width, imageWidth) ||
    !rectApproxEquals(rect.height, imageHeight)
  ) {
    return rect
  }

  const rawCenter = rectCenter(rect)
  const nativeDisplay =
    screen
      .getAllDisplays()
      .find((display) => pointInRect(rawCenter, displayNativeBounds(display))) ?? rawDisplay
  const nativeScale = nativeDisplay.scaleFactor || scale
  const normalized = {
    x: nativeDisplay.bounds.x + (rect.x - nativeDisplay.bounds.x) / nativeScale,
    y: nativeDisplay.bounds.y + (rect.y - nativeDisplay.bounds.y) / nativeScale,
    width: rect.width / nativeScale,
    height: rect.height / nativeScale
  }
  writeScreenshotLog('log', 'pin', 'normalized native rect to dip', {
    input: rect,
    output: normalized,
    image: { width: imageWidth, height: imageHeight },
    display: {
      id: nativeDisplay.id,
      bounds: nativeDisplay.bounds,
      scaleFactor: nativeDisplay.scaleFactor
    }
  })
  return normalized
}

const showAlwaysOnTop = (win: BrowserWindow): void => {
  if (process.platform === 'darwin') {
    win.setVisibleOnAllWorkspaces(true)
    win.setAlwaysOnTop(true, 'floating')
  } else {
    win.setAlwaysOnTop(true)
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }
  win.show()
  win.focus()
}

const showPinByPicOnTop = (win: BrowserWindow): void => {
  // 只把旧钉图降到普通置顶层，新钉图升到最高层，避免反复 raise 全部窗口导致闪烁。
  for (const existing of pinByPicWindows) {
    if (existing === win || existing.isDestroyed()) continue
    if (process.platform === 'darwin') {
      existing.setAlwaysOnTop(true, 'floating')
    } else {
      existing.setAlwaysOnTop(true)
    }
  }
  if (process.platform === 'darwin') {
    win.setVisibleOnAllWorkspaces(true)
    win.setAlwaysOnTop(true, 'screen-saver')
  } else {
    win.setAlwaysOnTop(true)
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }
  win.showInactive()
  win.moveTop()
}

const raisePinByPicWindows = (latest?: BrowserWindow): void => {
  if (latest && !latest.isDestroyed()) {
    showPinByPicOnTop(latest)
  }
  writeScreenshotLog('log', 'pin-window', 'raised pin windows', {
    count: pinByPicWindows.size,
    latestId: latest?.id
  })
}

const revealWindowAfterPayloadApply = (
  win: BrowserWindow,
  reveal: (target: BrowserWindow) => void
): void => {
  // OCR/钉图页面先拿到图片 payload 再显示，避免窗口先露出旧图或空白内容。
  setTimeout(() => {
    if (!win.isDestroyed() && !win.isVisible()) {
      reveal(win)
    }
  }, 40)
}

const createOcrResultWindow = (imageBase64: string): BrowserWindow => {
  const point = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(point)
  const width = OCR_RESULT_WINDOW_WIDTH
  const height = OCR_RESULT_WINDOW_HEIGHT
  const x = Math.round(display.workArea.x + (display.workArea.width - width) / 2)
  const y = Math.round(display.workArea.y + (display.workArea.height - height) / 2)
  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: false,
    backgroundColor: '#ffffff',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    show: false,
    webPreferences: {
      preload: getPreloadPath(),
      sandbox: false,
      contextIsolation: true,
      devTools: is.dev
    }
  })
  loadRendererRoute(win, '/ocr-result')
  ocrResultWindows.add(win)
  ocrResultPayloads.set(win.webContents.id, {
    imageBase64,
    text: '',
    empty: false,
    message: '',
    loading: true
  })
  win.on('closed', () => {
    ocrResultWindows.delete(win)
    ocrResultPayloads.delete(win.webContents.id)
  })
  writeScreenshotLog('log', 'ocr-window', 'created renderer OCR result window', {
    imageBase64Length: imageBase64.length,
    bounds: { x, y, width, height }
  })
  return win
}

const sendOcrResultWindowData = (
  win: BrowserWindow,
  imageBase64: string,
  result: { text: string; empty: boolean; message: string }
): void => {
  if (win.isDestroyed()) return
  const payload: OcrResultWindowPayload = {
    imageBase64,
    text: result.text,
    empty: result.empty,
    message: result.message,
    loading: false
  }
  ocrResultPayloads.set(win.webContents.id, payload)
  const sendPayload = (): void => {
    if (win.isDestroyed()) return
    win.webContents.send('ocr-result-data', payload)
    writeScreenshotLog('log', 'ocr-window', 'sent OCR result data', {
      imageBase64Length: imageBase64.length,
      textLength: result.text.length,
      empty: result.empty
    })
  }
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', sendPayload)
    return
  }
  sendPayload()
}

const ocrImage = async (
  bytes: Uint8Array
): Promise<{ text: string; empty: boolean; message: string }> => {
  const worker = await createWorker('chi_sim+eng', undefined, {
    langPath: getTessdataPath(),
    gzip: false
  })
  try {
    const { data } = await worker.recognize(Buffer.from(bytes))
    const text = String(data?.text || '').trim()
    return text
      ? { text, empty: false, message: '' }
      : { text: '', empty: true, message: OCR_EMPTY_MESSAGE }
  } finally {
    await worker.terminate()
  }
}

const createPinByPicWindow = (payload: ScreenshotPayload): void => {
  const imageBase64 = imageBase64FromPayload(payload)
  if (!imageBase64) return
  const image = nativeImage.createFromBuffer(Buffer.from(getPayloadBytes(payload)))
  const fallbackSize = image.getSize()
  const rect = normalizePinRect(payload.selectionRect ?? payload.anchorRect, payload, fallbackSize)
  const point = rect
    ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    : screen.getCursorScreenPoint()
  const display = rect
    ? screen.getDisplayMatching({
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height))
      })
    : screen.getDisplayNearestPoint(point)
  const displayScale = display.scaleFactor || 1
  const imageLogicalWidth = Math.max(
    1,
    Math.round((payload.width || fallbackSize.width || 320) / displayScale)
  )
  const imageLogicalHeight = Math.max(
    1,
    Math.round((payload.height || fallbackSize.height || 180) / displayScale)
  )
  const width = Math.max(1, Math.round(rect?.width || imageLogicalWidth))
  const height = Math.max(1, Math.round(rect?.height || imageLogicalHeight))
  const margin = process.platform === 'win32' ? 12 : 8
  const maxWidth = Math.max(1, display.workArea.width - margin * 2)
  const maxHeight = Math.max(1, display.workArea.height - margin * 2)
  const scale = Math.min(1, maxWidth / width, maxHeight / height)
  const winWidth = Math.max(1, Math.round(width * scale))
  const winHeight = Math.max(1, Math.round(height * scale))
  const x = Math.max(
    display.workArea.x + margin,
    Math.min(
      Math.round(rect?.x ?? point.x),
      display.workArea.x + display.workArea.width - winWidth - margin
    )
  )
  const y = Math.max(
    display.workArea.y + margin,
    Math.min(
      Math.round(rect?.y ?? point.y),
      display.workArea.y + display.workArea.height - winHeight - margin
    )
  )
  const win = new BrowserWindow({
    title: '',
    x,
    y,
    width: winWidth,
    height: winHeight,
    useContentSize: true,
    frame: true,
    backgroundColor: '#000000',
    resizable: true,
    movable: true,
    closable: true,
    autoHideMenuBar: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    show: false,
    webPreferences: {
      preload: getPreloadPath(),
      sandbox: false,
      contextIsolation: true
    }
  })
  writeScreenshotLog('log', 'pin-window', 'created renderer pin window', {
    selectionRect: rect,
    image: {
      width: payload.width,
      height: payload.height,
      fallbackWidth: fallbackSize.width,
      fallbackHeight: fallbackSize.height
    },
    display: {
      id: display.id,
      bounds: display.bounds,
      workArea: display.workArea,
      scaleFactor: display.scaleFactor
    },
    bounds: { x, y, width: winWidth, height: winHeight },
    scale
  })
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      event.preventDefault()
      win.close()
    }
  })
  win.on('page-title-updated', (event) => {
    // 原生标题栏保留关闭按钮，但不展示路由标题或应用名。
    event.preventDefault()
    win.setTitle('')
  })
  loadRendererRoute(win, '/pin-by-pic')
  pinByPicWindows.add(win)
  pinByPicPayloads.set(win.webContents.id, { imageBase64 })
  win.on('closed', () => {
    pinByPicWindows.delete(win)
    pinByPicPayloads.delete(win.webContents.id)
  })
}

const runPostScreenshotAction = async (
  action: ScreenshotAction,
  payload: ScreenshotPayload
): Promise<void> => {
  if (action === 'ocr-rec') {
    const bytes = getPayloadBytes(payload)
    const imageBase64 = imageBase64FromPayload(payload)
    writeScreenshotLog('log', 'ocr', 'start OCR action', {
      bytes: bytes.length,
      imageBase64Length: imageBase64.length,
      width: payload.width,
      height: payload.height
    })
    const win = createOcrResultWindow(imageBase64)
    try {
      const result = await ocrImage(bytes)
      writeScreenshotLog('log', 'ocr', 'OCR action done', {
        textLength: result.text.length,
        empty: result.empty,
        message: result.message
      })
      sendOcrResultWindowData(win, imageBase64, result)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      writeScreenshotLog('error', 'ocr', 'OCR action failed', error)
      sendOcrResultWindowData(win, imageBase64, {
        text: '',
        empty: true,
        message: `OCR 失败: ${message}`
      })
    }
    return
  }

  if (action === 'pin-by-pic') {
    writeScreenshotLog('log', 'pin', 'start pin-by-pic action', {
      width: payload.width,
      height: payload.height,
      selectionRect: payload.selectionRect,
      anchorRect: payload.anchorRect
    })
    createPinByPicWindow(payload)
  }
}

const handleScreenshotAction = (action: ScreenshotAction) => {
  return async (_event: Electron.IpcMainInvokeEvent, payload: ScreenshotPayload) => {
    writeScreenshotLog('log', 'action', 'screenshot action start', {
      action,
      width: payload?.width,
      height: payload?.height,
      bytes:
        payload?.uint8 instanceof Uint8Array
          ? payload.uint8.byteLength
          : Array.isArray(payload?.uint8)
            ? payload.uint8.length
            : 0,
      cost: getSessionCost()
    })
    const result = {
      success: false,
      action,
      width: Number(payload?.width || 0),
      height: Number(payload?.height || 0),
      message: ''
    }
    try {
      const ok = writeImageToClip(payload?.uint8 || [])
      if (!ok) {
        result.message = 'invalid screenshot payload'
        return result
      }
      if (action === 'pin-by-pic') {
        // 钉图先创建新窗口再收起截图层，避免主窗口或旧窗口抢到层级。
        await runPostScreenshotAction(action, payload)
        closeScreenshotWindow()
      } else {
        closeScreenshotWindow()
        await runPostScreenshotAction(action, payload)
      }
      result.success = true
      writeScreenshotLog('log', 'action', 'screenshot action done', result)
      return result
    } catch (error) {
      console.error(`screenshot:${action} failed:`, error)
      writeScreenshotLog('error', 'action', `screenshot:${action} failed`, error)
      result.message = error instanceof Error ? error.message : String(error)
      return result
    }
  }
}

export const initScreenShotFeature = (
  readToken: MainWindowTokenReader,
  readShortcut?: ScreenshotShortcutReader
): void => {
  tokenReader = readToken
  screenshotShortcutReader = readShortcut ?? null
  try {
    mkdirSync(getScreenshotLogRoot(), { recursive: true })
    appendFileSync(
      getScreenshotInitLogPath(),
      `[${formatTimestamp()}] [log] [main] screenshot logger initialized root=${getScreenshotLogRoot()}\n`
    )
  } catch (error) {
    console.error('[screenShot] failed to write screenshot init log:', error)
  }
  writeScreenshotLog('log', 'init', 'initScreenShotFeature', {
    defaultShortcut: DEFAULT_SCREENSHOT_SHORTCUT,
    logRoot: getScreenshotLogRoot()
  })
  registerIpcHandlers()
}

const getCurrentScreenshotShortcut = (): string => {
  return screenshotShortcutReader?.() || DEFAULT_SCREENSHOT_SHORTCUT
}

const registerIpcHandlers = (): void => {
  if (ipcRegistered) return
  ipcRegistered = true
  writeScreenshotLog('log', 'init', 'register screenshot ipc handlers')

  ipcMain.handle('screen-shot:open', () => {
    writeScreenshotLog('log', 'ipc', 'screen-shot:open')
    openScreenShotWindow('ipc')
  })
  ipcMain.handle(SCREENSHOT_IPC.SESSION_READY, () => {
    writeScreenshotLog('log', 'ipc', SCREENSHOT_IPC.SESSION_READY, { cost: getSessionCost() })
    presentScreenshotWindow()
    return true
  })
  ipcMain.handle(SCREENSHOT_IPC.SESSION_REVEAL, () => {
    writeScreenshotLog('log', 'ipc', SCREENSHOT_IPC.SESSION_REVEAL, { cost: getSessionCost() })
    revealScreenshotWindow()
    return true
  })
  ipcMain.handle('screen:get-mouse-position', () => {
    const point = screen.getCursorScreenPoint()
    writeScreenshotLog('log', 'ipc', 'screen:get-mouse-position', point)
    return point
  })
  ipcMain.handle('screen:get-display-metrics', () => {
    const metrics = getDisplayMetricsPayload()
    writeScreenshotLog('log', 'ipc', 'screen:get-display-metrics', metrics)
    return metrics
  })
  ipcMain.handle('screen:get-scale-factor', () => {
    const scaleFactor = screen.getPrimaryDisplay().scaleFactor || 1
    writeScreenshotLog('log', 'ipc', 'screen:get-scale-factor', scaleFactor)
    return scaleFactor
  })
  ipcMain.handle('screen:get-frame', async (_event, config: ScreenCaptureConfig) => {
    writeScreenshotLog('log', 'ipc', 'screen:get-frame start', config)
    const frame = await captureFrame(config)
    writeScreenshotLog('log', 'ipc', 'screen:get-frame done', {
      hasFrame: !!frame,
      width: frame?.width,
      height: frame?.height
    })
    return frame ? { ...frame, uint8: Buffer.from(frame.uint8) } : null
  })
  ipcMain.handle('screen:get-frames', async (_event, _config: ScreenCaptureConfig) => {
    writeScreenshotLog('log', 'ipc', 'screen:get-frames start')
    writeScreenshotLogSeparator('phase', 'PHASE  capture (main, tiles)')
    const capture = await captureDisplayTiles()
    if (!capture.frames.length) {
      writeScreenshotLog('warn', 'ipc', 'screen:get-frames no frames')
      return null
    }
    const metrics = getDisplayMetricsPayload()
    // 返回给 renderer 的同时缓存一份，后续 exportSelectionBase 直接从同一批 tiles 裁剪。
    storeSessionCaptureCache(
      capture.union,
      metrics.canvasWidth,
      metrics.canvasHeight,
      capture.frames
    )
    const payload = {
      union: {
        x: metrics.x,
        y: metrics.y,
        width: metrics.width,
        height: metrics.height,
        scaleFactor: metrics.scaleFactor
      },
      canvasWidth: metrics.canvasWidth,
      canvasHeight: metrics.canvasHeight,
      frames: capture.frames.map(({ display, frame }) => {
        const placement = resolveFramePlacement(display, capture.union)
        return {
          x: placement.x,
          y: placement.y,
          width: frame.width,
          height: frame.height,
          destWidth: placement.destWidth,
          destHeight: placement.destHeight,
          uint8: Buffer.from(frame.uint8)
        }
      })
    }
    writeScreenshotLog('log', 'ipc', 'screen:get-frames done', {
      frameCount: payload.frames.length,
      canvasWidth: payload.canvasWidth,
      canvasHeight: payload.canvasHeight
    })
    writeScreenshotLogSeparator('phase', 'PHASE  render')
    return payload
  })
  ipcMain.handle('screen:get-base64', async (_event, config: ScreenCaptureConfig) => {
    writeScreenshotLog('log', 'ipc', 'screen:get-base64 start', config)
    const frame = await captureFrame(config)
    const base64 = frame
      ? rgbaToNativeImage(frame.uint8, frame.width, frame.height).toPNG().toString('base64')
      : ''
    writeScreenshotLog('log', 'ipc', 'screen:get-base64 done', {
      hasFrame: !!frame,
      base64Length: base64.length
    })
    return base64
  })
  ipcMain.handle('screen:write-image-clip', (_event, arr: number[] | Uint8Array) => {
    return writeImageToClip(arr)
  })
  ipcMain.handle('ocr:copy-text', (_event, text: string) => {
    clipboard.writeText(String(text ?? ''))
    return true
  })
  ipcMain.handle('screenshot:get-ocr-result-data', (event) => {
    const payload = ocrResultPayloads.get(event.sender.id) ?? null
    const win = BrowserWindow.fromWebContents(event.sender)
    if (payload && win && !win.isDestroyed() && !win.isVisible()) {
      revealWindowAfterPayloadApply(win, showAlwaysOnTop)
    }
    writeScreenshotLog('log', 'ocr-window', 'renderer requested latest OCR result payload', {
      webContentsId: event.sender.id,
      hasPayload: !!payload,
      imageBase64Length: payload?.imageBase64.length ?? 0,
      textLength: payload?.text.length ?? 0,
      loading: payload?.loading ?? false
    })
    return payload
  })
  ipcMain.handle('screenshot:get-pin-by-pic-image', (event) => {
    const payload = pinByPicPayloads.get(event.sender.id) ?? null
    const win = BrowserWindow.fromWebContents(event.sender)
    if (payload && win && !win.isDestroyed() && !win.isVisible()) {
      revealWindowAfterPayloadApply(win, raisePinByPicWindows)
    }
    writeScreenshotLog('log', 'pin-window', 'renderer requested latest pin image payload', {
      webContentsId: event.sender.id,
      hasPayload: !!payload,
      imageBase64Length: payload?.imageBase64.length ?? 0
    })
    return payload
  })
  ipcMain.handle('screen:close-window', () => {
    closeScreenshotWindow()
    return true
  })
  ipcMain.handle(SCREENSHOT_IPC.GET_SESSION_TILES, () => {
    const cache = getSessionCaptureCache()
    if (!cache?.frames.length) {
      writeScreenshotLog('warn', 'session-tiles', 'cache empty')
      return null
    }
    writeScreenshotLog('log', 'session-tiles', 'return cached session tiles', {
      tiles: cache.frames.length,
      canvas: `${cache.canvasWidth}x${cache.canvasHeight}`,
      layoutMode: cache.layoutMode
    })
    return serializeSessionCaptureCache(cache)
  })
  ipcMain.handle(
    SCREENSHOT_IPC.EXPORT_SELECTION_BASE,
    (_event, request: ExportSelectionBaseRequest) => {
      const cache = getSessionCaptureCache()
      if (!cache?.frames.length) {
        writeScreenshotLog('warn', 'export-base', 'cache empty', request)
        return null
      }
      const startedAt = Date.now()
      const result = exportSelectionBaseFromCache(cache, request)
      if (!result) {
        writeScreenshotLog('warn', 'export-base', 'export returned empty', request)
        return null
      }
      writeScreenshotLog('log', 'export-base', 'exported base from session cache', {
        crop: `${request.imgX},${request.imgY} ${request.imgW}x${request.imgH}`,
        out: `${result.width}x${result.height}`,
        bytes: result.uint8.length,
        duration: `${Date.now() - startedAt}ms`
      })
      return {
        uint8: result.uint8,
        width: result.width,
        height: result.height
      }
    }
  )
  ipcMain.handle('screenshot:get-toolbar-config', () => {
    const shortcut = getCurrentScreenshotShortcut()
    const payload = {
      shortcut,
      shortcutStatus: {
        shortcut,
        registered:
          typeof globalShortcut?.isRegistered === 'function'
            ? globalShortcut.isRegistered(shortcut)
            : false
      },
      menuItems: [
        { id: 'ocr', enabled: true, showInMore: false },
        { id: 'summary', enabled: true, showInMore: false },
        { id: 'ask', enabled: true, showInMore: false },
        { id: 'extractTable', enabled: true, showInMore: true },
        { id: 'solveProblem', enabled: true, showInMore: true }
      ]
    }
    writeScreenshotLog('log', 'ipc', 'screenshot:get-toolbar-config', payload)
    return payload
  })
  ipcMain.handle('screenshot:ocr-rec', handleScreenshotAction('ocr-rec'))
  ipcMain.handle('screenshot:pin-by-pic', handleScreenshotAction('pin-by-pic'))
  ipcMain.handle('screenshot:ask-by-pic', handleScreenshotAction('ask-by-pic'))
  ipcMain.handle('screenshot:ask-by-pic-new', async (event, payload: ScreenshotPayload) => {
    if (!(await ensureLoggedIn())) {
      return {
        success: false,
        action: 'ask-by-pic-new' as const,
        width: Number(payload?.width || 0),
        height: Number(payload?.height || 0),
        message: '请先登录'
      }
    }
    return handleScreenshotAction('ask-by-pic-new')(event, payload)
  })
  ipcMain.handle('screenshot:summary', async (event, payload: ScreenshotPayload) => {
    if (!(await ensureLoggedIn())) {
      return {
        success: false,
        action: 'summary' as const,
        width: Number(payload?.width || 0),
        height: Number(payload?.height || 0),
        message: '请先登录'
      }
    }
    return handleScreenshotAction('summary')(event, payload)
  })
  ipcMain.handle('screenshot:extract-table', async (event, payload: ScreenshotPayload) => {
    if (!(await ensureLoggedIn())) {
      return {
        success: false,
        action: 'extract-table' as const,
        width: Number(payload?.width || 0),
        height: Number(payload?.height || 0),
        message: '请先登录'
      }
    }
    return handleScreenshotAction('extract-table')(event, payload)
  })
  ipcMain.handle('screenshot:solve-problem', async (event, payload: ScreenshotPayload) => {
    if (!(await ensureLoggedIn())) {
      return {
        success: false,
        action: 'solve-problem' as const,
        width: Number(payload?.width || 0),
        height: Number(payload?.height || 0),
        message: '请先登录'
      }
    }
    return handleScreenshotAction('solve-problem')(event, payload)
  })
  ipcMain.handle(SCREENSHOT_IPC.DEBUG_LOG, (_event, payload) => {
    const level = payload?.level === 'error' ? 'error' : payload?.level === 'warn' ? 'warn' : 'log'
    console[level]('[screenShot]', payload?.tag ?? '', ...(payload?.args ?? []))
    const argsText = (payload?.args ?? []).map(formatLogValue).join(' ')
    if (payload?.tag === 'startup' && argsText.includes('[renderer][onMounted]')) {
      writeScreenshotLogSeparator('phase', 'PHASE  renderer')
    }
    writeScreenshotLog(level, `renderer:${payload?.tag ?? 'debug'}`, ...(payload?.args ?? []))
    if (payload?.tag === 'startup' && argsText.includes('[renderer][first-paint]')) {
      writeScreenshotLogSeparator('session', `SESSION END  ${argsText}`)
    }
    return true
  })
}
