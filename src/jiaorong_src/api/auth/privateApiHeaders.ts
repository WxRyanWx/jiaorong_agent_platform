/**
 * 私有 API 裸请求（`fetch` / 下载）用的鉴权头。
 * axios 走拦截器自动注入，这里只服务绕过 axios 的场景，例如 zip 包下载。
 */

import { isJiaorongPrivateApiUrl, resolveAuthProductId } from './config'

/**
 * 命中私有 API 时返回鉴权头，否则返回 undefined。
 * @param url 待请求的绝对地址
 */
export function resolveJiaorongPrivateApiHeaders(url: string): Record<string, string> | undefined {
  if (!isJiaorongPrivateApiUrl(url)) return undefined
  const token = localStorage.getItem('xkaitoken')?.trim() || ''
  // 未登录时不发空凭据头，交给后端按匿名请求返回 401
  if (!token) return undefined
  return { 'Fusion-Auth': token, 'Product-Id': resolveAuthProductId() }
}
