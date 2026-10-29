/** 客户端本地能力适配器：开放平台业务层不直接触碰 Electron preload。 */

import type { JiaorongDevAppRecord, JiaorongDevCenterItem } from '../../appHost/types'
import type { AppManifestFormFields } from '../../appHost/manifestRules'

export type OpenPlatformAppCapabilities = {
  syncLocalApps: (apps: JiaorongDevAppRecord[]) => Promise<void>
  listLocalApps: () => Promise<JiaorongDevCenterItem[]>
  createLocalApp: () => Promise<{ ok: boolean; message?: string; record?: JiaorongDevAppRecord }>
  publishLocalApp: (input: {
    appId: string
    manifestJson: string
    zipPath: string
    /** 服务端卡片本机没登记目录，置真跳过登记校验。 */
    allowUnregistered?: boolean
  }) => Promise<{ ok: boolean; message?: string; zipBase64?: string }>
  pickZip: () => Promise<string | null>
  peekZip: (zipPath: string) => Promise<AppManifestFormFields | null>
  openApp: (appId: string) => Promise<{ ok: boolean; cancelled?: boolean; message?: string }>
  onLocalAppsChanged: (listener: () => void) => () => void
}

export function createClientAppCapabilities(): OpenPlatformAppCapabilities {
  return {
    async syncLocalApps(apps) {
      await window.jiaorongApps?.syncDevApps(apps)
    },
    async listLocalApps() {
      return (await window.jiaorongApps?.listDevCenter()) ?? []
    },
    async createLocalApp() {
      return (await window.jiaorongApps?.createDevApp()) ?? { ok: false, message: 'MISSING' }
    },
    async publishLocalApp(input) {
      return (
        (await window.jiaorongApps?.publishDevApp(
          input.appId,
          input.manifestJson,
          input.zipPath,
          input.allowUnregistered
        )) ?? { ok: false, message: 'MISSING' }
      )
    },
    async pickZip() {
      const result = await window.jiaorongApps?.pickDevZip()
      if (!result) return null
      if (!result.ok) {
        if (result.message !== '已取消') throw new Error(result.message)
        return null
      }
      return result.filePath ?? null
    },
    async peekZip(zipPath) {
      const result = await window.jiaorongApps?.peekDevZip(zipPath)
      if (!result || !result.ok) return null
      return result.fields ?? null
    },
    async openApp(appId) {
      return (
        (await window.jiaorongApps?.openDevAppWindow(appId)) ?? {
          ok: false,
          message: 'MISSING'
        }
      )
    },
    onLocalAppsChanged(listener) {
      return window.jiaorongApps?.onCatalogChanged?.(listener) ?? (() => undefined)
    }
  }
}
