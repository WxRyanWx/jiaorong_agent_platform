import type { DeepchatBridge } from '@shared/contracts/bridge'
import type {
  JiaorongAppCenterItem,
  JiaorongDevAppRecord,
  JiaorongDevCenterItem,
  JiaorongAppOpenInfo,
  JiaorongMenuAppItem
} from '@jiaorong/appHost/types'

declare global {
  interface Window {
    deepchat: DeepchatBridge
    api: {
      copyText(text: string): void
      copyImage(image: string): void
      readClipboardText(): string
      getPathForFile(file: File): string
      getPlatform(): string
      getArch(): string
      openExternal?(url: string): Promise<void>
      toRelativePath?(filePath: string, baseDir?: string): string
      formatPathForInput?(filePath: string): string
    }
    __deepchatDev?: {
      goToWelcome(): boolean
      clearWelcomeOverride(): boolean
    }
    jiaorongApps?: {
      listVisible(): Promise<JiaorongMenuAppItem[]>
      listAppCenter(): Promise<JiaorongAppCenterItem[]>
      installAppCenter(
        appId: string
      ): Promise<{ ok: boolean; message?: string; item?: JiaorongAppCenterItem }>
      uninstallAppCenter(appId: string): Promise<{ ok: boolean; message?: string }>
      listDevCenter(): Promise<JiaorongDevCenterItem[]>
      createDevApp(): Promise<{ ok: boolean; message?: string; record?: JiaorongDevAppRecord }>
      publishDevApp(
        appId: string,
        manifestJson: string,
        zipPath: string
      ): Promise<{ ok: boolean; message?: string; filePath?: string }>
      pickDevZip(): Promise<{ ok: boolean; message?: string; filePath?: string }>
      peekDevZip(zipPath: string): Promise<{
        ok: boolean
        message?: string
        fields?: {
          id: string
          name: string
          version: string
          entry: string
          slot: string
          icon: string
          description: string
          spawn: string
        }
      }>
      downloadDevSample(): Promise<{ ok: boolean; message?: string; filePath?: string }>
      syncDevApps(apps: JiaorongDevAppRecord[]): Promise<JiaorongDevAppRecord[]>
      openDevAppWindow(appId: string): Promise<boolean>
      getOpenInfo(appId: string): Promise<JiaorongAppOpenInfo | null>
      leave(appId: string): Promise<{ ok: boolean }>
      onCatalogChanged(handler: () => void): () => void
    }
  }
}
