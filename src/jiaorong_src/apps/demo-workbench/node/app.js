'use strict'

/**
 * Egg 应用启动钩子。挂进程级状态，供 SDK 客户端和 SSE 订阅共用。
 * 必须单进程，多进程会各有一份 sdkSseClients，事件对不齐。
 *
 * @param {import('egg').Application} app Egg 应用实例
 * @returns {void}
 */
module.exports = (app) => {
  // sdkSseClients：当前连着 GET /api/events 的原始 HTTP 响应。
  app.sdkSseClients = new Set()
}
