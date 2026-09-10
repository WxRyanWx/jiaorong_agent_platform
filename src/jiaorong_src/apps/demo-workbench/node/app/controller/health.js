'use strict'

const { Controller } = require('egg')

/**
 * 探活接口。connected=true 表示已经连上宿主注入的 SDK 桥。
 */
class HealthController extends Controller {
  /**
   * GET /api/health。
   * 无参数。
   * 返回：{ ok, service, port, connected }；桥未通时 connected=false，仍 ok=true（进程活着）。
   */
  async show() {
    const { ctx } = this
    try {
      await ctx.service.jiaorong.getClient()
      ctx.body = {
        ok: true,
        service: 'demo-workbench-node',
        port: ctx.app.config.jiaorong.port,
        connected: true
      }
    } catch (error) {
      // 进程已起来但桥未通：探活仍 200，把 code / message 带给页面。
      const payload = ctx.service.jiaorong.errorPayload(error)
      ctx.body = {
        ok: true,
        service: 'demo-workbench-node',
        port: ctx.app.config.jiaorong.port,
        connected: false,
        code: payload.code,
        message: payload.message
      }
    }
  }
}

module.exports = HealthController
