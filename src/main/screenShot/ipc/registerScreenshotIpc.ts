import { BrowserWindow, clipboard, globalShortcut, ipcMain, screen } from 'electron'
import { SCREENSHOT_IPC, type ExportSelectionBaseRequest } from '../contracts/ipc'
import { getSessionCaptureCache } from '../session/captureCache'
import { exportSelectionBaseFromCache } from '../session/exportSelection'
import { rgbaToNativeImage, writeImageToClip } from '../capture/imageUtils'
import { getDisplayMetricsPayload, resolveFramePlacement } from '../capture/displayMetrics'
import type { ScreenCaptureConfig, ScreenshotPayload } from '../contracts/types'
import {
  captureDisplayTiles,
  captureFrame,
  closeScreenshotWindow,
  ensureLoggedIn,
  getCurrentScreenshotShortcut,
  handleScreenshotAction,
  openScreenShotWindow,
  presentScreenshotWindow,
  revealScreenshotWindow,
  serializeSessionCaptureCache,
  storeSessionCaptureCache
} from '../index'
import { ocrResultPayloads } from '../features/ocr'
import { pinByPicPayloads, raisePinByPicWindows } from '../features/pin'
import { revealWindowAfterPayloadApply, showAlwaysOnTop } from '../features/windowUtils'
import {
  formatLogValue,
  getSessionCost,
  writeScreenshotLog,
  writeScreenshotLogSeparator
} from '../logging/runtimeLogger'

let ipcRegistered = false

/** 幂等注册截图采集、窗口、OCR、钉图和导出相关 IPC。 */
export const registerIpcHandlers = (): void => {
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
