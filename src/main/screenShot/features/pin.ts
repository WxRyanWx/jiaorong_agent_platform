import { BrowserWindow, nativeImage, screen } from 'electron'
import { getPayloadBytes, imageBase64FromPayload } from '../capture/imageUtils'
import type { PinByPicImagePayload, ScreenshotPayload, ScreenshotRect } from '../contracts/types'
import { writeScreenshotLog } from '../logging/runtimeLogger'
import { getFeaturePreloadPath, loadFeatureRoute } from './windowUtils'

export const pinByPicPayloads = new Map<number, PinByPicImagePayload>()
const pinByPicWindows = new Set<BrowserWindow>()

/** 判断两个坐标值在像素误差范围内是否相等。 */
const rectApproxEquals = (a: number, b: number): boolean => Math.abs(a - b) <= 2

/** 计算矩形中心点。 */
const rectCenter = (rect: ScreenshotRect): Electron.Point => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2
})

/** 将显示器 DIP 边界换算为原生像素边界。 */
const displayNativeBounds = (display: Electron.Display): ScreenshotRect => {
  const scale = display.scaleFactor || 1
  return {
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width * scale,
    height: display.bounds.height * scale
  }
}

/** 判断点是否位于矩形范围内。 */
const pointInRect = (point: Electron.Point, rect: ScreenshotRect): boolean =>
  point.x >= rect.x &&
  point.x <= rect.x + rect.width &&
  point.y >= rect.y &&
  point.y <= rect.y + rect.height

/** 将高分屏返回的原生像素选区归一化为钉图窗口使用的 DIP。 */
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

/** 将最新钉图提升到最高层，同时降低旧钉图层级。 */
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

/** 提升指定的最新钉图窗口并记录当前窗口数量。 */
export const raisePinByPicWindows = (latest?: BrowserWindow): void => {
  if (latest && !latest.isDestroyed()) {
    showPinByPicOnTop(latest)
  }
  writeScreenshotLog('log', 'pin-window', 'raised pin windows', {
    count: pinByPicWindows.size,
    latestId: latest?.id
  })
}

/** 根据截图选区和显示器缩放创建可移动、可缩放的钉图窗口。 */
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
      preload: getFeaturePreloadPath(),
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
  loadFeatureRoute(win, '/pin-by-pic')
  pinByPicWindows.add(win)
  pinByPicPayloads.set(win.webContents.id, { imageBase64 })
  win.on('closed', () => {
    pinByPicWindows.delete(win)
    pinByPicPayloads.delete(win.webContents.id)
  })
}

/** 创建并展示钉图窗口。 */
export const runPinAction = (payload: ScreenshotPayload): void => {
  writeScreenshotLog('log', 'pin', 'start pin-by-pic action', {
    width: payload.width,
    height: payload.height,
    selectionRect: payload.selectionRect,
    anchorRect: payload.anchorRect
  })
  createPinByPicWindow(payload)
}
