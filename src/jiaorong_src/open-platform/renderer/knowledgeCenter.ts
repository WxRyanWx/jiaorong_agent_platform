import { getToken } from '../../auth/lib/local-user'

const KNOWLEDGE_CENTER_TEST_URL = 'http://106.63.7.106:10001/technical-support-qa-platform-r-web/'
const KNOWLEDGE_CENTER_PROD_URL = 'https://c4ai.ccccltd.cn/technical-support-qa-platform-r-web/'

const KNOWLEDGE_CENTER_URL_BY_MODE: Record<string, string> = {
  development: KNOWLEDGE_CENTER_TEST_URL,
  test: KNOWLEDGE_CENTER_TEST_URL,
  production: KNOWLEDGE_CENTER_PROD_URL
}

export function resolveKnowledgeCenterOriginUrl(
  mode = import.meta.env.MODE || 'production'
): string {
  return KNOWLEDGE_CENTER_URL_BY_MODE[mode] ?? KNOWLEDGE_CENTER_PROD_URL
}

export function resolveKnowledgeCenterUrl(): string {
  const originUrl = resolveKnowledgeCenterOriginUrl()
  const token = getToken()?.trim()
  if (!originUrl || !token) return ''

  const url = new URL(originUrl)
  url.searchParams.set('token', token)
  return url.toString()
}
