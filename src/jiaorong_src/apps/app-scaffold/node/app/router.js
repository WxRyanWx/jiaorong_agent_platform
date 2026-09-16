'use strict'

/**
 * HTTP 路由。页面对话走 WebSocket，这里只留探活。
 *
 * @param {import('egg').Application} app Egg 应用实例
 * @returns {void}
 */
module.exports = (app) => {
  const { router, controller } = app
  router.get('/api/health', controller.health.show)
}
