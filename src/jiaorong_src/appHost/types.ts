export type ThemeMode = 'light' | 'dark'

export type JiaorongAppHostContext = {
  userId: string
  orgId: string | null
  locale: string
  theme: ThemeMode
  appId: string
  appDir: string
  token: string | null
  apiBaseUrl?: string
  productId?: string
}

export type JiaorongAppSlot = 'menu'

export type JiaorongAppSource = 'builtin' | 'local-debug' | 'store'

export type JiaorongAppInstallStatus =
  | 'not_installed'
  | 'installed'
  | 'update_available'
  | 'installing'
  | 'error'

/** 目录级权限。缺省 / 两数组皆空 = 全员可见。下载前过滤。 */
export type JiaorongAppAuth = {
  orgs: string[]
  userIds: string[]
}

export type JiaorongAppPackage = {
  kind: 'dir' | 'zip'
  /** M1：`src/jiaorong_src/apps/<dir>` 或 extraResources `jiaorong-apps/<dir>` */
  builtinDir?: string
  /** M2 后管 zip */
  downloadUrl?: string
  sha256?: string
}

/**
 * 内置 JSON 与后管列表共用。不要把 auth 写进包内 app.json。
 */
export type JiaorongAppCatalogRecord = {
  id: string
  name: string
  version: string
  description?: string
  icon?: string
  slot: JiaorongAppSlot
  source: JiaorongAppSource
  enabled?: boolean
  auth?: JiaorongAppAuth | null
  package: JiaorongAppPackage
}

/** 磁盘上的包清单（应用方维护） */
export type JiaorongAppManifest = {
  id: string
  name: string
  version: string
  icon?: string
  description?: string
  entry: string
  slot?: JiaorongAppSlot
  node?: {
    entry: string
    startCommand: string
    port: number
  }
}

export type JiaorongAppRuntime = JiaorongAppCatalogRecord & {
  visible: boolean
  installStatus: JiaorongAppInstallStatus
  installedVersion?: string | null
  appDir?: string | null
  entry?: string | null
  node?: JiaorongAppManifest['node'] | null
}

export type JiaorongAppUserIdentity = {
  userName: string | null
  orgNos: string[]
}

export type JiaorongMenuAppItem = {
  id: string
  name: string
  iconSrc?: string | null
  version: string
  installStatus: JiaorongAppInstallStatus
}

export type JiaorongAppOpenInfo = {
  appId: string
  src: string
  preload: string
  partition: string
}
