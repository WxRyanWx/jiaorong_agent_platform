import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawn, execSync, ChildProcess } from 'node:child_process'

// ==================== 枚举 ====================

/** 应用运行时状态 */
enum AppState {
  /** 已安装 */
  INSTALLED = 'INSTALLED',
  /** 已启用 */
  ENABLED = 'ENABLED',
  /** 已禁用 */
  DISABLED = 'DISABLED',
  /** 运行中 */
  RUNNING = 'RUNNING',
  /** 异常 */
  ERROR = 'ERROR'
}

/** 应用安装类型 */
enum AppInstallType {
  /** 开发模式 — 从本地文件夹加载（类似 Chrome "加载已解压的扩展"） */
  DEVELOPMENT = 'DEVELOPMENT',
  /** 正常安装 — 从安装包安装 */
  NORMAL = 'NORMAL',
  /** 旁加载 — 通过配置直接创建 */
  SIDELOAD = 'SIDELOAD'
}

// ==================== 核心类型定义 ====================

/** 应用权限配置 */
interface AppPermissions {
  /** 允许访问的角色列表 */
  roles?: string[]
  /** 允许访问的用户 ID 列表 */
  userIds?: string[]
  /** 是否需要管理员权限 */
  requireAdmin?: boolean
}

/** app.json 的清单配置结构（类似 Chrome 的 manifest.json） */
interface AppManifest {
  /** 应用唯一标识 */
  id: string
  /** 应用名称 */
  name: string
  /** 版本号 */
  version: string
  /** 图标路径 */
  icon?: string
  /** 应用描述 */
  description?: string
  /** Web 入口地址（支持 http(s):// URL 或相对路径） */
  entry: string
  /** 挂载位置 */
  slot: 'menu' | 'sidebar' | 'standalone'
  /**
   * 点开应用时由管理类 spawn 一次的脚本（npm scripts 风格，可用 && 拼接）。
   * 管理类不注入宿主通信。
   */
  spawn?: string
  /** 权限配置（可选） */
  permissions?: AppPermissions
  /** 依赖的其他应用 ID（可选） */
  dependencies?: string[]
}

/** 应用完整配置 = manifest + 运行时元数据 */
interface AppConfig extends AppManifest {
  /** 是否启用 */
  enabled: boolean
  /** 安装类型 */
  installType: AppInstallType
  /** 安装来源：文件夹路径 / 包文件路径 */
  installSource: string
  /** 安装时间 */
  installedAt: string
  /** 创建时间 */
  createdAt: string
  /** 更新时间 */
  updatedAt: string
}

// ==================== 安装选项 ====================

/** installAppFromPath 的选项 */
interface InstallFromPathOptions {
  /**
   * 安装模式：
   * - 'copy': 将源文件夹复制到 APPS 根目录（默认）
   * - 'link': 在 APPS 目录下创建链接文件（.app-link.json），指向源文件夹，
   *            应用运行时读取原始路径，不占用额外磁盘空间，适合开发调试
   * - 'reference': 仅注册到缓存中，不移动/复制文件，源文件夹保持原位
   */
  mode?: 'copy' | 'link' | 'reference'
  /** 目标文件夹名称（仅 mode='copy' 时生效，默认使用 manifest.id） */
  folderName?: string
  /** 是否覆盖已存在的应用 */
  overwrite?: boolean
  /** 安装后是否立即启用（默认 true） */
  enable?: boolean
}

/** installAppFromPackage 的选项 */
interface InstallFromPackageOptions {
  /** 目标文件夹名称（默认使用 manifest.id） */
  folderName?: string
  /** 是否覆盖已存在的应用 */
  overwrite?: boolean
  /** 安装后是否立即启用（默认 true） */
  enable?: boolean
}

/** registerApp（以配置对象旁加载）的选项 */
interface RegisterAppOptions {
  /** 应用的文件夹名称（不传则用 manifest.id） */
  folderName?: string
  /** 是否覆盖已存在的应用 */
  overwrite?: boolean
  /** 安装后是否立即启用（默认 true） */
  enable?: boolean
}

/** 更新应用时的参数（id、createdAt、installedAt、installType、installSource 不可变） */
type UpdateAppOptions = Partial<
  Omit<AppConfig, 'id' | 'createdAt' | 'installedAt' | 'installType' | 'installSource'>
>

/** 操作结果 */
interface AppManageResult<T = void> {
  success: boolean
  message: string
  data?: T
}

// ==================== 事件类型 ====================

/** 应用事件类型 */
type AppEventName =
  | 'installed'
  | 'uninstalled'
  | 'enabled'
  | 'disabled'
  | 'updated'
  | 'error'
  | 'running'
  | 'stopped'

/** 事件回调 */
type AppEventCallback = (event: AppEvent) => void

/** 应用事件对象 */
interface AppEvent {
  /** 事件名称 */
  eventName: AppEventName
  /** 应用 ID */
  appId: string
  /** 应用配置 */
  appConfig: AppConfig
  /** 事件时间 */
  timestamp: string
  /** 附加数据 */
  extra?: Record<string, unknown>
}

// ==================== 应用运行时状态 ====================

/** 运行时状态缓存（不写入 app.json，仅内存维护，可选持久化到 .app-runtime.json） */
interface AppRuntimeRecord {
  appId: string
  state: AppState
  /** Node 服务进程 PID（运行时） */
  pid?: number
  /** 子进程引用（不持久化） */
  process?: ChildProcess
  /** 健康检查是否通过 */
  healthy: boolean
  /** 上次健康检查时间 */
  lastHealthCheck?: string
  /** 最后错误信息 */
  lastError?: string
}

// ==================== 持久化结构 ====================

/** .app-link.json — link 模式下的引用文件 */
interface AppLinkFile {
  /** 指向的源文件夹绝对路径 */
  sourcePath: string
  /** 链接创建时间 */
  linkedAt: string
  /** manifest 快照 */
  manifestId: string
}

/** .app-runtime.json — 运行时状态持久化文件 */
interface AppRuntimeFile {
  [appId: string]: {
    state: AppState
    pid?: number
    healthy: boolean
    lastHealthCheck?: string
    lastError?: string
  }
}

// ==================== 主类 ====================

class appsManages {
  /** APPS 根目录路径 */
  private appsRootPath: string
  /** 配置文件名，默认 app.json */
  private configFileName: string
  /** 已加载的应用配置缓存 */
  private appCache: Map<string, AppConfig> = new Map()
  /** appId → 文件夹名 映射缓存（用于 O(1) 查找） */
  private appFolderMap: Map<string, string> = new Map()
  /** 应用运行时状态缓存 */
  private appRuntimeCache: Map<string, AppRuntimeRecord> = new Map()
  /** link 模式应用：appId → 源文件夹路径 */
  private appLinkMap: Map<string, string> = new Map()
  /** 运行中的应用进程：appId → ChildProcess */
  private runningProcesses: Map<string, ChildProcess> = new Map()

  /** 事件监听器 */
  private eventListeners: Map<AppEventName, Set<AppEventCallback>> = new Map()

  /**
   * @param appsFolderPath - APPS 文件夹的根路径，如 `C:\Users\11307\.jiaorongchat\apps`
   * @param configFileName - 清单配置文件名，默认 `app.json`
   */
  constructor(appsFolderPath: string, configFileName: string = 'app.json') {
    this.appsRootPath = path.resolve(appsFolderPath)
    this.configFileName = configFileName
    // 确保根目录存在
    this.ensureDir(this.appsRootPath)
    // 初始化时扫描加载所有已注册的应用
    this.scanApps()
    // 加载运行时状态
    this.loadRuntimeState()
    console.log(`[appsManages] 已初始化，根路径: ${this.appsRootPath}`)
  }

  // ========== 磁盘存储辅助 ==========

  /** 确保目录存在 */
  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  /** 读取 JSON 文件 */
  private readJSON<T>(filePath: string): T | null {
    if (!fs.existsSync(filePath)) return null
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T
    } catch {
      return null
    }
  }

  /** 写入 JSON 文件 */
  private writeJSON<T>(filePath: string, data: T): void {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  }

  // ========== 应用扫描与加载 ==========

  /**
   * 扫描 APPS 根目录下所有应用
   * 支持三种加载方式：
   * 1. 直接子文件夹内的 app.json
   * 2. .app-link.json 链接文件
   */
  private scanApps(): void {
    this.appCache.clear()
    this.appFolderMap.clear()
    this.appLinkMap.clear()

    if (!fs.existsSync(this.appsRootPath)) return

    const entries = fs.readdirSync(this.appsRootPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        this.tryLoadFromDirectory(entry.name)
      } else if (entry.isFile() && entry.name.endsWith('.app-link.json')) {
        this.tryLoadFromLink(entry.name)
      }
    }
    console.log(`[appsManages] 扫描完成，共加载 ${this.appCache.size} 个应用`)
  }

  /** 尝试从子文件夹加载 app.json */
  private tryLoadFromDirectory(folderName: string): boolean {
    const configPath = path.join(this.appsRootPath, folderName, this.configFileName)
    if (!fs.existsSync(configPath)) return false

    const manifest = this.readJSON<AppManifest>(configPath)
    if (!manifest) return false

    const runtimePath = path.join(this.appsRootPath, folderName, '.app-runtime.json')
    const runtimeMeta = this.readJSON<Partial<AppConfig>>(runtimePath)

    const config = this.buildFullConfig(manifest, {
      installType: AppInstallType.NORMAL,
      installSource: path.join(this.appsRootPath, folderName),
      ...runtimeMeta
    })

    this.appCache.set(config.id, config)
    this.appFolderMap.set(config.id, folderName)
    return true
  }

  /** 尝试从 .app-link.json 加载链接应用 */
  private tryLoadFromLink(linkFileName: string): boolean {
    const linkPath = path.join(this.appsRootPath, linkFileName)
    const linkData = this.readJSON<AppLinkFile>(linkPath)
    if (!linkData) return false

    const { sourcePath } = linkData
    const manifestPath = path.join(sourcePath, this.configFileName)
    if (!fs.existsSync(manifestPath)) {
      console.warn(`[appsManages] 链接源已失效: ${sourcePath}`)
      return false
    }

    const manifest = this.readJSON<AppManifest>(manifestPath)
    if (!manifest) return false

    const config = this.buildFullConfig(manifest, {
      installType: AppInstallType.DEVELOPMENT,
      installSource: sourcePath
    })

    this.appCache.set(config.id, config)
    this.appLinkMap.set(config.id, sourcePath)
    return true
  }

  /**
   * 从 manifest 构建完整的 AppConfig（补全元数据字段）
   */
  private buildFullConfig(manifest: AppManifest, overrides: Partial<AppConfig>): AppConfig {
    const now = new Date().toISOString()
    return {
      ...manifest,
      enabled: true,
      installType: AppInstallType.SIDELOAD,
      installSource: this.appsRootPath,
      installedAt: now,
      createdAt: now,
      updatedAt: now,
      ...overrides
    }
  }

  /**
   * 重新扫描所有应用（刷新缓存）
   */
  refresh(): void {
    this.scanApps()
    this.loadRuntimeState()
  }

  // ========== 运行时状态 ==========

  /** 从 .app-runtime.json 加载运行时状态 */
  private loadRuntimeState(): void {
    const runtimePath = path.join(this.appsRootPath, '.app-runtime.json')
    const data = this.readJSON<AppRuntimeFile>(runtimePath)
    if (!data) return

    for (const [appId, record] of Object.entries(data)) {
      if (this.appCache.has(appId)) {
        const previous = this.appRuntimeCache.get(appId)
        this.appRuntimeCache.set(appId, {
          appId,
          state: record.state ?? AppState.INSTALLED,
          pid: record.pid,
          process: previous?.process,
          healthy: record.healthy ?? false,
          lastHealthCheck: record.lastHealthCheck,
          lastError: record.lastError
        })
      }
    }
  }

  /** 持久化运行时状态到 .app-runtime.json */
  private saveRuntimeState(): void {
    const runtimePath = path.join(this.appsRootPath, '.app-runtime.json')
    const data: AppRuntimeFile = {}
    for (const [appId, record] of this.appRuntimeCache) {
      data[appId] = {
        state: record.state,
        pid: record.pid,
        healthy: record.healthy,
        lastHealthCheck: record.lastHealthCheck,
        lastError: record.lastError
      }
    }
    this.writeJSON(runtimePath, data)
  }

  /** 获取或创建运行时记录 */
  private getOrCreateRuntime(appId: string): AppRuntimeRecord {
    let record = this.appRuntimeCache.get(appId)
    if (!record) {
      record = {
        appId,
        state: AppState.INSTALLED,
        healthy: false
      }
      this.appRuntimeCache.set(appId, record)
    }
    return record
  }

  /** 获取应用运行时状态 */
  getAppState(appId: string): AppRuntimeRecord | null {
    return this.appRuntimeCache.get(appId) ?? null
  }

  // ========== 安装方式一：从配置对象旁加载（SIDELOAD） ==========

  /**
   * 以旁加载方式注册应用 — 从配置对象创建新应用
   * 类似 Chrome 的企业策略旁加载扩展
   *
   * @param manifest - 应用配置对象
   * @param options - 注册选项
   */
  registerApp(manifest: AppManifest, options: RegisterAppOptions = {}): AppManageResult<AppConfig> {
    const { folderName = manifest.id, overwrite = false, enable = true } = options

    // 冲突检测
    const conflictCheck = this.checkConflicts(manifest)
    if (!conflictCheck.success && !overwrite) {
      return { success: false, message: conflictCheck.message }
    }

    // 校验必填字段
    const validation = this.validateManifest(manifest)
    if (!validation.success) return validation as AppManageResult<AppConfig>

    const appDir = path.join(this.appsRootPath, folderName)
    const configPath = path.join(appDir, this.configFileName)

    try {
      this.ensureDir(appDir)

      const now = new Date().toISOString()
      const config = this.buildFullConfig(manifest, {
        enabled: enable,
        installType: AppInstallType.SIDELOAD,
        installSource: appDir,
        installedAt: now,
        createdAt: now,
        updatedAt: now
      })

      // 写入配置文件和运行时元数据
      this.writeJSON(configPath, manifest)
      // 将运行时字段单独写入 .app-runtime.json
      this.saveAppRuntimeMeta(folderName, config)

      this.appCache.set(config.id, config)
      this.appFolderMap.set(config.id, folderName)
      this.getOrCreateRuntime(config.id).state = enable ? AppState.ENABLED : AppState.DISABLED
      this.saveRuntimeState()

      this.emit('installed', config)

      return { success: true, message: `应用 "${config.id}" 注册成功`, data: config }
    } catch (err) {
      return { success: false, message: `注册应用失败: ${(err as Error).message}` }
    }
  }

  // ========== 安装方式二：从本地文件夹安装（DEVELOPMENT） ==========

  /**
   * 从本地文件夹加载应用 — 类似 Chrome "加载已解压的扩展程序"
   *
   * 支持三种模式：
   * - copy:   将文件夹完整复制到 APPS 目录
   * - link:   在 APPS 目录创建 .app-link.json 指向源文件夹（不复制文件）
   * - reference: 仅注册到缓存，不操作文件系统
   *
   * @param sourceFolderPath - 包含 app.json 的源文件夹路径
   * @param options - 安装选项
   */
  installAppFromPath(
    sourceFolderPath: string,
    options: InstallFromPathOptions = {}
  ): AppManageResult<AppConfig> {
    const { mode = 'copy', folderName, overwrite = false, enable = true } = options

    // 规范化源路径
    const sourcePath = path.resolve(sourceFolderPath)

    // 校验源文件夹
    if (!fs.existsSync(sourcePath)) {
      return { success: false, message: `源文件夹不存在: ${sourcePath}` }
    }
    if (!fs.statSync(sourcePath).isDirectory()) {
      return { success: false, message: `源路径不是文件夹: ${sourcePath}` }
    }

    // 读取并校验 app.json
    const manifestPath = path.join(sourcePath, this.configFileName)
    if (!fs.existsSync(manifestPath)) {
      return { success: false, message: `在 ${sourcePath} 中未找到 ${this.configFileName}` }
    }

    const manifest = this.readJSON<AppManifest>(manifestPath)
    if (!manifest) {
      return { success: false, message: `${this.configFileName} 格式无效` }
    }

    const validation = this.validateManifest(manifest)
    if (!validation.success) return validation as AppManageResult<AppConfig>

    // 冲突检测
    const conflictCheck = this.checkConflicts(manifest)
    if (!conflictCheck.success && !overwrite) {
      return { success: false, message: conflictCheck.message }
    }

    // 依赖检查
    const depCheck = this.resolveDependencies(manifest)
    if (!depCheck.success) return { success: false, message: depCheck.message }

    const now = new Date().toISOString()

    try {
      let config: AppConfig

      switch (mode) {
        case 'copy': {
          const targetName = folderName ?? manifest.id
          const targetDir = path.join(this.appsRootPath, targetName)

          // 如果已存在且允许覆盖，先删除旧文件夹
          if (fs.existsSync(targetDir) && overwrite) {
            fs.rmSync(targetDir, { recursive: true, force: true })
          }

          // 复制文件夹
          this.copyDirectory(sourcePath, targetDir)

          config = this.buildFullConfig(manifest, {
            enabled: enable,
            installType: AppInstallType.DEVELOPMENT,
            installSource: sourcePath,
            installedAt: now,
            createdAt: now,
            updatedAt: now
          })
          this.saveAppRuntimeMeta(targetName, config)
          this.appFolderMap.set(config.id, targetName)
          break
        }

        case 'link': {
          // 创建 .app-link.json
          const linkFileName = `${manifest.id}.app-link.json`
          const linkPath = path.join(this.appsRootPath, linkFileName)

          const linkFile: AppLinkFile = {
            sourcePath,
            linkedAt: now,
            manifestId: manifest.id
          }
          this.writeJSON(linkPath, linkFile)

          config = this.buildFullConfig(manifest, {
            enabled: enable,
            installType: AppInstallType.DEVELOPMENT,
            installSource: sourcePath,
            installedAt: now,
            createdAt: now,
            updatedAt: now
          })
          this.appLinkMap.set(config.id, sourcePath)
          break
        }

        case 'reference': {
          config = this.buildFullConfig(manifest, {
            enabled: enable,
            installType: AppInstallType.DEVELOPMENT,
            installSource: sourcePath,
            installedAt: now,
            createdAt: now,
            updatedAt: now
          })
          break
        }

        default:
          return { success: false, message: `不支持的安装模式: ${mode}` }
      }

      this.appCache.set(config.id, config)
      this.getOrCreateRuntime(config.id).state = enable ? AppState.ENABLED : AppState.DISABLED
      this.saveRuntimeState()

      this.emit('installed', config)

      return {
        success: true,
        message: `从路径安装 "${config.id}" 成功 (模式: ${mode})`,
        data: config
      }
    } catch (err) {
      return { success: false, message: `从路径安装失败: ${(err as Error).message}` }
    }
  }

  // ========== 安装方式三：从安装包安装（NORMAL） ==========

  /**
   * 从压缩包安装应用 — 类似 Chrome 安装 .crx 文件
   *
   * @param packagePath - .zip / .app 包文件路径
   * @param options - 安装选项
   */
  installAppFromPackage(
    packagePath: string,
    options: InstallFromPackageOptions = {}
  ): AppManageResult<AppConfig> {
    const absPackagePath = path.resolve(packagePath)

    if (!fs.existsSync(absPackagePath)) {
      return { success: false, message: `安装包不存在: ${absPackagePath}` }
    }

    const ext = path.extname(absPackagePath).toLowerCase()
    if (ext !== '.zip' && ext !== '.app') {
      return { success: false, message: `不支持的包格式 "${ext}"，仅支持 .zip 和 .app` }
    }

    // 尝试解压
    const tempDir = path.join(this.appsRootPath, '.temp_extract_' + Date.now())
    try {
      this.ensureDir(tempDir)
      this.extractZip(absPackagePath, tempDir)

      // 在解压目录中查找 app.json
      const manifestPath = this.findManifestInDir(tempDir)
      if (!manifestPath) {
        fs.rmSync(tempDir, { recursive: true, force: true })
        return { success: false, message: `安装包中未找到 ${this.configFileName}` }
      }

      const manifest = this.readJSON<AppManifest>(manifestPath)
      if (!manifest) {
        fs.rmSync(tempDir, { recursive: true, force: true })
        return { success: false, message: `${this.configFileName} 格式无效` }
      }

      const validation = this.validateManifest(manifest)
      if (!validation.success) {
        fs.rmSync(tempDir, { recursive: true, force: true })
        return validation as AppManageResult<AppConfig>
      }

      // 移到 APPS 目录
      const { folderName = manifest.id, overwrite = false, enable = true } = options
      const targetDir = path.join(this.appsRootPath, folderName)

      if (fs.existsSync(targetDir)) {
        if (!overwrite) {
          fs.rmSync(tempDir, { recursive: true, force: true })
          return {
            success: false,
            message: `应用 "${manifest.id}" 已存在，如需覆盖请设置 overwrite: true`
          }
        }
        fs.rmSync(targetDir, { recursive: true, force: true })
      }

      // 移动解压内容到目标目录
      const extractRoot = path.dirname(manifestPath)
      if (extractRoot === tempDir) {
        // app.json 在根目录，直接重命名 tempDir
        fs.renameSync(tempDir, targetDir)
      } else {
        // app.json 在子目录，复制该目录
        this.copyDirectory(extractRoot, targetDir)
        fs.rmSync(tempDir, { recursive: true, force: true })
      }

      const now = new Date().toISOString()
      const config = this.buildFullConfig(manifest, {
        enabled: enable,
        installType: AppInstallType.NORMAL,
        installSource: absPackagePath,
        installedAt: now,
        createdAt: now,
        updatedAt: now
      })
      this.saveAppRuntimeMeta(folderName, config)

      this.appCache.set(config.id, config)
      this.appFolderMap.set(config.id, folderName)
      this.getOrCreateRuntime(config.id).state = enable ? AppState.ENABLED : AppState.DISABLED
      this.saveRuntimeState()

      this.emit('installed', config)

      return { success: true, message: `从包安装 "${config.id}" 成功`, data: config }
    } catch (err) {
      // 清理临时目录
      if (fs.existsSync(tempDir)) {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true })
        } catch {
          /* ignore */
        }
      }
      return { success: false, message: `从包安装失败: ${(err as Error).message}` }
    }
  }

  // ========== 卸载 ==========

  /**
   * 卸载应用
   * - copy/normal 模式：删除文件夹
   * - link 模式：删除 .app-link.json
   * - reference 模式：仅从缓存移除
   *
   * @param appId - 应用 ID
   * @param keepSource - 是否保留源文件（默认 false，全部删除）
   */
  uninstallApp(appId: string, keepSource: boolean = false): AppManageResult {
    const app = this.appCache.get(appId)
    if (!app) {
      return { success: false, message: `应用 "${appId}" 不存在` }
    }

    try {
      // 如果应用正在运行，先停止
      if (this.isRunning(appId)) {
        this.stopApp(appId)
      }

      // 先停用
      this.setEnabled(appId, false)

      // 根据安装类型清理
      if (app.installType === AppInstallType.DEVELOPMENT && this.appLinkMap.has(appId)) {
        // link 模式：删除 .app-link.json
        const linkPath = path.join(this.appsRootPath, `${appId}.app-link.json`)
        if (fs.existsSync(linkPath)) fs.unlinkSync(linkPath)
        this.appLinkMap.delete(appId)
      } else if (!keepSource) {
        // copy/normal 模式：删除文件夹
        const folderName = this.appFolderMap.get(appId) ?? this.findAppFolderOnDisk(appId)
        if (folderName) {
          const appDir = path.join(this.appsRootPath, folderName)
          if (fs.existsSync(appDir)) {
            fs.rmSync(appDir, { recursive: true, force: true })
          }
        }
      }

      this.appCache.delete(appId)
      this.appFolderMap.delete(appId)
      this.appRuntimeCache.delete(appId)
      this.saveRuntimeState()

      this.emit('uninstalled', app)

      return { success: true, message: `应用 "${appId}" 已卸载` }
    } catch (err) {
      return { success: false, message: `卸载应用失败: ${(err as Error).message}` }
    }
  }

  /** 兼容旧接口 */
  deleteApp(appId: string, deleteFolder: boolean = false): AppManageResult {
    return this.uninstallApp(appId, !deleteFolder)
  }

  // ========== 更新 ==========

  /**
   * 更新应用配置
   * @param appId - 应用 ID
   * @param updates - 要更新的字段
   */
  updateApp(appId: string, updates: UpdateAppOptions): AppManageResult<AppConfig> {
    const existing = this.appCache.get(appId)
    if (!existing) {
      return { success: false, message: `应用 "${appId}" 不存在` }
    }

    const configPath = this.getAppConfigPath(appId)
    if (!configPath) {
      return { success: false, message: `找不到应用 "${appId}" 的配置文件` }
    }

    try {
      const updated: AppConfig = {
        ...existing,
        ...updates,
        id: existing.id,
        installType: existing.installType,
        installSource: existing.installSource,
        installedAt: existing.installedAt,
        updatedAt: new Date().toISOString()
      }

      // 仅将清单字段写入 app.json
      this.writeJSON(configPath, this.extractManifest(updated))

      // 运行时字段写入 .app-runtime.json
      const folderName = this.appFolderMap.get(appId)
      if (folderName) {
        this.saveAppRuntimeMeta(folderName, updated)
      }

      this.appCache.set(appId, updated)

      this.emit('updated', updated, { previousVersion: existing.version })

      return { success: true, message: `应用 "${appId}" 更新成功`, data: updated }
    } catch (err) {
      return { success: false, message: `更新应用失败: ${(err as Error).message}` }
    }
  }

  /**
   * 从源文件夹更新开发模式应用（link 模式）
   */
  updateAppFromSource(appId: string): AppManageResult<AppConfig> {
    const app = this.appCache.get(appId)
    if (!app) return { success: false, message: `应用 "${appId}" 不存在` }

    const sourcePath = app.installSource
    if (!fs.existsSync(path.join(sourcePath, this.configFileName))) {
      return { success: false, message: `源文件夹已失效: ${sourcePath}` }
    }

    const manifest = this.readJSON<AppManifest>(path.join(sourcePath, this.configFileName))
    if (!manifest) return { success: false, message: '源清单文件无效' }

    return this.updateApp(appId, {
      name: manifest.name,
      version: manifest.version,
      entry: manifest.entry,
      slot: manifest.slot,
      icon: manifest.icon,
      description: manifest.description,
      permissions: manifest.permissions,
      dependencies: manifest.dependencies
    })
  }

  // ========== 查询 ==========

  getApp(appId: string): AppConfig | null {
    return this.appCache.get(appId) ?? null
  }

  listApps(filter?: {
    enabled?: boolean
    installType?: AppInstallType
    slot?: AppConfig['slot']
  }): AppConfig[] {
    let apps = Array.from(this.appCache.values())
    if (filter?.enabled !== undefined) {
      apps = apps.filter((a) => a.enabled === filter.enabled)
    }
    if (filter?.installType) {
      apps = apps.filter((a) => a.installType === filter.installType)
    }
    if (filter?.slot) {
      apps = apps.filter((a) => a.slot === filter.slot)
    }
    return apps
  }

  listAppsBySlot(slot: AppConfig['slot']): AppConfig[] {
    return this.listApps({ slot })
  }

  getAppCount(): number {
    return this.appCache.size
  }

  /** 获取应用的磁盘文件夹路径 */
  getAppDir(appId: string): string | null {
    const app = this.appCache.get(appId)
    if (!app) return null

    // link 模式返回源路径
    if (app.installType === AppInstallType.DEVELOPMENT && this.appLinkMap.has(appId)) {
      return this.appLinkMap.get(appId)!
    }

    const folderName = this.appFolderMap.get(appId) ?? this.findAppFolderOnDisk(appId)
    if (!folderName) return null

    return path.join(this.appsRootPath, folderName)
  }

  // ========== 权限控制 ==========

  /**
   * 检查用户是否有权访问某个应用
   */
  checkAccess(
    appId: string,
    user: { userId: string; roles: string[]; isAdmin?: boolean }
  ): AppManageResult<boolean> {
    const app = this.appCache.get(appId)
    if (!app) {
      return { success: false, message: `应用 "${appId}" 不存在`, data: false }
    }

    if (app.enabled === false) {
      return { success: true, message: '应用已被禁用', data: false }
    }

    const perms = app.permissions
    if (!perms) {
      return { success: true, message: '无需权限校验', data: true }
    }

    if (perms.requireAdmin && !user.isAdmin) {
      return { success: true, message: '需要管理员权限', data: false }
    }

    if (perms.userIds && perms.userIds.length > 0) {
      if (!perms.userIds.includes(user.userId)) {
        return { success: true, message: '用户不在白名单中', data: false }
      }
    }

    if (perms.roles && perms.roles.length > 0) {
      const hasRole = user.roles.some((role) => perms.roles!.includes(role))
      if (!hasRole) {
        return { success: true, message: '用户角色无权限', data: false }
      }
    }

    return { success: true, message: '权限校验通过', data: true }
  }

  setPermissions(appId: string, permissions: AppPermissions): AppManageResult<AppConfig> {
    return this.updateApp(appId, { permissions })
  }

  setEnabled(appId: string, enabled: boolean): AppManageResult<AppConfig> {
    const result = this.updateApp(appId, { enabled })

    if (result.success && result.data) {
      const runtime = this.getOrCreateRuntime(appId)
      runtime.state = enabled ? AppState.ENABLED : AppState.DISABLED
      this.saveRuntimeState()

      this.emit(enabled ? 'enabled' : 'disabled', result.data)
    }

    return result
  }

  listAccessibleApps(user: { userId: string; roles: string[]; isAdmin?: boolean }): AppConfig[] {
    return this.listApps({ enabled: true }).filter((app) => {
      const result = this.checkAccess(app.id, user)
      return result.success && result.data === true
    })
  }

  // ========== 冲突检测 ==========

  /**
   * 检测新应用与已安装应用的冲突
   */
  checkConflicts(manifest: AppManifest, excludeAppId?: string): AppManageResult {
    // ID 冲突
    if (!excludeAppId || manifest.id !== excludeAppId) {
      if (this.appCache.has(manifest.id)) {
        return { success: false, message: `应用 ID "${manifest.id}" 已存在` }
      }
    }

    // 入口 URL 冲突
    if (manifest.entry) {
      const entryConflict = this.checkEntryConflict(manifest.entry, excludeAppId)
      if (entryConflict) {
        return { success: false, message: entryConflict }
      }
    }

    return { success: true, message: '无冲突' }
  }

  /** 检测入口冲突 */
  private checkEntryConflict(entry: string, excludeAppId?: string): string | null {
    for (const [id, app] of this.appCache) {
      if (excludeAppId && id === excludeAppId) continue
      if (app.entry === entry) {
        return `入口地址 "${entry}" 已被应用 "${id}" (${app.name}) 占用`
      }
    }
    return null
  }

  // ========== 依赖解析 ==========

  /**
   * 解析应用依赖，检查所有依赖是否已安装并启用
   */
  resolveDependencies(manifest: AppManifest): AppManageResult<string[]> {
    const deps = manifest.dependencies ?? []
    if (deps.length === 0) {
      return { success: true, message: '无依赖', data: [] }
    }

    const missing: string[] = []
    const disabled: string[] = []

    for (const depId of deps) {
      const dep = this.appCache.get(depId)
      if (!dep) {
        missing.push(depId)
      } else if (dep.enabled === false) {
        disabled.push(depId)
      }
    }

    if (missing.length > 0) {
      return { success: false, message: `缺少依赖: ${missing.join(', ')}`, data: missing }
    }

    if (disabled.length > 0) {
      return { success: false, message: `依赖被禁用: ${disabled.join(', ')}`, data: disabled }
    }

    return { success: true, message: '依赖检查通过', data: deps }
  }

  /**
   * 获取应用的依赖树（递归）
   */
  getDependencyTree(appId: string, visited: Set<string> = new Set()): AppConfig[] {
    if (visited.has(appId)) return []
    visited.add(appId)

    const app = this.appCache.get(appId)
    if (!app || !app.dependencies) return []

    const result: AppConfig[] = []
    for (const depId of app.dependencies) {
      const dep = this.appCache.get(depId)
      if (dep) {
        result.push(dep)
        result.push(...this.getDependencyTree(depId, visited))
      }
    }
    return result
  }

  // ========== 健康检查 ==========

  /**
   * 检查应用是否健康（入口文件/URL 是否可访问）
   */
  checkHealth(appId: string): AppManageResult<boolean> {
    const app = this.appCache.get(appId)
    if (!app) {
      return { success: false, message: `应用 "${appId}" 不存在`, data: false }
    }

    const runtime = this.getOrCreateRuntime(appId)

    try {
      let isHealthy = false

      // 根据 entry 类型做不同检查
      if (app.entry.startsWith('http://') || app.entry.startsWith('https://')) {
        // URL 入口 — 文件系统检查不适用，标记为需要网络验证
        isHealthy = true // 无法在此同步检查 HTTP，标记为健康
      } else {
        // 本地入口 — 检查文件是否存在
        const appDir = this.getAppDir(appId)
        if (appDir) {
          const fullEntry = path.resolve(appDir, app.entry)
          isHealthy = fs.existsSync(fullEntry)
          if (!isHealthy) {
            runtime.lastError = `入口文件不存在: ${fullEntry}`
          }
        }
      }

      runtime.healthy = isHealthy
      runtime.lastHealthCheck = new Date().toISOString()
      if (!isHealthy) {
        runtime.state = AppState.ERROR
        this.emit('error', app, { reason: runtime.lastError })
      }
      this.saveRuntimeState()

      return {
        success: true,
        message: isHealthy ? '应用健康' : `应用异常: ${runtime.lastError}`,
        data: isHealthy
      }
    } catch (err) {
      runtime.healthy = false
      runtime.state = AppState.ERROR
      runtime.lastError = (err as Error).message
      this.saveRuntimeState()
      return { success: false, message: `健康检查失败: ${(err as Error).message}`, data: false }
    }
  }

  /**
   * 对所有应用执行批量健康检查
   */
  checkAllHealth(): Map<string, AppManageResult<boolean>> {
    const results = new Map<string, AppManageResult<boolean>>()
    for (const appId of this.appCache.keys()) {
      results.set(appId, this.checkHealth(appId))
    }
    return results
  }

  // ========== 应用启停 ==========

  /**
   * 点开应用时执行 app.json.spawn（整串交给 shell，支持 &&）。
   * 无 spawn 则跳过。不向子进程注入宿主通信。
   */
  startApp(appId: string): AppManageResult<{ command: string; cwd: string; pid: number }> {
    const app = this.appCache.get(appId)
    if (!app) return { success: false, message: `应用 "${appId}" 不存在` }
    if (!app.enabled) return { success: false, message: `应用 "${appId}" 已被禁用，无法启动` }

    const appDir = this.getAppDir(appId)
    if (!appDir) return { success: false, message: `找不到应用 "${appId}" 的工作目录` }

    const command = (app.spawn || '').trim()
    if (!command) {
      return {
        success: true,
        message: `应用 "${appId}" 无 spawn，跳过进程启动`,
        data: { command: '', cwd: appDir, pid: 0 }
      }
    }

    if (this.isRunning(appId)) {
      return {
        success: true,
        message: `应用 "${appId}" 已在运行中`,
        data: { command, cwd: appDir, pid: this.runningProcesses.get(appId)?.pid || 0 }
      }
    }

    try {
      const child = spawn(command, {
        cwd: appDir,
        env: process.env,
        stdio: 'pipe',
        shell: true
      })

      // 监听子进程输出（可选日志）
      child.stdout?.on('data', (data: Buffer) => {
        console.log(`[${appId}] ${data.toString().trimEnd()}`)
      })
      child.stderr?.on('data', (data: Buffer) => {
        console.error(`[${appId}] ${data.toString().trimEnd()}`)
      })

      // 子进程退出时自动更新状态
      child.on('exit', (code, signal) => {
        console.log(`[${appId}] 进程退出，code=${code}, signal=${signal}`)
        this.runningProcesses.delete(appId)
        const runtime = this.appRuntimeCache.get(appId)
        if (runtime) {
          runtime.process = undefined
          runtime.pid = undefined
          runtime.state = app.enabled ? AppState.ENABLED : AppState.DISABLED
          this.saveRuntimeState()
          this.emit('stopped', app, { exitCode: code, signal })
        }
      })

      child.on('error', (err) => {
        console.error(`[${appId}] 进程异常:`, err.message)
        this.runningProcesses.delete(appId)
        const runtime = this.appRuntimeCache.get(appId)
        if (runtime) {
          runtime.process = undefined
          runtime.pid = undefined
          runtime.state = AppState.ERROR
          runtime.lastError = err.message
          this.saveRuntimeState()
          this.emit('error', app, { reason: err.message })
        }
      })

      // 记录进程引用
      this.runningProcesses.set(appId, child)

      const runtime = this.getOrCreateRuntime(appId)
      runtime.process = child
      runtime.pid = child.pid!
      runtime.state = AppState.RUNNING
      runtime.lastError = undefined
      this.saveRuntimeState()

      this.emit('running', app)

      return {
        success: true,
        message: `应用 "${appId}" 已启动 (PID: ${child.pid})`,
        data: { command, cwd: appDir, pid: child.pid! }
      }
    } catch (err) {
      return { success: false, message: `启动应用失败: ${(err as Error).message}` }
    }
  }

  /**
   * 停止应用的 Node 服务
   * 先尝试优雅退出（SIGTERM），超时后强制终止（SIGKILL）
   */
  stopApp(appId: string): AppManageResult {
    const app = this.appCache.get(appId)
    if (!app) return { success: false, message: `应用 "${appId}" 不存在` }

    if (!this.isRunning(appId)) {
      // 清理残留状态
      const runtime = this.appRuntimeCache.get(appId)
      if (runtime) {
        runtime.process = undefined
        runtime.pid = undefined
        runtime.state = app.enabled ? AppState.ENABLED : AppState.DISABLED
        this.saveRuntimeState()
      }
      return { success: true, message: `应用 "${appId}" 未在运行，无需停止` }
    }

    const child = this.runningProcesses.get(appId)!
    const runtime = this.getOrCreateRuntime(appId)

    try {
      // 优雅退出：发送 SIGTERM（Windows 上需要特殊处理）
      if (process.platform === 'win32') {
        // Windows: 使用 taskkill 发送终止信号
        try {
          execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'pipe' })
        } catch {
          // taskkill 可能失败（进程已退出），忽略
        }
      } else {
        child.kill('SIGTERM')
        // 等待最多 5 秒
        const killTimeout = setTimeout(() => {
          if (child.exitCode === null) {
            child.kill('SIGKILL')
          }
        }, 5000)

        child.on('exit', () => clearTimeout(killTimeout))
      }

      this.runningProcesses.delete(appId)
      runtime.process = undefined
      runtime.pid = undefined
      runtime.state = app.enabled ? AppState.ENABLED : AppState.DISABLED
      this.saveRuntimeState()

      this.emit('stopped', app)

      return { success: true, message: `应用 "${appId}" 已停止` }
    } catch (err) {
      return { success: false, message: `停止应用失败: ${(err as Error).message}` }
    }
  }

  /** 停掉所有已 spawn 的子进程。 */
  stopAllRunningApps(): void {
    for (const appId of [...this.runningProcesses.keys()]) {
      this.stopApp(appId)
    }
  }

  /**
   * 检查应用是否正在运行
   */
  isRunning(appId: string): boolean {
    const child = this.runningProcesses.get(appId)
    if (!child) return false
    // 检查进程是否还活着
    return child.exitCode === null && child.signalCode === null
  }

  /**
   * 获取应用运行中的子进程引用（供上层监听/操作）
   */
  getProcess(appId: string): ChildProcess | null {
    return this.runningProcesses.get(appId) ?? null
  }

  // ========== 事件系统 ==========

  /**
   * 注册事件监听器
   *
   * @example
   * manager.on('installed', (event) => {
   *   console.log(`应用 ${event.appId} 已安装`);
   * });
   */
  on(eventName: AppEventName, callback: AppEventCallback): void {
    let listeners = this.eventListeners.get(eventName)
    if (!listeners) {
      listeners = new Set()
      this.eventListeners.set(eventName, listeners)
    }
    listeners.add(callback)
  }

  /**
   * 移除事件监听器
   */
  off(eventName: AppEventName, callback: AppEventCallback): void {
    const listeners = this.eventListeners.get(eventName)
    if (listeners) {
      listeners.delete(callback)
    }
  }

  /** 触发事件 */
  private emit(
    eventName: AppEventName,
    appConfig: AppConfig,
    extra?: Record<string, unknown>
  ): void {
    const event: AppEvent = {
      eventName,
      appId: appConfig.id,
      appConfig,
      timestamp: new Date().toISOString(),
      extra
    }

    const listeners = this.eventListeners.get(eventName)
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(event)
        } catch (err) {
          console.error(`[appsManages] 事件处理异常 (${eventName}):`, err)
        }
      }
    }
  }

  // ========== 工具箱方法 ==========

  /** 获取 APP 配置文件路径 */
  private getAppConfigPath(appId: string): string | null {
    // link 模式：源文件夹下的 app.json
    if (this.appLinkMap.has(appId)) {
      const sourcePath = this.appLinkMap.get(appId)!
      const p = path.join(sourcePath, this.configFileName)
      return fs.existsSync(p) ? p : null
    }

    // copy/normal 模式：appsRootPath 子文件夹下
    const folderName = this.appFolderMap.get(appId) ?? this.findAppFolderOnDisk(appId)
    if (!folderName) return null

    const p = path.join(this.appsRootPath, folderName, this.configFileName)
    return fs.existsSync(p) ? p : null
  }

  /** 磁盘查找 appId 对应的文件夹名（后备方案） */
  private findAppFolderOnDisk(appId: string): string | null {
    if (!fs.existsSync(this.appsRootPath)) return null
    const entries = fs.readdirSync(this.appsRootPath, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const configPath = path.join(this.appsRootPath, entry.name, this.configFileName)
      if (!fs.existsSync(configPath)) continue
      try {
        const manifest = this.readJSON<AppManifest>(configPath)
        if (manifest?.id === appId) return entry.name
      } catch {
        /* skip */
      }
    }
    return null
  }

  /** 保存应用运行时元数据到 .app-runtime.json */
  private saveAppRuntimeMeta(folderName: string, config: AppConfig): void {
    const runtimePath = path.join(this.appsRootPath, folderName, '.app-runtime.json')
    this.writeJSON(runtimePath, {
      enabled: config.enabled,
      installType: config.installType,
      installSource: config.installSource,
      installedAt: config.installedAt,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt
    })
  }

  /** 在目录中递归查找 app.json */
  private findManifestInDir(dir: string): string | null {
    const configPath = path.join(dir, this.configFileName)
    if (fs.existsSync(configPath)) return configPath

    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const found = this.findManifestInDir(path.join(dir, entry.name))
        if (found) return found
      }
    }
    return null
  }

  /** 递归复制目录 */
  private copyDirectory(src: string, dest: string): void {
    this.ensureDir(dest)
    const entries = fs.readdirSync(src, { withFileTypes: true })
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name)
      const destPath = path.join(dest, entry.name)
      if (entry.isDirectory()) {
        this.copyDirectory(srcPath, destPath)
      } else {
        fs.copyFileSync(srcPath, destPath)
      }
    }
  }

  /** 解压 zip 文件（使用 Node 内置模块） */
  private extractZip(zipPath: string, destDir: string): void {
    // 使用系统命令解压
    try {
      if (process.platform === 'win32') {
        // Windows: 使用 PowerShell Expand-Archive
        execSync(
          `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`,
          { stdio: 'pipe' }
        )
      } else {
        // Linux/Mac: 使用 unzip
        execSync(`unzip -o "${zipPath}" -d "${destDir}"`, { stdio: 'pipe' })
      }
    } catch {
      throw new Error('解压失败，请确保系统已安装 unzip（Linux/Mac）或 PowerShell（Windows）')
    }
  }

  /** 从完整配置中提取清单字段 */
  private extractManifest(config: AppConfig): AppManifest {
    return {
      id: config.id,
      name: config.name,
      version: config.version,
      entry: config.entry,
      slot: config.slot,
      ...(config.icon ? { icon: config.icon } : {}),
      ...(config.description ? { description: config.description } : {}),
      ...(config.spawn ? { spawn: config.spawn } : {}),
      ...(config.permissions ? { permissions: config.permissions } : {}),
      ...(config.dependencies ? { dependencies: config.dependencies } : {})
    }
  }

  /** 校验清单必填字段 */
  private validateManifest(manifest: AppManifest): AppManageResult {
    if (!manifest.id?.trim()) return { success: false, message: '应用 id 不能为空' }
    if (!manifest.name?.trim()) return { success: false, message: '应用 name 不能为空' }
    if (!manifest.version?.trim()) return { success: false, message: '应用 version 不能为空' }
    if (!manifest.entry?.trim()) return { success: false, message: '应用 entry 不能为空' }
    if (!['menu', 'sidebar', 'standalone'].includes(manifest.slot)) {
      return { success: false, message: '应用 slot 必须为 menu | sidebar | standalone 之一' }
    }

    // 版本号格式校验（semver 宽松检查）
    const semverRegex = /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/
    if (!semverRegex.test(manifest.version)) {
      return { success: false, message: '版本号格式不符合 semver 规范（例如 1.0.0）' }
    }

    return { success: true, message: '清单校验通过' }
  }

  // ========== 统计与导出 ==========

  /** 获取统计信息 */
  getStats(): {
    total: number
    enabled: number
    disabled: number
    running: number
    error: number
    byInstallType: Record<string, number>
    bySlot: Record<string, number>
  } {
    const stats: Record<string, number> = {
      total: 0,
      enabled: 0,
      disabled: 0,
      running: 0,
      error: 0
    }
    const byInstallType: Record<string, number> = {}
    const bySlot: Record<string, number> = {}

    for (const app of this.appCache.values()) {
      stats.total++
      if (app.enabled) stats.enabled++
      else stats.disabled++

      const runtime = this.appRuntimeCache.get(app.id)
      if (runtime?.state === AppState.RUNNING) stats.running++
      if (runtime?.state === AppState.ERROR) stats.error++

      byInstallType[app.installType] = (byInstallType[app.installType] ?? 0) + 1
      bySlot[app.slot] = (bySlot[app.slot] ?? 0) + 1
    }

    return {
      total: stats.total,
      enabled: stats.enabled,
      disabled: stats.disabled,
      running: stats.running,
      error: stats.error,
      byInstallType,
      bySlot
    }
  }

  /** 导出全部应用清单快照（用于备份/迁移） */
  exportSnapshot(): { apps: AppConfig[]; stats: ReturnType<appsManages['getStats']> } {
    return {
      apps: Array.from(this.appCache.values()),
      stats: this.getStats()
    }
  }

  /** 获取根目录路径 */
  getRootPath(): string {
    return this.appsRootPath
  }

  /** 获取配置文件名 */
  getConfigFileName(): string {
    return this.configFileName
  }
}

// ==================== 导出 ====================

export default appsManages
export { AppState, AppInstallType }
export type {
  AppManifest,
  AppConfig,
  AppPermissions,
  InstallFromPathOptions,
  InstallFromPackageOptions,
  RegisterAppOptions,
  UpdateAppOptions,
  AppManageResult,
  AppEventName,
  AppEvent,
  AppEventCallback,
  AppRuntimeRecord,
  AppLinkFile
}
