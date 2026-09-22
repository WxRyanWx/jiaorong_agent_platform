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
  /** 当前客户端环境：测试服 `dev`，正式服 `prod`。 */
  env: 'dev' | 'prod'
}

/** 落位：侧栏菜单，或只在应用中心打开。 */
export type JiaorongAppSlot = 'menu' | 'app-center'

/** 应用来源：`builtin` 随客户端内置、`local-debug` 本地调试目录、`store` 后管下发。 */
export type JiaorongAppSource = 'builtin' | 'local-debug' | 'store'

/** 安装状态：未安装 / 已安装 / 有可用更新 / 安装中 / 安装失败。 */
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
  /** 落位：侧栏菜单或只在应用中心。 */
  slot: JiaorongAppSlot
  /** 来源。 */
  source: JiaorongAppSource
  /** 是否启用。 */
  enabled?: boolean
  /** 可见性。 */
  auth?: JiaorongAppAuth | null
  /** 提供方；应用中心卡片展示，配置未给则为空。 */
  provider?: string
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
  /** 落位。 */
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

/** 应用中心一条应用。 */
export type JiaorongAppCenterItem = {
  /** 应用 id。 */
  id: string
  /** 显示名。 */
  name: string
  /** 描述。 */
  description?: string
  /** 图标 URL；未安装且无本地图标时为 null。 */
  iconSrc?: string | null
  /** 目录版本。 */
  version: string
  /** 已装版本。 */
  installedVersion?: string | null
  /** 安装状态。 */
  installStatus: JiaorongAppInstallStatus
  /** 是否远程 zip 包（下载 / 更新走网络）。 */
  remotePackage: boolean
  /** 当前用户是否可打开。 */
  openable: boolean
  /** 是否允许卸载（仅开发者）。 */
  canUninstall: boolean
  /** 是否仅开发者可见（单应用 auth 未通过）。 */
  developerOnly: boolean
  /** 提供方；配置未给则为空串。 */
  provider: string
}

/** 开发者本地登记的一个应用（浏览器存储 apps.json 的一条）。 */
export type JiaorongDevAppRecord = {
  /** 应用 id，取自 app.json。 */
  id: string
  /** 显示名。 */
  name: string
  /** 版本。 */
  version: string
  /** 描述。 */
  description?: string
  /** 图标相对路径（取自 app.json）。 */
  icon?: string
  /** 插件文件夹绝对路径。 */
  dir: string
  /** 登记时间戳。 */
  createdAt: number
}

/** 开发者中心一张卡片。 */
export type JiaorongDevCenterItem = {
  /** 应用 id。 */
  id: string
  /** 显示名。 */
  name: string
  /** 描述。 */
  description?: string
  /** 图标 URL。 */
  iconSrc?: string | null
  /** 版本。 */
  version: string
  /** 安装状态。 */
  installStatus: JiaorongAppInstallStatus
  /** 是否可打开（已落盘且可见）。 */
  openable: boolean
  /** 是否默认示例应用。 */
  sample: boolean
  /** 提供方 / 来源说明。 */
  provider: string
  /** 本地目录；示例应用为空串。 */
  dir: string
}

/** 打开应用时 Node spawn 的警告：页面仍打开，但后端没起来。 */
export type JiaorongAppSpawnWarning = {
  /** 端口被其他已打开应用占用，或进程立刻退出。 */
  kind: 'port_busy' | 'exited'
  /** 当前仍在跑、可能占端口的应用显示名。 */
  occupiers?: string[]
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
  /** Node 没起来时的原因，供宿主 toast。 */
  spawnWarning?: JiaorongAppSpawnWarning
}
