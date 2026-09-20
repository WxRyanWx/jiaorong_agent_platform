/** 应用中心：远程应用列表、zip 下载安装 / 更新、开发者卸载。协同平台不在此列。 */

import fs from 'node:fs'
import { matchesIdentityWhitelist } from '../../../config/identityWhitelist'
import {
  peekJiaorongRemoteRuntimeConfig,
  refreshJiaorongRemoteRuntimeConfig
} from '../../../config/remoteRuntimeConfig'
import { notifyRemoteAppCatalogChanged } from '../../catalog'
import { isSystemBundledApp } from '../../systemApps'
import { isDevCenterAppId } from '../../devCenter/main/devApps'
import type {
  JiaorongAppCenterItem,
  JiaorongAppRuntime,
  JiaorongAppUserIdentity
} from '../../types'
import { resolveAppIconSrc } from '../../main/bridge'
import { sharedAppsManager } from '../../main/appManagerInstance'
import type { JiaorongAppHostDeps } from '../../main/deps'
import { downloadAppZip } from '../../main/downloadAppZip'
import { ensureJiaorongAppInstalled, scanJiaorongApps } from '../../main/scan'
import { readUserIdentityFromAuthSession } from '../../main/userIdentity'

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
 * 当前登录用户是否可见应用中心（白名单或开发者）。
 * @param user 主进程读出的登录身份
 */
export function canAccessAppCenter(user: JiaorongAppUserIdentity): boolean {
  /** 最近一次 OSS 配置快照。 */
  const config = peekJiaorongRemoteRuntimeConfig()
  if (!config) return false
  return (
    matchesIdentityWhitelist(config.appCenterVisiblePhones, {
      userName: user.userName,
      phone: user.phone
    }) || isDeveloperIdentity(user)
  )
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
    // 开发者中心登记的工作区包，只在开发者中心打开
    if (item.source === 'local-debug' && isDevCenterAppId(item.id)) return false
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
  return {
    id: runtime.id,
    name: runtime.name,
    ...(runtime.description ? { description: runtime.description } : {}),
    iconSrc: resolveAppIconSrc(runtime),
    version: runtime.version,
    installedVersion: runtime.installedVersion ?? null,
    installStatus: runtime.installStatus,
    remotePackage: Boolean(downloadUrl),
    // 开发者自测：auth 未过但已装的启用应用也要能打开
    openable: onDisk && (runtime.visible || options.isDeveloper),
    canUninstall: options.isDeveloper && onDisk,
    developerOnly: !runtime.visible,
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
 * 安装 / 更新应用中心应用：远程 zip 下载校验后解压安装；无下载地址回落内置拷贝。
 * @param deps 超级智能体依赖
 * @param appId 目标应用 id
 */
export async function installAppCenterApp(
  deps: JiaorongAppHostDeps,
  appId: string
): Promise<AppCenterMutationResult> {
  // 入参缺 appId
  if (!appId) return { ok: false, message: 'missing appId' }
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
    /** 下载结果；失败记日志并返回错误。 */
    const downloaded = await downloadAppZip(downloadUrl).catch((error) => {
      console.error('[jiaorong-app-center] download failed', appId, error)
      return null
    })
    if (!downloaded) return { ok: false, message: `download failed: ${downloadUrl}` }
    try {
      /** 目录声明的校验和。 */
      const expected = runtime.package.sha256?.trim().toLowerCase() || ''
      // 声明了 sha256 就必须一致
      if (expected && downloaded.sha256 !== expected) {
        return { ok: false, message: `sha256 mismatch: ${appId}` }
      }
      /** 安装结果。 */
      const result = sharedAppsManager().installAppFromPackage(downloaded.zipPath, {
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
 * 卸载应用中心应用；仅开发者，且系统应用不在此列。
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
  // 非开发者禁止卸载
  if (!isDeveloperIdentity(user)) return { ok: false, message: 'developer only' }
  // 系统应用不允许卸载
  if (isSystemBundledApp(appId)) return { ok: false, message: `system app: ${appId}` }
  /** 目标运行时：只卸应用市场包，不动开发者本地登记。 */
  const runtime = selectAppCenterRuntimes(scanJiaorongApps(user), { isDeveloper: true }).find(
    (item) => item.id === appId
  )
  // 不存在或不属于应用中心
  if (!runtime) return { ok: false, message: `app not available: ${appId}` }
  /** 卸载结果。 */
  const result = sharedAppsManager().uninstallApp(appId, false)
  if (result.success) notifyRemoteAppCatalogChanged()
  return { ok: result.success, message: result.message }
}
