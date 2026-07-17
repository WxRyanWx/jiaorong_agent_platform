// 截图 dist 来自 tools-gui/chat-pc，channel 名称需要保持稳定，避免重拷 dist 后桥接失效。
export const SCREENSHOT_IPC = {
  DEBUG_LOG: 'screenshot:debug-log',
  STARTUP_MARK: 'screenshot:startup-mark',
  RECAPTURE: 'screenshot:recapture',
  SESSION_READY: 'screenshot:session-ready',
  SESSION_REVEAL: 'screenshot:session-reveal',
  SESSION_DISMISS: 'screenshot:session-dismiss',
  OVERLAY_FRAME: 'screenshot:overlay-frame',
  OVERLAY_STATE: 'screenshot:overlay-state',
  OVERLAY_DRAW: 'screenshot:overlay-draw',
  OVERLAY_POINTER: 'screenshot:overlay-pointer',
  GET_SESSION_TILES: 'screenshot:get-session-tiles',
  EXPORT_SELECTION_BASE: 'screenshot:export-selection-base'
} as const

export type ScreenshotStartupSource = 'hotkey' | 'menu' | 'ipc' | 'reuse' | 'mouse' | 'unknown'

export type ExportSelectionBaseRequest = {
  imgX: number
  imgY: number
  imgW: number
  imgH: number
  outW: number
  outH: number
}

export type ScreenshotDisplayMetricsPayload = {
  x: number
  y: number
  width: number
  height: number
  canvasWidth: number
  canvasHeight: number
  scaleFactor: number
  layoutMode: 'union-dip' | 'packed-native'
  mixedDpiExport: boolean
  displays: Array<{
    x: number
    y: number
    width: number
    height: number
    captureScale: number
  }>
}

export type ScreenshotStartupMarkPayload = {
  wallMs: number
  source: ScreenshotStartupSource
  metrics: ScreenshotDisplayMetricsPayload
}

export type ScreenshotDebugLogPayload = {
  level?: ScreenshotDebugLogLevel
  tag?: string
  args?: unknown[]
}

export type ScreenshotDebugLogLevel = 'log' | 'warn' | 'error'
