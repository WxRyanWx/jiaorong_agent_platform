import { app, BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import { appendFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { SCREENSHOT_IPC, type ScreenshotStartupSource } from './contracts/ipc'
import { systemShortcutKey } from '../../main/presenter/configPresenter/shortcutKeySettings'
import {
  clearSessionCaptureCache,
  setSessionCaptureCache,
  type SessionCaptureCachePayload
} from './session/captureCache'
import { rgbaToNativeImage, writeImageToClip } from './capture/imageUtils'
import type {
  CapturedDisplayFrame,
  MainWindowTokenReader,
  RgbaFrame,
  ScreenCaptureConfig,
  ScreenshotAction,
  ScreenshotPayload,
  ScreenshotShortcutReader
} from './contracts/types'
import {
  getAllDisplayBounds,
  getDisplayCaptureScale,
  getDisplayMetricsPayload,
  getPreviewCanvasSize,
  resolveFramePlacement,
  shouldUseNativePixelCanvas,
  sortDisplaysByPosition
} from './capture/displayMetrics'
import { registerIpcHandlers } from './ipc/registerScreenshotIpc'
import { runPostScreenshotAction, warmOcrWorker } from './features'
import {
  formatTimestamp,
  getScreenshotInitLogPath,
  getScreenshotLogRoot,
  getSessionCost,
  startScreenshotLogSession,
  writeScreenshotLog
} from './logging/runtimeLogger'

const require = createRequire(import.meta.url)

type NativeMonitor = {
  id: () => number
  name: () => string
  captureImage: () => Promise<{
    width: number
    height: number
    toRaw: () => Promise<Uint8Array | Buffer>
  }>
}

let screenshotsModule: { Monitor: { all: () => NativeMonitor[] } } | null = null

/** 在交融私有截图模块中延迟加载原生采集能力，避免实现进入 src/main。 */
const loadScreenshots = () => {
  if (screenshotsModule) return screenshotsModule
  screenshotsModule = require('node-screenshots') as {
    Monitor: { all: () => NativeMonitor[] }
  }
  return screenshotsModule
}

let screenshotWindow: BrowserWindow | null = null
let screenshotWindowReady = false
let screenshotActivationStarted = false
let tokenReader: MainWindowTokenReader | null = null
let screenshotShortcutReader: ScreenshotShortcutReader | null = null

export const DEFAULT_SCREENSHOT_SHORTCUT = systemShortcutKey.Screenshot

// tools-gui 后续需要从本次截图会话导出选区底图，所以这里保存每个屏幕 tile。
/** 缓存本次采集的屏幕分片，供后续选区导出复用。 */
export const storeSessionCaptureCache = (
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

/** 将缓存中的 Uint8Array 转换为适合 Electron IPC 传输的 Buffer。 */
export const serializeSessionCaptureCache = (cache: SessionCaptureCachePayload) => ({
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

/** 根据开发或生产环境解析截图页面路径。 */
const getScreenshotHtmlPath = (): string => {
  if (is.dev) {
    return join(app.getAppPath(), 'resources/screen-shot/index.html')
  }
  return join(process.resourcesPath, 'app.asar.unpacked/resources/screen-shot/index.html')
}

/** 获取截图及结果窗口共用的 preload 路径。 */
const getPreloadPath = (): string => join(__dirname, '../preload/index.mjs')

/** 将截图窗口重新对齐到全部显示器的联合区域。 */
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
export const presentScreenshotWindow = (): void => {
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
export const revealScreenshotWindow = (): void => {
  if (!screenshotWindow || screenshotWindow.isDestroyed()) return
  screenshotWindow.setOpacity(1)
  screenshotWindow.focus()
  writeScreenshotLog('log', 'window', 'revealed', {
    cost: getSessionCost(),
    bounds: screenshotWindow.getBounds(),
    opacity: screenshotWindow.getOpacity()
  })
}

/** 创建或复用截图窗口，并启动一次新的截图会话。 */
export const openScreenShotWindow = (source: ScreenshotStartupSource = 'ipc'): void => {
  startScreenshotLogSession(source)
  warmOcrWorker()
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

/** 收起截图窗口并恢复 macOS 工作区相关状态。 */
export const closeScreenshotWindow = (): void => {
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

type CapturedMonitor = {
  id: number
  name: string
  width: number
  height: number
  uint8: Uint8Array
}

/** 按显示器 ID、名称或位置索引匹配原生采集结果。 */
const findMonitorForDisplay = (
  monitors: CapturedMonitor[],
  display: Electron.Display,
  displayIndex: number
) => {
  return (
    monitors.find((monitor) => monitor.id === display.id) ??
    monitors.find((monitor) => monitor.name.startsWith(`screen:${display.id}:`)) ??
    monitors[displayIndex]
  )
}

/** 并行采集所有显示器，并在采集期间临时隐藏截图蒙版。 */
export const captureDisplayTiles = async () => {
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
  const captureStartedAt = Date.now()
  let monitors: CapturedMonitor[]
  try {
    monitors = await Promise.all(
      loadScreenshots()
        .Monitor.all()
        .map(async (monitor) => {
          const image = await monitor.captureImage()
          const raw = await image.toRaw()
          return {
            id: monitor.id(),
            name: monitor.name(),
            width: image.width,
            height: image.height,
            uint8: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
          }
        })
    )
  } finally {
    // 原生采集异常时也要恢复原窗口，避免截图层永久隐藏。
    if (wasVisible) {
      screenshotWindow?.show()
      screenshotWindow?.focus()
    }
  }
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
    monitors: monitors.map((monitor) => ({
      id: monitor.id,
      name: monitor.name,
      raw: `${monitor.width}x${monitor.height}`
    })),
    nativeCaptureDuration: `${Date.now() - captureStartedAt}ms`
  })
  const sortedDisplays = sortDisplaysByPosition(union.displays)
  const capturedFrames = sortedDisplays.map((display, displayIndex) => {
    const monitor = findMonitorForDisplay(monitors, display, displayIndex)
    if (!monitor) return null
    const frame: RgbaFrame = {
      uint8: new Uint8Array(
        monitor.uint8.buffer,
        monitor.uint8.byteOffset,
        monitor.uint8.byteLength
      ),
      width: monitor.width,
      height: monitor.height
    }
    return { display, frame }
  })

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

/** 将多显示器采集分片合成为一张连续 RGBA 画布。 */
export const captureFrame = async (_config?: ScreenCaptureConfig) => {
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

/** 使用注入的令牌读取器判断用户是否已登录。 */
export const ensureLoggedIn = async (): Promise<boolean> => {
  const token = await tokenReader?.()
  if (token) return true
  return false
}

/** 创建统一的截图动作 IPC 处理器，负责校验、复制和收起窗口。 */
export const handleScreenshotAction = (action: ScreenshotAction) => {
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

/** 注入登录/快捷键读取器并注册截图模块的 IPC 能力。 */
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

/** 返回用户配置的截图快捷键，未配置时使用默认值。 */
export const getCurrentScreenshotShortcut = (): string => {
  return screenshotShortcutReader?.() || DEFAULT_SCREENSHOT_SHORTCUT
}
