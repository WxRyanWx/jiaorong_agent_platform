import { screen } from 'electron'

/** 所有显示器按左上坐标排序后的联合区域。 */
export type DisplayUnion = ReturnType<typeof getAllDisplayBounds>

/** 读取所有显示器，并计算覆盖它们的最小 DIP 矩形。 */
export const getAllDisplayBounds = () => {
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

/** 将系统缩放比例限制在截图模块支持的 1～3 倍范围内。 */
export const getDisplayCaptureScale = (display: Electron.Display): number =>
  Math.min(Math.max(display.scaleFactor || 1, 1), 3)

/** 判断当前环境是否应使用单屏原生像素画布以保持清晰度。 */
export const shouldUseNativePixelCanvas = (union: DisplayUnion): boolean =>
  union.displays.length <= 1 && (process.platform === 'darwin' || process.platform === 'win32')

/** 根据显示器数量和缩放比例计算预览画布尺寸。 */
export const getPreviewCanvasSize = (union: DisplayUnion) => {
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

/** 计算单个显示器采集帧在联合预览画布中的目标位置和尺寸。 */
export const resolveFramePlacement = (display: Electron.Display, union: DisplayUnion) => {
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

/** 生成供截图 Renderer 使用的显示器布局与画布指标。 */
export const getDisplayMetricsPayload = () => {
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

/** 返回按屏幕物理位置稳定排序后的显示器副本。 */
export const sortDisplaysByPosition = (displays: Electron.Display[]): Electron.Display[] =>
  [...displays].sort((a, b) => {
    if (a.bounds.x !== b.bounds.x) return a.bounds.x - b.bounds.x
    return a.bounds.y - b.bounds.y
  })
