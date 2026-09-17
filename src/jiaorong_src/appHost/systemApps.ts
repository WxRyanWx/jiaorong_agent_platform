/** 随客户端发布的系统应用：不拷到用户 apps，仍从内置目录 spawn。 */

import type { JiaorongAppCatalogRecord } from './types'

/** 协同平台：extraResources / 仓库 apps 内置。 */
export const COLLABORATION_PLATFORM_APP_ID = 'collaboration-platform'

/**
 * 是否为随客户端内置、不拷到用户 apps 的应用。spawn 仍走这份目录。
 * @param appId 应用 id
 */
export function isSystemBundledApp(appId: string): boolean {
  // 目前只有协同平台一个系统应用
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
    // OSS 没配这个应用，保持内置默认（启用、全员可见）
    if (!oss) return item
    // 只取 OSS 的 enabled / auth，其余字段仍以本地包为准
    return {
      ...item,
      enabled: oss.enabled !== false,
      auth: oss.auth
    }
  })
  // 系统应用排前面，OSS 里同 id 的已被合并掉不再重复出现
  return [...mergedSystem, ...remote.filter((item) => !systemIds.has(item.id))]
}
