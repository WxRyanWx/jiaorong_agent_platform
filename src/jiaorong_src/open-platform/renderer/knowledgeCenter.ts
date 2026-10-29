import { getToken } from '../../auth/lib/local-user'

/** 知识中心地址：测试与生产共用同一实例，后续切换正式域名只改这一处。 */
const KNOWLEDGE_CENTER_ORIGIN_URL = 'http://106.63.7.106:10001/qa-platform-web/'

export function resolveKnowledgeCenterUrl(): string {
  const token = getToken()?.trim()
  if (!token) return ''

  const url = new URL(KNOWLEDGE_CENTER_ORIGIN_URL)
  url.searchParams.set('token', token)
  return url.toString()
}
