/** 把宿主 `context.get` 收成稳定的 `HostContext`。 */

import type { HostContext } from './types'

/**
 * 可选字符串：trim 后空则视为未传。
 * @param value 未知字段
 */
function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  /** trim 后的值。 */
  const trimmed = value.trim()
  return trimmed || undefined
}

/**
 * 规范化上下文；缺字段给安全默认值，token 未登录为 null。
 * @param raw 宿主返回
 */
export function normalizeHostContext(raw: unknown): HostContext {
  /** 原始对象。 */
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    userId: typeof record.userId === 'string' ? record.userId : '',
    orgId: typeof record.orgId === 'string' ? record.orgId : null,
    locale: typeof record.locale === 'string' ? record.locale : '',
    theme: record.theme === 'dark' ? 'dark' : 'light',
    appId: typeof record.appId === 'string' ? record.appId : '',
    appDir: typeof record.appDir === 'string' ? record.appDir : '',
    token: readOptionalString(record.token) ?? null,
    apiBaseUrl: readOptionalString(record.apiBaseUrl),
    productId: readOptionalString(record.productId),
    nodePort: typeof record.nodePort === 'number' && record.nodePort > 0 ? record.nodePort : null,
    nodeBase: readOptionalString(record.nodeBase)
  }
}
