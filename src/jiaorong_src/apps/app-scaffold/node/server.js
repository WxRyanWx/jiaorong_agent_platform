'use strict'

/**
 * Egg 单进程入口。从 8787 起找第一个能 listen 的端口。
 * web-ui 从同一起点探测连接。宿主不注入通信。
 */

process.env.EGG_SERVER_ENV = process.env.EGG_SERVER_ENV || 'prod'

const egg = require('egg')
const { installPageHost } = require('./app/lib/pageHost')

const HOST = process.env.JIAORONG_NODE_HOST || '127.0.0.1'
const PORT_START = 8787
const PORT_TRIES = 32

/**
 * 尝试绑定一个端口。
 * @param {import('egg').Application} app Egg 应用
 * @param {number} port 端口
 * @param {string} host 地址
 * @returns {Promise<import('node:http').Server>}
 */
function listenPort(app, port, host) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host)
    const fail = (error) => {
      server.removeListener('listening', ok)
      try {
        server.close()
      } catch {
        // ignore
      }
      reject(error)
    }
    const ok = () => {
      server.removeListener('error', fail)
      resolve(server)
    }
    server.once('error', fail)
    server.once('listening', ok)
  })
}

/**
 * 从 8787 起逐个尝试。
 * @param {import('egg').Application} app Egg 应用
 * @param {string} host 地址
 * @returns {Promise<import('node:http').Server>}
 */
async function listenFirstFree(app, host) {
  let lastError
  for (let port = PORT_START; port < PORT_START + PORT_TRIES; port += 1) {
    try {
      return await listenPort(app, port, host)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error('没有可用端口')
}

/**
 * 启动 Egg 并挂 WebSocket 中继。
 */
async function main() {
  const app = await egg.start({
    baseDir: __dirname
  })
  const httpServer = await listenFirstFree(app, HOST)
  const addr = typeof httpServer.address === 'function' ? httpServer.address() : null
  const port = addr && typeof addr === 'object' ? addr.port : PORT_START
  app.config.jiaorong.port = port
  installPageHost(httpServer, app)
  console.log(`[app-scaffold] listening ${HOST}:${port}`)
}

main().catch((error) => {
  console.error('[app-scaffold] egg start failed', error)
  process.exit(1)
})
