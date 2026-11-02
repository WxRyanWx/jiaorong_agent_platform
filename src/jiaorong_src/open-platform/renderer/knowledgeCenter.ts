import { getToken } from '../../auth/lib/local-user'

/** 问答中心地址：测试与生产共用同一实例，后续切换正式域名只改这一处。 */
const KNOWLEDGE_CENTER_ORIGIN_URL = 'http://106.63.7.106:10001/qa-platform-web/'
/** 探测超时：请求挂死时尽快放开，不拖住后续检测。 */
const BUILD_PROBE_TIMEOUT_MS = 8_000

/**
 * reloadKey 由调用方维护：进程启动时生成一次，检测到线上换版时更新。
 * URL 只在 key 变化时重载，切菜单和保活恢复不会触发。
 */
export function resolveKnowledgeCenterUrl(reloadKey: string): string {
  const token = getToken()?.trim()
  if (!token) return ''

  const url = new URL(KNOWLEDGE_CENTER_ORIGIN_URL)
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
  const url = new URL(KNOWLEDGE_CENTER_ORIGIN_URL)
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
