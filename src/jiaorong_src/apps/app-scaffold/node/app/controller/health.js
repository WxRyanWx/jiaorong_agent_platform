'use strict'

const { Controller } = require('egg')

/**
 * 探活：进程已 listen 即 ok。不要求页面已连上。
 */
class HealthController extends Controller {
  /**
   * GET /api/health。
   * @returns {void}
   */
  async show() {
    const { ctx } = this
    ctx.body = {
      ok: true,
      service: 'app-scaffold',
      appId: ctx.app.config.jiaorong.appId,
      port: ctx.app.config.jiaorong.port
    }
  }
}

module.exports = HealthController
