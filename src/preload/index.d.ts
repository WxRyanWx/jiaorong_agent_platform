import { ElectronAPI } from '@electron-toolkit/preload'
import type { DeepchatBridge } from '@shared/contracts/bridge'
import type {
  ScreenshotDebugLogPayload,
  ScreenshotStartupMarkPayload
} from '../main/screenShot/screenshot-ipc'

type ScreenshotShotPayload = {
  uint8: Uint8Array | number[]
  width: number
  height: number
  x?: number
  y?: number
  anchorRect?: { x: number; y: number; width: number; height: number }
  selectionRect?: { x: number; y: number; width: number; height: number }
}

declare global {
  interface Window {
    electron: ElectronAPI
    deepchat: DeepchatBridge
    api: {
      onMessage(
        channel: string,
        callback: (...args: unknown[]) => void
      ): (...args: unknown[]) => void
      removeMessageListener(channel: string, callback: (...args: unknown[]) => void): void
      copyText(text: string): void
      copyTextByMain(text: string): Promise<boolean>
      getOcrResultData(): Promise<{
        imageBase64?: string
        text?: string
        empty?: boolean
        message?: string
        loading?: boolean
      } | null>
      getPinByPicImage(): Promise<{ imageBase64?: string } | null>
      copyImage(image: string): void
      readClipboardText(): string
      getPathForFile(file: File): string
      getWindowId(): number | null
      getWebContentsId(): number
      openExternal?(url: string): Promise<void>
      toRelativePath?(filePath: string, baseDir?: string): string
      formatPathForInput?(filePath: string): string
      getAuthToken?(): Promise<string | null>
      openScreenShotWindow?(): Promise<void>
      getScreenshotToolbarConfig?(): Promise<unknown>
      onScreenshotToolbarConfig?(callback: (payload: unknown) => void): () => void
      onScreenshotStartupMark?(
        callback: (payload: ScreenshotStartupMarkPayload) => void
      ): () => void
      onScreenshotRecapture?(callback: (payload: unknown) => void): () => void
      onScreenshotSessionDismiss?(callback: () => void): () => void
      useMain?: {
        _normalizeOptionalNumber(value: unknown): number | undefined
        _frameBufferToUint8(raw: unknown): Uint8Array
        _normalizeShotPayload(payload: ScreenshotShotPayload): {
          uint8: number[]
          width: number
          height: number
          x?: number
          y?: number
          anchorRect?: { x: number; y: number; width: number; height: number }
          selectionRect?: { x: number; y: number; width: number; height: number }
        }
        openScreenShotWindow(): Promise<void>
        getScreenshotToolbarConfig(): Promise<unknown>
        onScreenshotToolbarConfig(callback: (payload: unknown) => void): () => void
        onScreenshotStartupMark(
          callback: (payload: ScreenshotStartupMarkPayload) => void
        ): () => void
        onScreenshotRecapture(callback: (payload: unknown) => void): () => void
        onScreenshotSessionDismiss(callback: () => void): () => void
        getMousePosition(): Promise<{ x: number; y: number }>
        getScreenFrame(config: { x: string; y: string; width: string; height: string }): Promise<{
          uint8: Uint8Array
          width: number
          height: number
        } | null>
        getScreenFrames(config: {
          x: string
          y: string
          width: string
          height: string
        }): Promise<unknown>
        getScreenBase64(config: {
          x: string
          y: string
          width: string
          height: string
        }): Promise<string>
        writeImageToClip(uint8: Uint8Array): Promise<boolean>
        closeScreenWindow(): Promise<boolean>
        getDisplayScaleFactor(): Promise<number>
        getDisplayMetrics(): Promise<unknown>
        notifyScreenshotSessionReady(): Promise<boolean>
        presentScreenshotSession(): Promise<boolean>
        revealScreenshotSession(): Promise<boolean>
        getScreenshotSessionTiles(): Promise<unknown>
        exportSelectionBase(payload: unknown): Promise<unknown>
        exportSelectionBaseFromCache(payload: unknown): Promise<unknown>
        sendOverlayPointer(payload: unknown): undefined
        broadcastOverlayState(payload: unknown): undefined
        broadcastOverlayDraw(payload: unknown): undefined
        onOverlayFrame(callback: (payload: unknown) => void): () => void
        onOverlayState(callback: (payload: unknown) => void): () => void
        onOverlayDraw(callback: (payload: unknown) => void): () => void
        onOverlayPointer(callback: (payload: unknown) => void): () => void
        debugLog(payload: ScreenshotDebugLogPayload): Promise<boolean>
        ocrRec(payload: ScreenshotShotPayload): Promise<unknown>
        askByPic(payload: ScreenshotShotPayload): Promise<unknown>
        askByPicNew(payload: ScreenshotShotPayload): Promise<unknown>
        summary(payload: ScreenshotShotPayload): Promise<unknown>
        extractTable(payload: ScreenshotShotPayload): Promise<unknown>
        solveProblem(payload: ScreenshotShotPayload): Promise<unknown>
        pinByPic(payload: ScreenshotShotPayload): Promise<unknown>
      }
      // CardPopup 首次 IPC 文本丢失时，从主进程缓存读取当前划词文本。
      getCurrentCardPopupText?(): Promise<string>
      // 翻译弹窗首次 IPC 文本丢失时，从主进程缓存读取当前翻译原文。
      getCurrentTranslatePopupText?(): Promise<string>
      translateSelectedText?(text: string, locale?: string): Promise<string>
      startWindowDrag?(screenX: number, screenY: number): void
      moveWindowDrag?(screenX: number, screenY: number): void
      endWindowDrag?(): void
    }
    __deepchatDev?: {
      goToWelcome(): boolean
      clearWelcomeOverride(): boolean
    }
    floatingButtonAPI: typeof floatingButtonAPI
  }
}
