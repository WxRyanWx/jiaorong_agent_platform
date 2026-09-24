/**
 * 应用安装管理器：装 / 卸 / 更新 / 启停应用包。
 * 磁盘根目录是用户 apps 目录；点开应用时按 `app.json.spawn` 起子进程，
 * 只带握手用的 `JIAORONG_BRIDGE_TOKEN`，不注入超级智能体 IPC。
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { randomBytes } from 'node:crypto'
import { spawn, execSync, ChildProcess } from 'node:child_process'
import { isSystemBundledApp } from '../systemApps'
import { getSystemAppDir, getSystemAppsRoot, isHiddenAppDirName, isPathInsideRoot } from './paths'

/** 安装目录名必须是单层 kebab-id，防止 zip 清单把包装到 apps 目录外。 */
const APP_FOLDER_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
/** 刚 spawn 时还没 LISTEN，这段时间内允许复用，避免并发 getOpenInfo 把进程杀掉重拉。 */
const SPAWN_REUSE_GRACE_MS = 5000
const NODE_BIN_NAME = process.platform === 'win32' ? 'node.exe' : 'node'
const UV_BIN_NAME = process.platform === 'win32' ? 'uv.exe' : 'uv'

/** 这个目录里有没有指定可执行文件。 */
function directoryHasBin(dir: string, name: string): boolean {
  if (!dir) return false
  try {
    return fs.existsSync(path.join(dir, name))
  } catch {
    return false
  }
}

/** 安装包 / 开发态里 `runtime` 根目录。 */
function bundledRuntimeRoots(): string[] {
  const roots: string[] = []
  if (typeof process.resourcesPath === 'string' && process.resourcesPath) {
    roots.push(
      path.join(process.resourcesPath, 'app.asar.unpacked', 'runtime'),
      path.join(process.resourcesPath, 'runtime')
    )
  }
  roots.push(path.join(process.cwd(), 'runtime'))
  try {
    roots.push(path.resolve(__dirname, '../../../runtime'))
    roots.push(path.resolve(__dirname, '../../runtime'))
  } catch {
    // 打包进单文件时 __dirname 仍可用
  }
  return roots
}

/** 客户端自带 Node 的目录。 */
export function resolveBundledNodeBin(): string | null {
  for (const root of bundledRuntimeRoots()) {
    const dir =
      process.platform === 'win32' ? path.join(root, 'node') : path.join(root, 'node', 'bin')
    if (directoryHasBin(dir, NODE_BIN_NAME)) return dir
  }
  return null
}

/** 客户端自带 uv 的目录；Python 技能走它，不另带 python。 */
export function resolveBundledUvBin(): string | null {
  for (const root of bundledRuntimeRoots()) {
    const dir = path.join(root, 'uv')
    if (directoryHasBin(dir, UV_BIN_NAME)) return dir
  }
  return null
}

/**
 * spawn 用 PATH：只把客户端自带的运行时接到最前。
 * 用户 spawn 只写应用内相对路径，例如 `node node/server.js`、`uv run main.py`。
 * java / python 本体客户端没有，不会凭空拼出来。
 */
export function buildSpawnPath(currentPath: string): string {
  const seen = new Set<string>()
  const merged = [
    resolveBundledNodeBin(),
    resolveBundledUvBin(),
    ...currentPath.split(path.delimiter)
  ].filter((dir): dir is string => {
    if (!dir || seen.has(dir)) return false
    seen.add(dir)
    return true
  })
  return merged.join(path.delimiter)
}

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
  slot: 'menu' | 'sidebar' | 'standalone' | 'app-center'
  /**
   * 点开应用时由管理类 spawn 一次的脚本（npm scripts 风格，可用 && 拼接）。
   * 管理类不注入超级智能体通信。
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
  /** 目录声明的应用 id；zip 内 app.json.id 必须一致 */
  expectedId?: string
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
  /** 操作是否成功 */
  success: boolean
  /** 面向日志/调用方的说明 */
  message: string
  /** 成功时携带的数据 */
  data?: T
}

// ==================== 事件类型 ====================

/** 应用事件类型 */
type AppEventName =
  /** 安装完成 */
  | 'installed'
  /** 卸载完成 */
  | 'uninstalled'
  /** 已启用 */
  | 'enabled'
  /** 已禁用 */
  | 'disabled'
  /** 配置已更新 */
  | 'updated'
  /** 出错（健康检查或子进程异常） */
  | 'error'
  /** 子进程已启动 */
  | 'running'
  /** 子进程已停止 */
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
  /** 应用 ID */
  appId: string
  /** 当前运行时状态 */
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
  /** 键为 appId，值为该应用的运行时快照 */
  [appId: string]: {
    /** 运行时状态 */
    state: AppState
    /** Node 服务进程 PID */
    pid?: number
    /** 健康检查是否通过 */
    healthy: boolean
    /** 上次健康检查时间 */
    lastHealthCheck?: string
    /** 最后错误信息 */
    lastError?: string
  }
}

// ==================== 主类 ====================

/** 应用安装管理器；一个客户端进程持有一个实例。 */
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
  /** 本次 spawn 的开始时间，用来给复用留出 LISTEN 宽限期。 */
  private spawnStartedAt: Map<string, number> = new Map()
  /** 本次 spawn 的工作目录，退出时按 cwd 清残留。 */
  private runningCwd: Map<string, string> = new Map()
  /** 最近一次 spawn 的 stdout/stderr，用来判断 EADDRINUSE。 */
  private spawnLogs: Map<string, string> = new Map()

  /** 事件监听器 */
  private eventListeners: Map<AppEventName, Set<AppEventCallback>> = new Map()

  /**
   * @param appsFolderPath - APPS 文件夹的根路径，如 `C:\Users\11307\.jiaorongchat\apps`
   * @param configFileName - 清单配置文件名，默认 `app.json`
   */
  constructor(appsFolderPath: string, configFileName: string = 'app.json') {
    // 统一成绝对路径，后续拼接不受进程 cwd 影响
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

  /**
   * 子进程结束后清握手、PID，并写运行时状态。
   * @param appId 应用 id
   * @param state 结束后的状态
   * @param lastError 可选错误信息
   */
  private markChildEnded(
    appId: string,
    state: AppState,
    lastError?: string,
    child?: ChildProcess
  ): void {
    // 传了 child 但已不是当前登记的进程（说明又被重启过），不要覆盖新进程状态
    if (child && this.runningProcesses.get(appId) !== child) return
    this.clearRunning(appId)
    /** 该应用的运行时记录。 */
    const runtime = this.appRuntimeCache.get(appId)
    // 没有运行时记录就不用回写
    if (!runtime) return
    // 清掉进程引用与 PID，避免误判为「仍在运行」
    runtime.process = undefined
    runtime.pid = undefined
    runtime.state = state
    // 只在调用方明确给了错误信息时写
    if (lastError !== undefined) runtime.lastError = lastError
    this.saveRuntimeState()
  }

  /**
   * shell:true 时真正听端口的是孙进程；只杀 shell 会留下旧 Node 占口。
   * @param child 要终止的子进程
   */
  private killChildTree(child: ChildProcess): void {
    /** 子进程 PID。 */
    const pid = child.pid
    // spawn 失败时可能没有 pid
    if (!pid) return
    // Windows：taskkill /T 递归杀整棵进程树
    if (process.platform === 'win32') {
      try {
        execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'pipe' })
      } catch {
        /* already gone */
      }
      return
    }
    try {
      // POSIX：负 PID 表示整个进程组（spawn 时用了 detached）
      process.kill(-pid, 'SIGKILL')
    } catch {
      try {
        // 进程组不存在，退化成只杀 shell 本身
        child.kill('SIGKILL')
      } catch {
        /* already gone */
      }
    }
  }

  /**
   * 清掉进程表里的一条，返回当时的工作目录。
   * @param appId 应用 id
   */
  private clearRunning(appId: string): string | undefined {
    const cwd = this.runningCwd.get(appId)
    this.runningProcesses.delete(appId)
    this.spawnStartedAt.delete(appId)
    this.runningCwd.delete(appId)
    return cwd
  }

  /**
   * POSIX 下看进程组有没有 TCP LISTEN。不探具体端口号；查不到工具时返回 null。
   * @param pid spawn 出的壳进程 PID
   */
  private processGroupHasListen(pid: number): boolean | null {
    if (process.platform === 'win32') return null
    const pids = new Set<number>([pid])
    try {
      const grouped = execSync(`pgrep -g ${pid}`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim()
      for (const row of grouped.split('\n')) {
        const value = Number(row.trim())
        if (Number.isInteger(value) && value > 0) pids.add(value)
      }
    } catch {
      /* pgrep 无匹配时非 0 退出 */
    }
    const pending = [...pids]
    while (pending.length > 0) {
      const current = pending.pop()!
      try {
        const children = execSync(`pgrep -P ${current}`, {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore']
        }).trim()
        for (const row of children.split('\n')) {
          const value = Number(row.trim())
          if (!Number.isInteger(value) || value <= 0 || pids.has(value)) continue
          pids.add(value)
          pending.push(value)
        }
      } catch {
        /* 没有子进程 */
      }
    }
    let sawLsof = false
    for (const childPid of pids) {
      try {
        const out = execSync(`lsof -nP -a -p ${childPid} -iTCP -sTCP:LISTEN`, {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore']
        })
        sawLsof = true
        if (out.trim()) return true
      } catch (err) {
        if ((err as { status?: number }).status === 1) {
          sawLsof = true
          continue
        }
      }
    }
    return sawLsof ? false : null
  }

  /**
   * 已登记进程是否还能复用：宽限期内、或进程组确实在听 TCP。
   * @param appId 应用 id
   */
  private canReuseSpawn(appId: string): boolean {
    if (!this.isRunning(appId)) return false
    const startedAt = this.spawnStartedAt.get(appId)
    if (startedAt !== undefined && Date.now() - startedAt < SPAWN_REUSE_GRACE_MS) return true
    const log = this.spawnLogs.get(appId) ?? ''
    if (/EADDRINUSE|address already in use|端口.*占用/i.test(log)) return false
    const pid = this.runningProcesses.get(appId)?.pid
    if (!pid) return false
    const listening = this.processGroupHasListen(pid)
    // 探不到（无 lsof / Windows）时沿用「进程还活着」
    return listening !== false
  }

  /**
   * 解压到系统临时目录，避免半成品出现在用户 apps 根下。
   */
  private createTempExtractDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'jiaorong-extract-'))
  }

  /**
   * 同盘 rename，跨盘退回复制。
   * @param from 源目录
   * @param to 目标目录
   */
  private renameOrCopy(from: string, to: string): void {
    try {
      fs.renameSync(from, to)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err
      this.copyDirectory(from, to)
      fs.rmSync(from, { recursive: true, force: true })
    }
  }

  /**
   * 把解压结果放到安装目标目录。
   * @param extractRoot 清单所在目录
   * @param tempDir 临时解压根
   * @param targetDir 最终安装目录
   */
  private placeExtractedApp(extractRoot: string, tempDir: string, targetDir: string): void {
    if (extractRoot === tempDir) {
      this.renameOrCopy(tempDir, targetDir)
      return
    }
    this.copyDirectory(extractRoot, targetDir)
    fs.rmSync(tempDir, { recursive: true, force: true })
  }

  /**
   * Electron 重启后 Map 是空的，旧 Node 仍占 cwd。按工作目录清掉残留。
   * @param appDir 应用工作目录
   */
  private killLeftoverInDir(appDir: string): void {
    // 目录为空或 Windows（没有 pgrep / procfs）时跳过
    if (!appDir || process.platform === 'win32') return
    /** pgrep 输出的 PID 列表。 */
    let pids = ''
    try {
      pids = execSync('pgrep -f node', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim()
    } catch {
      // 没有任何 node 进程，pgrep 会以非 0 退出
      return
    }
    for (const raw of pids.split('\n')) {
      /** 单个 PID。 */
      const pid = Number(raw.trim())
      // 非法 PID 或客户端自己
      if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) continue
      /** 该进程的工作目录。 */
      let cwd = ''
      try {
        // Linux 直接读 procfs
        if (process.platform === 'linux') {
          cwd = fs.readlinkSync(`/proc/${pid}/cwd`)
        } else {
          // macOS 用 lsof 取 cwd
          const lsof = execSync(`lsof -a -p ${pid} -d cwd -Fn`, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
          })
          /** lsof 输出里以 n 开头的那行。 */
          const line = lsof.split('\n').find((row) => row.startsWith('n'))
          cwd = line ? line.slice(1) : ''
        }
      } catch {
        // 读不到 cwd（权限或进程已退出）就跳过
        continue
      }
      // 只杀工作目录正好是该应用目录的进程
      if (path.resolve(cwd) !== path.resolve(appDir)) continue
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        /* already gone */
      }
    }
  }

  // ========== 磁盘存储辅助 ==========

  /**
   * 确保目录存在
   * @param dir 目录路径
   */
  private ensureDir(dir: string): void {
    // 已存在就不动，避免多余的 mkdir
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  /**
   * 读取 JSON 文件
   * @param filePath 文件路径
   */
  private readJSON<T>(filePath: string): T | null {
    // 文件不存在
    if (!fs.existsSync(filePath)) return null
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T
    } catch {
      // JSON 损坏按「没有」处理，由调用方决定后续动作
      return null
    }
  }

  /**
   * 写入 JSON 文件
   * @param filePath 文件路径
   * @param data 待序列化数据
   */
  private writeJSON<T>(filePath: string, data: T): void {
    // 两空格缩进，方便人工排查
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  }

  // ========== 应用扫描与加载 ==========

  /**
   * 扫描 APPS 根目录下所有应用
   * 支持三种加载方式：
   * 1. 直接子文件夹内的 app.json
   * 2. .app-link.json 链接文件
   * 3. 随客户端内置的系统应用（不在用户 apps 目录）
   */
  private scanApps(): void {
    // 全量重扫，先清三份缓存
    this.appCache.clear()
    this.appFolderMap.clear()
    this.appLinkMap.clear()

    // 用户 apps 目录可能还没建
    if (fs.existsSync(this.appsRootPath)) {
      /** 根目录下的一档条目。 */
      const entries = fs.readdirSync(this.appsRootPath, { withFileTypes: true })
      for (const entry of entries) {
        // 子文件夹：普通安装的应用
        if (entry.isDirectory()) {
          // 跳过 .temp_extract_* 等点目录，避免安装半成品被登记成应用
          if (isHiddenAppDirName(entry.name)) continue
          // 按目录里的 app.json.id 登记；文件夹名不参与身份判断
          this.tryLoadFromDirectory(entry.name)
        } else if (entry.isFile() && entry.name.endsWith('.app-link.json')) {
          // 链接文件：link 模式安装的应用
          this.tryLoadFromLink(entry.name)
        }
      }
    }
    // 随客户端内置的系统应用单独登记
    this.loadSystemBundledApps()
    console.log(`[appsManages] 扫描完成，共加载 ${this.appCache.size} 个应用`)
  }

  /** 把已落到 Electron userData 的系统应用登记为引用，不进用户 apps。 */
  private loadSystemBundledApps(): void {
    const systemRoot = getSystemAppsRoot()
    if (!fs.existsSync(systemRoot)) return
    let names: string[] = []
    try {
      names = fs.readdirSync(systemRoot)
    } catch {
      return
    }
    for (const appId of names) {
      if (appId.startsWith('.')) continue
      const sourcePath = path.join(systemRoot, appId)
      let isDir = false
      try {
        isDir = fs.statSync(sourcePath).isDirectory()
      } catch {
        continue
      }
      if (!isDir) continue
      const configPath = path.join(sourcePath, this.configFileName)
      if (!fs.existsSync(configPath)) continue
      const manifest = this.readJSON<AppManifest>(configPath)
      if (!manifest?.id || !isSystemBundledApp(manifest.id)) continue
      const config = this.buildFullConfig(manifest, {
        installType: AppInstallType.DEVELOPMENT,
        installSource: sourcePath
      })
      this.appCache.set(config.id, config)
      this.appLinkMap.set(config.id, sourcePath)
    }
  }

  /**
   * 尝试从子文件夹加载 app.json
   * @param folderName 用户 apps 目录下的子文件夹名
   */
  private tryLoadFromDirectory(folderName: string): boolean {
    // 点目录不是应用安装目录
    if (!folderName || isHiddenAppDirName(folderName) || path.basename(folderName) !== folderName) {
      return false
    }
    /** 清单路径。 */
    const configPath = path.join(this.appsRootPath, folderName, this.configFileName)
    // 不是应用目录（没有 app.json）
    if (!fs.existsSync(configPath)) return false

    /** 清单内容。 */
    const manifest = this.readJSON<AppManifest>(configPath)
    // 清单无效，或目录名撞了系统应用
    if (!manifest || isSystemBundledApp(manifest.id)) return false

    /** 运行时元数据路径。 */
    const runtimePath = path.join(this.appsRootPath, folderName, '.app-runtime.json')
    /** 已持久化的运行时字段（enabled / installSource 等）。 */
    const runtimeMeta = this.readJSON<Partial<AppConfig>>(runtimePath)

    /** 完整配置。 */
    const config = this.buildFullConfig(manifest, {
      installType: AppInstallType.NORMAL,
      installSource: path.join(this.appsRootPath, folderName),
      // 运行时元数据覆盖默认值，保留上次的启用状态
      ...runtimeMeta
    })

    this.appCache.set(config.id, config)
    // 记下 id → 实际文件夹名，文件夹名可以和 app.json.id 不同
    this.appFolderMap.set(config.id, folderName)
    return true
  }

  /**
   * 从任意应用目录按 app.json.id 登记。不要求文件夹名等于 id。
   * @param appDir 含 app.json 的目录
   */
  private tryLoadFromAppDir(appDir: string): boolean {
    /** 规范化后的打开目录。 */
    const resolved = path.resolve(appDir)
    // 落在用户 apps 根下：复用扫盘子文件夹逻辑
    if (path.resolve(path.dirname(resolved)) === path.resolve(this.appsRootPath)) {
      return this.tryLoadFromDirectory(path.basename(resolved))
    }
    /** 清单路径。 */
    const configPath = path.join(resolved, this.configFileName)
    if (!fs.existsSync(configPath)) return false
    /** 清单内容。 */
    const manifest = this.readJSON<AppManifest>(configPath)
    if (!manifest) return false
    /** 是否落在系统应用根下。 */
    const inSystemRoot = isPathInsideRoot(getSystemAppsRoot(), resolved)
    // 系统应用只从 userData 登记；商店应用忽略误留在 system-apps 的目录
    if (isSystemBundledApp(manifest.id) !== inSystemRoot) return false
    // 已经按 id 登记过就不动，避免覆盖开发者中心 link
    if (this.appCache.has(manifest.id)) return true
    /** 完整配置。 */
    const config = this.buildFullConfig(manifest, {
      installType: AppInstallType.DEVELOPMENT,
      installSource: resolved
    })
    this.appCache.set(config.id, config)
    this.appLinkMap.set(config.id, resolved)
    return true
  }

  /**
   * 尝试从 .app-link.json 加载链接应用
   * @param linkFileName 链接文件名
   */
  private tryLoadFromLink(linkFileName: string): boolean {
    /** 链接文件路径。 */
    const linkPath = path.join(this.appsRootPath, linkFileName)
    /** 链接文件内容。 */
    const linkData = this.readJSON<AppLinkFile>(linkPath)
    // 链接文件损坏
    if (!linkData) return false

    const { sourcePath } = linkData
    /** 源目录下的清单路径。 */
    const manifestPath = path.join(sourcePath, this.configFileName)
    // 源目录被删或移动
    if (!fs.existsSync(manifestPath)) {
      console.warn(`[appsManages] 链接源已失效: ${sourcePath}`)
      return false
    }

    /** 源清单。 */
    const manifest = this.readJSON<AppManifest>(manifestPath)
    // 清单无效，或指向了系统应用
    if (!manifest || isSystemBundledApp(manifest.id)) return false

    /** 完整配置。 */
    const config = this.buildFullConfig(manifest, {
      installType: AppInstallType.DEVELOPMENT,
      installSource: sourcePath
    })

    this.appCache.set(config.id, config)
    // 记进 link 表，读写配置都走源目录
    this.appLinkMap.set(config.id, sourcePath)
    return true
  }

  /**
   * 从 manifest 构建完整的 AppConfig（补全元数据字段）
   * @param manifest 包内清单
   * @param overrides 需要覆盖的元数据字段
   */
  private buildFullConfig(manifest: AppManifest, overrides: Partial<AppConfig>): AppConfig {
    /** 统一的本次时间戳。 */
    const now = new Date().toISOString()
    return {
      ...manifest,
      // 下面几项是缺省值，overrides 里给了就以 overrides 为准
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
    // 重新扫盘，磁盘上手动增删的包也能被感知
    this.scanApps()
    // 重扫后缓存被清空，需要重新贴回运行时状态
    this.loadRuntimeState()
  }

  // ========== 运行时状态 ==========

  /** 从 .app-runtime.json 加载运行时状态 */
  private loadRuntimeState(): void {
    /** 运行时状态文件路径。 */
    const runtimePath = path.join(this.appsRootPath, '.app-runtime.json')
    /** 文件内容。 */
    const data = this.readJSON<AppRuntimeFile>(runtimePath)
    // 文件不存在或损坏
    if (!data) return

    for (const [appId, record] of Object.entries(data)) {
      // 只恢复当前确实存在的应用，避免残留脏数据
      if (this.appCache.has(appId)) {
        /** 内存里已有的记录，用于保留进程引用。 */
        const previous = this.appRuntimeCache.get(appId)
        this.appRuntimeCache.set(appId, {
          appId,
          // 字段缺失时给安全默认值
          state: record.state ?? AppState.INSTALLED,
          pid: record.pid,
          // 进程引用不可持久化，沿用内存里的
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
    /** 运行时状态文件路径。 */
    const runtimePath = path.join(this.appsRootPath, '.app-runtime.json')
    /** 待写入的数据。 */
    const data: AppRuntimeFile = {}
    for (const [appId, record] of this.appRuntimeCache) {
      // 只落可序列化的字段，process 引用不写盘
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

  /**
   * 获取或创建运行时记录
   * @param appId 应用 ID
   */
  private getOrCreateRuntime(appId: string): AppRuntimeRecord {
    /** 已有记录。 */
    let record = this.appRuntimeCache.get(appId)
    // 首次访问，建一条初始记录
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

  /**
   * 获取应用运行时状态
   * @param appId 应用 ID
   */
  getAppState(appId: string): AppRuntimeRecord | null {
    // 没有记录返回 null，调用方据此判断应用是否存在
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
    /** 目标文件夹名、是否覆盖、是否立即启用。 */
    const { folderName = manifest.id, overwrite = false, enable = true } = options

    // 冲突检测
    /** 冲突检测结果。 */
    const conflictCheck = this.checkConflicts(manifest)
    // 有冲突且调用方没允许覆盖
    if (!conflictCheck.success && !overwrite) {
      return { success: false, message: conflictCheck.message }
    }

    // 校验必填字段
    /** 清单校验结果。 */
    const validation = this.validateManifest(manifest)
    // 校验不过直接回失败
    if (!validation.success) return validation as AppManageResult<AppConfig>

    /** 目标应用目录。 */
    const appDir = path.join(this.appsRootPath, folderName)
    /** 目标 app.json 路径。 */
    const configPath = path.join(appDir, this.configFileName)

    try {
      this.ensureDir(appDir)

      /** 统一的本次时间戳。 */
      const now = new Date().toISOString()
      /** 完整配置。 */
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

      // 更新三份内存索引
      this.appCache.set(config.id, config)
      this.appFolderMap.set(config.id, folderName)
      // 按 enable 落运行时状态并持久化
      this.getOrCreateRuntime(config.id).state = enable ? AppState.ENABLED : AppState.DISABLED
      this.saveRuntimeState()

      this.emit('installed', config)

      return { success: true, message: `应用 "${config.id}" 注册成功`, data: config }
    } catch (err) {
      // 写盘失败：不回滚已建目录，交由调用方重试或覆盖安装
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
    /** 安装模式、目标文件夹名、是否覆盖、是否立即启用。 */
    const { mode = 'copy', folderName, overwrite = false, enable = true } = options

    // 规范化源路径
    /** 源目录绝对路径。 */
    const sourcePath = path.resolve(sourceFolderPath)

    // 校验源文件夹
    // 源目录不存在
    if (!fs.existsSync(sourcePath)) {
      return { success: false, message: `源文件夹不存在: ${sourcePath}` }
    }
    // 源路径是文件而不是目录
    if (!fs.statSync(sourcePath).isDirectory()) {
      return { success: false, message: `源路径不是文件夹: ${sourcePath}` }
    }

    // 读取并校验 app.json
    /** 源清单路径。 */
    const manifestPath = path.join(sourcePath, this.configFileName)
    // 源目录不是应用包
    if (!fs.existsSync(manifestPath)) {
      return { success: false, message: `在 ${sourcePath} 中未找到 ${this.configFileName}` }
    }

    /** 源清单内容。 */
    const manifest = this.readJSON<AppManifest>(manifestPath)
    // JSON 损坏
    if (!manifest) {
      return { success: false, message: `${this.configFileName} 格式无效` }
    }

    /** 清单校验结果。 */
    const validation = this.validateManifest(manifest)
    // 必填字段或版本号不合规
    if (!validation.success) return validation as AppManageResult<AppConfig>

    // 冲突检测
    /** 冲突检测结果。 */
    const conflictCheck = this.checkConflicts(manifest)
    // 有冲突且没允许覆盖
    if (!conflictCheck.success && !overwrite) {
      return { success: false, message: conflictCheck.message }
    }

    // 依赖检查
    /** 依赖解析结果。 */
    const depCheck = this.resolveDependencies(manifest)
    // 依赖缺失或被禁用
    if (!depCheck.success) return { success: false, message: depCheck.message }

    /** 统一的本次时间戳。 */
    const now = new Date().toISOString()

    try {
      /** 安装成功后的完整配置。 */
      let config: AppConfig

      // 三种模式对文件系统的处理不同，配置字段的构造是一致的
      switch (mode) {
        // 复制：把源目录整份拷进 apps 根目录
        case 'copy': {
          /** 目标文件夹名，默认用应用 id。 */
          const targetName = folderName ?? manifest.id
          /** 目标目录。 */
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
          // 运行时元数据写进目标目录
          this.saveAppRuntimeMeta(targetName, config)
          this.appFolderMap.set(config.id, targetName)
          break
        }

        // 链接：只在 apps 根目录写一个指向源目录的引用文件
        case 'link': {
          // 创建 .app-link.json
          /** 链接文件名。 */
          const linkFileName = `${manifest.id}.app-link.json`
          /** 链接文件路径。 */
          const linkPath = path.join(this.appsRootPath, linkFileName)

          /** 链接文件内容。 */
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
          // link 模式下 getAppDir 要靠这张表拿源目录
          this.appLinkMap.set(config.id, sourcePath)
          break
        }

        // 引用：完全不碰文件系统，只登记到内存缓存
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

        // 传了不支持的 mode
        default:
          return { success: false, message: `不支持的安装模式: ${mode}` }
      }

      // 登记缓存并落运行时状态
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
      // 复制/写链接失败，已建的目标目录留给下次覆盖安装处理
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
    /** 安装包绝对路径。 */
    const absPackagePath = path.resolve(packagePath)

    // 包文件不存在
    if (!fs.existsSync(absPackagePath)) {
      return { success: false, message: `安装包不存在: ${absPackagePath}` }
    }

    /** 小写扩展名。 */
    const ext = path.extname(absPackagePath).toLowerCase()
    // 只支持 zip 与 app 两种包
    if (ext !== '.zip' && ext !== '.app') {
      return { success: false, message: `不支持的包格式 "${ext}"，仅支持 .zip 和 .app` }
    }

    // 尝试解压：放系统临时目录，不进用户 apps 根
    /** 临时解压目录。 */
    const tempDir = this.createTempExtractDir()
    try {
      this.ensureDir(tempDir)
      this.extractZip(absPackagePath, tempDir)

      // 在解压目录中查找 app.json
      /** 解压出来的清单路径。 */
      const manifestPath = this.findManifestInDir(tempDir)
      // 包里根本没有 app.json
      if (!manifestPath) {
        fs.rmSync(tempDir, { recursive: true, force: true })
        return { success: false, message: `安装包中未找到 ${this.configFileName}` }
      }

      /** 清单内容。 */
      const manifest = this.readJSON<AppManifest>(manifestPath)
      // JSON 损坏
      if (!manifest) {
        fs.rmSync(tempDir, { recursive: true, force: true })
        return { success: false, message: `${this.configFileName} 格式无效` }
      }

      /** 清单校验结果。 */
      const validation = this.validateManifest(manifest)
      // 必填字段或版本号不合规
      if (!validation.success) {
        fs.rmSync(tempDir, { recursive: true, force: true })
        return validation as AppManageResult<AppConfig>
      }

      if (options.expectedId && manifest.id !== options.expectedId) {
        fs.rmSync(tempDir, { recursive: true, force: true })
        return {
          success: false,
          message: `安装包 id "${manifest.id}" 与目录 id "${options.expectedId}" 不一致`
        }
      }
      if (!APP_FOLDER_ID_RE.test(manifest.id)) {
        fs.rmSync(tempDir, { recursive: true, force: true })
        return { success: false, message: `应用 id 不合法: ${manifest.id}` }
      }

      // 移到 APPS 目录
      /** 目标文件夹名、是否覆盖、是否立即启用。 */
      const { folderName = manifest.id, overwrite = false, enable = true } = options
      if (!APP_FOLDER_ID_RE.test(folderName) || path.basename(folderName) !== folderName) {
        fs.rmSync(tempDir, { recursive: true, force: true })
        return { success: false, message: `安装目录名不合法: ${folderName}` }
      }
      /** 目标目录。 */
      const targetDir = path.join(this.appsRootPath, folderName)
      if (!isPathInsideRoot(this.appsRootPath, targetDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true })
        return { success: false, message: `安装路径越界: ${folderName}` }
      }
      /** 缓存里已有同 id 的安装。 */
      const alreadyInstalled = this.appCache.has(manifest.id)

      // 覆盖：按 app.json.id 卸掉旧份（文件夹名可以不同），再装到目标目录
      if (overwrite) {
        if (alreadyInstalled) this.uninstallApp(manifest.id)
        if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true })
      } else if (alreadyInstalled || fs.existsSync(targetDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true })
        return {
          success: false,
          message: `应用 "${manifest.id}" 已存在，如需覆盖请设置 overwrite: true`
        }
      }

      // 移动解压内容到目标目录
      /** 清单所在目录，即真正的包根。 */
      const extractRoot = path.dirname(manifestPath)
      this.placeExtractedApp(extractRoot, tempDir, targetDir)

      /** 统一的本次时间戳。 */
      const now = new Date().toISOString()
      /** 完整配置。 */
      const config = this.buildFullConfig(manifest, {
        enabled: enable,
        installType: AppInstallType.NORMAL,
        installSource: absPackagePath,
        installedAt: now,
        createdAt: now,
        updatedAt: now
      })
      this.saveAppRuntimeMeta(folderName, config)

      // 登记缓存与运行时状态
      this.appCache.set(config.id, config)
      this.appFolderMap.set(config.id, folderName)
      this.getOrCreateRuntime(config.id).state = enable ? AppState.ENABLED : AppState.DISABLED
      this.saveRuntimeState()

      this.emit('installed', config)

      return { success: true, message: `从包安装 "${config.id}" 成功`, data: config }
    } catch (err) {
      fs.rmSync(tempDir, { recursive: true, force: true })
      return { success: false, message: `从安装包安装失败: ${(err as Error).message}` }
    }
  }

  /**
   * 把系统应用 zip 解压到 Electron userData，不进用户 apps / ~/.jiaorongchat。
   * @param packagePath zip 路径
   */
  installSystemAppFromPackage(packagePath: string): AppManageResult<AppConfig> {
    /** 安装包绝对路径。 */
    const absPackagePath = path.resolve(packagePath)
    if (!fs.existsSync(absPackagePath)) {
      return { success: false, message: `安装包不存在: ${absPackagePath}` }
    }
    /** 系统应用根。 */
    const systemRoot = getSystemAppsRoot()
    this.ensureDir(systemRoot)
    /** 临时解压目录，不进系统应用根，避免扫到半成品。 */
    const tempDir = this.createTempExtractDir()
    try {
      this.ensureDir(tempDir)
      this.extractZip(absPackagePath, tempDir)
      /** 解压出来的清单路径。 */
      const manifestPath = this.findManifestInDir(tempDir)
      if (!manifestPath) {
        fs.rmSync(tempDir, { recursive: true, force: true })
        return { success: false, message: `安装包中未找到 ${this.configFileName}` }
      }
      /** 清单。 */
      const manifest = this.readJSON<AppManifest>(manifestPath)
      if (!manifest) {
        fs.rmSync(tempDir, { recursive: true, force: true })
        return { success: false, message: `${this.configFileName} 格式无效` }
      }
      if (!isSystemBundledApp(manifest.id)) {
        fs.rmSync(tempDir, { recursive: true, force: true })
        return { success: false, message: `不是系统应用: ${manifest.id}` }
      }
      /** 清单校验。 */
      const validation = this.validateManifest(manifest)
      if (!validation.success) {
        fs.rmSync(tempDir, { recursive: true, force: true })
        return validation as AppManageResult<AppConfig>
      }
      if (this.isRunning(manifest.id)) this.stopApp(manifest.id)
      /** 目标目录。 */
      const targetDir = getSystemAppDir(manifest.id)
      this.killLeftoverInDir(targetDir)
      /** 覆盖失败时用来还原的备份。 */
      const backupDir = `${targetDir}.bak`
      if (fs.existsSync(backupDir)) fs.rmSync(backupDir, { recursive: true, force: true })
      if (fs.existsSync(targetDir)) fs.renameSync(targetDir, backupDir)
      try {
        /** 清单所在目录。 */
        const extractRoot = path.dirname(manifestPath)
        this.placeExtractedApp(extractRoot, tempDir, targetDir)
        if (fs.existsSync(backupDir)) fs.rmSync(backupDir, { recursive: true, force: true })
      } catch (error) {
        if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true })
        if (fs.existsSync(backupDir)) fs.renameSync(backupDir, targetDir)
        throw error
      }
      /** 完整配置。 */
      const now = new Date().toISOString()
      const config = this.buildFullConfig(manifest, {
        enabled: true,
        installType: AppInstallType.DEVELOPMENT,
        installSource: targetDir,
        installedAt: now,
        createdAt: now,
        updatedAt: now
      })
      this.appCache.set(config.id, config)
      this.appLinkMap.set(config.id, targetDir)
      this.appFolderMap.delete(config.id)
      this.getOrCreateRuntime(config.id).state = AppState.ENABLED
      this.saveRuntimeState()
      this.emit('installed', config)
      return { success: true, message: `系统应用 "${config.id}" 已安装`, data: config }
    } catch (err) {
      fs.rmSync(tempDir, { recursive: true, force: true })
      return { success: false, message: `系统应用安装失败: ${(err as Error).message}` }
    }
  }

  // ========== 卸载 ==========

  /**
   * 卸载应用
   * - copy/normal 模式：删除已登记目录（不要求文件夹名等于 id）
   * - link 模式：删除 .app-link.json
   * - reference 模式：仅从缓存移除
   *
   * @param appId - app.json.id
   * @param keepSource - 是否保留源文件（默认 false，全部删除）
   */
  uninstallApp(appId: string, keepSource: boolean = false): AppManageResult {
    /** 待卸载的应用配置。 */
    const app = this.appCache.get(appId)
    // 只认 app.json.id，不按文件夹名查找
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
      // link 模式：只删引用文件，源目录是开发者的工作区，不能动
      if (app.installType === AppInstallType.DEVELOPMENT && this.appLinkMap.has(appId)) {
        // link 模式：删除 .app-link.json
        /** 链接文件路径。 */
        const linkPath = path.join(this.appsRootPath, `${appId}.app-link.json`)
        // 文件可能已被手工删掉
        if (fs.existsSync(linkPath)) fs.unlinkSync(linkPath)
        this.appLinkMap.delete(appId)
      } else if (!keepSource) {
        // copy/normal 模式：删除已登记的那份目录，文件夹名可以和 id 不同
        /** 应用文件夹名，缓存没有就按 app.json.id 回磁盘找。 */
        const folderName = this.appFolderMap.get(appId) ?? this.findAppFolderOnDisk(appId)
        // 找到目录才删
        if (folderName) {
          /** 应用目录绝对路径。 */
          const appDir = path.join(this.appsRootPath, folderName)
          if (fs.existsSync(appDir)) {
            fs.rmSync(appDir, { recursive: true, force: true })
          }
        }
      }

      // 清三份缓存并持久化运行时状态
      this.appCache.delete(appId)
      this.appFolderMap.delete(appId)
      this.appRuntimeCache.delete(appId)
      this.saveRuntimeState()

      this.emit('uninstalled', app)

      return { success: true, message: `应用 "${appId}" 已卸载` }
    } catch (err) {
      // 删文件失败时缓存保持原状，避免出现「缓存没有但磁盘还在」
      return { success: false, message: `卸载应用失败: ${(err as Error).message}` }
    }
  }

  /**
   * 兼容旧接口
   * @param appId 应用 ID
   * @param deleteFolder 是否连文件夹一起删；语义与 keepSource 相反
   */
  deleteApp(appId: string, deleteFolder: boolean = false): AppManageResult {
    // deleteFolder=true 等价于 keepSource=false
    return this.uninstallApp(appId, !deleteFolder)
  }

  // ========== 更新 ==========

  /**
   * 更新应用配置
   * @param appId - 应用 ID
   * @param updates - 要更新的字段
   */
  updateApp(appId: string, updates: UpdateAppOptions): AppManageResult<AppConfig> {
    /** 现有配置。 */
    const existing = this.appCache.get(appId)
    // 应用不存在
    if (!existing) {
      return { success: false, message: `应用 "${appId}" 不存在` }
    }

    /** 配置文件路径。 */
    const configPath = this.getAppConfigPath(appId)
    // 找不到 app.json（源目录被删等）
    if (!configPath) {
      return { success: false, message: `找不到应用 "${appId}" 的配置文件` }
    }

    try {
      /** 合并后的配置。 */
      const updated: AppConfig = {
        ...existing,
        ...updates,
        // 下面几项不可变，强制沿用旧值
        id: existing.id,
        installType: existing.installType,
        installSource: existing.installSource,
        installedAt: existing.installedAt,
        // 更新时间取当前时刻
        updatedAt: new Date().toISOString()
      }

      // 仅将清单字段写入 app.json
      this.writeJSON(configPath, this.extractManifest(updated))

      // 运行时字段写入 .app-runtime.json
      /** 应用文件夹名。 */
      const folderName = this.appFolderMap.get(appId)
      // link / reference 模式没有文件夹，跳过运行时元数据
      if (folderName) {
        this.saveAppRuntimeMeta(folderName, updated)
      }

      this.appCache.set(appId, updated)

      // 带上旧版本号，方便上层判断是否升级
      this.emit('updated', updated, { previousVersion: existing.version })

      return { success: true, message: `应用 "${appId}" 更新成功`, data: updated }
    } catch (err) {
      // 写盘失败时不改缓存，保持与磁盘一致
      return { success: false, message: `更新应用失败: ${(err as Error).message}` }
    }
  }

  /**
   * 从源文件夹更新开发模式应用（link 模式）
   * @param appId 应用 ID
   */
  updateAppFromSource(appId: string): AppManageResult<AppConfig> {
    /** 现有配置。 */
    const app = this.appCache.get(appId)
    // 应用不存在
    if (!app) return { success: false, message: `应用 "${appId}" 不存在` }

    /** 源目录（link 模式下即开发者工作区）。 */
    const sourcePath = app.installSource
    // 源目录里的清单已不在
    if (!fs.existsSync(path.join(sourcePath, this.configFileName))) {
      return { success: false, message: `源文件夹已失效: ${sourcePath}` }
    }

    /** 源清单内容。 */
    const manifest = this.readJSON<AppManifest>(path.join(sourcePath, this.configFileName))
    // 清单损坏
    if (!manifest) return { success: false, message: '源清单文件无效' }

    // 只同步清单字段，运行时元数据保持不动
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

  /**
   * 按 id 取应用配置。只认 app.json.id，不要求与文件夹名相同。
   * @param appId 应用 ID
   */
  getApp(appId: string): AppConfig | null {
    return this.appCache.get(appId) ?? null
  }

  /**
   * 列出应用，可按启用状态 / 安装类型 / 槽位过滤
   * @param filter 过滤条件，缺省列全部
   */
  listApps(filter?: {
    /** 只看启用或只看禁用。 */
    enabled?: boolean
    /** 按安装类型过滤。 */
    installType?: AppInstallType
    /** 按挂载位置过滤。 */
    slot?: AppConfig['slot']
  }): AppConfig[] {
    /** 过滤中的应用列表。 */
    let apps = Array.from(this.appCache.values())
    // enabled 允许传 false，所以用 undefined 判断有没有给
    if (filter?.enabled !== undefined) {
      apps = apps.filter((a) => a.enabled === filter.enabled)
    }
    // 按安装类型过滤
    if (filter?.installType) {
      apps = apps.filter((a) => a.installType === filter.installType)
    }
    // 按槽位过滤
    if (filter?.slot) {
      apps = apps.filter((a) => a.slot === filter.slot)
    }
    return apps
  }

  /**
   * 按挂载位置列出应用
   * @param slot 槽位
   */
  listAppsBySlot(slot: AppConfig['slot']): AppConfig[] {
    return this.listApps({ slot })
  }

  /** 已登记的应用总数。 */
  getAppCount(): number {
    return this.appCache.size
  }

  /**
   * 是否为 link 模式登记的外部目录应用（开发者中心本地包）。
   * @param appId 应用 ID
   */
  isLinkedApp(appId: string): boolean {
    /** 应用配置。 */
    const app = this.appCache.get(appId)
    return Boolean(
      app && app.installType === AppInstallType.DEVELOPMENT && this.appLinkMap.has(appId)
    )
  }

  /**
   * 获取应用的磁盘文件夹路径
   * @param appId 应用 ID
   */
  getAppDir(appId: string): string | null {
    /** 应用配置。 */
    const app = this.appCache.get(appId)
    // 应用不存在
    if (!app) return null

    // link 模式返回源路径
    if (app.installType === AppInstallType.DEVELOPMENT && this.appLinkMap.has(appId)) {
      return this.appLinkMap.get(appId)!
    }

    /** 已登记的文件夹名。 */
    const mapped = this.appFolderMap.get(appId)
    if (mapped) {
      /** 登记路径。 */
      const mappedDir = path.join(this.appsRootPath, mapped)
      if (fs.existsSync(mappedDir)) return mappedDir
    }
    /** 文件夹被改名后，按 app.json.id 回磁盘找。 */
    const folderName = this.findAppFolderOnDisk(appId)
    // reference 模式或目录已被删
    if (!folderName) return null
    this.appFolderMap.set(appId, folderName)
    return path.join(this.appsRootPath, folderName)
  }

  // ========== 权限控制 ==========

  /**
   * 检查用户是否有权访问某个应用
   * @param appId 应用 ID
   * @param user 当前用户，含 userId / roles / isAdmin
   */
  checkAccess(
    appId: string,
    user: { userId: string; roles: string[]; isAdmin?: boolean }
  ): AppManageResult<boolean> {
    /** 应用配置。 */
    const app = this.appCache.get(appId)
    // 应用不存在
    if (!app) {
      return { success: false, message: `应用 "${appId}" 不存在`, data: false }
    }

    // 已禁用的应用对所有人不可见
    if (app.enabled === false) {
      return { success: true, message: '应用已被禁用', data: false }
    }

    /** 应用权限配置。 */
    const perms = app.permissions
    // 没配权限就是全员可用
    if (!perms) {
      return { success: true, message: '无需权限校验', data: true }
    }

    // 要求管理员但当前用户不是
    if (perms.requireAdmin && !user.isAdmin) {
      return { success: true, message: '需要管理员权限', data: false }
    }

    // 配了用户白名单
    if (perms.userIds && perms.userIds.length > 0) {
      // 当前用户不在名单里
      if (!perms.userIds.includes(user.userId)) {
        return { success: true, message: '用户不在白名单中', data: false }
      }
    }

    // 配了角色白名单
    if (perms.roles && perms.roles.length > 0) {
      /** 是否命中任一角色。 */
      const hasRole = user.roles.some((role) => perms.roles!.includes(role))
      // 一个角色都没命中
      if (!hasRole) {
        return { success: true, message: '用户角色无权限', data: false }
      }
    }

    // 上面所有关卡都过了
    return { success: true, message: '权限校验通过', data: true }
  }

  /**
   * 覆盖应用权限配置
   * @param appId 应用 ID
   * @param permissions 新的权限配置
   */
  setPermissions(appId: string, permissions: AppPermissions): AppManageResult<AppConfig> {
    return this.updateApp(appId, { permissions })
  }

  /**
   * 启用 / 禁用应用，并同步运行时状态与事件
   * @param appId 应用 ID
   * @param enabled 是否启用
   */
  setEnabled(appId: string, enabled: boolean): AppManageResult<AppConfig> {
    /** 更新结果。 */
    const result = this.updateApp(appId, { enabled })

    // 写盘成功才动运行时状态，避免内存与磁盘不一致
    if (result.success && result.data) {
      /** 运行时记录。 */
      const runtime = this.getOrCreateRuntime(appId)
      runtime.state = enabled ? AppState.ENABLED : AppState.DISABLED
      this.saveRuntimeState()

      // 按方向发不同事件
      this.emit(enabled ? 'enabled' : 'disabled', result.data)
    }

    return result
  }

  /**
   * 列出该用户能访问的启用应用
   * @param user 当前用户，含 userId / roles / isAdmin
   */
  listAccessibleApps(user: { userId: string; roles: string[]; isAdmin?: boolean }): AppConfig[] {
    return this.listApps({ enabled: true }).filter((app) => {
      /** 单个应用的权限校验结果。 */
      const result = this.checkAccess(app.id, user)
      // 校验本身失败（应用已消失）也算不可访问
      return result.success && result.data === true
    })
  }

  // ========== 冲突检测 ==========

  /**
   * 检测新应用与已安装应用的冲突
   * @param manifest 待安装清单
   * @param excludeAppId 更新场景下要排除自身的应用 ID
   */
  checkConflicts(manifest: AppManifest, excludeAppId?: string): AppManageResult {
    // ID 冲突
    // 更新自己时不算 ID 冲突
    if (!excludeAppId || manifest.id !== excludeAppId) {
      // 已有同 id 应用
      if (this.appCache.has(manifest.id)) {
        return { success: false, message: `应用 ID "${manifest.id}" 已存在` }
      }
    }

    // 入口 URL 冲突
    // 有 entry 才需要比对
    if (manifest.entry) {
      /** 入口冲突说明，null 表示无冲突。 */
      const entryConflict = this.checkEntryConflict(manifest.entry, excludeAppId)
      if (entryConflict) {
        return { success: false, message: entryConflict }
      }
    }

    // 两项都没冲突
    return { success: true, message: '无冲突' }
  }

  /**
   * 检测入口冲突
   * @param entry 待检查入口
   * @param excludeAppId 要排除的应用 ID
   */
  private checkEntryConflict(entry: string, excludeAppId?: string): string | null {
    for (const [id, app] of this.appCache) {
      // 跳过自己
      if (excludeAppId && id === excludeAppId) continue
      // 入口完全相同即冲突
      if (app.entry === entry) {
        return `入口地址 "${entry}" 已被应用 "${id}" (${app.name}) 占用`
      }
    }
    // 没有冲突
    return null
  }

  // ========== 依赖解析 ==========

  /**
   * 解析应用依赖，检查所有依赖是否已安装并启用
   * @param manifest 待安装清单
   */
  resolveDependencies(manifest: AppManifest): AppManageResult<string[]> {
    /** 依赖 id 列表，缺省视为无依赖。 */
    const deps = manifest.dependencies ?? []
    // 没声明依赖
    if (deps.length === 0) {
      return { success: true, message: '无依赖', data: [] }
    }

    /** 未安装的依赖。 */
    const missing: string[] = []
    /** 已安装但被禁用的依赖。 */
    const disabled: string[] = []

    for (const depId of deps) {
      /** 依赖应用配置。 */
      const dep = this.appCache.get(depId)
      // 依赖没装
      if (!dep) {
        missing.push(depId)
      } else if (dep.enabled === false) {
        // 依赖装了但被禁用
        disabled.push(depId)
      }
    }

    // 缺依赖优先报，data 里带回缺失清单
    if (missing.length > 0) {
      return { success: false, message: `缺少依赖: ${missing.join(', ')}`, data: missing }
    }

    // 依赖被禁用
    if (disabled.length > 0) {
      return { success: false, message: `依赖被禁用: ${disabled.join(', ')}`, data: disabled }
    }

    return { success: true, message: '依赖检查通过', data: deps }
  }

  /**
   * 获取应用的依赖树（递归）
   * @param appId 应用 ID
   * @param visited 已访问集合，用于断开循环依赖
   */
  getDependencyTree(appId: string, visited: Set<string> = new Set()): AppConfig[] {
    // 已经访问过，说明成环或重复引用
    if (visited.has(appId)) return []
    visited.add(appId)

    /** 应用配置。 */
    const app = this.appCache.get(appId)
    // 应用不存在或没声明依赖
    if (!app || !app.dependencies) return []

    /** 收集到的依赖配置。 */
    const result: AppConfig[] = []
    for (const depId of app.dependencies) {
      /** 依赖应用配置。 */
      const dep = this.appCache.get(depId)
      // 依赖已安装才计入，未安装的交给 resolveDependencies 报错
      if (dep) {
        result.push(dep)
        // 继续往下展开依赖的依赖
        result.push(...this.getDependencyTree(depId, visited))
      }
    }
    return result
  }

  // ========== 健康检查 ==========

  /**
   * 检查应用是否健康（入口文件/URL 是否可访问）
   * @param appId 应用 ID
   */
  checkHealth(appId: string): AppManageResult<boolean> {
    /** 应用配置。 */
    const app = this.appCache.get(appId)
    // 应用不存在
    if (!app) {
      return { success: false, message: `应用 "${appId}" 不存在`, data: false }
    }

    /** 运行时记录。 */
    const runtime = this.getOrCreateRuntime(appId)

    try {
      /** 本次健康检查结论。 */
      let isHealthy = false

      // 根据 entry 类型做不同检查
      // HTTP(S) 入口：主进程无法同步探活
      if (app.entry.startsWith('http://') || app.entry.startsWith('https://')) {
        // URL 入口 — 文件系统检查不适用，标记为需要网络验证
        isHealthy = true // 无法在此同步检查 HTTP，标记为健康
      } else {
        // 本地入口 — 检查文件是否存在
        /** 应用磁盘目录。 */
        const appDir = this.getAppDir(appId)
        // 目录都找不到就无从检查，保持不健康
        if (appDir) {
          /** 入口文件绝对路径。 */
          const fullEntry = path.resolve(appDir, app.entry)
          isHealthy = fs.existsSync(fullEntry)
          // 入口文件缺失，记下原因供界面展示
          if (!isHealthy) {
            runtime.lastError = `入口文件不存在: ${fullEntry}`
          }
        }
      }

      // 回写检查结论与时间
      runtime.healthy = isHealthy
      runtime.lastHealthCheck = new Date().toISOString()
      // 不健康则置为 ERROR 并发事件
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
      // 检查过程本身抛错（如权限问题），按不健康处理
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
    /** appId → 检查结果。 */
    const results = new Map<string, AppManageResult<boolean>>()
    for (const appId of this.appCache.keys()) {
      results.set(appId, this.checkHealth(appId))
    }
    return results
  }

  // ========== 应用启停 ==========

  /**
   * 点开应用时执行 app.json.spawn（整串交给 shell，支持 &&）。
   * 无 spawn 则跳过。不向子进程注入超级智能体 IPC。端口由子应用自己听，客户端不探具体端口号、不管冲突。
   * 复用已登记进程时只确认进程组是否仍在 LISTEN；僵尸进程会杀掉重拉。
   * @param appId 应用 ID，必须是 app.json.id
   * @param options.cwd 打开的那份目录；不传则走已登记的 getAppDir
   */
  startApp(
    appId: string,
    options?: { cwd?: string }
  ): AppManageResult<{ command: string; cwd: string; pid: number }> {
    /** 调用方指定的打开目录。 */
    const requestedDir = options?.cwd?.trim() || ''
    // 缓存没有时，从打开目录登记，不假定文件夹名等于 id
    if (!this.appCache.has(appId) && requestedDir) this.tryLoadFromAppDir(requestedDir)
    /** 应用配置。 */
    const app = this.appCache.get(appId)
    // 应用不存在
    if (!app) return { success: false, message: `应用 "${appId}" 不存在` }
    // 已禁用的应用不允许启动
    if (!app.enabled) return { success: false, message: `应用 "${appId}" 已被禁用，无法启动` }

    /** 应用工作目录：优先用打开的那份，否则按 id 查已登记目录。 */
    const appDir =
      requestedDir && fs.existsSync(path.join(requestedDir, this.configFileName))
        ? requestedDir
        : this.getAppDir(appId)
    // 找不到目录就没法定 cwd
    if (!appDir) return { success: false, message: `找不到应用 "${appId}" 的工作目录` }

    /** 去空白后的 spawn 命令。 */
    const command = (app.spawn || '').trim()
    // 应用没声明 spawn：不算失败，只是没有子进程要起
    if (!command) {
      return {
        success: true,
        message: `应用 "${appId}" 无 spawn，跳过进程启动`,
        data: { command: '', cwd: appDir, pid: 0 }
      }
    }

    // 已在跑且确实在听（或刚拉起）就复用，避免应用中心返回后再打开把 Node 重启掉
    if (this.isRunning(appId)) {
      if (this.canReuseSpawn(appId)) {
        return {
          success: true,
          message: `应用 "${appId}" 已在运行`,
          data: { command, cwd: appDir, pid: this.runningProcesses.get(appId)?.pid || 0 }
        }
      }
      const stale = this.runningProcesses.get(appId)
      if (stale) this.killChildTree(stale)
      const staleCwd = this.clearRunning(appId)
      if (staleCwd) this.killLeftoverInDir(staleCwd)
    }
    // 清掉上次客户端崩溃后仍占着该目录的残留 Node
    this.killLeftoverInDir(appDir)

    try {
      /** 本次握手 token，子进程用它校验桥请求来源。 */
      const token = randomBytes(32).toString('hex')
      /** spawn 出的子进程。 */
      const child = spawn(command, {
        // 以应用目录为 cwd，spawn 脚本里的相对路径才成立
        cwd: appDir,
        env: {
          ...process.env,
          // 用户只写应用内相对路径；node 用客户端自带的
          PATH: buildSpawnPath(process.env.PATH || ''),
          // 告诉子进程自己是哪个应用
          JIAORONG_APP_ID: appId,
          // 只给握手 token，不给超级智能体 IPC
          JIAORONG_BRIDGE_TOKEN: token
        },
        // 收集输出转发到客户端控制台
        stdio: 'pipe',
        // 整串命令交给 shell，支持 && 拼接
        shell: true,
        // POSIX 下独立进程组，方便整树 kill
        detached: process.platform !== 'win32'
      })

      this.spawnLogs.set(appId, '')
      const appendSpawnLog = (chunk: Buffer) => {
        const text = chunk.toString()
        this.spawnLogs.set(appId, `${this.spawnLogs.get(appId) ?? ''}${text}`)
        return text
      }
      // 子进程 stdout 转到客户端日志
      child.stdout?.on('data', (data: Buffer) => {
        console.log(`[${appId}] ${appendSpawnLog(data).trimEnd()}`)
      })
      // 子进程 stderr 转到客户端错误日志
      child.stderr?.on('data', (data: Buffer) => {
        console.error(`[${appId}] ${appendSpawnLog(data).trimEnd()}`)
      })

      // 子进程退出时自动更新状态
      child.on('exit', (code, signal) => {
        console.log(`[${appId}] 进程退出，code=${code}, signal=${signal}`)
        // 退回启用/禁用态，而不是留在 RUNNING
        this.markChildEnded(
          appId,
          app.enabled ? AppState.ENABLED : AppState.DISABLED,
          undefined,
          child
        )
        this.emit('stopped', app, { exitCode: code, signal })
      })

      // spawn 本身失败（命令不存在等）
      child.on('error', (err) => {
        console.error(`[${appId}] 进程异常:`, err.message)
        this.markChildEnded(appId, AppState.ERROR, err.message, child)
        this.emit('error', app, { reason: err.message })
      })

      // 记录进程引用
      this.runningProcesses.set(appId, child)
      this.spawnStartedAt.set(appId, Date.now())
      this.runningCwd.set(appId, appDir)

      /** 运行时记录。 */
      const runtime = this.getOrCreateRuntime(appId)
      runtime.process = child
      // spawn 刚返回时 pid 一定存在
      runtime.pid = child.pid!
      runtime.state = AppState.RUNNING
      // 启动成功清掉上次的错误
      runtime.lastError = undefined
      this.saveRuntimeState()

      this.emit('running', app)

      return {
        success: true,
        message: `应用 "${appId}" 已启动 (PID: ${child.pid})`,
        data: { command, cwd: appDir, pid: child.pid! }
      }
    } catch (err) {
      // spawn 抛错，不留下半截状态
      return { success: false, message: `启动应用失败: ${(err as Error).message}` }
    }
  }

  /**
   * 停止应用的 Node 服务。整棵进程树 SIGKILL，不依赖 appCache 是否还有这条应用。
   * @param appId 应用 ID
   */
  stopApp(appId: string): AppManageResult {
    /** 应用配置；refresh 之后可能已经被清掉。 */
    const app = this.appCache.get(appId)
    /** 正在运行的子进程。 */
    const child = this.runningProcesses.get(appId)
    /** 停之前记下 cwd，杀树后再按目录清残留。 */
    const cwd = this.runningCwd.get(appId)

    try {
      if (child && this.isRunning(appId)) {
        // 整棵进程树一起杀，避免孙进程继续占端口
        this.killChildTree(child)
      }
      this.clearRunning(appId)
      if (cwd) this.killLeftoverInDir(cwd)
      /** 运行时记录；缓存没有时也可以没有。 */
      const runtime = this.appRuntimeCache.get(appId)
      if (runtime) {
        runtime.process = undefined
        runtime.pid = undefined
        runtime.state = app?.enabled ? AppState.ENABLED : AppState.DISABLED
        this.saveRuntimeState()
      }
      if (app) this.emit('stopped', app)
      return { success: true, message: `应用 "${appId}" 已停止` }
    } catch (err) {
      // kill 失败时保留登记，下次 stop 会再试
      return { success: false, message: `停止应用失败: ${(err as Error).message}` }
    }
  }

  /** 停掉所有已 spawn 的子进程。 */
  stopAllRunningApps(): void {
    // 先拷贝目录与键：stopApp 会在遍历中改动 runningProcesses
    const dirs = Array.from(this.runningCwd.values())
    const runningIds = Array.from(this.runningProcesses.keys())
    for (const appId of runningIds) this.stopApp(appId)
    for (const dir of dirs) this.killLeftoverInDir(dir)
  }

  /**
   * 检查应用是否正在运行
   * @param appId 应用 ID
   */
  isRunning(appId: string): boolean {
    /** 登记的子进程。 */
    const child = this.runningProcesses.get(appId)
    // 从没启动过，或已被清理
    if (!child) return false
    // 检查进程是否还活着
    // exitCode / signalCode 任一有值都说明已退出
    return child.exitCode === null && child.signalCode === null
  }

  /**
   * 当前仍在跑的应用显示名，供端口占用提示。
   * @param excludeId 排除正在启动的自己
   */
  listRunningAppNames(excludeId?: string): string[] {
    /** 显示名。 */
    const names: string[] = []
    for (const appId of this.runningProcesses.keys()) {
      if (excludeId && appId === excludeId) continue
      if (!this.isRunning(appId)) continue
      names.push(this.appCache.get(appId)?.name || appId)
    }
    return names
  }

  /**
   * 最近一次 spawn 的输出，供打开应用时判断端口占用。
   * @param appId 应用 id
   */
  readLastSpawnLog(appId: string): string {
    return this.spawnLogs.get(appId) ?? ''
  }

  /**
   * 获取应用运行中的子进程引用（供上层监听/操作）
   * @param appId 应用 ID
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
    /** 该事件已有的监听器集合。 */
    let listeners = this.eventListeners.get(eventName)
    // 首次订阅该事件，建一个集合
    if (!listeners) {
      listeners = new Set()
      this.eventListeners.set(eventName, listeners)
    }
    // Set 天然去重，同一个回调不会被调两次
    listeners.add(callback)
  }

  /**
   * 移除事件监听器
   * @param eventName 事件名
   * @param callback 之前注册的回调
   */
  off(eventName: AppEventName, callback: AppEventCallback): void {
    /** 该事件的监听器集合。 */
    const listeners = this.eventListeners.get(eventName)
    // 从没订阅过就不用删
    if (listeners) {
      listeners.delete(callback)
    }
  }

  /**
   * 触发事件
   * @param eventName 事件名
   * @param appConfig 相关应用配置
   * @param extra 附加数据
   */
  private emit(
    eventName: AppEventName,
    appConfig: AppConfig,
    extra?: Record<string, unknown>
  ): void {
    /** 组装出的事件对象。 */
    const event: AppEvent = {
      eventName,
      appId: appConfig.id,
      appConfig,
      timestamp: new Date().toISOString(),
      extra
    }

    /** 该事件的监听器集合。 */
    const listeners = this.eventListeners.get(eventName)
    // 没人订阅就不必构造遍历
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(event)
        } catch (err) {
          // 单个监听器抛错不能影响其它监听器
          console.error(`[appsManages] 事件处理异常 (${eventName}):`, err)
        }
      }
    }
  }

  // ========== 工具箱方法 ==========

  /**
   * 获取 APP 配置文件路径
   * @param appId 应用 ID
   */
  private getAppConfigPath(appId: string): string | null {
    // link 模式：源文件夹下的 app.json
    if (this.appLinkMap.has(appId)) {
      /** link 指向的源目录。 */
      const sourcePath = this.appLinkMap.get(appId)!
      /** 源目录下的清单路径。 */
      const p = path.join(sourcePath, this.configFileName)
      // 文件不存在说明源已失效
      return fs.existsSync(p) ? p : null
    }

    // copy/normal 模式：appsRootPath 子文件夹下
    /** 应用文件夹名，缓存没有就回磁盘找。 */
    const folderName = this.appFolderMap.get(appId) ?? this.findAppFolderOnDisk(appId)
    // reference 模式或目录已删
    if (!folderName) return null

    /** 目标清单路径。 */
    const p = path.join(this.appsRootPath, folderName, this.configFileName)
    // 只有文件确实存在才返回，避免写入时凭空建文件
    return fs.existsSync(p) ? p : null
  }

  /**
   * 磁盘查找 appId 对应的文件夹名（后备方案）
   * @param appId 应用 ID
   */
  private findAppFolderOnDisk(appId: string): string | null {
    // 根目录都还没建
    if (!fs.existsSync(this.appsRootPath)) return null
    /** 根目录下的一档条目。 */
    const entries = fs.readdirSync(this.appsRootPath, { withFileTypes: true })
    for (const entry of entries) {
      // 只看目录；跳过安装临时解压目录
      if (!entry.isDirectory() || isHiddenAppDirName(entry.name)) continue
      /** 该目录下的清单路径。 */
      const configPath = path.join(this.appsRootPath, entry.name, this.configFileName)
      // 不是应用目录
      if (!fs.existsSync(configPath)) continue
      try {
        /** 清单内容。 */
        const manifest = this.readJSON<AppManifest>(configPath)
        // 目录名可能与 appId 不同，按清单里的 id 比对
        if (manifest?.id === appId) return entry.name
      } catch {
        /* skip */
      }
    }
    // 整个根目录都没找到
    return null
  }

  /**
   * 保存应用运行时元数据到 .app-runtime.json
   * @param folderName 应用文件夹名
   * @param config 完整配置
   */
  private saveAppRuntimeMeta(folderName: string, config: AppConfig): void {
    /** 运行时元数据路径。 */
    const runtimePath = path.join(this.appsRootPath, folderName, '.app-runtime.json')
    // 只写运行时字段，清单字段留在 app.json 由应用方维护
    this.writeJSON(runtimePath, {
      enabled: config.enabled,
      installType: config.installType,
      installSource: config.installSource,
      installedAt: config.installedAt,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt
    })
  }

  /**
   * 在目录中递归查找 app.json
   * @param dir 起始目录
   */
  private findManifestInDir(dir: string): string | null {
    /** 当前目录下的清单路径。 */
    const configPath = path.join(dir, this.configFileName)
    // 优先取最外层，符合常见打包习惯
    if (fs.existsSync(configPath)) return configPath

    /** 当前目录下的一档条目。 */
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      // 只往子目录里找
      if (entry.isDirectory()) {
        /** 子目录里的查找结果。 */
        const found = this.findManifestInDir(path.join(dir, entry.name))
        // 找到就立即返回，不再继续找
        if (found) return found
      }
    }
    // 整棵树都没有清单
    return null
  }

  /**
   * 递归复制目录
   * @param src 源目录
   * @param dest 目标目录
   */
  private copyDirectory(src: string, dest: string): void {
    // 目标目录可能还不存在
    this.ensureDir(dest)
    /** 源目录下的一档条目。 */
    const entries = fs.readdirSync(src, { withFileTypes: true })
    for (const entry of entries) {
      /** 源条目路径。 */
      const srcPath = path.join(src, entry.name)
      /** 目标条目路径。 */
      const destPath = path.join(dest, entry.name)
      // 符号链接原样保留链接本身（pnpm node_modules 依赖相对链接，解引用会破坏结构或直接报错）
      if (entry.isSymbolicLink()) {
        /** 链接指向（保留相对路径原样）。 */
        const linkTarget = fs.readlinkSync(srcPath)
        // 目标已存在同名残留时先移除，避免 symlink 报错
        if (fs.lstatSync(destPath, { throwIfNoEntry: false })) fs.rmSync(destPath, { force: true })
        fs.symlinkSync(linkTarget, destPath)
      } else if (entry.isDirectory()) {
        // 目录递归
        this.copyDirectory(srcPath, destPath)
      } else {
        // 普通文件直接拷
        fs.copyFileSync(srcPath, destPath)
      }
    }
  }

  /**
   * 解压 zip 文件（使用系统命令）
   * @param zipPath 包文件路径
   * @param destDir 解压目标目录
   */
  private extractZip(zipPath: string, destDir: string): void {
    // 使用系统命令解压
    try {
      // Windows 与类 Unix 用不同的系统工具
      if (process.platform === 'win32') {
        // Windows: 使用 PowerShell Expand-Archive
        execSync(
          `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`,
          { stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 }
        )
      } else {
        // Linux/Mac: 使用 unzip（-q 静默，避免海量文件逐行输出撑爆 stdout 缓冲）
        execSync(`unzip -q -o "${zipPath}" -d "${destDir}"`, {
          stdio: 'pipe',
          maxBuffer: 64 * 1024 * 1024
        })
      }
    } catch {
      // 统一成可读错误，隐藏平台命令细节
      throw new Error('解压失败，请确保系统已安装 unzip（Linux/Mac）或 PowerShell（Windows）')
    }
  }

  /**
   * 从完整配置中提取清单字段，运行时字段不写进 app.json
   * @param config 完整配置
   */
  private extractManifest(config: AppConfig): AppManifest {
    return {
      id: config.id,
      name: config.name,
      version: config.version,
      entry: config.entry,
      slot: config.slot,
      // 可选字段为空就不写，保持 app.json 干净
      ...(config.icon ? { icon: config.icon } : {}),
      ...(config.description ? { description: config.description } : {}),
      ...(config.spawn ? { spawn: config.spawn } : {}),
      ...(config.permissions ? { permissions: config.permissions } : {}),
      ...(config.dependencies ? { dependencies: config.dependencies } : {})
    }
  }

  /**
   * 校验清单必填字段
   * @param manifest 待校验清单
   */
  private validateManifest(manifest: AppManifest): AppManageResult {
    // 四个必填字段逐个校验，缺哪个报哪个
    if (!manifest.id?.trim()) return { success: false, message: '应用 id 不能为空' }
    if (!manifest.name?.trim()) return { success: false, message: '应用 name 不能为空' }
    if (!manifest.version?.trim()) return { success: false, message: '应用 version 不能为空' }
    if (!manifest.entry?.trim()) return { success: false, message: '应用 entry 不能为空' }

    // 版本号格式校验（semver 宽松检查）
    /** 宽松 semver 正则：允许预发布与构建元数据。 */
    const semverRegex = /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/
    // 版本号不合规
    if (!semverRegex.test(manifest.version)) {
      return { success: false, message: '版本号格式不符合 semver 规范（例如 1.0.0）' }
    }

    return { success: true, message: '清单校验通过' }
  }

  // ========== 统计与导出 ==========

  /** 获取统计信息 */
  getStats(): {
    /** 应用总数。 */
    total: number
    /** 已启用数。 */
    enabled: number
    /** 已禁用数。 */
    disabled: number
    /** 运行中数。 */
    running: number
    /** 异常数。 */
    error: number
    /** 按安装类型计数。 */
    byInstallType: Record<string, number>
    /** 按槽位计数。 */
    bySlot: Record<string, number>
  } {
    /** 基础计数。 */
    const stats: Record<string, number> = {
      total: 0,
      enabled: 0,
      disabled: 0,
      running: 0,
      error: 0
    }
    /** 安装类型计数表。 */
    const byInstallType: Record<string, number> = {}
    /** 槽位计数表。 */
    const bySlot: Record<string, number> = {}

    for (const app of this.appCache.values()) {
      stats.total++
      // 启用与禁用互斥，二选一累加
      if (app.enabled) stats.enabled++
      else stats.disabled++

      /** 运行时记录，可能还没有。 */
      const runtime = this.appRuntimeCache.get(app.id)
      // 运行中与异常按状态分别计数
      if (runtime?.state === AppState.RUNNING) stats.running++
      if (runtime?.state === AppState.ERROR) stats.error++

      // 分组计数，键不存在时从 0 起
      byInstallType[app.installType] = (byInstallType[app.installType] ?? 0) + 1
      bySlot[app.slot] = (bySlot[app.slot] ?? 0) + 1
    }

    // 收成固定形状，避免把内部计数键透出
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
      // 拷贝一份数组，避免调用方改动内部缓存
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

/** 默认导出管理器类。 */
export default appsManages
/** 导出枚举，供上层判断安装状态与类型。 */
export { AppState, AppInstallType }
/** 导出配套类型，供 IPC 层与测试引用。 */
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
