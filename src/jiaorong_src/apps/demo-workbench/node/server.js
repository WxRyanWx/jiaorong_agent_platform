'use strict'

/**
 * Egg 入口。
 *
 * 侧栏打开应用时，由交融客户端拉起本文件并注入连接。
 * 本机调试也可以在系统终端执行 `node server.js`：交融客户端需已启动并登录，
 * 本应用需已安装。此时默认听 127.0.0.1:8787。
 *
 * 必须 egg.start 单进程，不要 egg.startCluster。
 */
process.env.EGG_SERVER_ENV = process.env.EGG_SERVER_ENV || 'prod'

const egg = require('egg')

const spawned = typeof process.send === 'function'
const PORT = Number(process.env.JIAORONG_NODE_PORT || (spawned ? 0 : 8787))
const HOST = process.env.JIAORONG_NODE_HOST || '127.0.0.1'

async function main() {
  const app = await egg.start({
    baseDir: __dirname
  })
  const httpServer = app.listen(PORT, HOST)
  const logAddr = () => {
    const addr = typeof httpServer.address === 'function' ? httpServer.address() : null
    const port = addr && typeof addr === 'object' ? addr.port : PORT
    console.log(`[demo-workbench] listening ${HOST}:${port}`)
  }
  if (httpServer && typeof httpServer.on === 'function') {
    httpServer.on('listening', logAddr)
  } else {
    logAddr()
  }
}

main().catch((error) => {
  console.error('[demo-workbench] egg start failed', error)
  process.exit(1)
})
