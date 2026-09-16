'use strict'

/**
 * 后端听 WebSocket，等 web-ui 连上后经页面调用 window.jiaorong。
 * 宿主不向本进程注入任何桥。
 */

const { attachWebSocketServer } = require('./wsLite')

/**
 * 挂到 Egg HTTP server 上。
 * @param {import('node:http').Server} httpServer 已 listen 的 HTTP
 * @param {import('egg').Application} app Egg 应用
 * @returns {void}
 */
function installPageHost(httpServer, app) {
  const appId = app.config.jiaorong.appId
  /** @type {null | { send: Function, close: Function }} */
  let page = null
  const pending = new Map()
  /** @type {Array<(ws: { send: Function }) => void>} */
  const waiters = []

  attachWebSocketServer(httpServer, {
    onOpen() {
      // hello 成功后才算连上
    },
    onMessage(ws, msg) {
      if (msg.type === 'hello') {
        const id = typeof msg.appId === 'string' ? msg.appId.trim() : ''
        if (id !== appId) {
          ws.send({ type: 'hello-reject', reason: 'appId mismatch' })
          ws.close()
          return
        }
        page = ws
        app.pageSocket = ws
        for (const waiter of waiters.splice(0)) waiter(ws)
        ws.send({ type: 'hello-ok', appId })
        return
      }
      if (msg.type === 'sdk') {
        const id = msg.id
        const ctx = app.createAnonymousContext()
        const method = String(msg.method || '')
        Promise.resolve()
          .then(async () => {
            const args = await ctx.service.biz.beforeInvoke(method, msg.args || {})
            const data = await ctx.service.jiaorong.invoke(method, args)
            return ctx.service.biz.afterInvoke(method, args, data)
          })
          .then((result) => {
            ws.send({ type: 'sdk:ok', id, result })
          })
          .catch((error) => {
            const payload = ctx.service.jiaorong.errorPayload(error)
            ws.send({
              type: 'sdk:err',
              id,
              error: { code: payload.code, message: payload.message }
            })
          })
        return
      }
      if (msg.type === 'invoke:ok' || msg.type === 'invoke:err') {
        const waiter = pending.get(msg.id)
        pending.delete(msg.id)
        if (!waiter) return
        if (msg.type === 'invoke:ok') waiter.resolve(msg.result)
        else waiter.reject(msg.error ?? { code: 'GENERATION_FAILED', message: '请求失败' })
        return
      }
      if (msg.type === 'event') {
        ws.send({ type: 'event', event: msg.event, payload: msg.payload })
      }
    },
    onClose(ws) {
      if (page === ws) {
        page = null
        app.pageSocket = null
      }
    }
  })

  /**
   * 等页面连上后转发一次宿主 invoke。
   * @param {string} method 如 session.send
   * @param {object} [args] 入参
   * @returns {Promise<*>} 页面回传结果
   */
  app.invokeViaPage = (method, args) => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(Object.assign(new Error('页面未连接宿主桥'), { code: 'JIAORONG_NOT_RUNNING' }))
      }, 8000)
      const run = (ws) => {
        const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
        pending.set(id, {
          resolve: (result) => {
            clearTimeout(timer)
            resolve(result)
          },
          reject: (error) => {
            clearTimeout(timer)
            reject(error)
          }
        })
        ws.send({ type: 'invoke', id, method, args: args ?? {} })
      }
      if (page) run(page)
      else waiters.push(run)
    })
  }
}

module.exports = { installPageHost }
