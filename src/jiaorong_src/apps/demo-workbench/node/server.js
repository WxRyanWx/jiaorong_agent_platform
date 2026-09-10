'use strict'

/**
 * Egg 单进程入口。
 *
 * 侧栏打开应用时，由交融客户端拉起本文件并注入连接。
 * 本机调试也可以在系统终端执行 `node server.js`：交融客户端需已启动并登录，
 * 本应用需已安装。此时默认听 127.0.0.1:8787。
 *
 * 必须 egg.start 单进程，不要 egg.startCluster。
 */
process.env.EGG_SERVER_ENV = process.env.EGG_SERVER_ENV || 'prod'

const egg = require('egg')

// spawned：有 process.send 说明是宿主 spawn 的子进程，端口交给系统分配。
const spawned = typeof process.send === 'function'
// PORT：宿主注入 JIAORONG_NODE_PORT；子进程默认 0（随机端口），本机直接跑默认 8787。
const PORT = Number(process.env.JIAORONG_NODE_PORT || (spawned ? 0 : 8787))
// HOST：只绑本机回环，避免对外暴露脚手架 HTTP。
const HOST = process.env.JIAORONG_NODE_HOST || '127.0.0.1'

/**
 * 启动 Egg 并开始监听。
 * 无参数。
 * 返回：Promise，listen 挂上后结束（进程保持运行）。
 */
async function main() {
  const app = await egg.start({
    baseDir: __dirname
  })
  const httpServer = app.listen(PORT, HOST)
  /**
   * 打出实际监听地址。PORT 为 0 时必须从 address() 取系统分配的端口。
   * 无参数，无返回值。
   */
  const logAddr = () => {
    const addr = typeof httpServer.address === 'function' ? httpServer.address() : null
    // address() 可能是字符串或对象；对象才有 .port。
    const port = addr && typeof addr === 'object' ? addr.port : PORT
    console.log(`[demo-workbench] listening ${HOST}:${port}`)
  }
  if (httpServer && typeof httpServer.on === 'function') {
    // 正常 Node HTTP Server：等 listening 再打日志，避免端口尚未绑定。
    httpServer.on('listening', logAddr)
  } else {
    // 测试桩或异常返回值没有 on：立刻打一次，避免静默。
    logAddr()
  }
}

main().catch((error) => {
  // 启动失败直接退出，避免空进程挂着。
  console.error('[demo-workbench] egg start failed', error)
  process.exit(1)
})
