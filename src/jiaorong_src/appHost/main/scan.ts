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

/**
 * 比较已装版本与目录版本。
 * @param installed 磁盘上的版本
 * @param catalog 目录里的版本
 * @returns true 表示版本不一致，有可用更新
 */
function compareAppVersion(installed: string | null | undefined, catalog: string): boolean {
  // 没装过就不算「有更新」
  return Boolean(installed && installed !== catalog)
}

/**
 * 复制内置应用时暂存 node_modules 的路径。
 * @param destDir 用户安装目录
 */
function stashPath(destDir: string): string {
  // 带目录名与时间戳，避免并发复制互相覆盖
  return path.join(os.tmpdir(), `jiaorong-app-nm-${path.basename(destDir)}-${Date.now()}`)
}

/**
 * 缺 node_modules 时打警告；依赖要求随包发布，不在用户机上安装。
 * @param appDir 应用安装目录
 */
function warnMissingNodeDependencies(appDir: string): void {
  /** 应用 node 目录。 */
  const nodeDir = path.join(appDir, 'node')
  // 没有 node 子应用，不用检查
  if (!fs.existsSync(path.join(nodeDir, 'package.json'))) return
  // 依赖齐全
  if (fs.existsSync(path.join(nodeDir, 'node_modules'))) return
  console.warn(
    '[jiaorong-app] node_modules missing in',
    nodeDir,
    '(bundle them with the app; do not install on the user machine)'
  )
}

/**
 * 把内置应用目录拷到用户安装目录，并保住已有的 node_modules。
 * @param sourceDir 内置源目录
 * @param destDir 用户安装目录
 */
function copyBuiltinApp(sourceDir: string, destDir: string): void {
  // 确保父目录存在
  ensureDir(path.dirname(destDir))
  /** 目标 node_modules。 */
  const destNodeModules = path.join(destDir, 'node', 'node_modules')
  /** 源 node_modules。 */
  const sourceNodeModules = path.join(sourceDir, 'node', 'node_modules')
  /** 暂存的 node_modules。 */
  const stash = stashPath(destDir)
  /** 是否暂存了 node_modules。 */
  let stashed = false
  // 目标已有依赖，先挪到临时目录，避免被清空
  if (fs.existsSync(destNodeModules)) {
    try {
      fs.cpSync(destNodeModules, stash, { recursive: true })
      stashed = true
    } catch (error) {
      // 暂存失败只告警，后面还能从源目录拷
      console.warn('[jiaorong-app] Failed to stash node_modules', destDir, error)
    }
  }
  try {
    // 清掉旧版本，保证是干净覆盖
    fs.rmSync(destDir, { recursive: true, force: true })
  } catch (error) {
    console.warn('[jiaorong-app] Failed to clear app dir before copy', destDir, error)
  }
  // 拷应用本体，按白名单过滤掉不需要的路径
  fs.cpSync(sourceDir, destDir, {
    recursive: true,
    filter: (filePath) => {
      // 根目录本身必须放行
      if (filePath === sourceDir) return true
      return shouldCopyAppPath(sourceDir, filePath)
    }
  })
  /** 是否拷过 node_modules。 */
  const copiedNodeModules = path.join(destDir, 'node', 'node_modules')
  // 源目录带依赖：以源为准
  if (fs.existsSync(sourceNodeModules)) {
    try {
      fs.cpSync(sourceNodeModules, copiedNodeModules, {
        recursive: true,
        // 跟随符号链接，pnpm 风格的 .pnpm 目录才能落地
        dereference: true
      })
    } catch (error) {
      console.warn('[jiaorong-app] Failed to copy source node_modules', destDir, error)
    }
  } else if (stashed && fs.existsSync(path.join(destDir, 'node'))) {
    // 源目录没带依赖：把刚才暂存的还原回去
    try {
      fs.cpSync(stash, copiedNodeModules, { recursive: true, dereference: true })
    } catch (error) {
      console.warn('[jiaorong-app] Failed to restore node_modules', destDir, error)
    }
  }
  // 清理临时暂存
  if (stashed) {
    try {
      fs.rmSync(stash, { recursive: true, force: true })
    } catch {
      // ignore
    }
  }
  warnMissingNodeDependencies(destDir)
}

/**
 * 列出本地调试应用：用户 apps 目录里手丢的包。
 * @param catalogIds 目录里已有的应用 id，用于排重
 */
function listLocalDebugApps(catalogIds: Set<string>): JiaorongAppCatalogRecord[] {
  /** 根目录。 */
  const root = getUserAppsRoot()
  // 用户 apps 目录还没建
  if (!fs.existsSync(root)) return []
  /** 额外字段。 */
  const extras: JiaorongAppCatalogRecord[] = []
  /** 目录下一档。 */
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    // 只认目录
    if (!entry.isDirectory()) continue
    // 目录已收录，或是随客户端内置的系统应用，都不算本地调试
    if (catalogIds.has(entry.name) || isSystemBundledApp(entry.name)) continue
    /** 应用安装目录。 */
    const appDir = path.join(root, entry.name)
    /** 应用清单。 */
    const manifest = readAppManifest(appDir)
    // 没有合法清单，或清单 id 与目录名不一致
    if (!manifest || manifest.id !== entry.name) continue
    // 收成一条本地调试记录：始终启用、不限可见性
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

/**
 * 本机 apps/ 里的应用始终并入列表（手丢的包也要能出现在侧栏）。
 * @param remote OSS 目录
 * @param localDebug 本地调试目录
 */
export function combineRemoteAndLocalDebugApps(
  remote: JiaorongAppCatalogRecord[],
  localDebug: JiaorongAppCatalogRecord[]
): JiaorongAppCatalogRecord[] {
  return [...remote, ...localDebug]
}

/**
 * 这条目录是否还能装：用户目录已有，或仓库/extraResources 里有源。
 * @param record 目录记录
 */
export function catalogRecordHasInstallSource(record: JiaorongAppCatalogRecord): boolean {
  // 系统应用只看内置目录在不在
  if (isSystemBundledApp(record.id)) {
    /** 内置目录名。 */
    const builtinDir = record.package.builtinDir
    return Boolean(builtinDir && fs.existsSync(getBuiltinAppDir(builtinDir)))
  }
  // 后管应用由下载流程负责，恒认为有源
  if (record.source === 'store') return true
  /** 用户安装目录。 */
  const destDir = getUserAppDir(record.id)
  // 本机已经装过
  if (readAppManifest(destDir)) return true
  /** 内置目录名。 */
  const builtinDir = record.package.builtinDir
  // 仓库 / extraResources 里有源
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
  // 清单缺失时标记为 error，但仍保留 appDir 为 null 防止误用
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
  // 没随包发布（如仓库未放该目录）
  if (!manifest) return []
  // 固定按内置来源登记，可见性交给 OSS 覆盖
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
  /** 目录侧是否可见：启用且通过 auth。 */
  const catalogVisible = record.enabled !== false && isAppVisibleToUser(record.auth, user)
  // 系统应用：直接指向内置目录，不拷到用户 apps
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

  // 已装：比对版本决定是 installed 还是 update_available
  if (userManifest) {
    appDir = userDir
    installedVersion = userManifest.version
    installStatus = compareAppVersion(installedVersion, record.version)
      ? 'update_available'
      : 'installed'
  } else if (record.source === 'local-debug') {
    // 本地调试包却没读到清单，说明包坏了
    installStatus = 'error'
  }

  /** 应用清单。 */
  const manifest = appDir ? readAppManifest(appDir) : null
  // 合成运行时项
  return {
    ...record,
    visible,
    installStatus,
    installedVersion,
    appDir,
    entry: manifest?.entry ?? null
  }
}

/**
 * 扫当前用户可见应用。谁能看见只看 OSS 配置表；本机已装的包另外并上。
 * @param user 当前登录用户身份
 */
export function scanJiaorongApps(user: JiaorongAppUserIdentity): JiaorongAppRuntime[] {
  /** OSS 目录。 */
  const remote = loadBuiltinAppCatalog()
  /** 随客户端内置的系统应用。 */
  const system = loadSystemBundledCatalog()
  /** 系统应用叠上 OSS 可见性，并滤掉没有安装源的记录。 */
  const merged = mergeAppCatalogs(mergeSystemBundledCatalog(system, remote), []).filter(
    catalogRecordHasInstallSource
  )
  /** 用户 apps 目录里手丢的本地调试包。 */
  const localDebug = listLocalDebugApps(new Set(merged.map((item) => item.id)))
  // 合并后逐条算出运行时状态
  return combineRemoteAndLocalDebugApps(merged, localDebug).map((record) =>
    resolveRuntime(record, user)
  )
}

/**
 * 把内置应用拷到用户目录；版本一致则跳过。
 * @param runtime 目录扫出的运行时项
 * @param options refresh 为 true 时开发态强制重拷
 */
export function ensureJiaorongAppInstalled(
  runtime: JiaorongAppRuntime,
  options?: { refresh?: boolean }
): JiaorongAppRuntime {
  // 系统应用始终指向内置目录，不拷贝
  if (isSystemBundledApp(runtime.id)) return bindSystemBundledDir(runtime)
  // 本地调试包本来就在用户目录里
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
  // 已装且版本一致，且不需要开发态刷新：直接复用
  if (destManifest && destManifest.version === sourceVersion && !refreshUnpackaged) {
    return {
      ...runtime,
      appDir: destDir,
      installedVersion: destManifest.version,
      installStatus: 'installed',
      entry: destManifest.entry
    }
  }

  // 没有内置源可拷
  if (!builtinDir || !fs.existsSync(builtinDir)) {
    // 但用户目录已经装过，就继续用旧的
    if (destManifest) {
      return {
        ...runtime,
        appDir: destDir,
        installedVersion: destManifest.version,
        installStatus: 'installed',
        entry: destManifest.entry
      }
    }
    // 既没源也没装过，标记失败
    return { ...runtime, installStatus: 'error' }
  }

  try {
    // 拷贝或升级到目标目录
    copyBuiltinApp(builtinDir, destDir)
  } catch (error) {
    // 拷贝失败标记 error，调用方不给打开
    console.error('[jiaorong-app] Failed to copy builtin app', runtime.id, error)
    return { ...runtime, installStatus: 'error' }
  }
  /** 应用清单。 */
  const manifest = readAppManifest(destDir)
  // 拷完按磁盘清单回填版本与入口
  return {
    ...runtime,
    appDir: destDir,
    installedVersion: manifest?.version ?? runtime.version,
    installStatus: 'installed',
    entry: manifest?.entry ?? runtime.entry
  }
}

/**
 * 找当前用户可见且可打开的应用。
 * @param apps 运行时列表
 * @param appId 应用 id
 */
export function findVisibleOpenableApp(
  apps: JiaorongAppRuntime[],
  appId: string
): JiaorongAppRuntime | null {
  /** 当前应用运行时。 */
  const runtime = apps.find((item) => item.id === appId)
  // 不存在或当前用户不可见
  if (!runtime?.visible) return null
  // 后管应用还没下载完，不能打开
  if (runtime.source === 'store' && runtime.installStatus === 'not_installed') return null
  return runtime
}
