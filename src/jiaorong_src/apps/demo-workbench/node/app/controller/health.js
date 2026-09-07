'use strict'

const { Controller } = require('egg')

/** 探活。connected=true 表示已经连上宿主注入的 SDK 桥。 */
class HealthController extends Controller {
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
