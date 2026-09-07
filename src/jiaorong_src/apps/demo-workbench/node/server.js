'use strict'

/**
 * Egg 入口。宿主 spawn 本文件，并注入 globalThis.jiaorong。
 *
 * 必须 egg.start 单进程，再自己 listen。
 * 不要 egg.startCluster / 多 worker：worker 拿不到宿主注入的桥，connect({ runtime: 'node' }) 会失败。
 * 端口必须和 app.json 的 node.port、前端 NODE_BASE 一致。
 */
process.env.EGG_SERVER_ENV = process.env.EGG_SERVER_ENV || 'prod'

const egg = require('egg')

const PORT = Number(process.env.JIAORONG_NODE_PORT || 8787)
const HOST = process.env.JIAORONG_NODE_HOST || '127.0.0.1'

async function main() {
  const app = await egg.start({
    baseDir: __dirname
  })
  app.listen(PORT, HOST, () => {
    console.log(`[demo-workbench] listening ${HOST}:${PORT}`)
  })
}

main().catch((error) => {
  console.error('[demo-workbench] egg start failed', error)
  process.exit(1)
})
