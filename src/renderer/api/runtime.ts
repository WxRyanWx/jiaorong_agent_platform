type RendererRuntimeApi = Window['api']

function getRendererRuntimeApi(): RendererRuntimeApi {
  if (!window.api) {
    throw new Error('window.api is not available')
  }

  return window.api
}

export function copyRuntimeText(text: string): void {
  getRendererRuntimeApi().copyText(text)
}

export function copyRuntimeImage(image: string): void {
  getRendererRuntimeApi().copyImage(image)
}

export function readRuntimeClipboardText(): string {
  return getRendererRuntimeApi().readClipboardText()
}

export function getRuntimePathForFile(file: File): string {
  return getRendererRuntimeApi().getPathForFile(file) ?? ''
}

export function getRuntimeWindowId(): number | null {
  return getRendererRuntimeApi().getWindowId() ?? null
}

export function getRuntimeWebContentsId(): number | null {
  return getRendererRuntimeApi().getWebContentsId?.() ?? null
}

export async function openRuntimeExternal(url: string): Promise<void> {
  const runtimeApi = getRendererRuntimeApi()
  if (!runtimeApi.openExternal) {
    throw new Error('window.api.openExternal is not available')
  }

  await runtimeApi.openExternal(url)
}

export function toRuntimeRelativePath(filePath: string, baseDir?: string): string {
  return getRendererRuntimeApi().toRelativePath?.(filePath, baseDir) ?? filePath
}

export function formatRuntimePathForInput(filePath: string): string {
  return getRendererRuntimeApi().formatPathForInput?.(filePath) ?? filePath
}

export function getRuntimeAuthToken(): Promise<string | null> {
  return getRendererRuntimeApi().getAuthToken?.() ?? Promise.resolve(null)
}

// CardPopup 文本兜底读取：首次 IPC 推送丢失时从主进程缓存读取。
export function getRuntimeCurrentCardPopupText(): Promise<string> {
  return getRendererRuntimeApi().getCurrentCardPopupText?.() ?? Promise.resolve('')
}

// 翻译弹窗原文兜底读取：首次 update-translation-text 丢失时从主进程缓存读取。
export function getRuntimeCurrentTranslatePopupText(): Promise<string> {
  return getRendererRuntimeApi().getCurrentTranslatePopupText?.() ?? Promise.resolve('')
}

// 真实翻译请求统一走主进程，避免 renderer CORS 和 token 暴露面扩大。
export function translateRuntimeSelectedText(text: string, locale?: string): Promise<string> {
  return getRendererRuntimeApi().translateSelectedText?.(text, locale) ?? Promise.resolve('')
}

export function startRuntimeWindowDrag(screenX: number, screenY: number): void {
  getRendererRuntimeApi().startWindowDrag?.(screenX, screenY)
}

export function moveRuntimeWindowDrag(screenX: number, screenY: number): void {
  getRendererRuntimeApi().moveWindowDrag?.(screenX, screenY)
}

export function endRuntimeWindowDrag(): void {
  getRendererRuntimeApi().endWindowDrag?.()
}
