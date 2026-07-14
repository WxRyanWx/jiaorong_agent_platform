import { screen } from 'electron'

/** 将 uiohook 的 Windows 物理坐标转换为 Electron DIP。 */
export const toDipPoint = (point: { x: number; y: number }): { x: number; y: number } => {
  if (process.platform !== 'win32') return point
  try {
    return screen.screenToDipPoint(point)
  } catch (error) {
    console.warn('[highlightedText] screenToDipPoint failed, fallback to raw point:', error)
    return point
  }
}
