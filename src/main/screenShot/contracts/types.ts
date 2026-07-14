/** node-screenshots 暴露的显示器采集接口。 */
export type NodeScreenshotMonitor = {
  id: () => number
  name: () => string
  captureImage: () => Promise<{
    width: number
    height: number
    toRaw: () => Promise<Uint8Array | Buffer>
  }>
}

/** Renderer 发起屏幕采集时携带的区域配置。 */
export type ScreenCaptureConfig = {
  x: string
  y: string
  width: string
  height: string
}

/** 截图操作在主进程中使用的图片和选区数据。 */
export type ScreenshotPayload = {
  uint8?: number[] | Uint8Array
  width?: number
  height?: number
  x?: number
  y?: number
  anchorRect?: { x: number; y: number; width: number; height: number }
  selectionRect?: { x: number; y: number; width: number; height: number }
}

/** 截图选区的矩形坐标。 */
export type ScreenshotRect = NonNullable<ScreenshotPayload['selectionRect']>

/** 一帧 RGBA 原始像素。 */
export type RgbaFrame = {
  uint8: Uint8Array
  width: number
  height: number
}

/** 显示器信息及其对应的采集帧。 */
export type CapturedDisplayFrame = {
  display: Electron.Display
  frame: RgbaFrame
}

/** 截图完成后可执行的业务动作。 */
export type ScreenshotAction =
  | 'ocr-rec'
  | 'ask-by-pic'
  | 'ask-by-pic-new'
  | 'pin-by-pic'
  | 'summary'
  | 'extract-table'
  | 'solve-problem'

/** 从主窗口读取当前登录令牌的方法。 */
export type MainWindowTokenReader = () => Promise<string | null>

/** 读取用户当前截图快捷键的方法。 */
export type ScreenshotShortcutReader = () => string | undefined

/** OCR 结果窗口初始化及更新所需的数据。 */
export type OcrResultWindowPayload = {
  imageBase64: string
  text: string
  empty: boolean
  message: string
  loading?: boolean
}

/** 钉图窗口初始化所需的图片数据。 */
export type PinByPicImagePayload = {
  imageBase64: string
}
