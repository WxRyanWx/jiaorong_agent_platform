import { getToken } from '../../auth/lib/local-user'

/**
 * 问答中心地址：按 Vite mode 选择，日常无需 .env。
 *   development（pnpm dev）/ test（build:test）→ 测试服
 *   production（pnpm build / 正式包）→ 正式服
 */
const KNOWLEDGE_CENTER_TEST_URL = 'http://106.63.7.106:10001/qa-platform-web/'
const KNOWLEDGE_CENTER_PROD_URL = 'https://c4ai.ccccltd.cn/qa-platform-web/'

const KNOWLEDGE_CENTER_URL_BY_MODE: Record<string, string> = {
  development: KNOWLEDGE_CENTER_TEST_URL,
  test: KNOWLEDGE_CENTER_TEST_URL,
  production: KNOWLEDGE_CENTER_PROD_URL
}

/** 未匹配 mode 时的回退（正式服） */
export const DEFAULT_KNOWLEDGE_CENTER_URL = KNOWLEDGE_CENTER_PROD_URL

export function resolveKnowledgeCenterOriginUrl(): string {
  const mode = import.meta.env.MODE || 'production'
  return KNOWLEDGE_CENTER_URL_BY_MODE[mode] || DEFAULT_KNOWLEDGE_CENTER_URL
}

/** 探测超时：请求挂死时尽快放开，不拖住后续检测。 */
const BUILD_PROBE_TIMEOUT_MS = 8_000

/**
 * reloadKey 由调用方维护：进程启动时生成一次，检测到线上换版时更新。
 * URL 只在 key 变化时重载，切菜单和保活恢复不会触发。
 */
export function resolveKnowledgeCenterUrl(reloadKey: string): string {
  const token = getToken()?.trim()
  if (!token) return ''

  const url = new URL(resolveKnowledgeCenterOriginUrl())
  url.searchParams.set('token', token)
  url.searchParams.set('_t', reloadKey)
  return url.toString()
}

/**
 * 入口 HTML 里的 hash 资源名就是构建指纹：同一版本稳定，重新构建必然变化。
 * 只取脚本/样式地址并去掉查询串，避免内联内容差异导致误判换版。
 */
export function extractBuildSignature(html: string): string {
  if (!html) return ''

  const parsedDocument = new DOMParser().parseFromString(html, 'text/html')
  const urls = Array.from(parsedDocument.querySelectorAll('script[src], link[href]'))
    .map((element) => element.getAttribute('src') ?? element.getAttribute('href') ?? '')
    .map((url) => url.split('?')[0].trim())
    .filter(Boolean)

  return Array.from(new Set(urls)).sort().join('|')
}

/** 拉取线上入口指纹；网络或跨域失败返回 null，调用方保持现状。 */
export async function fetchBuildSignature(): Promise<string | null> {
  const url = new URL(resolveKnowledgeCenterOriginUrl())
  const token = getToken()?.trim()
  if (token) url.searchParams.set('token', token)
  url.searchParams.set('__probe', String(Date.now()))

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), BUILD_PROBE_TIMEOUT_MS)
  try {
    const response = await fetch(url.toString(), { cache: 'no-store', signal: controller.signal })
    if (!response.ok) return null

    const signature = extractBuildSignature(await response.text())
    return signature || null
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}
