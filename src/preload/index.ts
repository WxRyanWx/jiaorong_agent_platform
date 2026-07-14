import path from 'path'
import {
  clipboard,
  contextBridge,
  nativeImage,
  webUtils,
  webFrame,
  ipcRenderer,
  shell,
  type IpcRendererEvent
} from 'electron'
import { exposeElectronAPI } from '@electron-toolkit/preload'
import { normalizeExternalUrl } from '@shared/externalUrl'
import { createBridge } from './createBridge'
import {
  SCREENSHOT_IPC,
  type ScreenshotDebugLogPayload,
  type ScreenshotStartupMarkPayload
} from '../main/screenShot/contracts/ipc'

const isDevHiddenApiEnabled =
  process.env.NODE_ENV === 'development' || Boolean(process.env.ELECTRON_RENDERER_URL)
const DEV_WELCOME_OVERRIDE_KEY = '__deepchat_dev_force_welcome'
const validMessageChannels = ['pin-by-pic-image', 'ocr-result-data'] as const

// Cache variables
let cachedWindowId: number | undefined = undefined
let cachedWebContentsId: number | undefined = undefined

const frameBufferToUint8 = (raw: unknown): Uint8Array => {
  if (raw instanceof Uint8Array) return raw
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) {
    return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
  }
  return Uint8Array.from((raw as number[]) || [])
}

const normalizeOptionalNumber = (value: unknown): number | undefined => {
  const num = Number(value)
  return Number.isFinite(num) ? num : undefined
}

type ScreenshotShotPayload = {
  uint8: Uint8Array | number[]
  width: number
  height: number
  x?: number
  y?: number
  anchorRect?: { x: number; y: number; width: number; height: number }
  selectionRect?: { x: number; y: number; width: number; height: number }
}

const normalizeShotPayload = (payload: ScreenshotShotPayload) => ({
  uint8:
    payload?.uint8 instanceof Uint8Array
      ? Array.from(payload.uint8)
      : Array.from(payload?.uint8 || []),
  width: Number(payload?.width || 0),
  height: Number(payload?.height || 0),
  x: normalizeOptionalNumber(payload?.x),
  y: normalizeOptionalNumber(payload?.y),
  anchorRect: payload?.anchorRect,
  selectionRect: payload?.selectionRect
})

// Custom APIs for renderer
const api = Object.freeze({
  onMessage: (channel: string, callback: (...args: unknown[]) => void) => {
    if (!validMessageChannels.includes(channel as (typeof validMessageChannels)[number])) {
      console.warn('Blocked IPC channel:', channel)
      return () => {}
    }
    const listener = (_event: IpcRendererEvent, ...args: unknown[]) => callback(...args)
    ipcRenderer.on(channel, listener)
    return listener
  },
  removeMessageListener: (channel: string, callback: (...args: unknown[]) => void) => {
    if (!validMessageChannels.includes(channel as (typeof validMessageChannels)[number])) return
    ipcRenderer.removeListener(channel, callback)
  },
  copyText: (text: string) => {
    clipboard.writeText(text)
  },
  copyTextByMain: (text: string) => ipcRenderer.invoke('ocr:copy-text', text),
  getOcrResultData: () => ipcRenderer.invoke('screenshot:get-ocr-result-data'),
  getPinByPicImage: () => ipcRenderer.invoke('screenshot:get-pin-by-pic-image'),
  copyImage: (image: string) => {
    const img = nativeImage.createFromDataURL(image)
    clipboard.writeImage(img)
  },
  readClipboardText: () => {
    return clipboard.readText()
  },
  getPathForFile: (file: File) => {
    return webUtils.getPathForFile(file)
  },
  getWindowId: () => {
    if (cachedWindowId !== undefined) {
      return cachedWindowId
    }
    cachedWindowId = ipcRenderer.sendSync('get-window-id')
    return cachedWindowId
  },
  getWebContentsId: () => {
    if (cachedWebContentsId !== undefined) {
      return cachedWebContentsId
    }
    cachedWebContentsId = ipcRenderer.sendSync('get-web-contents-id')
    return cachedWebContentsId
  },
  openExternal: (url: string) => {
    const externalUrl = normalizeExternalUrl(url)
    if (!externalUrl) {
      console.warn('Preload: Blocked openExternal for disallowed URL:', url)
      return Promise.reject(new Error('URL protocol not allowed'))
    }
    return shell.openExternal(externalUrl)
  },
  toRelativePath: (filePath: string, baseDir?: string) => {
    if (!baseDir) return filePath

    try {
      const relative = path.relative(baseDir, filePath)
      if (
        relative === '' ||
        (relative && !relative.startsWith('..') && !path.isAbsolute(relative))
      ) {
        return relative
      }
    } catch (error) {
      console.warn('Preload: Failed to compute relative path', filePath, baseDir, error)
    }
    return filePath
  },
  formatPathForInput: (filePath: string) => {
    const containsSpace = /\s/.test(filePath)
    const hasDoubleQuote = filePath.includes('"')
    const hasSingleQuote = filePath.includes("'")

    if (!containsSpace && !hasDoubleQuote && !hasSingleQuote) {
      return filePath
    }

    // Prefer double quotes; escape any existing ones
    if (hasDoubleQuote) {
      const escaped = filePath.replace(/"/g, '\\"')
      return `"${escaped}"`
    }

    // Use double quotes when only spaces
    if (containsSpace) {
      return `"${filePath}"`
    }

    // Fallback: no spaces but contains single quotes
    return `'${filePath.replace(/'/g, `'\\''`)}'`
  },
  getAuthToken: () => ipcRenderer.invoke('highlighted-text:get-token') as Promise<string | null>,
  openScreenShotWindow: () => ipcRenderer.invoke('screen-shot:open'),
  getScreenshotToolbarConfig: () => ipcRenderer.invoke('screenshot:get-toolbar-config'),
  onScreenshotToolbarConfig: (callback: (payload: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload)
    ipcRenderer.on('screenshot-toolbar-config', handler)
    return () => ipcRenderer.removeListener('screenshot-toolbar-config', handler)
  },
  onScreenshotStartupMark: (callback: (payload: ScreenshotStartupMarkPayload) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: ScreenshotStartupMarkPayload) =>
      callback(payload)
    ipcRenderer.on(SCREENSHOT_IPC.STARTUP_MARK, handler)
    return () => ipcRenderer.removeListener(SCREENSHOT_IPC.STARTUP_MARK, handler)
  },
  onScreenshotRecapture: (callback: (payload: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload)
    ipcRenderer.on(SCREENSHOT_IPC.RECAPTURE, handler)
    return () => ipcRenderer.removeListener(SCREENSHOT_IPC.RECAPTURE, handler)
  },
  onScreenshotSessionDismiss: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on(SCREENSHOT_IPC.SESSION_DISMISS, handler)
    return () => ipcRenderer.removeListener(SCREENSHOT_IPC.SESSION_DISMISS, handler)
  },
  // tools-gui 截图 dist 固定读取 window.api.useMain；这里保留 chat-pc 兼容桥接。
  useMain: {
    _normalizeOptionalNumber: normalizeOptionalNumber,
    _frameBufferToUint8: frameBufferToUint8,
    _normalizeShotPayload: normalizeShotPayload,
    openScreenShotWindow: () => ipcRenderer.invoke('screen-shot:open'),
    getScreenshotToolbarConfig: () => ipcRenderer.invoke('screenshot:get-toolbar-config'),
    onScreenshotToolbarConfig: (callback: (payload: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload)
      ipcRenderer.on('screenshot-toolbar-config', handler)
      return () => ipcRenderer.removeListener('screenshot-toolbar-config', handler)
    },
    onScreenshotStartupMark: (callback: (payload: ScreenshotStartupMarkPayload) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: ScreenshotStartupMarkPayload) =>
        callback(payload)
      ipcRenderer.on(SCREENSHOT_IPC.STARTUP_MARK, handler)
      return () => ipcRenderer.removeListener(SCREENSHOT_IPC.STARTUP_MARK, handler)
    },
    onScreenshotRecapture: (callback: (payload: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload)
      ipcRenderer.on(SCREENSHOT_IPC.RECAPTURE, handler)
      return () => ipcRenderer.removeListener(SCREENSHOT_IPC.RECAPTURE, handler)
    },
    onScreenshotSessionDismiss: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on(SCREENSHOT_IPC.SESSION_DISMISS, handler)
      return () => ipcRenderer.removeListener(SCREENSHOT_IPC.SESSION_DISMISS, handler)
    },
    getMousePosition: () => ipcRenderer.invoke('screen:get-mouse-position'),
    getScreenFrame: async (config: { x: string; y: string; width: string; height: string }) => {
      const payload = await ipcRenderer.invoke('screen:get-frame', config)
      if (!payload) return null
      return {
        uint8: frameBufferToUint8(payload?.uint8),
        width: Number(payload?.width || 0),
        height: Number(payload?.height || 0)
      }
    },
    getScreenFrames: async (config: { x: string; y: string; width: string; height: string }) => {
      const payload = await ipcRenderer.invoke('screen:get-frames', config)
      if (!payload?.frames?.length) return payload
      // Electron IPC 会把 Uint8Array 序列化为 Buffer-like 对象，回到截图页前统一恢复。
      return {
        ...payload,
        frames: payload.frames.map((tile: Record<string, unknown>) => ({
          ...tile,
          uint8: frameBufferToUint8(tile.uint8)
        }))
      }
    },
    getScreenBase64: (config: { x: string; y: string; width: string; height: string }) =>
      ipcRenderer.invoke('screen:get-base64', config),
    writeImageToClip: (uint8: Uint8Array) =>
      ipcRenderer.invoke('screen:write-image-clip', Array.from(uint8)),
    closeScreenWindow: () => ipcRenderer.invoke('screen:close-window'),
    getDisplayScaleFactor: () => ipcRenderer.invoke('screen:get-scale-factor'),
    getDisplayMetrics: () => ipcRenderer.invoke('screen:get-display-metrics'),
    notifyScreenshotSessionReady: () => ipcRenderer.invoke(SCREENSHOT_IPC.SESSION_READY),
    presentScreenshotSession: () => ipcRenderer.invoke(SCREENSHOT_IPC.SESSION_READY),
    revealScreenshotSession: () => ipcRenderer.invoke(SCREENSHOT_IPC.SESSION_REVEAL),
    getScreenshotSessionTiles: () => ipcRenderer.invoke(SCREENSHOT_IPC.GET_SESSION_TILES),
    exportSelectionBase: (payload: unknown) =>
      ipcRenderer.invoke(SCREENSHOT_IPC.EXPORT_SELECTION_BASE, payload),
    // chat-pc 旧 dist 使用这个名字；新旧命名都指向同一个 session cache 导出逻辑。
    exportSelectionBaseFromCache: (payload: unknown) =>
      ipcRenderer.invoke(SCREENSHOT_IPC.EXPORT_SELECTION_BASE, payload),
    // 当前迁移只启用主截图层，overlay 多窗口同步 channel 先保留为空实现兼容 dist 调用。
    sendOverlayPointer: (_payload: unknown) => undefined,
    broadcastOverlayState: (_payload: unknown) => undefined,
    broadcastOverlayDraw: (_payload: unknown) => undefined,
    onOverlayFrame: (_callback: (payload: unknown) => void) => () => {},
    onOverlayState: (_callback: (payload: unknown) => void) => () => {},
    onOverlayDraw: (_callback: (payload: unknown) => void) => () => {},
    onOverlayPointer: (_callback: (payload: unknown) => void) => () => {},
    debugLog: (payload: ScreenshotDebugLogPayload) =>
      ipcRenderer.invoke(SCREENSHOT_IPC.DEBUG_LOG, payload),
    ocrRec: (payload: ScreenshotShotPayload) =>
      ipcRenderer.invoke('screenshot:ocr-rec', normalizeShotPayload(payload)),
    askByPic: (payload: ScreenshotShotPayload) =>
      ipcRenderer.invoke('screenshot:ask-by-pic', normalizeShotPayload(payload)),
    askByPicNew: (payload: ScreenshotShotPayload) =>
      ipcRenderer.invoke('screenshot:ask-by-pic-new', normalizeShotPayload(payload)),
    summary: (payload: ScreenshotShotPayload) =>
      ipcRenderer.invoke('screenshot:summary', normalizeShotPayload(payload)),
    extractTable: (payload: ScreenshotShotPayload) =>
      ipcRenderer.invoke('screenshot:extract-table', normalizeShotPayload(payload)),
    solveProblem: (payload: ScreenshotShotPayload) =>
      ipcRenderer.invoke('screenshot:solve-problem', normalizeShotPayload(payload)),
    pinByPic: (payload: ScreenshotShotPayload) =>
      ipcRenderer.invoke('screenshot:pin-by-pic', normalizeShotPayload(payload))
  },
  // CardPopup 首次加载可能错过文本推送，允许 renderer 主动读取主进程缓存。
  getCurrentCardPopupText: () =>
    ipcRenderer.invoke('highlighted-text:get-current-card-popup-text') as Promise<string>,
  // 翻译弹窗首次加载可能错过文本推送，允许 renderer 主动读取主进程缓存。
  getCurrentTranslatePopupText: () =>
    ipcRenderer.invoke('highlighted-text:get-current-translate-popup-text') as Promise<string>,
  // 翻译接口放在主进程执行，便于统一携带 token 和规避跨域问题。
  translateSelectedText: (text: string, locale?: string) =>
    ipcRenderer.invoke('highlighted-text:translate', text, locale) as Promise<string>,
  startWindowDrag: (screenX: number, screenY: number) => {
    ipcRenderer.send('drag-window:start', screenX, screenY)
  },
  moveWindowDrag: (screenX: number, screenY: number) => {
    ipcRenderer.send('drag-window:move', screenX, screenY)
  },
  endWindowDrag: () => {
    ipcRenderer.send('drag-window:end')
  }
})

const setDevWelcomeOverride = (enabled: boolean) => {
  try {
    if (enabled) {
      window.sessionStorage.setItem(DEV_WELCOME_OVERRIDE_KEY, '1')
    } else {
      window.sessionStorage.removeItem(DEV_WELCOME_OVERRIDE_KEY)
    }
  } catch (error) {
    console.warn('Preload: Failed to update dev welcome override:', error)
  }
}

const deepchatDevApi = isDevHiddenApiEnabled
  ? Object.freeze({
      goToWelcome: () => {
        setDevWelcomeOverride(true)
        window.location.hash = '/welcome'
        return true
      },
      clearWelcomeOverride: () => {
        setDevWelcomeOverride(false)
        return true
      }
    })
  : undefined
const deepchatBridge = Object.freeze(createBridge(ipcRenderer))

exposeElectronAPI()

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('deepchat', deepchatBridge)
    if (deepchatDevApi) {
      contextBridge.exposeInMainWorld('__deepchatDev', deepchatDevApi)
    }
  } catch (error) {
    console.error('Preload: Failed to expose API via contextBridge:', error)
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api
  // @ts-ignore (define in dts)
  window.deepchat = deepchatBridge
  if (deepchatDevApi) {
    // @ts-ignore (define in dts)
    window.__deepchatDev = deepchatDevApi
  }
}
window.addEventListener('DOMContentLoaded', () => {
  cachedWebContentsId = ipcRenderer.sendSync('get-web-contents-id')
  cachedWindowId = ipcRenderer.sendSync('get-window-id')
  console.log(
    'Preload: Initialized with WebContentsId:',
    cachedWebContentsId,
    'WindowId:',
    cachedWindowId
  )
  webFrame.setVisualZoomLevelLimits(1, 1) // Disable trackpad zooming
  webFrame.setZoomFactor(1)
})
