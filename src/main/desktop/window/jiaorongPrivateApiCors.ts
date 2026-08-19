import { session, type Session } from 'electron'
import { listJiaorongPrivateApiCorsUrls } from '@jiaorong/api/auth/config'

const PRIVATE_API_ALLOW_HEADERS = [
  'Content-Type',
  'Fusion-Auth',
  'Product-Id',
  'Authorization',
  'dontShowMessage'
].join(', ')

const PRIVATE_API_ALLOW_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD'

let installed = false

/** 去掉响应里已有 CORS 头，避免与注入值重复导致浏览器拒绝 */
export function mergeJiaorongPrivateApiCorsHeaders(
  responseHeaders: Record<string, string[]> | undefined
): Record<string, string[]> {
  const next: Record<string, string[]> = { ...(responseHeaders ?? {}) }
  for (const key of Object.keys(next)) {
    if (key.toLowerCase().startsWith('access-control-')) {
      delete next[key]
    }
  }
  next['Access-Control-Allow-Origin'] = ['*']
  next['Access-Control-Allow-Headers'] = [PRIVATE_API_ALLOW_HEADERS]
  next['Access-Control-Allow-Methods'] = [PRIVATE_API_ALLOW_METHODS]
  return next
}

/**
 * 仅对当前 mode 的交融 API origin 补 CORS。
 * 窗口暂关 webSecurity 时此 filter 不参与拦截，保留以便再开隔离。
 */
export function ensureJiaorongPrivateApiCors(ses?: Session): void {
  if (installed) return
  const target = ses ?? session.defaultSession
  if (!target?.webRequest?.onHeadersReceived) {
    return
  }
  installed = true
  const urls = listJiaorongPrivateApiCorsUrls()
  target.webRequest.onHeadersReceived({ urls }, (details, callback) => {
    callback({
      responseHeaders: mergeJiaorongPrivateApiCorsHeaders(details.responseHeaders)
    })
  })
}
