/**
 * 页面 ↔ 包内 Node 的 WebSocket 桥，结构与《快速开始》5.1 一致。
 *
 * Node 起 WS 服务，页面调 `window.initRendererBridge(port)` 连进来；Node 用 `createSAProxy()`
 * 拿到 `jr`，写 `jr.jiaorong.session.send({...})` 就会调到页面里的 `window.jiaorong.session.send`。
 */
import { WebSocketServer } from 'ws'
import { randomUUID } from 'node:crypto'

/** 单次请求超时（毫秒）：页面没回包时不能让调用方一直挂着。 */
const TIMEOUT_MS = 30_000

/** 页面桥：一个 WS 服务 + 一张未完成请求表 + 一张事件回调表。 */
export class ElysiaBridge {
  /**
   * @param options port WS 端口，要与页面 `initRendererBridge` 传的一致；0 表示交给系统分配
   */
  constructor(options = {}) {
    /** WS 监听端口。 */
    this.port = options.port || 0
    /** WS 服务实例，`start()` 之后才有值。 */
    this.wss = null
    /** 当前连上的页面连接，页面没连上时为 null。 */
    this.ws = null
    /** reqId → `{ resolve, reject, timer }`，收到回包时结算。 */
    this.pending = new Map()
    /** 页面连上前排队的请求，连上后按原顺序补发。 */
    this.queue = []
    /** 事件名 → Node 侧回调，宿主推来的事件在这里分发。 */
    this.hooks = new Map()
  }

  /** 起 WS 服务并等到端口可用，返回实际监听的端口。 */
  async start() {
    // 只听回环地址：这座桥只给本机页面用
    this.wss = new WebSocketServer({ host: '127.0.0.1', port: this.port })
    this.wss.on('connection', (ws) => {
      this.ws = ws
      // 把排队的请求按原顺序补发出去
      for (const item of this.queue.splice(0)) {
        ws.send(JSON.stringify({ msgType: 'request', ...item }))
      }
      // 页面的回包（response / error）和宿主事件（event）都从这里进来
      ws.on('message', (raw) => {
        try {
          this.handleIncoming(JSON.parse(raw.toString()))
        } catch (error) {
          // 回包不是合法 JSON 时只记日志，别把进程带崩
          console.error('[bridge] 解析页面消息失败', error)
        }
      })
      // 页面刷新或关闭后清掉引用，后续请求重新排队等下一次连接
      ws.on('close', () => {
        if (this.ws === ws) this.ws = null
      })
    })
    // 等端口真正 listening 再返回，避免调用方过早发请求
    await new Promise((resolve) => this.wss.once('listening', resolve))
    return this.wss.address().port
  }

  /** 分发页面发来的一条消息：回包结算请求，事件交给订阅的回调。 */
  handleIncoming(msg) {
    // 宿主事件：交给 Node 侧订阅的回调，没订阅就忽略
    if (msg.msgType === 'event') return this.hooks.get(msg.event)?.(msg.payload)
    /** 该 reqId 对应的未完成请求。 */
    const item = this.pending.get(msg.reqId)
    // 已经超时结算过的请求直接丢掉
    if (!item) return
    clearTimeout(item.timer)
    this.pending.delete(msg.reqId)
    // 成功回包：交出宿主返回值
    if (msg.msgType === 'response') return item.resolve(msg.data)
    // 失败回包：把宿主的 code 和 message 造成 Error 抛给调用方
    item.reject(
      Object.assign(new Error(msg.message || '请求失败'), { code: msg.code || 'CALL_ERROR' })
    )
  }

  /**
   * 调页面里的一个方法。
   * @param method 点号路径，如 `jiaorong.session.send`
   * @param args 位置参数数组，宿主方法都只收一个入参对象
   * @returns 宿主方法的返回值
   */
  call(method, args, timeout = TIMEOUT_MS) {
    /** 本次请求 id，回包按它对上号。 */
    const reqId = randomUUID()
    return new Promise((resolve, reject) => {
      /** 超时定时器：到点结算失败，避免请求永远挂着。 */
      const timer = setTimeout(() => {
        this.pending.delete(reqId)
        reject(Object.assign(new Error(`请求超时：${method}`), { code: 'JIAORONG_NOT_RUNNING' }))
      }, timeout)
      // 先登记再发送，避免回包比登记更快导致丢结果
      this.pending.set(reqId, { resolve, reject, timer })
      /** 要发出去的请求消息。 */
      const message = JSON.stringify({ msgType: 'request', reqId, method, payload: args })
      // 页面已连上就直接发（1 是 WS 的 OPEN 状态），否则进队列等连上后补发
      if (this.ws?.readyState === 1) this.ws.send(message)
      else this.queue.push({ reqId, method, payload: args })
    })
  }

  /** 生成 `jr` 代理：`jr.jiaorong.agent.create({...})` 转成 `call('jiaorong.agent.create', [{...}])`。 */
  createSAProxy(path = []) {
    /** 不能当方法名处理的属性，取到它们要返回原值，否则 `await` 会把代理当成 Thenable。 */
    const reserved = ['then', 'catch', 'constructor', 'toString', 'valueOf']
    // 用函数做 target，代理才既能取属性又能被调用
    return new Proxy(function () {}, {
      // 取属性就把属性名压进路径，继续返回下一层代理
      get: (target, prop) =>
        reserved.includes(prop) ? Reflect.get(target, prop) : this.createSAProxy([...path, prop]),
      // 真正调用时把路径拼成方法名发出去
      apply: (_target, _thisArg, args) => {
        /** 完整方法名，如 `jiaorong.agent.create`。 */
        const method = path.join('.')
        // 订阅事件：回调过不了 JSON，只在本地记回调，发给页面的只有事件名
        if (method === 'jiaorong.on') {
          this.hooks.set(args[0], args[1])
          return this.call(method, [args[0]])
        }
        return this.call(method, args)
      }
    })
  }

  /** 关掉 WS 服务，进程退出前调用。 */
  stop() {
    this.wss?.close()
  }
}
