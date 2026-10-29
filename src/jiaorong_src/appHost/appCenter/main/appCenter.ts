/** 应用中心：远程应用列表、zip 下载安装 / 更新、卸载。协同平台不在此列。 */

import fs from 'node:fs'
import path from 'node:path'
import {
  allowsIdentityByOptionalWhitelist,
  matchesIdentityWhitelist
} from '../../../config/identityWhitelist'
import {
  peekJiaorongRemoteRuntimeConfig,
  refreshJiaorongRemoteRuntimeConfig
} from '../../../config/remoteRuntimeConfig'
import { notifyRemoteAppCatalogChanged } from '../../catalog'
import { isSystemBundledApp } from '../../systemApps'
import { getDevApps, isDevCenterAppId } from '../../devCenter/main/devApps'
import { isJiaorongPrivateApiUrl, resolveAuthProductId } from '../../../api/auth/config'
import type {
  JiaorongAppCenterItem,
  JiaorongAppRuntime,
  JiaorongAppUserIdentity
} from '../../types'
import { resolveAppIconSrc } from '../../main/bridge'
import { sharedAppsManager } from '../../main/appManagerInstance'
import type { JiaorongAppHostDeps } from '../../main/deps'
import { downloadAppZip } from '../../main/downloadAppZip'
import { syncAppCatalogFromApi } from '../../main/appCatalogApi'
import { ensureJiaorongAppInstalled, scanJiaorongApps } from '../../main/scan'
import { readAuthToken, readUserIdentityFromAuthSession } from '../../main/userIdentity'
import { isAppInstallInFlight, runExclusiveAppInstall } from './appInstallLock'

/** 安装前等目录同步的上限：网络慢时不能把「点安装」卡成无响应。 */
const CATALOG_SYNC_WAIT_MS = 3_000

/**
 * 最多等目录同步这么久，超时就先用现有快照判断。
 * 同步本身继续在后台跑完，成功了会广播刷新。
 * @param deps 超级智能体依赖
 */
async function waitForCatalogSync(deps: JiaorongAppHostDeps): Promise<void> {
  /** 超时计时器；同步先完成时要清掉，避免多挂一个 3s 的定时器。 */
  let timer: NodeJS.Timeout | undefined
  try {
    await Promise.race([
      syncAppCatalogFromApi(deps).then(
        () => undefined,
        () => undefined
      ),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, CATALOG_SYNC_WAIT_MS)
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** 安装 / 卸载结果。 */
export type AppCenterMutationResult = {
  ok: boolean
  message?: string
  item?: JiaorongAppCenterItem
}

/**
 * 当前登录用户是否为开发者（OSS 开发者名单）。
 * @param user 主进程读出的登录身份
 */
export function isDeveloperIdentity(user: JiaorongAppUserIdentity): boolean {
  /** 最近一次 OSS 配置快照。 */
  const config = peekJiaorongRemoteRuntimeConfig()
  // 没拉到配置按非开发者处理
  if (!config) return false
  return matchesIdentityWhitelist(config.developerPhones, {
    userName: user.userName,
    phone: user.phone
  })
}

/**
 * 当前登录用户是否可见应用中心。
 * 没写 appCenterVisiblePhones 则全员可见；写了则只命中名单的人可见。开发者名单不另开入口。
 * @param user 主进程读出的登录身份
 */
export function canAccessAppCenter(user: JiaorongAppUserIdentity): boolean {
  /** 最近一次 OSS 配置快照。 */
  const config = peekJiaorongRemoteRuntimeConfig()
  if (!config) return false
  return allowsIdentityByOptionalWhitelist(config.appCenterVisiblePhones, {
    userName: user.userName,
    phone: user.phone
  })
}

/**
 * 应用中心：OSS 目录项 + 用户 apps 下手丢的包。
 * 系统应用、停用项、开发者中心登记包不在此列。
 * 开发者额外可见 auth 未通过的启用应用。
 * @param runtimes 扫盘结果
 * @param options isDeveloper 为 true 时放宽可见性
 */
export function selectAppCenterRuntimes(
  runtimes: JiaorongAppRuntime[],
  options: { isDeveloper: boolean }
): JiaorongAppRuntime[] {
  return runtimes.filter((item) => {
    // 协同平台等系统应用只走侧栏
    if (item.source === 'builtin') return false
    // 开发者中心登记的工作区包只在开发者中心打开；同名生产安装副本按目录区分，照常展示
    if (isDevWorkspaceRuntime(item)) return false
    // 停用项谁都不给看
    if (item.enabled === false) return false
    // 普通用户只看 auth 通过的；手丢包 visible 为 true
    if (item.visible) return true
    // 开发者可见未过 auth 的启用应用，便于上线前自测
    return options.isDeveloper
  })
}

/**
 * 运行时的远程 zip 下载地址；非 zip 包或未配置返回空串。
 * @param runtime 运行时项
 */
function resolveRemoteDownloadUrl(runtime: JiaorongAppRuntime): string {
  return runtime.package.kind === 'zip' ? runtime.package.downloadUrl?.trim() || '' : ''
}

/**
 * 运行时项转应用中心卡片数据。
 * @param runtime 扫盘运行时项
 * @param options isDeveloper 决定是否给卸载能力
 */
export function toAppCenterItem(
  runtime: JiaorongAppRuntime,
  options: { isDeveloper: boolean }
): JiaorongAppCenterItem {
  /** 已落盘可打开的状态。 */
  const onDisk =
    runtime.installStatus === 'installed' || runtime.installStatus === 'update_available'
  /** 远程 zip 下载地址。 */
  const downloadUrl = resolveRemoteDownloadUrl(runtime)
  /** 内置应用（source=builtin）不允许卸载。 */
  const isBuiltinApp = runtime.source === 'builtin' || isSystemBundledApp(runtime.id)
  return {
    id: runtime.id,
    name: runtime.name,
    ...(runtime.description ? { description: runtime.description } : {}),
    iconSrc: resolveAppIconSrc(runtime),
    version: runtime.version,
    installedVersion: runtime.installedVersion ?? null,
    // 安装任务在飞时抬成「安装中」：页面切走再切回（组件重建）也不会退回「安装」按钮
    installStatus: isAppInstallInFlight(runtime.id) ? 'installing' : runtime.installStatus,
    remotePackage: Boolean(downloadUrl),
    // 开发者自测：auth 未过但已装的启用应用也要能打开
    openable: onDisk && (runtime.visible || options.isDeveloper),
    canUninstall: onDisk && !isBuiltinApp,
    developerOnly: !runtime.visible,
    visibleToCurrentUser: runtime.visible || options.isDeveloper,
    provider: runtime.provider ?? ''
  }
}

/**
 * 应用中心列表。
 * @param deps 超级智能体依赖（读登录态）
 */
export function listAppCenterItems(deps: JiaorongAppHostDeps): JiaorongAppCenterItem[] {
  /** 当前登录身份。 */
  const user = readUserIdentityFromAuthSession(deps.getAuthSession())
  if (!canAccessAppCenter(user)) return []
  /** 是否开发者。 */
  const isDeveloper = isDeveloperIdentity(user)
  return selectAppCenterRuntimes(scanJiaorongApps(user), { isDeveloper }).map((runtime) =>
    toAppCenterItem(runtime, { isDeveloper })
  )
}

/**
 * 是否为开发者工作区运行时：目录就是开发者中心登记的本地关联目录。
 * 插件中心的安装状态只认生产包；创建者本机的工作区 link 不算「已安装」，
 * 否则发布者自己会在插件中心看到未安装应用的「打开」按钮，打开的还是本地代码。
 * @param runtime 扫盘运行时项
 */
export function isDevWorkspaceRuntime(runtime: JiaorongAppRuntime): boolean {
  if (runtime.source !== 'local-debug' || !isDevCenterAppId(runtime.id)) return false
  // 目录缺失（坏包）时同样按未安装处理
  if (!runtime.appDir) return true
  /** 规范化后的运行时目录。 */
  const runtimeDir = path.resolve(runtime.appDir)
  return getDevApps().some((record) => record.dir && path.resolve(record.dir) === runtimeDir)
}

/**
 * 按应用 id 查询安装状态：供市场卡片合并本地状态；开发者工作区 link 不算已安装。
 * @param deps 超级智能体依赖（读登录态）
 * @param appIds 请求的应用 id 列表
 */
export function listAppCenterItemsByIds(
  deps: JiaorongAppHostDeps,
  appIds: string[]
): JiaorongAppCenterItem[] {
  const user = readUserIdentityFromAuthSession(deps.getAuthSession())
  if (!canAccessAppCenter(user)) return []
  const requestedIds = Array.from(new Set(appIds.map((appId) => appId.trim()).filter(Boolean)))
  if (requestedIds.length === 0) return []
  const isDeveloper = isDeveloperIdentity(user)
  const runtimesById = new Map(scanJiaorongApps(user).map((runtime) => [runtime.id, runtime]))
  return requestedIds.flatMap((appId) => {
    const runtime = runtimesById.get(appId)
    if (!runtime || isDevWorkspaceRuntime(runtime)) return []
    // auth 未通过的条目也要回给市场卡，由 `visibleToCurrentUser` 决定是否展示；
    // 直接丢掉会让渲染侧分不清「没装」和「无权看见」。
    return [toAppCenterItem(runtime, { isDeveloper })]
  })
}

/**
 * 安装 / 更新应用中心应用：远程 zip 下载校验后解压安装；无下载地址回落内置拷贝。
 * @param deps 超级智能体依赖
 * @param appId 目标应用 id
 */
async function runInstallAppCenterApp(
  deps: JiaorongAppHostDeps,
  appId: string
): Promise<AppCenterMutationResult> {
  // 安装 / 更新前重拉目录，保证下载地址与 sha256 是最新配置
  await refreshJiaorongRemoteRuntimeConfig()
  /** 当前登录身份。 */
  const user = readUserIdentityFromAuthSession(deps.getAuthSession())
  if (!canAccessAppCenter(user)) return { ok: false, message: 'app center not available' }
  /** 是否开发者。 */
  const isDeveloper = isDeveloperIdentity(user)
  /** 目标运行时。 */
  const runtime = selectAppCenterRuntimes(scanJiaorongApps(user), { isDeveloper }).find(
    (item) => item.id === appId
  )
  // 不可见或不存在
  if (!runtime) return { ok: false, message: `app not available: ${appId}` }
  /** 远程 zip 下载地址。 */
  const downloadUrl = resolveRemoteDownloadUrl(runtime)

  // 有下载地址：走远程下载 + 校验 + 解压安装
  if (downloadUrl) {
    /** 登录 token；私有 API 包地址必须带。 */
    const token = readAuthToken(deps.getAuthSession())
    const headers =
      token && isJiaorongPrivateApiUrl(downloadUrl)
        ? { 'Fusion-Auth': token, 'Product-Id': resolveAuthProductId() }
        : undefined
    /** 下载失败原因，透传给界面而不是只给一个 URL。 */
    let downloadErrorMessage = ''
    /** 下载结果；失败记日志并返回错误。 */
    const downloaded = await downloadAppZip(downloadUrl, headers ? { headers } : {}).catch(
      (error) => {
        downloadErrorMessage = error instanceof Error ? error.message : ''
        console.error('[jiaorong-app-center] download failed', appId, error)
        return null
      }
    )
    if (!downloaded) {
      return { ok: false, message: downloadErrorMessage || `download failed: ${downloadUrl}` }
    }
    try {
      /** 目录声明的校验和。 */
      const expected = runtime.package.sha256?.trim().toLowerCase() || ''
      // 声明了 sha256 就必须一致
      if (expected && downloaded.sha256 !== expected) {
        return { ok: false, message: `sha256 mismatch: ${appId}` }
      }
      /** 安装结果。 */
      const result = await sharedAppsManager().installAppFromPackage(downloaded.zipPath, {
        overwrite: true,
        expectedId: appId
      })
      if (!result.success) return { ok: false, message: result.message }
    } finally {
      fs.rmSync(downloaded.zipPath, { force: true })
    }
  } else {
    // 没配下载地址：回落内置目录拷贝
    /** 拷贝后的运行时。 */
    const ensured = ensureJiaorongAppInstalled(runtime)
    if (ensured.installStatus === 'error') return { ok: false, message: `install failed: ${appId}` }
  }

  notifyRemoteAppCatalogChanged()
  return { ok: true, item: listAppCenterItems(deps).find((item) => item.id === appId) }
}

/**
 * 安装 / 更新应用中心应用：远程 zip 下载校验后解压安装；无下载地址回落内置拷贝。
 * @param deps 超级智能体依赖
 * @param appId 目标应用 id
 */
export function installAppCenterApp(
  deps: JiaorongAppHostDeps,
  appId: string
): Promise<AppCenterMutationResult> {
  // 入参缺 appId
  if (!appId) return Promise.resolve({ ok: false, message: 'missing appId' })
  return runExclusiveAppInstall(appId, () => runInstallAppCenterApp(deps, appId))
}

/**
 * 安装本地 zip 应用：按现有包安装器校验并注册。
 * @param deps 超级智能体依赖
 * @param appId 目标应用 id
 * @param packagePath 本地 zip 路径
 */
export function installAppCenterAppFromPackage(
  deps: JiaorongAppHostDeps,
  appId: string,
  packagePath: string
): Promise<AppCenterMutationResult> {
  // 入参校验失败不必进互斥表
  if (!appId) return Promise.resolve({ ok: false, message: 'missing appId' })
  if (!packagePath.trim()) return Promise.resolve({ ok: false, message: 'missing package path' })
  // 与远程安装同一把锁：连点两次不会并行解压覆盖同一个目录
  return runExclusiveAppInstall(appId, () =>
    runInstallAppCenterAppFromLocalPackage(deps, appId, packagePath)
  )
}

/**
 * 本地 zip 安装的实际逻辑。
 * @param deps 超级智能体依赖
 * @param appId 目标应用 id
 * @param packagePath 本地 zip 路径
 */
async function runInstallAppCenterAppFromLocalPackage(
  deps: JiaorongAppHostDeps,
  appId: string,
  packagePath: string
): Promise<AppCenterMutationResult> {
  const user = readUserIdentityFromAuthSession(deps.getAuthSession())
  if (!canAccessAppCenter(user)) return { ok: false, message: 'app center not available' }
  if (!isDeveloperIdentity(user)) return { ok: false, message: 'developer only' }
  const result = await sharedAppsManager().installAppFromPackage(packagePath, {
    overwrite: true,
    expectedId: appId
  })
  if (!result.success) return { ok: false, message: result.message }
  notifyRemoteAppCatalogChanged()
  return { ok: true, item: listAppCenterItems(deps).find((item) => item.id === appId) }
}

/**
 * 安装开放平台远端应用包：主进程带鉴权下载、校验 sha256 后走同一套包安装器。
 * 下载地址必须是当前环境的私有 API，避免把登录凭据发到第三方直链。
 * @param deps 超级智能体依赖
 * @param input 应用 id、下载地址与可选校验和
 */
export async function installAppCenterAppFromRemotePackage(
  deps: JiaorongAppHostDeps,
  input: { appId: string; downloadUrl: string; sha256?: string | null }
): Promise<AppCenterMutationResult> {
  /** 目标应用 id。 */
  const appId = input.appId.trim()
  if (!appId) return { ok: false, message: 'missing appId' }
  return runExclusiveAppInstall(appId, () => runInstallAppCenterAppFromRemotePackage(deps, input))
}

/**
 * 远端包安装的实际逻辑：下载、校验 sha256、解压安装。
 * @param deps 超级智能体依赖
 * @param input 应用 id、下载地址与可选校验和
 */
async function runInstallAppCenterAppFromRemotePackage(
  deps: JiaorongAppHostDeps,
  input: { appId: string; downloadUrl: string; sha256?: string | null }
): Promise<AppCenterMutationResult> {
  /** 目标应用 id。 */
  const appId = input.appId.trim()
  /** 远端包地址。 */
  const downloadUrl = input.downloadUrl.trim()
  if (!isJiaorongPrivateApiUrl(downloadUrl)) {
    return { ok: false, message: `untrusted download url: ${downloadUrl}` }
  }
  const user = readUserIdentityFromAuthSession(deps.getAuthSession())
  if (!canAccessAppCenter(user)) return { ok: false, message: 'app center not available' }
  // 市场卡可能刚发布，先同步目录再判断可见性，避免误判为「不存在」；
  // 最多等 3s，超时先用旧快照判断，不让安装按钮卡住
  await waitForCatalogSync(deps)
  /** 是否开发者：允许自测 auth 未过的应用。 */
  const isDeveloper = isDeveloperIdentity(user)
  /** 目录里的目标应用。 */
  const runtime = scanJiaorongApps(user).find((item) => item.id === appId)
  // 不存在、已停用或 auth 未通过都不允许绕过市场卡直接安装
  if (!runtime || runtime.enabled === false || (!runtime.visible && !isDeveloper)) {
    return { ok: false, message: `app not available: ${appId}` }
  }
  // 内置应用只走系统应用同步，不接受市场安装
  if (runtime.source === 'builtin') return { ok: false, message: `system app: ${appId}` }
  /** 登录 token；私有 API 下载必须带。 */
  const token = readAuthToken(deps.getAuthSession())
  if (!token) return { ok: false, message: 'not logged in' }
  /** 下载失败原因，透传给界面而不是只给一个 URL。 */
  let downloadErrorMessage = ''
  /** 下载结果；失败记日志并返回错误。 */
  const downloaded = await downloadAppZip(downloadUrl, {
    headers: { 'Fusion-Auth': token, 'Product-Id': resolveAuthProductId() }
  }).catch((error) => {
    downloadErrorMessage = error instanceof Error ? error.message : ''
    console.error('[jiaorong-app-center] remote package download failed', appId, error)
    return null
  })
  if (!downloaded) {
    return { ok: false, message: downloadErrorMessage || `download failed: ${downloadUrl}` }
  }
  try {
    /** 市场声明的校验和。 */
    const expected = input.sha256?.trim().toLowerCase() || ''
    if (expected && downloaded.sha256 !== expected) {
      return { ok: false, message: `sha256 mismatch: ${appId}` }
    }
    /** 安装结果。 */
    const result = await sharedAppsManager().installAppFromPackage(downloaded.zipPath, {
      overwrite: true,
      expectedId: appId
    })
    if (!result.success) return { ok: false, message: result.message }
  } finally {
    fs.rmSync(downloaded.zipPath, { force: true })
  }

  notifyRemoteAppCatalogChanged()
  return { ok: true, item: listAppCenterItems(deps).find((item) => item.id === appId) }
}

/**
 * 卸载应用中心应用；已安装即可卸载，内置（系统）应用不允许。
 * @param deps 超级智能体依赖
 * @param appId 目标应用 id
 */
export function uninstallAppCenterApp(
  deps: JiaorongAppHostDeps,
  appId: string
): AppCenterMutationResult {
  // 入参缺 appId
  if (!appId) return { ok: false, message: 'missing appId' }
  /** 当前登录身份。 */
  const user = readUserIdentityFromAuthSession(deps.getAuthSession())
  // 拿不到应用中心入口的人不走 IPC 卸载
  if (!canAccessAppCenter(user)) return { ok: false, message: 'app center not available' }
  // 系统应用不允许卸载
  if (isSystemBundledApp(appId)) return { ok: false, message: `system app: ${appId}` }
  // 安装还在飞：先别卸，否则会和覆盖安装抢同一个目录
  if (isAppInstallInFlight(appId)) return { ok: false, message: `installing: ${appId}` }
  /**
   * 目标运行时：只卸应用市场包，不动开发者本地登记。
   * 视角比列表宽一档：auth 未过（含管理员事后收权）的已装应用列表里看不见，
   * 但本地目录还得能清掉，否则用户既用不了也卸不掉。
   */
  const runtime = scanJiaorongApps(user).find(
    (item) => item.id === appId && item.source !== 'builtin' && !isDevWorkspaceRuntime(item)
  )
  // 不存在或不属于应用中心
  if (!runtime) return { ok: false, message: `app not available: ${appId}` }
  // 内置应用兜底：目录 source 标记比全局 id 缓存更可靠
  if (runtime.source === 'builtin') return { ok: false, message: `system app: ${appId}` }
  /** 卸载结果。 */
  const result = sharedAppsManager().uninstallApp(appId, false)
  if (result.success) notifyRemoteAppCatalogChanged()
  return { ok: result.success, message: result.message }
}
