/**
 * 启动时安装已下载的更新（Windows）。
 *
 * 在创建任何窗口之前调用：命中就直接静默安装并退出，用户不会先进入界面再被踢出来。
 * 只做本地判断，不联网；安装包不存在/过期/校验失败/次数用尽就正常启动。
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { app, Notification } from 'electron'
import logger from '@shared/logger'
import {
  getUpdateCacheRoot,
  isMarkerCacheExpired,
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

export type StartupInstallOutcome = 'installed' | 'skipped' | 'none'

export type StartupInstallDeps = {
  platform: NodeJS.Platform
  currentVersion: string
  markerPath: string
  /** electron-updater 的缓存根（Windows 下是 %LOCALAPPDATA%），用于路径白名单 */
  cacheRoot: string
  resourcesPath: string
  now: number
  isInstallerRunning: (installerFile: string) => boolean
  launchInstaller: (installerPath: string, resourcesPath: string) => Promise<boolean>
  hashFile: (filePath: string) => Promise<string>
  notify: (version: string) => void
  exitApp: () => void
  delay: (ms: number) => Promise<void>
}

const INSTALL_ARGUMENTS = ['/S', '--updated', '--force-run']

/**
 * 用 CSV 格式输出：默认 TABLE 格式会把超过 25 字符的进程名截断，
 * 我们的安装包名（JiaorongAI-windows-x64.exe，26 字符）会被截断导致永远匹配失败。
 */
export const isInstallerListed = (output: string, installerFile: string): boolean => {
  const needle = `"${installerFile}"`.toLowerCase()
  return output.toLowerCase().includes(needle)
}

const defaultIsInstallerRunning = (installerFile: string): boolean => {
  try {
    const output = execFileSync(
      'tasklist',
      ['/FI', `IMAGENAME eq ${installerFile}`, '/FO', 'CSV', '/NH'],
      { encoding: 'utf8', timeout: 3000 }
    )
    return isInstallerListed(output, installerFile)
  } catch {
    return false
  }
}

const spawnDetached = (command: string, args: string[]): Promise<boolean> =>
  new Promise((resolve) => {
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      resolve(ok)
    }
    try {
      const child = spawn(command, args, { detached: true, stdio: 'ignore' })
      child.once('spawn', () => {
        child.unref()
        finish(true)
      })
      child.once('error', (error) => {
        console.error('启动安装器失败', error)
        finish(false)
      })
    } catch (error) {
      console.error('启动安装器异常', error)
      finish(false)
    }
  })

/** 直接拉起；权限不足时回退到 electron-builder 自带的无 UAC 提权器。 */
const defaultLaunchInstaller = async (
  installerPath: string,
  resourcesPath: string
): Promise<boolean> => {
  if (await spawnDetached(installerPath, INSTALL_ARGUMENTS)) {
    return true
  }

  const elevatePath = path.join(resourcesPath, 'elevate.exe')
  if (fs.existsSync(elevatePath)) {
    logger.info('直接启动安装器失败，改用 elevate.exe 提权启动')
    return await spawnDetached(elevatePath, [installerPath, ...INSTALL_ARGUMENTS])
  }

  return false
}

export const computeFileSha512 = (filePath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = createHash('sha512')
    const stream = fs.createReadStream(filePath)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('base64')))
  })

const defaultNotify = (version: string): void => {
  try {
    if (!Notification.isSupported()) {
      return
    }
    new Notification({
      title: 'JiaorongAI',
      body: `正在安装更新（v${version}），完成后会自动重启`
    }).show()
  } catch (error) {
    // 通知失败不影响更新
    console.warn('更新提示通知发送失败', error)
  }
}

const readMarker = (markerPath: string): UpdateMarker | null => {
  try {
    if (!fs.existsSync(markerPath)) {
      return null
    }
    return parseUpdateMarker(JSON.parse(fs.readFileSync(markerPath, 'utf8')))
  } catch (error) {
    console.error('读取更新标记失败', error)
    return null
  }
}

const writeMarker = (markerPath: string, marker: UpdateMarker): boolean => {
  try {
    fs.writeFileSync(markerPath, serializeUpdateMarker(marker), 'utf8')
    return true
  } catch (error) {
    console.error('写入更新标记失败', error)
    return false
  }
}

const clearMarker = (markerPath: string): void => {
  try {
    fs.rmSync(markerPath, { force: true })
  } catch (error) {
    console.warn('清理更新标记失败', error)
  }
}

/** 只删 updater 缓存目录里的安装包；标记被改写时不能删到用户文件。 */
const removeInstaller = (installerPath: string, cacheRoot: string): void => {
  if (!isTrustedInstallerPath(installerPath, cacheRoot)) {
    return
  }
  try {
    fs.rmSync(installerPath, { force: true })
  } catch (error) {
    console.warn('清理已安装的更新包失败', error)
  }
}

export async function tryInstallDownloadedUpdateOnStartup(
  overrides: Partial<StartupInstallDeps> = {}
): Promise<StartupInstallOutcome> {
  const deps: StartupInstallDeps = {
    platform: process.platform,
    currentVersion: app.getVersion(),
    markerPath: path.join(app.getPath('userData'), UPDATE_MARKER_FILE_NAME),
    cacheRoot: getUpdateCacheRoot(),
    resourcesPath: process.resourcesPath,
    now: Date.now(),
    isInstallerRunning: defaultIsInstallerRunning,
    launchInstaller: defaultLaunchInstaller,
    hashFile: computeFileSha512,
    notify: defaultNotify,
    exitApp: () => app.exit(0),
    delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    ...overrides
  }

  // 只有 Windows 有「先卸载旧版、再装新版」的安装器；macOS/Linux 保持退出时安装
  if (deps.platform !== 'win32') {
    return 'none'
  }

  const marker = readMarker(deps.markerPath)
  if (!marker) {
    return 'none'
  }

  // 进程名只从安装包路径推导。启动安装只执行 .exe；清理缓存时才允许 zip/AppImage 等后缀
  const trustedInstaller = isTrustedInstallerPath(marker.installerPath, deps.cacheRoot, ['.exe'])
  const installerFile = marker.installerPath ? path.basename(marker.installerPath) : ''

  // 安装器还在跑：最先判断，即使版本号已经被拷进去，也不能放行半残目录启动。
  // 也不能在这个阶段删安装包/写标记，否则会把正在跑的安装搅黄。
  if (
    marker.phase === UPDATE_MARKER_PHASE_INSTALLING &&
    trustedInstaller &&
    installerFile &&
    deps.isInstallerRunning(installerFile)
  ) {
    logger.info('安装器正在运行，本次启动直接退出')
    deps.exitApp()
    return 'skipped'
  }

  // 渠道不一致（beta/stable 互换）：缓存包不能装回当前渠道
  if (isPrereleaseVersion(marker.version) !== isPrereleaseVersion(deps.currentVersion)) {
    logger.info('忽略跨渠道的启动安装标记', {
      marker: marker.version,
      currentVersion: deps.currentVersion
    })
    removeInstaller(marker.installerPath, deps.cacheRoot)
    clearMarker(deps.markerPath)
    return 'none'
  }

  // 版本已经追上（含用户手动装了更高版本）：清理标记和旧安装包
  if (isMarkerVersionReached(marker.version, deps.currentVersion)) {
    removeInstaller(marker.installerPath, deps.cacheRoot)
    clearMarker(deps.markerPath)
    return 'none'
  }

  if (marker.attempts >= MAX_UPDATE_INSTALL_ATTEMPTS) {
    return 'none'
  }

  if (isMarkerCacheExpired(marker.downloadedAt, deps.now)) {
    logger.info('缓存的安装包已过期，丢弃后重新下载', { version: marker.version })
    removeInstaller(marker.installerPath, deps.cacheRoot)
    clearMarker(deps.markerPath)
    return 'none'
  }

  // 先做路径白名单，再去碰文件：标记被改写时不能对任意路径做存在性检查或删除
  if (!marker.installerPath || !trustedInstaller) {
    logger.warn('安装包路径不在更新缓存目录内，拒绝执行', {
      installerPath: marker.installerPath
    })
    clearMarker(deps.markerPath)
    return 'none'
  }

  if (!fs.existsSync(marker.installerPath)) {
    logger.info('缓存的安装包不存在，丢弃标记', { version: marker.version })
    clearMarker(deps.markerPath)
    return 'none'
  }

  if (marker.sha512) {
    let actual = ''
    try {
      actual = await deps.hashFile(marker.installerPath)
    } catch (error) {
      // 读不了/被杀软占用：按校验失败处理，别让坏包每次启动都卡一遍
      console.warn('安装包校验读取失败，丢弃后重新下载', error)
      removeInstaller(marker.installerPath, deps.cacheRoot)
      clearMarker(deps.markerPath)
      return 'none'
    }
    if (actual !== marker.sha512) {
      logger.warn('安装包 sha512 校验失败，丢弃后重新下载', { version: marker.version })
      removeInstaller(marker.installerPath, deps.cacheRoot)
      clearMarker(deps.markerPath)
      return 'none'
    }
  } else {
    logger.info('标记没有 sha512，跳过完整性校验（旧标记）')
  }

  const nextMarker: UpdateMarker = {
    ...marker,
    phase: UPDATE_MARKER_PHASE_INSTALLING,
    attempts: marker.attempts + 1,
    updatedAt: deps.now
  }

  if (!writeMarker(deps.markerPath, nextMarker)) {
    // 写不进标记就不装，避免每次启动都重复尝试
    return 'none'
  }

  logger.info('启动时安装更新', {
    version: marker.version,
    installerPath: marker.installerPath,
    attempts: nextMarker.attempts
  })
  let launched = false
  try {
    launched = await deps.launchInstaller(marker.installerPath, deps.resourcesPath)
  } catch (error) {
    console.error('启动安装器异常', error)
    launched = false
  }
  if (!launched) {
    // 拉不起来也要保留这次尝试：权限/安全软件长期拦截时才能累计到 3 次、收敛到手动下载态。
    // 通知只在真正拉起后发，避免用户看到"正在安装"却打开了旧版。
    const rollback: UpdateMarker = {
      ...marker,
      phase: UPDATE_MARKER_PHASE_DOWNLOADED,
      attempts: nextMarker.attempts,
      updatedAt: deps.now
    }
    writeMarker(deps.markerPath, rollback)
    return 'none'
  }

  deps.notify(marker.version)
  // 给系统通知一点投递时间，再退出进程
  await deps.delay(500)
  deps.exitApp()
  return 'installed'
}
