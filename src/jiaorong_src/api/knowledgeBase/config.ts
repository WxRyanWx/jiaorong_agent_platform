/**
 * 知识库 Web 页地址（主窗口 iframe）。
 * 全自动：按 Vite mode 选择，日常无需 .env。
 *   development（pnpm dev）/ test（build:test）→ 测试服
 *   production（pnpm build / 正式包）→ 正式服
 * 拼接 query：token = localStorage.xkaitoken
 */
import { getToken } from '../../auth/lib/local-user'

const KNOWLEDGE_BASE_TEST_URL = 'http://106.63.7.106:10001/agent/knowledge_base'
const KNOWLEDGE_BASE_PROD_URL = 'https://c4ai.ccccltd.cn/agent/knowledge_base'

const KNOWLEDGE_BASE_URL_BY_MODE: Record<string, string> = {
  development: KNOWLEDGE_BASE_TEST_URL,
  test: KNOWLEDGE_BASE_TEST_URL,
  production: KNOWLEDGE_BASE_PROD_URL
}

/** 未匹配 mode 时的回退（正式服） */
export const DEFAULT_KNOWLEDGE_BASE_URL = KNOWLEDGE_BASE_PROD_URL

export function resolveKnowledgeBaseOriginUrl(): string {
  const mode = import.meta.env.MODE || 'production'
  return KNOWLEDGE_BASE_URL_BY_MODE[mode] || DEFAULT_KNOWLEDGE_BASE_URL
}

/** 带登录 token 的完整 iframe 地址 */
export function resolveKnowledgeBaseUrl(): string {
  const base = resolveKnowledgeBaseOriginUrl()
  const token = getToken()?.trim()
  if (!token) {
    return base
  }

  const url = new URL(base)
  url.searchParams.set('token', token)
  return url.toString()
}
