/** 扫 OSS 目录与本机已装；协同平台只走 OSS zip，装到 Electron userData。 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isAppVisibleToUser } from '../auth'
import { loadBuiltinAppCatalog } from '../catalog'
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
 * 拆宽松 semver 为数字段与预发布标识；构建元数据（+xxx）忽略。
 * @param version 版本号字符串
 * @returns 解析结果；无法解析返回 null
 */
function parseVersionParts(version: string): { core: number[]; pre: string[] } | null {
  /** 宽松 semver 匹配：三段数字 + 可选预发布 + 可选构建元数据。 */
  const matched = /^(\d+)\.(\d+)\.(\d+)(?:-([\w.]+))?(?:\+[\w.]+)?$/.exec(version.trim())
  // 非 semver 格式不做语义比较
  if (!matched) return null
  return {
    core: [Number(matched[1]), Number(matched[2]), Number(matched[3])],
    pre: matched[4] ? matched[4].split('.') : []
  }
}

/**
 * 比较两个宽松 semver 的新旧。
 * @param a 左侧版本
 * @param b 右侧版本
 * @returns 1 表示 a 更新，-1 表示 a 更旧，0 表示同级；无法解析则视为同级
 */
function compareVersion(a: string, b: string): number {
  /** 左侧解析结果。 */
  const left = parseVersionParts(a)
  /** 右侧解析结果。 */
  const right = parseVersionParts(b)
  if (!left || !right) return 0
  // 先比三段数字
  for (let i = 0; i < 3; i += 1) {
    if (left.core[i] !== right.core[i]) return left.core[i] > right.core[i] ? 1 : -1
  }
  // 数字段同级：无预发布比有预发布更新
  if (left.pre.length === 0 && right.pre.length === 0) return 0
  if (left.pre.length === 0) return 1
  if (right.pre.length === 0) return -1
  // 预发布标识逐段比较
  const preLength = Math.max(left.pre.length, right.pre.length)
  for (let i = 0; i < preLength; i += 1) {
    /** 左侧标识，缺省算更旧。 */
    const leftId = left.pre[i]
    /** 右侧标识，缺省算更旧。 */
    const rightId = right.pre[i]
    if (leftId === undefined) return -1
    if (rightId === undefined) return 1
    if (leftId === rightId) continue
    /** 左侧是否纯数字标识。 */
    const leftNum = /^\d+$/.test(leftId) ? Number(leftId) : null
    /** 右侧是否纯数字标识。 */
    const rightNum = /^\d+$/.test(rightId) ? Number(rightId) : null
    // 数字标识按数值比，且比非数字标识旧
    if (leftNum !== null && rightNum !== null) return leftNum > rightNum ? 1 : -1
    if (leftNum !== null) return -1
    if (rightNum !== null) return 1
    return leftId > rightId ? 1 : -1
  }
  return 0
}

/**
 * 比较已装版本与目录版本。
 * @param installed 磁盘上的版本
 * @param catalog 目录里的版本
 * @returns true 表示目录版本比已装版本新，有可用更新
 */
export function compareAppVersion(installed: string | null | undefined, catalog: string): boolean {
  // 没装过就不算「有更新」
  if (!installed) return false
  return compareVersion(catalog, installed) > 0
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
    entry: manifest?.entry ?? null
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

  // 合成运行时项：已装时以包内 slot 为准，未装才用目录 slot
  return {
    ...record,
    slot: pickRuntimeSlot(record.slot, userManifest?.slot),
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
 * 扫当前用户可见应用。谁能看见只看 OSS 配置表；本机已装的包另外并上。
 * @param user 当前登录用户身份
 */
export function scanJiaorongApps(user: JiaorongAppUserIdentity): JiaorongAppRuntime[] {
  // 先按 app.json.id 重扫安装缓存，已装状态不看文件夹名
  sharedAppsManager().refresh()
  /** OSS 目录。 */
  const remote = loadBuiltinAppCatalog()
  const merged = mergeSystemBundledCatalog(remote).filter(catalogRecordHasInstallSource)
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
