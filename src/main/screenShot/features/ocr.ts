import { app, BrowserWindow, screen } from 'electron'
import { is } from '@electron-toolkit/utils'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { getPayloadBytes, imageBase64FromPayload } from '../capture/imageUtils'
import type { OcrResultWindowPayload, ScreenshotPayload } from '../contracts/types'
import { writeScreenshotLog } from '../logging/runtimeLogger'
import { getFeaturePreloadPath, loadFeatureRoute } from './windowUtils'

const require = createRequire(import.meta.url)
const { createWorker } = require('tesseract.js') as {
  createWorker: (...args: unknown[]) => Promise<OcrWorker>
}
type OcrWorker = {
  recognize: (image: Buffer | Uint8Array | string) => Promise<{ data?: { text?: string } }>
  terminate: () => Promise<void>
}
export const ocrResultPayloads = new Map<number, OcrResultWindowPayload>()
const ocrResultWindows = new Set<BrowserWindow>()
const OCR_RESULT_WINDOW_WIDTH = 665
const OCR_RESULT_WINDOW_HEIGHT = 520
const OCR_EMPTY_MESSAGE = '未识别到文字，当前仅支持中文或英文内容。'
let ocrWorkerPromise: Promise<OcrWorker> | null = null
let ocrQueue: Promise<void> = Promise.resolve()
const getTessdataPath = (): string =>
  is.dev
    ? join(app.getAppPath(), 'resources')
    : join(process.resourcesPath, 'app.asar.unpacked/resources')

/** 延迟创建并复用 OCR worker，避免每次识别都重新加载语言模型。 */
const getOcrWorker = (): Promise<OcrWorker> => {
  if (!ocrWorkerPromise) {
    const startedAt = Date.now()
    ocrWorkerPromise = createWorker('chi_sim+eng', undefined, {
      langPath: getTessdataPath(),
      gzip: false
    })
      .then((worker) => {
        writeScreenshotLog('log', 'ocr', 'OCR worker ready', {
          duration: `${Date.now() - startedAt}ms`
        })
        return worker
      })
      .catch((error) => {
        ocrWorkerPromise = null
        throw error
      })
  }
  return ocrWorkerPromise
}

/** 在用户选择截图区域期间后台加载 OCR 模型，缩短首次识别等待。 */
export const warmOcrWorker = (): void => {
  void getOcrWorker().catch((error) => {
    writeScreenshotLog('warn', 'ocr', 'OCR worker warm-up failed', error)
  })
}

/** 丢弃异常 worker，让下一次 OCR 可以重新初始化恢复。 */
const resetOcrWorker = async (): Promise<void> => {
  const workerPromise = ocrWorkerPromise
  ocrWorkerPromise = null
  if (!workerPromise) return
  try {
    const worker = await workerPromise
    await worker.terminate()
  } catch {
    // 初始化或终止失败时已无可复用实例。
  }
}

app.once('will-quit', () => {
  void resetOcrWorker()
})

/** 创建位于当前屏幕中央的 OCR 结果窗口。 */
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
      preload: getFeaturePreloadPath(),
      sandbox: false,
      contextIsolation: true,
      devTools: is.dev
    }
  })
  loadFeatureRoute(win, '/ocr-result')
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

/** 缓存并向 OCR 结果窗口发送最终识别数据。 */
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

/** 使用复用的中英文 Tesseract worker 识别图片，并串行处理并发请求。 */
const ocrImage = async (
  bytes: Uint8Array
): Promise<{ text: string; empty: boolean; message: string }> => {
  const recognize = async (): Promise<{ text: string; empty: boolean; message: string }> => {
    const worker = await getOcrWorker()
    const startedAt = Date.now()
    try {
      const { data } = await worker.recognize(Buffer.from(bytes))
      const text = String(data?.text || '').trim()
      writeScreenshotLog('log', 'ocr', 'OCR recognition finished', {
        duration: `${Date.now() - startedAt}ms`,
        textLength: text.length
      })
      return text
        ? { text, empty: false, message: '' }
        : { text: '', empty: true, message: OCR_EMPTY_MESSAGE }
    } catch (error) {
      await resetOcrWorker()
      throw error
    }
  }
  const result = ocrQueue.then(recognize)
  ocrQueue = result.then(
    () => undefined,
    () => undefined
  )
  return result
}

/** 执行 OCR 识别并更新结果窗口。 */
export const runOcrAction = async (payload: ScreenshotPayload): Promise<void> => {
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
}
