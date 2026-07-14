export type SessionCaptureTile = {
  displayId?: number
  x: number
  y: number
  width: number
  height: number
  destWidth: number
  destHeight: number
  uint8: Uint8Array
}

// 一次截图会话内的屏幕 tiles 缓存。tools-gui 选区动作随后会请求这些 tiles 来导出底图。
export type SessionCaptureCachePayload = {
  canvasWidth: number
  canvasHeight: number
  union: {
    x: number
    y: number
    width: number
    height: number
    scaleFactor: number
  }
  layoutMode: 'union-dip' | 'packed-native'
  frames: SessionCaptureTile[]
  capturedAt: number
}

let sessionCaptureCache: SessionCaptureCachePayload | null = null

// 缓存只保留当前截图会话，新的截图会话开始时由主进程清理，避免误用上一张屏幕。
export const setSessionCaptureCache = (payload: SessionCaptureCachePayload | null): void => {
  sessionCaptureCache = payload
}

export const getSessionCaptureCache = (): SessionCaptureCachePayload | null => sessionCaptureCache

export const clearSessionCaptureCache = (): void => {
  sessionCaptureCache = null
}
