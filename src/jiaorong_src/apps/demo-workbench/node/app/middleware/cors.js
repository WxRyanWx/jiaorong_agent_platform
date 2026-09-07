'use strict'

/**
 * 访客页请求 127.0.0.1 动态端口是跨源。
 * 允许 jiaorong-app:// 和本机 Vite（localhost / 127.0.0.1），
 * 避免任意网页读走 /api/sdk。
 * Allow-Private-Network 给 Chrome 的 private network access 预检用。
 */
function isLoopbackHttpOrigin(origin) {
  try {
    const url = new URL(origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    const host = url.hostname.toLowerCase()
    return host === '127.0.0.1' || host === 'localhost' || host === '[::1]' || host === '::1'
  } catch {
    return false
  }
}

function allowedOrigin(origin) {
  if (typeof origin !== 'string' || !origin) return ''
  if (origin.startsWith('jiaorong-app://')) return origin
  return isLoopbackHttpOrigin(origin) ? origin : ''
}

module.exports = () => {
  return async function cors(ctx, next) {
    const origin = allowedOrigin(ctx.get('Origin'))
    if (origin) {
      ctx.set('Access-Control-Allow-Origin', origin)
      ctx.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
      ctx.set('Access-Control-Allow-Headers', 'Content-Type')
      ctx.set('Access-Control-Allow-Private-Network', 'true')
      ctx.set('Vary', 'Origin')
    }
    if (ctx.method === 'OPTIONS') {
      ctx.status = origin ? 204 : 403
      return
    }
    await next()
  }
}

module.exports.allowedOrigin = allowedOrigin
