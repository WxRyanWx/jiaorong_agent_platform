import logger from '@shared/logger'
import { app, shell } from 'electron'
import type { DeepchatEventPublisher } from '@shared/contracts/events'
import electronUpdater from 'electron-updater'
import type { UpdateDownloadedEvent, UpdateInfo } from 'electron-updater'
import { compare } from 'compare-versions'
import fs from 'fs'
import path from 'path'
import { resolveAppDownloadArtifact } from '@shared/upgrade/downloadLinks'
import {
  getUpdateCacheRoot,
  isMarkerVersionReached,
  isPrereleaseVersion,
  isTrustedInstallerPath,
  MAX_UPDATE_INSTALL_ATTEMPTS,
  parseUpdateMarker,
  serializeUpdateMarker,
  UPDATE_MARKER_FILE_NAME,
  UPDATE_MARKER_PHASE_DOWNLOADED,
  UPDATE_MARKER_PHASE_INSTALLING,
  type UpdateMarker
} from './updateMarker'
import type { UpdateSettings } from './settings'

const { autoUpdater } = electronUpdater

const GITHUB_OWNER = 'ThinkInAIXYZ'
const GITHUB_REPO = 'deepchat'

/** 当前安装包对应的直链；不读上次写进标记里的旧地址。 */
const resolveCurrentDownloadUrl = (): string =>
  resolveAppDownloadArtifact({ platform: process.platform, arch: process.arch })?.url ?? ''

const UPDATE_CHANNEL_STABLE = 'stable'
const UPDATE_CHANNEL_BETA = 'beta'

type ReleaseNoteItem = {
  version?: string | null
  note?: string | null
}

// 版本信息接口
interface VersionInfo {
  version: string
  releaseDate: string
  releaseNotes: string
  githubUrl: string
  downloadUrl: string
  isMock?: boolean
}

type UpdateStatus =
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export type UpgradeFailureObservation = {
  operation:
    | 'check'
    | 'download'
    | 'install'
    | 'install_verification'
    | 'marker_reconcile'
    | 'marker_write'
    | 'runtime'
  errorCategory: 'persistence' | 'provider' | 'unknown'
}

interface UpdateProgress {
  bytesPerSecond: number
  percent: number
  transferred: number
  total: number
}

const normalizeUpdateChannel = (channel?: string): 'stable' | 'beta' => {
  return channel === UPDATE_CHANNEL_BETA ? UPDATE_CHANNEL_BETA : UPDATE_CHANNEL_STABLE
}

const formatTagVersion = (version: string): string => {
  return version.startsWith('v') ? version : `v${version}`
}

const buildReleaseUrl = (version: string): string => {
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tag/${formatTagVersion(version)}`
}

const formatReleaseNotes = (notes?: string | ReleaseNoteItem[] | null): string => {
  if (!notes) return ''
  if (typeof notes === 'string') return notes
  if (!Array.isArray(notes)) return String(notes)
  const blocks = notes
    .map((note) => {
      const title = note.version ? `## ${note.version}` : ''
      const body = note.note ?? ''
      return [title, body].filter(Boolean).join('\n')
    })
    .filter((entry) => entry.length > 0)
  return blocks.join('\n\n')
}

const toVersionInfo = (info: UpdateInfo): VersionInfo => {
  // electron-updater 用 js-yaml 解析 latest*.yml，未加引号的 ISO releaseDate 会被转成 Date。
  // 发布流水线已经强制加引号，这里再做一次防御性归一化，避免历史产物把 Date 带进 IPC 契约。
  const rawReleaseDate = info.releaseDate as unknown
  const releaseDate =
    rawReleaseDate instanceof Date
      ? rawReleaseDate.toISOString()
      : typeof rawReleaseDate === 'string'
        ? rawReleaseDate
        : ''
  const releaseUrl = buildReleaseUrl(info.version)
  return {
    version: info.version,
    releaseDate,
    releaseNotes: formatReleaseNotes(info.releaseNotes),
    githubUrl: releaseUrl,
    downloadUrl: resolveCurrentDownloadUrl()
  }
}

/**
 * update-downloaded 的顶层 sha512 只对应主文件；多架构 yml 下要按下载文件名从 files 里找。
 * 否则 arm64 会把别的架构的哈希写进标记，启动校验必然失败、删包重下。
 */
const resolveDownloadedSha512 = (event: UpdateDownloadedEvent): string => {
  const downloadedName = event.downloadedFile ? path.basename(event.downloadedFile) : ''
  if (downloadedName) {
    const matched = (event.files ?? []).find(
      (file) => file?.url && path.basename(String(file.url)) === downloadedName
    )
    if (matched?.sha512) {
      return matched.sha512
    }
  }
  return event.sha512 || ''
}

// 获取自动更新状态文件路径
const getUpdateMarkerFilePath = () => {
  return path.join(app.getPath('userData'), UPDATE_MARKER_FILE_NAME)
}

export class UpgradeService {
  private _lock: boolean = false
  private _status: UpdateStatus = 'not-available'
  private _progress: UpdateProgress | null = null
  private _error: string | null = null
  private _versionInfo: VersionInfo | null = null
  private _lastCheckTime: number = 0 // 上次检查更新的时间戳
  private _lastCheckType?: string
  private _updateMarkerPath: string
  private _previousUpdateFailed: boolean = false // 标记上次更新是否失败
  private _isUpdating: boolean = false // Flag to track if update installation is in progress
  private _isMockUpdate: boolean = false
  private _automaticCheckFailureActive: boolean = false
  private _activeCheckOperations: number = 0
  private _downloadOperationActive: boolean = false
  private _checkFailureObserved: boolean = false
  private _downloadFailureObserved: boolean = false
  private _installFailureObserved: boolean = false
  private _installAttempts: number = 0
  private _installerPath: string = ''
  private _downloadedAt: number = 0
  private _sha512: string = ''
  /** 本次进程是否真的完成过下载：非 Windows 退出安装只看这个标记 */
  private _downloadedInCurrentSession: boolean = false
  private readonly requestUpdateInstall: (installAction: () => void) => Promise<void>

  private emitStatusChanged(payload: {
    status: UpdateStatus | null
    error?: string | null
    info?: VersionInfo | null
    type?: string
  }): void {
    this.publishEvent('upgrade.status.changed', {
      ...payload,
      version: Date.now()
    })
  }

  private emitProgress(progress: UpdateProgress): void {
    this.publishEvent('upgrade.progress', {
      ...progress,
      version: Date.now()
    })
  }

  private emitWillRestart(): void {
    this.publishEvent('upgrade.willRestart', {
      version: Date.now()
    })
  }

  private emitError(error: string): void {
    this.publishEvent('upgrade.error', {
      error,
      version: Date.now()
    })
  }

  constructor(
    private readonly settings: UpdateSettings,
    private readonly isPrivacyModeEnabled: () => boolean,
    requestUpdateInstall: (installAction: () => void) => Promise<void>,
    private readonly publishEvent: DeepchatEventPublisher,
    private readonly observeFailure: (observation: UpgradeFailureObservation) => void = () =>
      undefined
  ) {
    this.requestUpdateInstall = requestUpdateInstall
    this._updateMarkerPath = getUpdateMarkerFilePath()

    // 配置自动更新
    autoUpdater.autoDownload = false // 默认不自动下载，由我们手动控制
    autoUpdater.allowDowngrade = false
    // Windows 改成「启动时安装」：退出时不再拉起安装器，竞态窗口消失
    autoUpdater.autoInstallOnAppQuit = process.platform !== 'win32'
    // 未打包时 electron-updater 默认跳检查，本地要看状态得强制启用
    if (!app.isPackaged) {
      autoUpdater.forceDevUpdateConfig = true
      // out/main → 项目根目录（electron-vite）；只用 app.getAppPath() 可能找不到 yml
      autoUpdater.updateConfigPath = path.join(__dirname, '../../dev-app-update.yml')
    }

    // 错误处理
    autoUpdater.on('error', (e) => {
      const operation = this.currentUpdaterOperation()
      this.notifyUpdaterFailure(
        operation,
        operation === 'check' || operation === 'download' ? 'provider' : 'unknown'
      )
      logger.info('自动更新失败', e.message)
      this._lock = false
      this._status = 'error'
      this._error = e.message
      this.emitStatusChanged({
        status: this._status,
        error: this._error,
        info: this._versionInfo
      })
    })

    // 检查更新状态
    autoUpdater.on('checking-for-update', () => {
      logger.info('正在检查更新')
    })

    // 无可用更新
    autoUpdater.on('update-not-available', (info) => {
      logger.info('无可用更新')
      this.reconcileMarkerWithRemoteVersion(info?.version)
      this._lock = false
      this._status = 'not-available'
      this._error = null
      this._progress = null
      this._versionInfo = null
      this.emitStatusChanged({
        status: this._status,
        type: this._lastCheckType
      })
    })

    // 有可用更新
    autoUpdater.on('update-available', (info) => {
      logger.info('检测到新版本', info)
      this._lock = false

      // 版本号兜底保护：electron-updater 在 channel 错配时可能把当前 beta 安装包"更新"成更旧的正式版。
      // 严格按 semver 判定——只要远端版本 <= 当前版本就拒绝。这里不再单独以"channel 是否同源"为拒绝条件，
      // 以免误伤"beta → 同版本号 stable 正式发布"这类合法的渠道收敛升级。
      const currentVersion = app.getVersion()
      const remoteVersion = info?.version || ''

      let isDowngradeOrSame = false
      try {
        if (!remoteVersion) {
          isDowngradeOrSame = true
        } else if (compare(remoteVersion, currentVersion, '<=')) {
          isDowngradeOrSame = true
        }
      } catch (e) {
        console.warn('版本号对比失败，忽略此次更新提示', currentVersion, remoteVersion, e)
        isDowngradeOrSame = true
      }

      if (isDowngradeOrSame) {
        logger.info('忽略降级或同版本的更新提示', {
          current: currentVersion,
          remote: remoteVersion
        })
        this._status = 'not-available'
        this._error = null
        this._progress = null
        this._versionInfo = null
        this.emitStatusChanged({
          status: this._status,
          type: this._lastCheckType
        })
        return
      }

      const nextInfo = toVersionInfo(info)
      // _versionInfo 可能被 update-not-available 清空，回退到标记里的目标版本
      const previousTarget = this._versionInfo?.version ?? this.readUpdateMarker()?.version ?? ''
      this._versionInfo = nextInfo
      this._error = null
      this._progress = null

      // 目标版本变了：重置次数与「上次失败」状态，新版本应重新获得自动更新机会
      if (previousTarget && previousTarget !== nextInfo.version) {
        logger.info('更新目标版本变化，重置重试次数', {
          from: previousTarget,
          to: nextInfo.version
        })
        this._installAttempts = 0
        this._previousUpdateFailed = false
        // 目标版本变了：旧安装包路径/哈希不能带进新版本的标记（fallback 路径会用到）
        this._installerPath = ''
        this._sha512 = ''
        this._downloadedAt = 0
      }

      if (this._previousUpdateFailed) {
        logger.info('上次更新失败，本次不进行自动更新，改为手动更新')
        this._status = 'error'
        this._error = '自动更新可能不稳定，请手动下载更新'
        this.emitStatusChanged({
          status: this._status,
          error: this._error,
          info: this._versionInfo
        })
        return
      }

      this._status = 'available'
      this.emitStatusChanged({
        status: this._status,
        info: this._versionInfo
      })

      if (this._lastCheckType === 'autoCheck') {
        this.startDownloadUpdate()
      }
    })

    // 下载进度
    autoUpdater.on('download-progress', (progressObj) => {
      this._lock = true
      this._status = 'downloading'
      this._progress = {
        bytesPerSecond: progressObj.bytesPerSecond,
        percent: progressObj.percent,
        transferred: progressObj.transferred,
        total: progressObj.total
      }
      this.emitStatusChanged({
        status: this._status,
        info: this._versionInfo // 使用已保存的版本信息
      })
      this.emitProgress(this._progress)
    })

    // 下载完成：把安装包路径一起记下来，下次启动可以直接运行它
    autoUpdater.on('update-downloaded', (info) => {
      logger.info('更新下载完成', info)
      this._installerPath = info.downloadedFile || ''
      this._sha512 = resolveDownloadedSha512(info)
      this._downloadedAt = Date.now()
      this._downloadedInCurrentSession = true
      this.markUpdateDownloaded(info)
    })

    // macOS/Linux 仍由 electron-updater 在退出时安装；只有本次进程真的下载过、且正常退出才补记
    if (process.platform !== 'win32') {
      app.on('quit', (_event, exitCode) => {
        if (typeof exitCode === 'number' && exitCode !== 0) {
          return
        }
        if (!this._downloadedInCurrentSession) {
          return
        }
        this.recordQuitInstallAttempt()
      })
    }

    // 应用启动时检查是否有未完成的更新
    this.checkPendingUpdate()
  }

  // 启动时读标记做一次最小状态判定：Windows 的启动安装已在创建窗口前处理，这里负责清理与手动下载态
  private checkPendingUpdate(): void {
    const marker = this.readUpdateMarker()
    if (!marker) {
      return
    }

    const currentVersion = app.getVersion()
    logger.info('检查未完成的更新', marker, currentVersion)

    // 版本已经追上（含用户手动装了更高版本）：标记作废，顺手清掉缓存里的安装包
    if (isMarkerVersionReached(marker.version, currentVersion)) {
      this.removeCachedInstaller(marker.installerPath)
      this.clearUpdateMarker()
      return
    }

    // 渠道不一致：上次的标记来自渠道错配，直接丢弃
    const markerIsPre = isPrereleaseVersion(marker.version)
    const currentIsPre = isPrereleaseVersion(currentVersion)
    if (markerIsPre !== currentIsPre) {
      logger.info('忽略跨渠道的旧 update marker', { marker: marker.version, currentVersion })
      this.removeCachedInstaller(marker.installerPath)
      this.clearUpdateMarker()
      return
    }

    this._versionInfo = {
      version: marker.version,
      releaseDate: marker.releaseDate,
      releaseNotes: marker.releaseNotes,
      githubUrl: marker.githubUrl,
      downloadUrl: resolveCurrentDownloadUrl()
    }
    this._installAttempts = marker.attempts
    this._installerPath = marker.installerPath
    this._downloadedAt = marker.downloadedAt
    this._sha512 = marker.sha512

    if (this._installAttempts >= MAX_UPDATE_INSTALL_ATTEMPTS) {
      logger.info('上次自动更新反复未完成，改为手动下载', {
        version: marker.version,
        attempts: this._installAttempts
      })
      this.enterManualDownloadState()
      return
    }

    // 上次交给安装器但没装成：改回 downloaded，本次启动再试一次
    if (marker.phase === UPDATE_MARKER_PHASE_INSTALLING) {
      logger.info('上次安装未完成，本次启动重试', { version: marker.version })
      this.writeUpdateMarker(marker.version, UPDATE_MARKER_PHASE_DOWNLOADED)
    }
  }

  /**
   * 线上已经不再提供标记里的版本（回滚/下架）时，丢弃缓存包，
   * 避免下次启动把已经撤回的版本装回去。
   */
  private reconcileMarkerWithRemoteVersion(remoteVersion?: string): void {
    const remote = typeof remoteVersion === 'string' ? remoteVersion.trim() : ''
    if (!remote) return

    const marker = this.readUpdateMarker()
    if (!marker) return

    try {
      if (compare(marker.version, remote, '>')) {
        logger.info('线上已不再提供该版本，丢弃缓存包', {
          marker: marker.version,
          remote
        })
        this.removeCachedInstaller(marker.installerPath)
        this.clearUpdateMarker()
      }
    } catch {
      // 版本号非法时交给 checkPendingUpdate 的容错逻辑处理
    }
  }

  /** 版本追平后清掉缓存里的安装包，避免每次更新在磁盘上留一份旧包。 */
  private removeCachedInstaller(installerPath?: string): void {
    if (!installerPath) {
      return
    }
    // 标记可能被改写：只允许删 updater 缓存目录里的安装包
    if (!isTrustedInstallerPath(installerPath, getUpdateCacheRoot())) {
      return
    }
    try {
      fs.rmSync(installerPath, { force: true })
    } catch (error) {
      console.warn('清理已安装的更新包失败', error)
    }
  }

  private enterManualDownloadState(): void {
    this._status = 'error'
    this._error = '自动更新失败，请手动下载安装包'
    this._previousUpdateFailed = true
    this.notifyFailure('install_verification', 'unknown')
    this.emitStatusChanged({
      status: this._status,
      error: this._error,
      info: this._versionInfo
    })
  }

  private readUpdateMarker(): UpdateMarker | null {
    if (!fs.existsSync(this._updateMarkerPath)) {
      return null
    }

    try {
      return parseUpdateMarker(JSON.parse(fs.readFileSync(this._updateMarkerPath, 'utf8')))
    } catch (error) {
      this.notifyFailure('marker_reconcile', 'unknown')
      console.error('检查未完成更新失败', error)
      this.clearUpdateMarker()
      return null
    }
  }

  private clearUpdateMarker(): void {
    try {
      if (fs.existsSync(this._updateMarkerPath)) {
        fs.unlinkSync(this._updateMarkerPath)
      }
    } catch (error) {
      console.error('删除更新标记文件失败', error)
    }
  }

  // 写入更新标记文件；phase 区分「下载完」与「已交给安装器」，attempts 累计安装尝试。
  // 返回是否写成功：调用方需要据此回退次数，避免把没落盘的尝试算进去。
  private writeUpdateMarker(version: string, phase: string): boolean {
    try {
      const marker: UpdateMarker = {
        version,
        releaseDate: this._versionInfo?.releaseDate || '',
        releaseNotes: this._versionInfo?.releaseNotes || '',
        githubUrl: this._versionInfo?.githubUrl || '',
        downloadUrl: this._versionInfo?.downloadUrl || '',
        phase,
        attempts: this._installAttempts,
        installerPath: this._installerPath,
        downloadedAt: this._downloadedAt,
        updatedAt: Date.now(),
        sha512: this._sha512
      }

      fs.writeFileSync(this._updateMarkerPath, serializeUpdateMarker(marker), 'utf8')
      logger.info('写入更新标记文件成功', this._updateMarkerPath)
      return true
    } catch (error) {
      this.notifyFailure('marker_write', 'persistence')
      console.error('写入更新标记文件失败', error)
      return false
    }
  }

  private markUpdateDownloaded(info?: UpdateDownloadedEvent): void {
    this._isMockUpdate = false
    this._lock = false
    this._status = 'downloaded'
    this._error = null
    this._progress = null

    if (!this._versionInfo && info) {
      this._versionInfo = toVersionInfo(info)
    }

    if (!this._versionInfo) {
      this.notifyFailure('download', 'unknown')
      console.warn('Downloaded update is missing version info, skipping renderer broadcast.')
      return
    }

    this.writeUpdateMarker(this._versionInfo.version, UPDATE_MARKER_PHASE_DOWNLOADED)
    this.emitStatusChanged({
      status: this._status,
      info: this._versionInfo
    })
  }

  // 处理应用获得焦点事件
  handleAppFocus(): void {
    if (this.isPrivacyModeEnabled()) {
      return
    }

    const now = Date.now()
    const twelveHoursInMs = 12 * 60 * 60 * 1000 // 12小时的毫秒数
    // 如果距离上次检查更新超过12小时，则重新检查
    if (now - this._lastCheckTime > twelveHoursInMs) {
      this.checkUpdate('autoCheck')
    }
  }

  /**
   *
   * @param type 检查更新的类型，'autoCheck'表示自动检查
   *            如果不传则默认为手动检查
   * @returns
   */
  async checkUpdate(type?: string): Promise<void> {
    if (this._lock) {
      return
    }

    const checkType = type ?? 'manualCheck'
    if (checkType !== 'autoCheck') {
      // 用户主动检查：重置重试预算，但保留已下载的标记（装它就行，不用重新下）
      this._previousUpdateFailed = false
      this.resetMarkerAttempts()
    }
    this._activeCheckOperations += 1
    try {
      this._status = 'checking'
      this._error = null
      this._progress = null
      this._lastCheckType = checkType
      this._checkFailureObserved = false
      this.emitStatusChanged({
        status: this._status
      })

      const updateChannel = normalizeUpdateChannel(this.settings.getChannel())
      autoUpdater.allowPrerelease = updateChannel === UPDATE_CHANNEL_BETA
      autoUpdater.channel = 'jrsi'

      await autoUpdater.checkForUpdates()
      this._lastCheckTime = Date.now()
      this._automaticCheckFailureActive = false
    } catch (error: unknown) {
      this.notifyUpdaterFailure('check', 'unknown')
      this._status = 'error'
      this._error = error instanceof Error ? error.message : String(error)
      this.emitStatusChanged({
        status: this._status,
        error: this._error
      })
    } finally {
      if (this._activeCheckOperations > 0) this._activeCheckOperations -= 1
    }
  }

  getUpdateStatus() {
    return {
      status: this._status,
      progress: this._progress,
      error: this._error,
      updateInfo: this._versionInfo
        ? {
            version: this._versionInfo.version,
            releaseDate: this._versionInfo.releaseDate,
            releaseNotes: this._versionInfo.releaseNotes,
            githubUrl: this._versionInfo.githubUrl,
            // 始终给当前安装包对应的直链，旧标记里的地址不再透出
            downloadUrl: resolveCurrentDownloadUrl()
          }
        : null
    }
  }

  async goDownloadUpgrade(type: 'github' | 'official'): Promise<void> {
    const githubFallbackUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`
    if (type === 'github') {
      const url = this._versionInfo?.githubUrl || githubFallbackUrl
      if (url) {
        shell.openExternal(url)
      }
    } else if (type === 'official') {
      const url = resolveCurrentDownloadUrl()
      if (url) {
        await shell.openExternal(url)
      }
    }
  }

  // 开始下载更新（如果手动触发）
  startDownloadUpdate(): boolean {
    if (this._status !== 'available') {
      return false
    }
    this._downloadFailureObserved = false
    try {
      this._status = 'downloading'
      this._downloadOperationActive = true
      this.emitStatusChanged({
        status: this._status,
        info: this._versionInfo // 使用已保存的版本信息
      })
      void autoUpdater
        .downloadUpdate()
        .then(() => {
          if (this._status !== 'downloaded') {
            logger.info(
              'downloadUpdate resolved before update-downloaded event, applying fallback downloaded status'
            )
            this.markUpdateDownloaded()
          }
        })
        .catch((error: unknown) => {
          this.notifyUpdaterFailure('download', 'provider')
          this._lock = false
          this._status = 'error'
          this._error = error instanceof Error ? error.message : String(error)
          this.emitStatusChanged({
            status: this._status,
            error: this._error,
            info: this._versionInfo
          })
        })
        .finally(() => {
          this._downloadOperationActive = false
        })
      return true
    } catch (error: unknown) {
      this._downloadOperationActive = false
      this.notifyUpdaterFailure('download', 'unknown')
      this._status = 'error'
      this._error = error instanceof Error ? error.message : String(error)
      this.emitStatusChanged({
        status: this._status,
        error: this._error
      })
      return false
    }
  }

  // 触发退出并安装（各平台通用）
  private _doQuitAndInstall(): void {
    logger.info('Preparing to quit and install update')
    this.beginInstallFlow(() => {
      if (process.platform === 'darwin') {
        logger.info('macOS update: calling quitAndInstall with forceRunAfter=true')
        autoUpdater.quitAndInstall(false, true) // silent=false, forceRunAfter=true
        return
      }

      logger.info(`${process.platform} update: calling quitAndInstall`)
      autoUpdater.quitAndInstall()
    })
  }

  private _doMockQuitAndInstall(): void {
    logger.info('Preparing to run mock update restart flow')
    this.beginInstallFlow(() => {
      logger.info('Mock update: relaunching app instead of invoking installer')
      app.relaunch()
      app.exit()
    })
  }

  private beginInstallFlow(installAction: () => void): void {
    this._installFailureObserved = false
    const attemptRecorded = this.recordInstallAttempt()
    this.emitWillRestart()
    this.setUpdatingFlag(true)
    void this.requestUpdateInstall(installAction).catch((error) => {
      this.notifyUpdaterFailure('install', 'unknown')
      console.error('Failed to start update installation flow', error)
      this.setUpdatingFlag(false)
      // 交接失败：回退这次尝试，下次启动还要能重试
      if (attemptRecorded) {
        this._installAttempts = Math.max(0, this._installAttempts - 1)
        const version = this._versionInfo?.version ?? ''
        if (version) {
          this.writeUpdateMarker(version, UPDATE_MARKER_PHASE_DOWNLOADED)
        }
      }
      this.emitError(error instanceof Error ? error.message : String(error))
    })
  }

  /** 交给安装器之前把「已开始安装」和尝试次数落盘；写失败要回退次数。 */
  private recordInstallAttempt(): boolean {
    if (this._isMockUpdate) return false
    const version = this._versionInfo?.version ?? ''
    if (!version) return false
    this._installAttempts += 1
    if (!this.writeUpdateMarker(version, UPDATE_MARKER_PHASE_INSTALLING)) {
      this._installAttempts = Math.max(0, this._installAttempts - 1)
      return false
    }
    return true
  }

  /**
   * 非 Windows：退出时 electron-updater 会直接拉起安装，不经过 beginInstallFlow。
   * 这里补记一次尝试，下次启动才能判断上次是否装成。
   */
  private recordQuitInstallAttempt(): void {
    if (this._isMockUpdate) return
    const marker = this.readUpdateMarker()
    if (!marker) return
    if (marker.phase !== UPDATE_MARKER_PHASE_DOWNLOADED) return
    if (isMarkerVersionReached(marker.version, app.getVersion())) return
    if (!marker.installerPath || !fs.existsSync(marker.installerPath)) {
      // 缓存包已经不在：这次退出不会真正安装，别把"没装成"算成一次失败
      this.clearUpdateMarker()
      return
    }

    this._versionInfo = this._versionInfo ?? {
      version: marker.version,
      releaseDate: marker.releaseDate,
      releaseNotes: marker.releaseNotes,
      githubUrl: marker.githubUrl,
      downloadUrl: resolveCurrentDownloadUrl()
    }
    this._installAttempts = marker.attempts + 1
    this._installerPath = marker.installerPath
    this._downloadedAt = marker.downloadedAt
    this._sha512 = marker.sha512
    this.writeUpdateMarker(marker.version, UPDATE_MARKER_PHASE_INSTALLING)
  }

  /** 用户主动检查时把次数清零，但保留已下载的包和阶段。 */
  private resetMarkerAttempts(): void {
    const marker = this.readUpdateMarker()
    if (!marker) {
      this._installAttempts = 0
      return
    }
    this._installAttempts = 0
    this._installerPath = marker.installerPath
    this._downloadedAt = marker.downloadedAt
    this._sha512 = marker.sha512
    // 手动重试属于「已下载、待安装」，不能把 installing 阶段带进去
    this.writeUpdateMarker(marker.version, UPDATE_MARKER_PHASE_DOWNLOADED)
  }

  mockDownloadedUpdate(): boolean {
    this._isMockUpdate = true
    this._lock = false
    this._status = 'downloaded'
    this._error = null
    this._progress = null
    this._versionInfo = {
      version: '9.9.9-mock',
      releaseDate: '2026-04-16',
      releaseNotes:
        '## Mock Update\n\n- Simulates a downloaded update.\n- Uses the real restart/install UI flow.\n- Intended for floating window shutdown verification.',
      githubUrl: '',
      downloadUrl: '',
      isMock: true
    }

    this.emitStatusChanged({
      status: this._status,
      info: this._versionInfo
    })
    return true
  }

  clearMockUpdate(): boolean {
    if (!this._isMockUpdate) {
      return false
    }

    this._isMockUpdate = false
    this._lock = false
    this._status = 'not-available'
    this._error = null
    this._progress = null
    this._versionInfo = null

    this.emitStatusChanged({
      status: this._status
    })
    return true
  }

  // 重启并更新
  restartToUpdate(): boolean {
    logger.info('重启并更新')
    if (this._status !== 'downloaded') {
      this.emitError('更新尚未下载完成')
      return false
    }
    try {
      if (this._isMockUpdate) {
        this._doMockQuitAndInstall()
        return true
      }

      this._doQuitAndInstall()
      return true
    } catch (e) {
      this.notifyUpdaterFailure('install', 'unknown')
      console.error('重启更新失败', e)
      this.emitError(e instanceof Error ? e.message : String(e))
      return false
    }
  }

  // 重启应用
  restartApp(): void {
    try {
      // 发送即将重启的消息
      this.emitWillRestart()
      // 给UI层一点时间保存状态
      setTimeout(() => {
        try {
          app.relaunch()
          app.exit()
        } catch (error) {
          this.reportRestartFailure(error)
        }
      }, 1000)
    } catch (error) {
      this.reportRestartFailure(error)
    }
  }

  // 设置「正在更新」标记
  private setUpdatingFlag(updating: boolean): void {
    this._isUpdating = updating
  }

  // 读取「正在更新」标记
  isUpdatingInProgress(): boolean {
    return this._isUpdating
  }

  private reportRestartFailure(error: unknown): void {
    this.notifyFailure('runtime', 'unknown')
    console.error('重启失败', error)
    this.emitError(error instanceof Error ? error.message : String(error))
  }

  private notifyFailure(
    operation: UpgradeFailureObservation['operation'],
    errorCategory: UpgradeFailureObservation['errorCategory']
  ): void {
    try {
      this.observeFailure({ operation, errorCategory })
    } catch {
      // 诊断上报不能改变更新状态，也不能影响用户侧恢复行为。
    }
  }

  private currentUpdaterOperation(): 'check' | 'download' | 'install' | 'runtime' {
    let operation: 'check' | 'download' | 'install' | undefined
    let activeOperations = 0
    if (this._isUpdating) {
      operation = 'install'
      activeOperations += 1
    }
    if (this._downloadOperationActive) {
      operation = 'download'
      activeOperations += 1
    }
    if (this._activeCheckOperations > 0) {
      operation = 'check'
      activeOperations += 1
    }
    return activeOperations === 1 && operation ? operation : 'runtime'
  }

  private notifyUpdaterFailure(
    operation: 'check' | 'download' | 'install' | 'runtime',
    errorCategory: 'provider' | 'unknown'
  ): void {
    if (operation === 'check') {
      if (this._checkFailureObserved) return
      this._checkFailureObserved = true
    }
    if (operation === 'check' && this._lastCheckType === 'autoCheck') {
      if (this._automaticCheckFailureActive) return
      this._automaticCheckFailureActive = true
    }
    if (operation === 'download') {
      if (this._downloadFailureObserved) return
      this._downloadFailureObserved = true
    }
    if (operation === 'install') {
      if (this._installFailureObserved) return
      this._installFailureObserved = true
    }
    this.notifyFailure(operation, errorCategory)
  }
}
