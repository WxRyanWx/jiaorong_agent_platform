'use strict'

/**
 * 脚手架只暴露三条：
 * GET  /api/health  探活 + 是否已连上宿主桥
 * POST /api/sdk     前端传 { method, args }，Node 调 SDK
 * GET  /api/events  SSE，把 SDK 事件推给页面
 */
module.exports = (app) => {
  const { router, controller } = app
  router.get('/api/health', controller.health.show)
  router.post('/api/sdk', controller.sdk.invoke)
  router.get('/api/events', controller.sdk.events)
}
