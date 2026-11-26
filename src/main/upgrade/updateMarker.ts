/**
 * 更新标记（auto_update_marker.json）的共享读写与判定。
 *
 * 启动早期（还没创建窗口）和 UpgradeService 都要用它，所以从服务里抽出来，
 * 保证阶段、次数、版本比较只有一套实现。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { compare } from 'compare-versions'

export const UPDATE_MARKER_FILE_NAME = 'auto_update_marker.json'

/** 更新标记阶段：已下载待安装 / 已交给安装器。 */
export const UPDATE_MARKER_PHASE_DOWNLOADED = 'downloaded'
export const UPDATE_MARKER_PHASE_INSTALLING = 'installing'

/** 连续失败这么多次后不再自动重试，改为引导手动下载。 */
export const MAX_UPDATE_INSTALL_ATTEMPTS = 3

/** 缓存包超过这个时间就不再安装，避免装上一个很旧的版本。 */
export const UPDATE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

const PRERELEASE_VERSION_REGEX = /-(?:alpha|beta|rc|canary)(?:[.-]\d+)?$/i

/** 版本号是否是预发布（beta / rc 等），用于渠道一致性判断。 */
export const isPrereleaseVersion = (version: string): boolean =>
  PRERELEASE_VERSION_REGEX.test(version)

export type UpdateMarker = {
  version: string
  releaseDate: string
  releaseNotes: string
  githubUrl: string
  downloadUrl: string
  phase: string
  attempts: number
  installerPath: string
  downloadedAt: number
  updatedAt: number
  /** 安装包的 sha512（base64），下载完成时由 electron-updater 提供 */
  sha512: string
}

const readString = (value: unknown): string => (typeof value === 'string' ? value : '')
const readNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

/** 宽容解析：字段缺失/类型不对就取默认值；版本号不合法视为无效标记。 */
export function parseUpdateMarker(raw: unknown): UpdateMarker | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }
  const record = raw as Record<string, unknown>
  const version = readString(record.version).trim()
  if (!version) {
    return null
  }
  return {
    version,
    releaseDate: readString(record.releaseDate),
    releaseNotes: readString(record.releaseNotes),
    githubUrl: readString(record.githubUrl),
    downloadUrl: readString(record.downloadUrl),
    // 未知阶段按「已下载」处理，避免标记永远停在无法识别的状态
    phase:
      record.phase === UPDATE_MARKER_PHASE_INSTALLING
        ? UPDATE_MARKER_PHASE_INSTALLING
        : UPDATE_MARKER_PHASE_DOWNLOADED,
    attempts: Math.max(0, Math.floor(readNumber(record.attempts))),
    installerPath: readString(record.installerPath),
    downloadedAt: readNumber(record.downloadedAt) || readNumber(record.timestamp),
    updatedAt: readNumber(record.updatedAt) || readNumber(record.timestamp),
    sha512: readString(record.sha512)
  }
}

export function serializeUpdateMarker(marker: UpdateMarker): string {
  return JSON.stringify(marker, null, 2)
}

/** 标记版本是否已经追上当前版本；版本号不合法时按「已过期」处理，避免 compare 抛错卡住启动。 */
export function isMarkerVersionReached(markerVersion: string, currentVersion: string): boolean {
  try {
    return compare(markerVersion, currentVersion, '<=')
  } catch {
    return true
  }
}

export function isMarkerCacheExpired(downloadedAt: number, now: number = Date.now()): boolean {
  if (!downloadedAt || !Number.isFinite(downloadedAt)) {
    return false
  }
  return now - downloadedAt > UPDATE_CACHE_MAX_AGE_MS
}

/** electron-updater 的缓存根；Electron 的 app.getPath 没有 'cache'，按官方 getAppCacheDir 的规则取。 */
export function getUpdateCacheRoot(): string {
  // 测试/定制部署可以覆盖缓存根
  const override = process.env.JIAORONG_UPDATE_CACHE_ROOT?.trim()
  if (override) {
    return override
  }
  if (process.platform === 'win32') {
    return process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Caches')
  }
  return process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache')
}

/** updater 可能缓存的安装包后缀：Windows .exe、macOS .zip/.dmg、Linux .AppImage。 */
const TRUSTED_EXTENSIONS = ['.exe', '.zip', '.dmg', '.appimage'] as const

/**
 * 安装包必须在 updater 的 pending 缓存目录内，且是我们自己的安装包命名。
 * 所有删除/执行安装包的地方都要先过这一层，防止标记被改写后操作任意文件。
 * 执行安装时必须传入 ['.exe']，清理缓存时用默认集合。
 */
const resolveCanonicalPath = (targetPath: string): string => {
  const realpath = fs.realpathSync.native ?? fs.realpathSync
  let current = path.resolve(targetPath)
  const trailing: string[] = []
  while (true) {
    try {
      const realBase = realpath(current)
      return trailing.length > 0 ? path.join(realBase, ...trailing.reverse()) : realBase
    } catch {
      const parent = path.dirname(current)
      if (!parent || parent === current) {
        return path.resolve(targetPath)
      }
      trailing.push(path.basename(current))
      current = parent
    }
  }
}

export function isTrustedInstallerPath(
  installerPath: string,
  cacheRoot: string = getUpdateCacheRoot(),
  allowedExtensions: readonly string[] = TRUSTED_EXTENSIONS
): boolean {
  if (!installerPath || !cacheRoot) {
    return false
  }

  const root = resolveCanonicalPath(cacheRoot)
  const resolved = resolveCanonicalPath(installerPath)
  if (!allowedExtensions.includes(path.extname(resolved).toLowerCase())) {
    return false
  }
  const relativeDir = path.relative(root.toLowerCase(), path.dirname(resolved).toLowerCase())
  if (!relativeDir || relativeDir.startsWith('..') || path.isAbsolute(relativeDir)) {
    return false
  }

  // electron-updater 的下载缓存固定为 <cache>/<app>-updater/pending/<file>
  const segments = relativeDir.split(path.sep).filter(Boolean)
  if (segments.length !== 2 || !segments[0].endsWith('-updater') || segments[1] !== 'pending') {
    return false
  }

  // artifactName 固定是 JiaorongAI-<platform>-<arch>.<ext>
  return path.basename(resolved).toLowerCase().startsWith('jiaorongai-')
}
