/** 扫 OSS 目录与本机已装；协同平台随客户端内置，不拷到用户 apps。 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app } from 'electron'
import { isAppVisibleToUser } from '../auth'
import { loadBuiltinAppCatalog, mergeAppCatalogs } from '../catalog'
import {
  COLLABORATION_PLATFORM_APP_ID,
  isSystemBundledApp,
  mergeSystemBundledCatalog
} from '../systemApps'
import type {
  JiaorongAppCatalogRecord,
  JiaorongAppInstallStatus,
  JiaorongAppRuntime,
  JiaorongAppUserIdentity
} from '../types'
import { readAppManifest } from './manifest'
import {
  ensureDir,
  getBuiltinAppDir,
  getUserAppDir,
  getUserAppsRoot,
  shouldCopyAppPath
} from './paths'

/** 比较已装版本与目录版本。 */
function compareAppVersion(installed: string | null | undefined, catalog: string): boolean {
  return Boolean(installed && installed !== catalog)
}

/** 复制内置应用时暂存 node_modules 的路径。 */
function stashPath(destDir: string): string {
  return path.join(os.tmpdir(), `jiaorong-app-nm-${path.basename(destDir)}-${Date.now()}`)
}

/** 缺 node_modules 时打警告。 */
function warnMissingNodeDependencies(appDir: string): void {
  /** 应用 node 目录。 */
  const nodeDir = path.join(appDir, 'node')
  if (!fs.existsSync(path.join(nodeDir, 'package.json'))) return
  if (fs.existsSync(path.join(nodeDir, 'node_modules'))) return
  console.warn(
    '[jiaorong-app] node_modules missing in',
    nodeDir,
    '(bundle them with the app; do not install on the user machine)'
  )
}

/** 把内置应用目录拷到用户安装目录。 */
function copyBuiltinApp(sourceDir: string, destDir: string): void {
  ensureDir(path.dirname(destDir))
  /** 目标 node_modules。 */
  const destNodeModules = path.join(destDir, 'node', 'node_modules')
  /** 源 node_modules。 */
  const sourceNodeModules = path.join(sourceDir, 'node', 'node_modules')
  /** 暂存的 node_modules。 */
  const stash = stashPath(destDir)
  /** 是否暂存了 node_modules。 */
  let stashed = false
  if (fs.existsSync(destNodeModules)) {
    try {
      fs.cpSync(destNodeModules, stash, { recursive: true })
      stashed = true
    } catch (error) {
      console.warn('[jiaorong-app] Failed to stash node_modules', destDir, error)
    }
  }
  try {
    fs.rmSync(destDir, { recursive: true, force: true })
  } catch (error) {
    console.warn('[jiaorong-app] Failed to clear app dir before copy', destDir, error)
  }
  fs.cpSync(sourceDir, destDir, {
    recursive: true,
    filter: (filePath) => {
      if (filePath === sourceDir) return true
      return shouldCopyAppPath(sourceDir, filePath)
    }
  })
  /** 是否拷过 node_modules。 */
  const copiedNodeModules = path.join(destDir, 'node', 'node_modules')
  if (fs.existsSync(sourceNodeModules)) {
    try {
      fs.cpSync(sourceNodeModules, copiedNodeModules, {
        recursive: true,
        dereference: true
      })
    } catch (error) {
      console.warn('[jiaorong-app] Failed to copy source node_modules', destDir, error)
    }
  } else if (stashed && fs.existsSync(path.join(destDir, 'node'))) {
    try {
      fs.cpSync(stash, copiedNodeModules, { recursive: true, dereference: true })
    } catch (error) {
      console.warn('[jiaorong-app] Failed to restore node_modules', destDir, error)
    }
  }
  if (stashed) {
    try {
      fs.rmSync(stash, { recursive: true, force: true })
    } catch {
      // ignore
    }
  }
  warnMissingNodeDependencies(destDir)
}

/** 列出本地调试应用。 */
function listLocalDebugApps(catalogIds: Set<string>): JiaorongAppCatalogRecord[] {
  /** 根目录。 */
  const root = getUserAppsRoot()
  if (!fs.existsSync(root)) return []
  /** 额外字段。 */
  const extras: JiaorongAppCatalogRecord[] = []
  /** 目录下一档。 */
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (catalogIds.has(entry.name) || isSystemBundledApp(entry.name)) continue
    /** 应用安装目录。 */
    const appDir = path.join(root, entry.name)
    /** 应用清单。 */
    const manifest = readAppManifest(appDir)
    if (!manifest || manifest.id !== entry.name) continue
    extras.push({
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      icon: manifest.icon,
      slot: 'menu',
      source: 'local-debug',
      enabled: true,
      auth: null,
      package: { kind: 'dir', builtinDir: manifest.id }
    })
  }
  return extras
}

/** 本机 apps/ 里的应用始终并入列表（手丢的包也要能出现在侧栏）。 */
export function combineRemoteAndLocalDebugApps(
  remote: JiaorongAppCatalogRecord[],
  localDebug: JiaorongAppCatalogRecord[]
): JiaorongAppCatalogRecord[] {
  return [...remote, ...localDebug]
}

/** 这条目录是否还能装：用户目录已有，或仓库/extraResources 里有源。 */
export function catalogRecordHasInstallSource(record: JiaorongAppCatalogRecord): boolean {
  if (isSystemBundledApp(record.id)) {
    const builtinDir = record.package.builtinDir
    return Boolean(builtinDir && fs.existsSync(getBuiltinAppDir(builtinDir)))
  }
  if (record.source === 'store') return true
  const destDir = getUserAppDir(record.id)
  if (readAppManifest(destDir)) return true
  const builtinDir = record.package.builtinDir
  return Boolean(builtinDir && fs.existsSync(getBuiltinAppDir(builtinDir)))
}

/**
 * 指向 extraResources / 仓库内的系统应用目录，不拷贝。
 * @param runtime 目录项
 */
function bindSystemBundledDir(runtime: JiaorongAppRuntime): JiaorongAppRuntime {
  /** 内置目录名。 */
  const builtinName = runtime.package.builtinDir || runtime.id
  /** 随包目录。 */
  const appDir = getBuiltinAppDir(builtinName)
  /** 包内清单。 */
  const manifest = readAppManifest(appDir)
  return {
    ...runtime,
    appDir: manifest ? appDir : null,
    installedVersion: manifest?.version ?? null,
    installStatus: manifest ? 'installed' : 'error',
    entry: manifest?.entry ?? null
  }
}

/**
 * 从 extraResources / 仓库 apps 读系统应用清单。
 */
function loadSystemBundledCatalog(): JiaorongAppCatalogRecord[] {
  /** 协同平台源目录。 */
  const appDir = getBuiltinAppDir(COLLABORATION_PLATFORM_APP_ID)
  /** 包内 app.json。 */
  const manifest = readAppManifest(appDir)
  if (!manifest) return []
  return [
    {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      icon: manifest.icon,
      slot: 'menu',
      source: 'builtin',
      enabled: true,
      auth: null,
      package: { kind: 'dir', builtinDir: COLLABORATION_PLATFORM_APP_ID }
    }
  ]
}

/**
 * 系统应用固定用内置目录，不把 extraResources 当成「用户已装」。
 */
function resolveRuntime(
  record: JiaorongAppCatalogRecord,
  user: JiaorongAppUserIdentity
): JiaorongAppRuntime {
  const catalogVisible = record.enabled !== false && isAppVisibleToUser(record.auth, user)
  if (isSystemBundledApp(record.id)) {
    return bindSystemBundledDir({
      ...record,
      visible: catalogVisible,
      installStatus: 'not_installed',
      installedVersion: null,
      appDir: null,
      entry: null
    })
  }
  /** userDir 路径。 */
  const userDir = getUserAppDir(record.id)
  /** 用户目录里的清单。 */
  const userManifest = fs.existsSync(userDir) ? readAppManifest(userDir) : null
  /** 配置表允许看见，或本机已经有安装目录（无配置权限但手丢了也能进侧栏）。 */
  const onDisk = Boolean(userManifest)
  const visible = catalogVisible || onDisk

  /** 应用安装目录。 */
  let appDir: string | null = null
  /** 已装版本。 */
  let installedVersion: string | null = null
  /** 安装状态。 */
  let installStatus: JiaorongAppInstallStatus = 'not_installed'

  if (userManifest) {
    appDir = userDir
    installedVersion = userManifest.version
    installStatus = compareAppVersion(installedVersion, record.version)
      ? 'update_available'
      : 'installed'
  } else if (record.source === 'local-debug') {
    installStatus = 'error'
  }

  /** 应用清单。 */
  const manifest = appDir ? readAppManifest(appDir) : null
  return {
    ...record,
    visible,
    installStatus,
    installedVersion,
    appDir,
    entry: manifest?.entry ?? null
  }
}

/** 扫当前用户可见应用。谁能看见只看 OSS 配置表；本机已装的包另外并上。 */
export function scanJiaorongApps(user: JiaorongAppUserIdentity): JiaorongAppRuntime[] {
  const remote = loadBuiltinAppCatalog()
  const system = loadSystemBundledCatalog()
  const merged = mergeAppCatalogs(mergeSystemBundledCatalog(system, remote), []).filter(
    catalogRecordHasInstallSource
  )
  const localDebug = listLocalDebugApps(new Set(merged.map((item) => item.id)))
  return combineRemoteAndLocalDebugApps(merged, localDebug).map((record) =>
    resolveRuntime(record, user)
  )
}

/** 把内置应用拷到用户目录；版本一致则跳过。 */
export function ensureJiaorongAppInstalled(
  runtime: JiaorongAppRuntime,
  options?: { refresh?: boolean }
): JiaorongAppRuntime {
  if (isSystemBundledApp(runtime.id)) return bindSystemBundledDir(runtime)
  if (runtime.source === 'local-debug') return runtime

  /** 用户安装目录。 */
  const destDir = getUserAppDir(runtime.id)
  /** 目标目录清单。 */
  const destManifest = fs.existsSync(destDir) ? readAppManifest(destDir) : null
  /** 开发态是否刷新未打包应用。 */
  const refreshUnpackaged = options?.refresh === true && !app.isPackaged
  /** 内置目录名。 */
  const builtinDir = runtime.package.builtinDir
    ? getBuiltinAppDir(runtime.package.builtinDir)
    : null
  /** 源目录清单。 */
  const sourceManifest =
    builtinDir && fs.existsSync(builtinDir) ? readAppManifest(builtinDir) : null
  /** 源版本。 */
  const sourceVersion = sourceManifest?.version ?? runtime.version
  if (destManifest && destManifest.version === sourceVersion && !refreshUnpackaged) {
    return {
      ...runtime,
      appDir: destDir,
      installedVersion: destManifest.version,
      installStatus: 'installed',
      entry: destManifest.entry
    }
  }

  if (!builtinDir || !fs.existsSync(builtinDir)) {
    if (destManifest) {
      return {
        ...runtime,
        appDir: destDir,
        installedVersion: destManifest.version,
        installStatus: 'installed',
        entry: destManifest.entry
      }
    }
    return { ...runtime, installStatus: 'error' }
  }

  try {
    copyBuiltinApp(builtinDir, destDir)
  } catch (error) {
    console.error('[jiaorong-app] Failed to copy builtin app', runtime.id, error)
    return { ...runtime, installStatus: 'error' }
  }
  /** 应用清单。 */
  const manifest = readAppManifest(destDir)
  return {
    ...runtime,
    appDir: destDir,
    installedVersion: manifest?.version ?? runtime.version,
    installStatus: 'installed',
    entry: manifest?.entry ?? runtime.entry
  }
}

/** 找当前用户可见且可打开的应用。 */
export function findVisibleOpenableApp(
  apps: JiaorongAppRuntime[],
  appId: string
): JiaorongAppRuntime | null {
  /** 当前应用运行时。 */
  const runtime = apps.find((item) => item.id === appId)
  if (!runtime?.visible) return null
  if (runtime.source === 'store' && runtime.installStatus === 'not_installed') return null
  return runtime
}
