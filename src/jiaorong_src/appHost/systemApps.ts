/** 系统应用：OSS `source === "builtin"`。不进用户 apps，zip 装到 Electron userData，启动自动更新。 */

import type { JiaorongAppCatalogRecord } from './types'

/** OSS 最近一次目录里 `source === "builtin"` 的 id。 */
let builtinAppIds = new Set<string>()

/**
 * 用 OSS 目录刷新系统应用 id。发布默认 store，只有手改 builtin 才会进来。
 * @param ids 系统应用 id
 */
export function setSystemBundledAppIds(ids: readonly string[]): void {
  builtinAppIds = new Set(ids)
}

/**
 * 是否为系统应用（OSS source=builtin）。
 * 仅有 appId、没有目录记录时用这份缓存。
 * @param appId 应用 id
 */
export function isSystemBundledApp(appId: string): boolean {
  return builtinAppIds.has(appId)
}

/**
 * 系统应用固定 slot=menu，并排在商店应用前面。
 * @param remote OSS 目录
 */
export function mergeSystemBundledCatalog(
  remote: JiaorongAppCatalogRecord[]
): JiaorongAppCatalogRecord[] {
  const builtins: JiaorongAppCatalogRecord[] = []
  const rest: JiaorongAppCatalogRecord[] = []
  for (const item of remote) {
    if (item.source === 'builtin') builtins.push({ ...item, slot: 'menu' })
    else rest.push(item)
  }
  return [...builtins, ...rest]
}
