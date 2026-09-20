/** 系统应用：OSS zip 装到 Electron userData，启动自动更新。不进用户 apps。 */

import fs from 'node:fs'
import type { JiaorongAppRuntime } from '../types'
import type { JiaorongAppHostDeps } from './deps'
import { downloadAppZip } from './downloadAppZip'
import { sharedAppsManager } from './appManagerInstance'
import { getSystemAppDir } from './paths'
import { readAppManifest } from './manifest'
import { compareAppVersion, scanJiaorongApps } from './scan'
import {
  peekJiaorongRemoteRuntimeConfig,
  refreshJiaorongRemoteRuntimeConfig
} from '../../config/remoteRuntimeConfig'
import { readUserIdentityFromAuthSession } from './userIdentity'

/** 正在更新的系统应用 id。 */
let updatingAppId: string | null = null
/** 同一次启动只跑一条同步。 */
let inflight: Promise<boolean> | null = null
/** 侧栏刷新。 */
let catalogBroadcaster: (() => void) | null = null

/**
 * 登记目录刷新回调。
 * @param fn 广播实现，传 null 表示注销
 */
export function setSystemAppUpdateBroadcaster(fn: (() => void) | null): void {
  catalogBroadcaster = fn
}

/**
 * 该系统应用是否正在自动安装 / 更新。
 * @param appId 应用 id
 */
export function isSystemAppUpdating(appId: string): boolean {
  return updatingAppId === appId
}

/**
 * 缺包则下载，有新版本则更新。OSS `source=builtin` 的应用都会跑。
 * @param deps 超级智能体依赖（读登录态）
 * @returns 是否实际装/更成功过至少一个
 */
export async function syncCollaborationPlatform(deps: JiaorongAppHostDeps): Promise<boolean> {
  if (inflight) return inflight
  inflight = runSync(deps).finally(() => {
    inflight = null
  })
  return inflight
}

/** 真正的下载安装。 */
async function runSync(deps: JiaorongAppHostDeps): Promise<boolean> {
  /** 已有快照就别再挡一轮 OSS；没有才拉一次。 */
  if (!peekJiaorongRemoteRuntimeConfig()) {
    await refreshJiaorongRemoteRuntimeConfig()
  }
  const user = readUserIdentityFromAuthSession(deps.getAuthSession())
  const runtimes = scanJiaorongApps(user).filter(
    (item) => item.source === 'builtin' && item.visible
  )
  let anyOk = false
  for (const runtime of runtimes) {
    if (await syncOne(runtime)) anyOk = true
  }
  return anyOk
}

/**
 * 同步单个系统应用。
 * @param runtime 目录项
 */
async function syncOne(runtime: JiaorongAppRuntime): Promise<boolean> {
  const downloadUrl = runtime.package.downloadUrl?.trim() || ''
  if (!downloadUrl) return false

  const installed = readAppManifest(getSystemAppDir(runtime.id))
  const localVersion = installed?.version ?? null
  const shouldFetch = !installed || compareAppVersion(localVersion, runtime.version)
  if (!shouldFetch) return false

  updatingAppId = runtime.id
  catalogBroadcaster?.()
  /** 下载结果。 */
  let zipPath = ''
  try {
    const downloaded = await downloadAppZip(downloadUrl).catch((error) => {
      console.error('[jiaorong-app] system app download failed', runtime.id, error)
      return null
    })
    if (!downloaded) return false
    zipPath = downloaded.zipPath
    /** 目录声明的校验和。 */
    const expected = runtime.package.sha256?.trim().toLowerCase() || ''
    if (expected && downloaded.sha256 !== expected) {
      console.error('[jiaorong-app] system app sha256 mismatch', runtime.id)
      return false
    }
    /** 解压安装到 Electron userData。 */
    const result = sharedAppsManager().installSystemAppFromPackage(downloaded.zipPath)
    if (!result.success) {
      console.error('[jiaorong-app] system app install failed', runtime.id, result.message)
      return false
    }
    return true
  } finally {
    if (zipPath) fs.rmSync(zipPath, { force: true })
    updatingAppId = null
    catalogBroadcaster?.()
  }
}
