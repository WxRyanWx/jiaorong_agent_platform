/** 应用平台共享类型：目录、清单、运行时、侧栏打开信息。 */

/** 主题。 */
export type ThemeMode = 'light' | 'dark'

/** `context.get` 出参。 */
export type JiaorongAppHostContext = {
  /** 登录用户名。 */
  userId: string
  /** 当前组织，没有则为 null。 */
  orgId: string | null
  /** 界面语言。 */
  locale: string
  /** 亮/暗色。 */
  theme: ThemeMode
  /** 当前应用 id。 */
  appId: string
  /** 安装目录。 */
  appDir: string
  /** xkaitoken；未登录为 null。 */
  token: string | null
  /** 云端 API 根。 */
  apiBaseUrl?: string
  /** 请求头 Product-Id。 */
  productId?: string
}

/** 侧栏槽位；目前只有菜单。 */
export type JiaorongAppSlot = 'menu'

/** 应用来源。 */
export type JiaorongAppSource = 'builtin' | 'local-debug' | 'store'

/** 安装状态。 */
export type JiaorongAppInstallStatus =
  | 'not_installed'
  | 'installed'
  | 'update_available'
  | 'installing'
  | 'error'

/** 目录级权限。缺省 / 三数组皆空 = 全员可见。下载前过滤。 */
export type JiaorongAppAuth = {
  /** 可见组织 orgNo。 */
  orgs: string[]
  /** 可见用户 userName。 */
  userIds: string[]
  /** 可见手机号。 */
  phones: string[]
}

/** 包形态。 */
export type JiaorongAppPackage = {
  /** 文件夹或 zip。 */
  kind: 'dir' | 'zip'
  /** M1：`src/jiaorong_src/apps/<dir>` 或 extraResources `jiaorong-apps/<dir>` */
  builtinDir?: string
  /** M2 后管 zip */
  downloadUrl?: string
  /** zip 校验。 */
  sha256?: string
}

/**
 * 内置 JSON 与后管列表共用。不要把 auth 写进包内 app.json。
 */
export type JiaorongAppCatalogRecord = {
  /** 应用 id。 */
  id: string
  /** 显示名。 */
  name: string
  /** 目录版本；安装比对用磁盘 app.json。 */
  version: string
  /** 描述。 */
  description?: string
  /** 图标相对路径。 */
  icon?: string
  /** 侧栏位置。 */
  slot: JiaorongAppSlot
  /** 来源。 */
  source: JiaorongAppSource
  /** 是否启用。 */
  enabled?: boolean
  /** 可见性。 */
  auth?: JiaorongAppAuth | null
  /** 包。 */
  package: JiaorongAppPackage
}

/** 磁盘上的包清单（应用方维护） */
export type JiaorongAppManifest = {
  /** 应用 id。 */
  id: string
  /** 显示名。 */
  name: string
  /** 版本，与安装目录比对。 */
  version: string
  /** 图标。 */
  icon?: string
  /** 描述。 */
  description?: string
  /** webview 入口。 */
  entry: string
  /** 槽位。 */
  slot?: JiaorongAppSlot
  /** 点开时管理类 spawn 一次的脚本，可用 && 拼接。 */
  spawn?: string
}

/** 扫盘后的运行时项。 */
export type JiaorongAppRuntime = JiaorongAppCatalogRecord & {
  /** 当前用户是否可见。 */
  visible: boolean
  /** 安装状态。 */
  installStatus: JiaorongAppInstallStatus
  /** 已安装版本。 */
  installedVersion?: string | null
  /** 用户目录。 */
  appDir?: string | null
  /** 实际入口。 */
  entry?: string | null
}

/** 当前登录用户。 */
export type JiaorongAppUserIdentity = {
  /** 用户名。 */
  userName: string | null
  /** 组织号。 */
  orgNos: string[]
  /** 手机号。 */
  phone: string | null
}

/** 侧栏一条应用。 */
export type JiaorongMenuAppItem = {
  /** 应用 id。 */
  id: string
  /** 显示名。 */
  name: string
  /** 图标 URL。 */
  iconSrc?: string | null
  /** 版本。 */
  version: string
  /** 安装状态。 */
  installStatus: JiaorongAppInstallStatus
}

/** webview 打开参数。 */
export type JiaorongAppOpenInfo = {
  /** 应用 id。 */
  appId: string
  /** `jiaorong-app://` 入口。 */
  src: string
  /** preload file URL。 */
  preload: string
  /** persist 分区。 */
  partition: string
}
