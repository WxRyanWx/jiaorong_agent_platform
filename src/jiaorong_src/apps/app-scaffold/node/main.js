/**
 * 包内 Node 入口：只做装配与启动，业务代码在 `service/` 下。
 *
 * 链路：页面 `POST /rpc` → 本进程 → 桥（WS）→ 页面 `window.jiaorong` → 超级智能体。
 * 页面不直接调宿主能力，一律经本进程转发；本进程也不直连超级智能体，一律经页面中继。
 *
 * 各文件职责：
 * - `config.js`：端口与智能体常量
 * - `bridge.js`：页面 ↔ 本进程的 WS 桥，见《快速开始》5.1
 * - `service/forward.js`：把 SDK 方法名打到页面上
 * - `service/agent.js`：技能路径与系统提示词
 * - `service/http.js`：`GET /api/health` 与 `POST /rpc`
 * - `service/startup.js`：订阅事件与同步智能体
 */
import { ElysiaBridge } from './bridge.js'
import { BRIDGE_PORT, HTTP_PORT } from './config.js'
import { createForwarder } from './service/forward.js'
import { createHttpServer } from './service/http.js'
import { createStartup } from './service/startup.js'

/** 页面桥：`start()` 之后，页面 `initRendererBridge(BRIDGE_PORT)` 就能连进来。 */
const bridge = new ElysiaBridge({ port: BRIDGE_PORT })
/** 代理根：写 `jr.jiaorong.agent.create({...})` 就会调到页面里的同名方法。 */
const jr = bridge.createSAProxy()
/** 转发函数：SDK 方法名 → 页面 `window.jiaorong`。 */
const forward = createForwarder({ jr })
/** 启动动作：`subscribeHostEvents` 订阅事件、`startup` 同步智能体。 */
const { subscribeHostEvents, startup } = createStartup({ jr, forward })

/** 打一条错误日志，同时避免 rejection 冒出去让进程退出。 */
const logError = (error) => console.error('[app-scaffold]', error?.message || error)

/** 启动本进程：起桥、起 HTTP，再做启动动作。 */
const main = async () => {
  // 桥先起，页面一进来就能连上
  await bridge.start()
  console.log(`[app-scaffold] 桥已监听 127.0.0.1:${BRIDGE_PORT}`)
  // 页面刷新后是一条新连接，旧订阅不会自己恢复，每次连上都重发一次
  bridge.wss.on('connection', () => subscribeHostEvents().catch(logError))
  // HTTP 起在另一个端口，页面的业务请求打这里
  createHttpServer({ forward, bridge }).listen({ hostname: '127.0.0.1', port: HTTP_PORT }, () => {
    console.log(`[app-scaffold] HTTP 已监听 127.0.0.1:${HTTP_PORT}`)
  })
  // 启动动作：页面还没连上时请求会在桥里排队，连上后自动补发
  await startup()
}

main().catch(logError)
