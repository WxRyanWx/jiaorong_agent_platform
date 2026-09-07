import type { HostContext } from './types'

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

export function normalizeHostContext(raw: unknown): HostContext {
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
    productId: readOptionalString(record.productId)
  }
}
