/** 扫应用列表目录与本机已装；系统应用走 zip，装到 Electron userData。 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { compareOpenPlatformVersions } from '@jiaorong/api/openPlatform/version'
import { isAppVisibleToUser } from '../auth'
import { hasAppliedAppCatalogSnapshot, loadBuiltinAppCatalog } from '../catalog'
import { isSystemBundledApp, mergeSystemBundledCatalog } from '../systemApps'
import type {
  JiaorongAppCatalogRecord,
  JiaorongAppInstallStatus,
  JiaorongAppRuntime,
  JiaorongAppSlot,
  JiaorongAppUserIdentity
} from '../types'
import { devAppCatalogRecords, isDevCenterAppId } from '../devCenter/main/devApps'
import { readAppManifest } from './manifest'
import { sharedAppsManager } from './appManagerInstance'
import {
  ensureDir,
  getBuiltinAppDir,
  getSystemAppDir,
  getSystemAppsRoot,
  getUserAppDir,
  getUserAppsRoot,
  isHiddenAppDirName,
  isPathInsideRoot,
  shouldCopyAppPath
} from './paths'

/**
 * 比较已装版本与目录版本。
 * semver 解析与比较统一走 `api/openPlatform/version`，与技能、连接器的更新判定同一口径
 * （含 `v1.2.0` 这类带前缀 tag 的兼容），避免应用侧另写一份后两边判定悄悄跑偏。
 * @param installed 磁盘上的版本
 * @param catalog 目录里的版本
 * @returns true 表示目录版本比已装版本新，有可用更新
 */
export function compareAppVersion(installed: string | null | undefined, catalog: string): boolean {
  // 没装过就不算「有更新」
  if (!installed) return false
  return compareOpenPlatformVersions(catalog, installed) > 0
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
  /** 已收进本地调试的 app.json.id。 */
  const seen = new Set<string>()
  /** 目录下一档。 */
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    // 只认目录；跳过 .temp_extract_* 等点目录，避免安装半成品进本地调试
    if (!entry.isDirectory() || isHiddenAppDirName(entry.name)) continue
    /** 应用安装目录。 */
    const appDir = path.join(root, entry.name)
    /** 应用清单。 */
    const manifest = readAppManifest(appDir)
    // 没有合法清单就不收
    if (!manifest) continue
    // 已按 app.json.id 收录，或是系统应用，都不算本地调试；文件夹名不参与判断
    if (catalogIds.has(manifest.id) || isSystemBundledApp(manifest.id)) continue
    if (seen.has(manifest.id)) continue
    seen.add(manifest.id)
    // 收成一条本地调试记录：始终启用、不限可见性
    extras.push({
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      icon: manifest.icon,
      slot: pickRuntimeSlot('app-center', manifest.slot),
      source: 'local-debug',
      enabled: true,
      auth: null,
      provider: '本地',
      package: { kind: 'dir', builtinDir: manifest.id }
    })
  }
  return extras
}

/**
 * 合并 OSS 目录与用户 apps 下手丢的本地包，供打开路径识别；侧栏和应用中心会再各自过滤。
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
 * 目录快照还没到时（冷启动 / 断网），用本机已装的系统应用兜底成目录记录。
 * 否则侧栏的内置应用会整体消失，直到接口恢复。
 * @param existingIds 目录里已有的 id，避免重复
 */
function listInstalledSystemAppsFallback(existingIds: Set<string>): JiaorongAppCatalogRecord[] {
  /** 系统应用根目录。 */
  const root = getSystemAppsRoot()
  if (!fs.existsSync(root)) return []
  /** 兜底记录。 */
  const records: JiaorongAppCatalogRecord[] = []
  /** 已收录 id。 */
  const seen = new Set<string>()
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || isHiddenAppDirName(entry.name)) continue
    /** 已装系统应用的清单。 */
    const manifest = readAppManifest(path.join(root, entry.name))
    if (!manifest || seen.has(manifest.id) || existingIds.has(manifest.id)) continue
    seen.add(manifest.id)
    records.push({
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      ...(manifest.description ? { description: manifest.description } : {}),
      ...(manifest.icon ? { icon: manifest.icon } : {}),
      // 系统应用固定进侧栏，与目录解析规则保持一致
      slot: 'menu',
      source: 'builtin',
      enabled: true,
      auth: null,
      package: { kind: 'dir', builtinDir: manifest.id }
    })
  }
  return records
}

/**
 * 这条目录是否还能装：系统应用要本机已装或有 zip；商店应用走下载；其余看已装目录或仓库源。
 * @param record 目录记录
 */
export function catalogRecordHasInstallSource(record: JiaorongAppCatalogRecord): boolean {
  if (record.source === 'builtin') {
    if (readAppManifest(getSystemAppDir(record.id))) return true
    return Boolean(record.package.kind === 'zip' && record.package.downloadUrl?.trim())
  }
  if (record.source === 'store') return true
  if (sharedAppsManager().getAppDir(record.id)) return true
  const builtinDir = record.package.builtinDir
  return Boolean(builtinDir && fs.existsSync(getBuiltinAppDir(builtinDir)))
}

/**
 * 系统应用指向 Electron userData 下的安装目录，不拷到用户 apps。
 * @param runtime 目录项
 */
function bindSystemBundledDir(runtime: JiaorongAppRuntime): JiaorongAppRuntime {
  /** OSS 解压后的目录。 */
  const installedDir = getSystemAppDir(runtime.id)
  /** 已装清单。 */
  const manifest = readAppManifest(installedDir)
  const installStatus = !manifest
    ? 'not_installed'
    : compareAppVersion(manifest.version, runtime.version)
      ? 'update_available'
      : 'installed'
  return {
    ...runtime,
    appDir: manifest ? installedDir : null,
    installedVersion: manifest?.version ?? null,
    installStatus,
    entry: manifest?.entry ?? null,
    // 接口目录没有包内图标路径，装好后用 app.json 里的相对路径回填
    icon: runtime.icon || manifest?.icon
  }
}

/** 系统应用走 userData；商店应用忽略误留在 system-apps 里的目录。 */
function resolveRuntime(
  record: JiaorongAppCatalogRecord,
  user: JiaorongAppUserIdentity
): JiaorongAppRuntime {
  /** 目录侧是否可见：启用且通过 auth。 */
  const catalogVisible = record.enabled !== false && isAppVisibleToUser(record.auth, user)
  // 系统应用：直接指向内置目录，不拷到用户 apps
  if (record.source === 'builtin') {
    return bindSystemBundledDir({
      ...record,
      visible: catalogVisible,
      installStatus: 'not_installed',
      installedVersion: null,
      appDir: null,
      entry: null
    })
  }
  /** 已按 app.json.id 登记的安装目录，文件夹名可以不同。 */
  const linkedDir = sharedAppsManager().getAppDir(record.id)
  // 改回 store 后，jiaorong-system-apps 里的旧包不算商店已装，侧栏不再展示
  const userDir = linkedDir && isPathInsideRoot(getSystemAppsRoot(), linkedDir) ? null : linkedDir
  /** 用户目录里的清单。 */
  const userManifest = userDir ? readAppManifest(userDir) : null
  // 目录已成功加载：可见性只认 auth，收权后不可见、不可打开。
  // 目录还没加载（冷启动 / 断网）：已装应用先乐观可见，否则整个侧栏会短暂清空。
  const visible = catalogVisible || (!hasAppliedAppCatalogSnapshot() && Boolean(userManifest))

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

  // 合成运行时项：已装时以包内 slot 为准，未装才用目录 slot
  return {
    ...record,
    slot: pickRuntimeSlot(record.slot, userManifest?.slot),
    // 接口目录不提供包内图标路径，装好后用 app.json 里的 icon 回填
    icon: record.icon || userManifest?.icon,
    visible,
    installStatus,
    installedVersion,
    appDir,
    entry: userManifest?.entry ?? null
  }
}

/**
 * 已装包的 slot 优先于目录配置。包内没写或非法时退回目录 slot。
 * @param catalogSlot OSS / 目录 slot
 * @param manifestSlot 磁盘 app.json.slot
 */
export function pickRuntimeSlot(
  catalogSlot: JiaorongAppSlot,
  manifestSlot?: JiaorongAppSlot | null
): JiaorongAppSlot {
  if (manifestSlot === 'menu' || manifestSlot === 'app-center') return manifestSlot
  return catalogSlot
}

/**
 * 扫当前用户可见应用。谁能看见只看目录 auth；开发者中心登记的本地包另行并入。
 * @param user 当前登录用户身份
 */
export function scanJiaorongApps(user: JiaorongAppUserIdentity): JiaorongAppRuntime[] {
  // 先按 app.json.id 重扫安装缓存，已装状态不看文件夹名
  sharedAppsManager().refresh()
  /** OSS 目录。 */
  const remote = loadBuiltinAppCatalog()
  /** 目录快照未到时补上本机已装系统应用。 */
  const systemFallback = hasAppliedAppCatalogSnapshot()
    ? []
    : listInstalledSystemAppsFallback(new Set(remote.map((item) => item.id)))
  const merged = mergeSystemBundledCatalog([...remote, ...systemFallback]).filter(
    catalogRecordHasInstallSource
  )
  /** 用户 apps 目录里手丢的本地调试包。 */
  const localDebug = listLocalDebugApps(new Set(merged.map((item) => item.id)))
  /** 已收录 id：开发者本地包不覆盖 OSS 与用户目录包。 */
  const knownIds = new Set([...merged.map((item) => item.id), ...localDebug.map((item) => item.id)])
  /** 开发者中心登记的本地包。 */
  const devRuntimes = devAppCatalogRecords(knownIds).map(({ record, dir }) =>
    resolveDevRuntime(record, dir)
  )
  // 合并后逐条算出运行时状态
  return [
    ...combineRemoteAndLocalDebugApps(merged, localDebug).map((record) =>
      resolveRuntime(record, user)
    ),
    ...devRuntimes
  ]
}

/**
 * 开发者本地登记包的运行时：目录即安装目录，清单读不到视为坏包。
 * @param record 合成目录记录
 * @param appDir 插件文件夹
 */
function resolveDevRuntime(record: JiaorongAppCatalogRecord, appDir: string): JiaorongAppRuntime {
  /** 插件文件夹清单。 */
  const manifest = fs.existsSync(appDir) ? readAppManifest(appDir) : null
  return {
    ...record,
    slot: pickRuntimeSlot(record.slot, manifest?.slot),
    visible: true,
    installStatus: manifest ? 'installed' : 'error',
    installedVersion: manifest?.version ?? null,
    appDir,
    entry: manifest?.entry ?? null
  }
}

/**
 * 商店应用：已装则复用目录；有 extraResources / 仓库源则按需拷到用户 apps。
 * 系统应用只绑定 userData，不拷贝。
 * @param runtime 目录扫出的运行时项
 */
export function ensureJiaorongAppInstalled(runtime: JiaorongAppRuntime): JiaorongAppRuntime {
  /** 调试窗口存活期间的外部 link；所有来源都必须优先使用，且不能被安装/更新覆盖。 */
  const manager = sharedAppsManager()
  if (manager.isExternalAppLink(runtime.id)) {
    /** 调试目录。 */
    const debugDir = manager.getAppDir(runtime.id)
    /** 调试清单。 */
    const debugManifest = debugDir ? readAppManifest(debugDir) : null
    if (debugDir && debugManifest) {
      return {
        ...runtime,
        appDir: debugDir,
        installedVersion: debugManifest.version,
        installStatus: 'installed',
        entry: debugManifest.entry
      }
    }
  }
  // 系统应用始终指向内置目录，不拷贝
  if (runtime.source === 'builtin') return bindSystemBundledDir(runtime)
  // 本地调试包本来就在用户目录里
  if (runtime.source === 'local-debug') return runtime

  /** 已按 app.json.id 找到的安装目录，文件夹名可以不同。 */
  const installedDir =
    runtime.appDir && fs.existsSync(path.join(runtime.appDir, 'app.json'))
      ? runtime.appDir
      : sharedAppsManager().getAppDir(runtime.id)
  /** 目标目录清单。 */
  const destManifest = installedDir ? readAppManifest(installedDir) : null
  /** 内置目录名。 */
  const builtinDir = runtime.package.builtinDir
    ? getBuiltinAppDir(runtime.package.builtinDir)
    : null
  /** 源目录清单。 */
  const sourceManifest =
    builtinDir && fs.existsSync(builtinDir) ? readAppManifest(builtinDir) : null
  /** 源版本。 */
  const sourceVersion = sourceManifest?.version ?? runtime.version
  // 已装且版本一致：直接复用
  if (installedDir && destManifest && destManifest.version === sourceVersion) {
    return {
      ...runtime,
      appDir: installedDir,
      installedVersion: destManifest.version,
      installStatus: 'installed',
      entry: destManifest.entry
    }
  }

  // 没有内置源可拷
  if (!builtinDir || !fs.existsSync(builtinDir)) {
    // 但用户目录已经装过，就继续用旧的
    if (installedDir && destManifest) {
      return {
        ...runtime,
        appDir: installedDir,
        installedVersion: destManifest.version,
        installStatus: 'installed',
        entry: destManifest.entry
      }
    }
    // 既没源也没装过，标记失败
    return { ...runtime, installStatus: 'error' }
  }

  /** 内置拷贝落盘目录：已装用原目录，全新安装才按 id 建默认文件夹名。 */
  const destDir = installedDir ?? getUserAppDir(runtime.id)
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
 * 侧栏菜单：slot=menu 的系统应用 / 商店应用，以及用户 apps 下手丢的 menu 包。
 * 开发者中心登记包只在开发者中心打开。
 * @param item 运行时项
 */
export function isJiaorongSidebarMenuApp(item: {
  id: string
  source: JiaorongAppRuntime['source']
  slot: JiaorongAppRuntime['slot']
}): boolean {
  if (item.slot !== 'menu') return false
  if (item.source === 'local-debug') return !isDevCenterAppId(item.id)
  return true
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
  // 没落盘或坏包不能打开；更新中若目录还在则可以继续看
  if (runtime.installStatus === 'not_installed' || runtime.installStatus === 'error') return null
  if (!runtime.appDir) return null
  return runtime
}
