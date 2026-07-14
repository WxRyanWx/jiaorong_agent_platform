import { app, BrowserWindow, screen } from 'electron'
import { is } from '@electron-toolkit/utils'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { getPayloadBytes, imageBase64FromPayload } from '../capture/imageUtils'
import type { OcrResultWindowPayload, ScreenshotPayload } from '../contracts/types'
import { writeScreenshotLog } from '../logging/runtimeLogger'
import { getFeaturePreloadPath, showAlwaysOnTop } from './windowUtils'

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

/** 生成独立 OCR 结果页，避免为简单结果窗口加载完整主应用 renderer。 */
const createOcrResultDocument = (imageBase64: string): string => {
  const imageUrl = `data:image/png;base64,${imageBase64}`
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'"><style>*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#1f2329}.panel{width:100%;height:100%;display:flex;flex-direction:column;background:#fff}.header{-webkit-app-region:drag;height:48px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;border-bottom:1px solid #e5e6eb}.title{font-size:16px;font-weight:600}.close{-webkit-app-region:no-drag;width:28px;height:28px;border:0;border-radius:6px;background:transparent;color:#646a73;font-size:20px;cursor:pointer}.close:hover{background:#f2f3f5}.body{display:flex;flex:1;min-height:0}.image-column{width:393px;padding:16px}.image-box{width:100%;height:100%;border:0;padding:0;background:#f7f8fa;cursor:pointer;overflow:hidden}.image-box img{display:block;width:100%;height:100%;object-fit:contain}.text-column{flex:1;border-left:1px solid #ddd;padding:16px;min-width:0}.preview{height:100%;display:flex;flex-direction:column}.label{font-size:14px;font-weight:600;margin-bottom:12px}.status{color:#86909c;font-size:14px}.text{flex:1;margin:0;white-space:pre-wrap;word-break:break-word;overflow:auto;font:14px/1.6 inherit}.footer{height:64px;display:flex;align-items:center;justify-content:flex-end;padding:0 16px;border-top:1px solid #e5e6eb}.copy{height:32px;padding:0 16px;border:0;border-radius:6px;background:#165dff;color:#fff;cursor:pointer}.copy:disabled{background:#c9cdd4;cursor:not-allowed}.lightbox{display:none;position:fixed;inset:0;z-index:2;background:rgba(0,0,0,.8);align-items:center;justify-content:center}.lightbox.open{display:flex}.lightbox img{max-width:94vw;max-height:92vh;object-fit:contain}.lightbox-close{position:absolute;right:18px;top:14px;border:0;background:transparent;color:#fff;font-size:30px;cursor:pointer}</style></head><body><div class="panel"><div class="header"><div class="title">文字识别</div><button id="close" class="close" aria-label="关闭">×</button></div><div class="body"><div class="image-column"><button id="imageBox" class="image-box" aria-label="点击预览大图"><img id="image" src="${imageUrl}" alt="原始截图"></button></div><div class="text-column"><div class="preview"><div class="label">识别预览</div><div id="status" class="status">识别中...</div><pre id="text" class="text"></pre></div></div></div><div class="footer"><button id="copy" class="copy" disabled>复制全文</button></div></div><div id="lightbox" class="lightbox"><button id="lightboxClose" class="lightbox-close" aria-label="关闭预览">×</button><img src="${imageUrl}" alt="截图大图预览"></div><script>(()=>{const byId=(id)=>document.getElementById(id);const status=byId('status');const text=byId('text');const copy=byId('copy');const lightbox=byId('lightbox');let currentText='';const apply=(payload)=>{const data=payload||{};currentText=String(data.text||'').trim();text.textContent=currentText;const loading=Boolean(data.loading);const empty=Boolean(data.empty);status.hidden=!loading&&!empty;status.textContent=loading?'识别中...':empty?String(data.message||'未识别到文字，当前仅支持中文或英文内容。'):'';copy.disabled=loading||empty||!currentText};window.api?.onMessage?.('ocr-result-data',apply);window.api?.getOcrResultData?.().then(apply).catch(()=>{});byId('close').onclick=()=>window.close();byId('imageBox').onclick=()=>lightbox.classList.add('open');byId('lightboxClose').onclick=()=>lightbox.classList.remove('open');lightbox.onclick=(event)=>{if(event.target===lightbox)lightbox.classList.remove('open')};copy.onclick=async()=>{if(!currentText)return;try{await window.api?.copyTextByMain?.(currentText);copy.textContent='已复制';setTimeout(()=>copy.textContent='复制全文',1200)}catch{}};addEventListener('keydown',(event)=>{if(event.key!=='Escape')return;if(lightbox.classList.contains('open'))lightbox.classList.remove('open');else window.close()})})()</script></body></html>`
}

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
  const startedAt = Date.now()
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
  win.webContents.once('did-finish-load', () => {
    if (win.isDestroyed()) return
    writeScreenshotLog('log', 'ocr-window', 'lightweight OCR document loaded', {
      duration: `${Date.now() - startedAt}ms`,
      webContentsId: win.webContents.id
    })
    showAlwaysOnTop(win)
  })
  const documentUrl = `data:text/html;charset=utf-8,${encodeURIComponent(
    createOcrResultDocument(imageBase64)
  )}`
  win.loadURL(documentUrl).catch((error) => {
    writeScreenshotLog('error', 'ocr-window', 'load lightweight OCR document failed', error)
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
