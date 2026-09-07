'use strict'

const { Controller } = require('egg')

/**
 * HTTP 入口。默认原样转发，不改 SDK 入参/出参。
 * 业务改写走 service.biz 的 beforeInvoke / afterInvoke。
 */
class SdkController extends Controller {
  async invoke() {
    const { ctx } = this
    const method = String(ctx.request.body?.method || '').trim()
    if (!method) {
      ctx.status = 400
      ctx.body = { ok: false, code: 'VALIDATION_ERROR', message: '需要提供 method' }
      return
    }
    try {
      const rawArgs = ctx.request.body?.args ?? {}
      const args = await ctx.service.biz.beforeInvoke(method, rawArgs)
      const data = await ctx.service.jiaorong.invoke(method, args)
      ctx.body = {
        ok: true,
        data: await ctx.service.biz.afterInvoke(method, args, data)
      }
    } catch (error) {
      const payload = ctx.service.jiaorong.errorPayload(error)
      ctx.status = ctx.service.jiaorong.statusForCode(payload.code)
      ctx.body = payload
    }
  }

  async events() {
    const { ctx } = this
    // 关掉 Egg 自动响应，自己写 SSE。X-Accel-Buffering 避免中间层攒包。
    ctx.respond = false
    const origin = require('../middleware/cors').allowedOrigin(ctx.get('Origin'))
    ctx.res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...(origin
        ? {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Private-Network': 'true',
            Vary: 'Origin'
          }
        : {})
    })
    if (typeof ctx.res.flushHeaders === 'function') ctx.res.flushHeaders()
    ctx.res.write(': connected\n\n')
    ctx.res.write('event: sdk\ndata: {"event":"ready","payload":{}}\n\n')
    ctx.app.sdkSseClients.add(ctx.res)
    ctx.req.on('close', () => {
      ctx.app.sdkSseClients.delete(ctx.res)
    })
  }
}

module.exports = SdkController
