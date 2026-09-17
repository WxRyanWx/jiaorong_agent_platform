/** 随客户端发布的系统应用：不拷到用户 apps，仍从内置目录 spawn。 */

import type { JiaorongAppCatalogRecord } from './types'

/** 协同平台：extraResources / 仓库 apps 内置。 */
export const COLLABORATION_PLATFORM_APP_ID = 'collaboration-platform'

/**
 * 是否为随客户端内置、不拷到用户 apps 的应用。spawn 仍走这份目录。
 * @param appId 应用 id
 */
export function isSystemBundledApp(appId: string): boolean {
  return appId === COLLABORATION_PLATFORM_APP_ID
}

/**
 * 系统应用固定用本地包；OSS 同 id 只覆盖 enabled / auth。
 * @param system 从磁盘清单读出的系统应用
 * @param remote OSS 目录
 */
export function mergeSystemBundledCatalog(
  system: JiaorongAppCatalogRecord[],
  remote: JiaorongAppCatalogRecord[]
): JiaorongAppCatalogRecord[] {
  /** 系统应用 id。 */
  const systemIds = new Set(system.map((item) => item.id))
  /** OSS 按 id。 */
  const remoteById = new Map(remote.map((item) => [item.id, item]))
  /** 系统项叠可见性。 */
  const mergedSystem = system.map((item) => {
    /** OSS 同 id。 */
    const oss = remoteById.get(item.id)
    if (!oss) return item
    return {
      ...item,
      enabled: oss.enabled !== false,
      auth: oss.auth
    }
  })
  return [...mergedSystem, ...remote.filter((item) => !systemIds.has(item.id))]
}
