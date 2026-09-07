'use strict'

/**
 * 访客页跑在 jiaorong-app://，请求 127.0.0.1:8787 是跨源。
 * 只回显该协议 Origin，避免任意网页读走 /api/sdk 里的 token。
 * Allow-Private-Network 给 Chrome 的 private network access 预检用。
 */
function allowedOrigin(origin) {
  if (typeof origin !== 'string' || !origin) return ''
  return origin.startsWith('jiaorong-app://') ? origin : ''
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
