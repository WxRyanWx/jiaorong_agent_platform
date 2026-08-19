import fs from 'fs'
import os from 'os'
import path from 'path'

/** 主进程家目录 / 协议。勿从 `@jiaorong/brand` 桶导出，避免渲染进程打进 fs。 */

export const APP_BRAND_SLUG = 'jiaorongchat' as const
export const APP_HOME_DIR_NAME = `.${APP_BRAND_SLUG}` as const
export const LEGACY_APP_HOME_DIR_NAME = '.deepchat' as const
export const DEEPLINK_SCHEME = APP_BRAND_SLUG
export const LEGACY_DEEPLINK_SCHEME = 'deepchat' as const

export const getAppHomeDir = (homeDir: string): string => {
  return path.join(homeDir, APP_HOME_DIR_NAME)
}

export const getDefaultSkillsPath = (homeDir: string): string => {
  migrateLegacyAppHomeDir(homeDir)
  return path.join(homeDir, APP_HOME_DIR_NAME, 'skills')
}

export const getSessionsRoot = (homeDir: string = os.homedir()): string => {
  migrateLegacyAppHomeDir(homeDir)
  return path.resolve(homeDir, APP_HOME_DIR_NAME, 'sessions')
}

export const getLegacySessionsRoot = (homeDir: string = os.homedir()): string => {
  return path.resolve(homeDir, LEGACY_APP_HOME_DIR_NAME, 'sessions')
}

const hasDeeplinkPrefix = (value: string, scheme: string): boolean => {
  const lower = value.toLowerCase()
  const prefix = scheme.toLowerCase()
  return lower.startsWith(`${prefix}://`) || lower.startsWith(`${prefix}:`)
}

export const isDeeplinkUrl = (value: string | null | undefined): value is string => {
  if (typeof value !== 'string') {
    return false
  }

  return hasDeeplinkPrefix(value.trim(), DEEPLINK_SCHEME)
}

export const isLegacyDeeplinkUrl = (value: string | null | undefined): value is string => {
  if (typeof value !== 'string') {
    return false
  }

  return hasDeeplinkPrefix(value.trim(), LEGACY_DEEPLINK_SCHEME)
}

export const matchesAnyDeeplinkUrl = (value: string | null | undefined): value is string => {
  return isDeeplinkUrl(value) || isLegacyDeeplinkUrl(value)
}

export const normalizeDeeplinkUrl = (value: string): string => {
  const trimmed = value.trim()
  if (isLegacyDeeplinkUrl(trimmed)) {
    return trimmed.replace(/^deepchat:/i, `${DEEPLINK_SCHEME}:`)
  }

  return trimmed
}

export const isSupportedDeeplinkProtocol = (protocol: string): boolean => {
  const normalized = protocol.toLowerCase().replace(/:$/, '')
  return normalized === DEEPLINK_SCHEME || normalized === LEGACY_DEEPLINK_SCHEME
}

export const repairLegacySkillsPath = (configuredPath: string, homeDir: string): string | null => {
  const slashPath = configuredPath.replace(/\\/g, '/')
  const legacyMatch =
    slashPath.match(/\/\.deepchat\/skills(?:\/(.*))?$/) ??
    slashPath.match(/^[A-Za-z]:\/\.deepchat\/skills(?:\/(.*))?$/i)

  if (!legacyMatch) {
    return null
  }

  const suffixParts = (legacyMatch[1] ?? '').split('/').filter(Boolean)
  return path.join(homeDir, APP_HOME_DIR_NAME, 'skills', ...suffixParts)
}

export const repairPortableDefaultSkillsPath = (
  configuredPath: string,
  homeDir: string
): string | null => {
  const slashPath = configuredPath.replace(/\\/g, '/')
  const match =
    slashPath.match(/^\/Users\/[^/]+\/\.jiaorongchat\/skills(?:\/(.*))?$/i) ??
    slashPath.match(/^[A-Za-z]:\/Users\/[^/]+\/\.jiaorongchat\/skills(?:\/(.*))?$/i) ??
    slashPath.match(/^\/Users\/[^/]+\/\.deepchat\/skills(?:\/(.*))?$/i) ??
    slashPath.match(/^[A-Za-z]:\/Users\/[^/]+\/\.deepchat\/skills(?:\/(.*))?$/i) ??
    slashPath.match(/^\/home\/[^/]+\/\.jiaorongchat\/skills(?:\/(.*))?$/i) ??
    slashPath.match(/^\/home\/[^/]+\/\.deepchat\/skills(?:\/(.*))?$/i)

  if (!match) {
    return null
  }

  const suffixParts = (match[1] ?? '').split('/').filter(Boolean)
  return path.join(homeDir, APP_HOME_DIR_NAME, 'skills', ...suffixParts)
}

let migrationDone = false

/** @internal Exposed for testing only */
export const _resetMigrationState = (): void => {
  migrationDone = false
}

export const migrateLegacyAppHomeDir = (homeDir: string): void => {
  if (migrationDone) return
  migrationDone = true

  const legacyRoot = path.join(homeDir, LEGACY_APP_HOME_DIR_NAME)
  const newRoot = path.join(homeDir, APP_HOME_DIR_NAME)

  if (fs.existsSync(newRoot) || !fs.existsSync(legacyRoot)) {
    return
  }

  try {
    fs.renameSync(legacyRoot, newRoot)
    return
  } catch (renameError) {
    try {
      fs.cpSync(legacyRoot, newRoot, { recursive: true })
      fs.rmSync(legacyRoot, { recursive: true, force: true })
    } catch (copyError) {
      console.warn('[appIdentity] Failed to migrate legacy app home dir:', renameError, copyError)
    }
  }
}
