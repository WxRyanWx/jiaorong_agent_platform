import { ElectronAPI } from '@electron-toolkit/preload'
import type { DeepchatBridge } from '@shared/contracts/bridge'

declare global {
  interface Window {
    electron: ElectronAPI
    deepchat: DeepchatBridge
    api: {
      copyText(text: string): void
      copyImage(image: string): void
      readClipboardText(): string
      getPathForFile(file: File): string
      getWindowId(): number | null
      getWebContentsId(): number
      openExternal?(url: string): Promise<void>
      toRelativePath?(filePath: string, baseDir?: string): string
      formatPathForInput?(filePath: string): string
      getAuthToken?(): Promise<string | null>
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
