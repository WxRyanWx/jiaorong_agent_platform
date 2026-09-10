'use strict'

const { Controller } = require('egg')

/**
 * HTTP 入口。默认原样转发，不改 SDK 入参 / 出参。
 * 业务改写走 service.biz 的 beforeInvoke / afterInvoke。
 */
class SdkController extends Controller {
  /**
   * POST /api/sdk：按 body.method 调 SDK。
   * 读 ctx.request.body.method、ctx.request.body.args。
   * 成功返回 { ok: true, data }；缺 method 时 400；其它错误走 jiaorong 的 code → HTTP 状态。
   */
  async invoke() {
    const { ctx } = this
    const method = String(ctx.request.body?.method || '').trim()
    if (!method) {
      // 没有 method 无法 dispatch，直接 400，不碰 SDK。
      ctx.status = 400
      ctx.body = { ok: false, code: 'VALIDATION_ERROR', message: '需要提供 method' }
      return
    }
    try {
      const rawArgs = ctx.request.body?.args ?? {}
      // args：业务钩子可改写后再交给 SDK。
      const args = await ctx.service.biz.beforeInvoke(method, rawArgs)
      const data = await ctx.service.jiaorong.invoke(method, args)
      ctx.body = {
        ok: true,
        data: await ctx.service.biz.afterInvoke(method, args, data)
      }
    } catch (error) {
      // SDK / 业务抛错：统一成 { ok: false, code, message }，按 code 映射状态码。
      const payload = ctx.service.jiaorong.errorPayload(error)
      ctx.status = ctx.service.jiaorong.statusForCode(payload.code)
      ctx.body = payload
    }
  }

  /**
   * GET /api/events：把 SDK 事件以 SSE 推给页面。
   * 无业务参数。不返回 JSON，自己写响应流；连接关闭时从 sdkSseClients 摘掉。
   */
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
            // origin 合法才回 CORS 头，避免任意网页挂 SSE。
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Private-Network': 'true',
            Vary: 'Origin'
          }
        : {})
    })
    // 立刻把头打出去，避免代理等第一帧。没有该方法的响应对象跳过。
    if (typeof ctx.res.flushHeaders === 'function') ctx.res.flushHeaders()
    ctx.res.write(': connected\n\n')
    ctx.res.write('event: sdk\ndata: {"event":"ready","payload":{}}\n\n')
    ctx.app.sdkSseClients.add(ctx.res)
    ctx.req.on('close', () => {
      // 页面关掉 EventSource：从集合删除，避免 writeSse 写到死连接。
      ctx.app.sdkSseClients.delete(ctx.res)
    })
  }
}

module.exports = SdkController
