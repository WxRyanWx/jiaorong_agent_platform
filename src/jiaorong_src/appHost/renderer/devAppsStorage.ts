/** 开发者本地应用名单：浏览器存储是唯一源，主进程只持内存镜像。 */

import type { JiaorongDevAppRecord } from '../types'
import { resolveJiaorongIdentityValue } from '../../config/identityWhitelist'
import { readStoredUserInfo } from '../../config/storedUserInfo'

/** 存储键前缀。 */
const DEV_APPS_STORAGE_PREFIX = 'jiaorong-dev-apps'

/** 当前登录身份对应的名单存储键。 */
export function resolveDevAppsStorageKey(): string {
  /** 当前登录身份。 */
  const identity = readStoredUserInfo()
  /** 与主进程换人判断一致的身份值。 */
  const identityValue = resolveJiaorongIdentityValue(identity)
  return `${DEV_APPS_STORAGE_PREFIX}:${encodeURIComponent(identityValue)}.json`
}

/** 读浏览器存储名单；缺失或损坏按空名单处理。 */
export function readStoredDevApps(storageKey: string): JiaorongDevAppRecord[] {
  try {
    /** 存储原文。 */
    const raw = localStorage.getItem(storageKey)
    if (!raw) return []
    /** 解析结果。 */
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as JiaorongDevAppRecord[]) : []
  } catch {
    return []
  }
}

/** 写浏览器存储并同步主进程内存镜像。 */
export async function writeStoredDevApps(
  apps: JiaorongDevAppRecord[],
  storageKey: string
): Promise<void> {
  localStorage.setItem(storageKey, JSON.stringify(apps))
  await window.jiaorongApps?.syncDevApps(apps)
}

/**
 * 把当前身份的名单同步给主进程。
 * 主进程重启后内存镜像为空，任何入口打开应用前都要先同步，否则会误判成没有本地关联。
 */
export async function syncStoredDevApps(): Promise<JiaorongDevAppRecord[]> {
  /** 当前身份名单。 */
  const apps = readStoredDevApps(resolveDevAppsStorageKey())
  await window.jiaorongApps?.syncDevApps(apps)
  return apps
}
