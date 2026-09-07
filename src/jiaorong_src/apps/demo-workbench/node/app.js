'use strict'

/**
 * 进程级状态。单进程才能让 SDK 客户端和 SSE 订阅共用这一份。
 * sdkSseClients：当前连着 GET /api/events 的响应。
 */
module.exports = (app) => {
  app.sdkSseClients = new Set()
}
