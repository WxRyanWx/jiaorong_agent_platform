'use strict'

/**
 * CORS 中间件。访客页请求 127.0.0.1 动态端口是跨源。
 * 允许 jiaorong-app:// 和本机 Vite（localhost / 127.0.0.1），
 * 避免任意网页读走 /api/sdk。
 * Allow-Private-Network 给 Chrome 的 private network access 预检用。
 */

/**
 * 判断 Origin 是否本机回环 HTTP(S)。
 * @param {string} origin 请求 Origin 头
 * @returns {boolean} 是 127.0.0.1 / localhost / ::1 则为 true
 */
function isLoopbackHttpOrigin(origin) {
  try {
    const url = new URL(origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false // 拒绝 file:、chrome-extension: 等。
    const host = url.hostname.toLowerCase()
    return host === '127.0.0.1' || host === 'localhost' || host === '[::1]' || host === '::1'
  } catch {
    return false // Origin 不是合法 URL。
  }
}

/**
 * 白名单 Origin：宿主协议或本机回环。其它返回空串，不回 CORS 头。
 * @param {string} origin 请求 Origin 头
 * @returns {string} 允许回显的 Origin，或不允许时的 ''
 */
function allowedOrigin(origin) {
  if (typeof origin !== 'string' || !origin) return '' // 无 Origin（同源或非浏览器）不回 CORS。
  if (origin.startsWith('jiaorong-app://')) return origin // 交融内嵌页。
  return isLoopbackHttpOrigin(origin) ? origin : '' // 本机 Vite；其它域名拒绝。
}

/**
 * 生成 Egg CORS 中间件。
 * 无参数。
 * 返回：async (ctx, next) => void
 */
module.exports = () => {
  /**
   * 给白名单 Origin 写 CORS 头；OPTIONS 预检到此结束。
   * @param {import('egg').Context} ctx Egg 上下文
   * @param {Function} next 后续中间件
   * @returns {Promise<void>}
   */
  return async function cors(ctx, next) {
    const origin = allowedOrigin(ctx.get('Origin'))
    if (origin) {
      // 白名单才写 CORS 头；空 Origin 保持默认，避免 `*`。
      ctx.set('Access-Control-Allow-Origin', origin)
      ctx.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
      ctx.set('Access-Control-Allow-Headers', 'Content-Type')
      ctx.set('Access-Control-Allow-Private-Network', 'true')
      ctx.set('Vary', 'Origin')
    }
    if (ctx.method === 'OPTIONS') {
      // 预检到此结束：允许则 204，否则 403，不进业务路由。
      ctx.status = origin ? 204 : 403
      return
    }
    await next()
  }
}

module.exports.allowedOrigin = allowedOrigin
