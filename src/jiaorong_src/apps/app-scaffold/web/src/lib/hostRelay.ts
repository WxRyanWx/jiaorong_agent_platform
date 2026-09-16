/**
 * web-ui 中间层：连包内 Node 的 WebSocket。
 * 只有 bindInvoke / getPathForFile 碰 window.jiaorong；页面业务走 Node。
 */

import { APP_ID } from '../constants'
import { APP_PORT_START, APP_PORT_TRIES, APP_WS_PROBE_MS, listProbePorts } from './appPorts'

const LAST_PORT_KEY = 'jiaorong-node-port'

const RELAY_EVENTS = [
  'chat.stream.updated',
  'chat.stream.completed',
  'chat.stream.failed',
  'chat.plan.updated',
  'sessions.messages.changed',
  'context'
]

/** 读上次握手成功的端口。 */
function readLastPort(): number | undefined {
  try {
    const raw = sessionStorage.getItem(LAST_PORT_KEY)
    const port = raw ? Number(raw) : NaN
    if (
      Number.isInteger(port) &&
      port >= APP_PORT_START &&
      port < APP_PORT_START + APP_PORT_TRIES
    ) {
      return port
    }
  } catch {
    // sessionStorage 在部分 webview 不可用
  }
  return undefined
}

function writeLastPort(port: number): void {
  try {
    sessionStorage.setItem(LAST_PORT_KEY, String(port))
  } catch {
    // ignore
  }
}

function closeSocket(socket: WebSocket): void {
  try {
    socket.close()
  } catch {
    // ignore
  }
}

function tryWsPort(port: number, stopped: () => boolean): Promise<WebSocket | null> {
  return new Promise((resolve) => {
    let settled = false
    let socket: WebSocket
    try {
      socket = new WebSocket(`ws://127.0.0.1:${port}`)
    } catch {
      resolve(null)
      return
    }
    const done = (value: WebSocket | null) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      if (value !== socket) closeSocket(socket)
      resolve(value)
    }
    const timer = window.setTimeout(() => done(null), APP_WS_PROBE_MS)
    socket.addEventListener('open', () => {
      if (stopped()) {
        done(null)
        return
      }
      socket.send(JSON.stringify({ type: 'hello', appId: APP_ID }))
    })
    socket.addEventListener('message', (event) => {
      let msg: { type?: string }
      try {
        msg = JSON.parse(String(event.data)) as { type?: string }
      } catch {
        return
      }
      if (msg.type === 'hello-ok') {
        done(socket)
        return
      }
      if (msg.type === 'hello-reject') done(null)
    })
    socket.addEventListener('error', () => done(null))
    socket.addEventListener('close', () => done(null))
  })
}

function host() {
  return window.jiaorong
}

/**
 * 从 8787 起找一条已握手的页面 WebSocket。找不到返回 null。
 * @param stopped 页面已卸载则停止探测
 */
export async function findPageSocket(stopped: () => boolean): Promise<WebSocket | null> {
  if (stopped()) return null
  const ports = listProbePorts(APP_PORT_START, APP_PORT_TRIES, readLastPort())
  return new Promise((resolve) => {
    let settled = false
    let remaining = ports.length
    const extras: WebSocket[] = []
    const finish = (socket: WebSocket | null, port?: number) => {
      if (settled) {
        if (socket) closeSocket(socket)
        return
      }
      settled = true
      for (const extra of extras) {
        if (extra !== socket) closeSocket(extra)
      }
      if (socket && port != null) writeLastPort(port)
      resolve(socket)
    }
    for (const port of ports) {
      void tryWsPort(port, stopped).then((socket) => {
        if (socket) {
          extras.push(socket)
          finish(socket, port)
          return
        }
        remaining -= 1
        if (remaining === 0) finish(null)
      })
    }
  })
}

/**
 * 处理后端发来的 invoke，转给注入的 window.jiaorong。页面业务不要调这个对象。
 * @param socket 已握手的连接
 */
export function bindInvoke(socket: WebSocket): () => void {
  const offs: Array<() => void> = []
  const jr = host()
  if (jr?.on) {
    for (const event of RELAY_EVENTS) {
      offs.push(
        jr.on(event, (payload: unknown) => {
          if (socket.readyState !== WebSocket.OPEN) return
          socket.send(JSON.stringify({ type: 'event', event, payload }))
        })
      )
    }
  }
  const onMessage = async (event: MessageEvent) => {
    let msg: { type?: string; id?: string; method?: string; args?: unknown }
    try {
      msg = JSON.parse(String(event.data)) as typeof msg
    } catch {
      return
    }
    if (msg.type !== 'invoke' || typeof msg.id !== 'string' || typeof msg.method !== 'string') {
      return
    }
    try {
      const invoke = host()?.invoke
      if (!invoke) {
        throw { code: 'NOT_IN_JIAORONG', message: 'window.jiaorong 不存在' }
      }
      const result = await invoke(msg.method, msg.args ?? {})
      socket.send(JSON.stringify({ type: 'invoke:ok', id: msg.id, result }))
    } catch (error) {
      const record = error && typeof error === 'object' ? (error as Record<string, unknown>) : {}
      const message =
        typeof record.message === 'string' && record.message.trim()
          ? record.message
          : error instanceof Error
            ? error.message
            : '请求失败'
      socket.send(
        JSON.stringify({
          type: 'invoke:err',
          id: msg.id,
          error: {
            code: typeof record.code === 'string' ? record.code : 'GENERATION_FAILED',
            message
          }
        })
      )
    }
  }
  socket.addEventListener('message', onMessage)
  return () => {
    socket.removeEventListener('message', onMessage)
    for (const off of offs) off()
  }
}

/**
 * 解析浏览器 File 的本地绝对路径。必须在本页调 preload，不能经 Node。
 * @param file 拖放或选择的文件
 */
export function getPathForFile(file: File) {
  try {
    return host()?.getPathForFile?.(file) || ''
  } catch {
    return ''
  }
}

/** 页面调 Node 的客户端：方法名映射到 WS `sdk` 请求。 */
export type NodeClient = {
  /** 调 Node 方法。 */
  invoke(method: string, args?: unknown): Promise<unknown>
  /** 订阅 Node 回推的宿主事件。 */
  on(event: string, handler: (payload: any) => void): () => void
  /** 通知 Node 断开。 */
  disconnect(): Promise<{ ok: true }>
  /** context.get */
  getContext(): Promise<{ appDir?: string; [key: string]: unknown }>
  /** userinfo.get */
  userinfo(): Promise<Record<string, unknown>>
  /** chat.respondToolInteraction */
  respondToolInteraction(input: unknown): Promise<unknown>
  /** agent.* */
  agent: Record<string, (input?: unknown) => Promise<any>>
  /** session.* */
  session: Record<string, (input?: unknown) => Promise<any>>
  /** catalog.* */
  catalog: Record<string, (input?: unknown) => Promise<any>>
  /** knowledgeBase.* */
  knowledgeBase: Record<string, (input?: unknown) => Promise<any>>
}

/** 当前页连上 Node 后的客户端；卸载或断线时清空。 */
let activeNodeClient: NodeClient | null = null

/**
 * 记下当前 Node 客户端，供顶栏调试和 chat-kit 经 Node 调宿主。
 * @param client 已握手的客户端；断线传 null
 */
export function setActiveNodeClient(client: NodeClient | null) {
  activeNodeClient = client
}

/** 当前页连上的 Node 客户端；未连接为 null。 */
export function getActiveNodeClient() {
  return activeNodeClient
}

/**
 * 经 Node 调宿主方法。File 不能过 WS，路径解析用 {@link getPathForFile}。
 * @param method 如 session.send、dialog.selectFiles
 * @param args 入参
 */
export function invokeViaNode(method: string, args?: unknown) {
  if (!activeNodeClient) {
    return Promise.reject(
      Object.assign(new Error('页面未连接应用后端'), { code: 'JIAORONG_NOT_RUNNING' })
    )
  }
  return activeNodeClient.invoke(method, args)
}

/**
 * 把已握手的 WS 收成对话页用的 Node 客户端。
 * @param socket 与包内后端的连接
 */
export function createNodeClient(socket: WebSocket): NodeClient {
  const pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: unknown) => void }
  >()
  const listeners = new Map<string, Set<(payload: any) => void>>()

  const onMessage = (event: MessageEvent) => {
    let msg: {
      type?: string
      id?: string
      event?: string
      payload?: unknown
      result?: unknown
      error?: unknown
    }
    try {
      msg = JSON.parse(String(event.data)) as typeof msg
    } catch {
      return
    }
    if (msg.type === 'sdk:ok' || msg.type === 'sdk:err') {
      if (typeof msg.id !== 'string') return
      const waiter = pending.get(msg.id)
      pending.delete(msg.id)
      if (!waiter) return
      if (msg.type === 'sdk:ok') waiter.resolve(msg.result)
      else waiter.reject(msg.error ?? { code: 'GENERATION_FAILED', message: '请求失败' })
      return
    }
    if (msg.type === 'event' && typeof msg.event === 'string') {
      const handlers = listeners.get(msg.event)
      if (!handlers) return
      for (const handler of handlers) handler(msg.payload)
    }
  }
  socket.addEventListener('message', onMessage)

  const invoke = (method: string, args?: unknown) => {
    if (socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(
        Object.assign(new Error('页面未连接 Node'), { code: 'JIAORONG_NOT_RUNNING' })
      )
    }
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ type: 'sdk', id, method, args: args ?? {} }))
    })
  }

  const nest = (prefix: string) =>
    new Proxy(
      {},
      {
        get(_target, key) {
          if (typeof key !== 'string' || key === 'then') return undefined
          return (input?: unknown) => invoke(`${prefix}.${key}`, input)
        }
      }
    )

  return {
    invoke,
    on(event, handler) {
      let set = listeners.get(event)
      if (!set) {
        set = new Set()
        listeners.set(event, set)
      }
      set.add(handler)
      return () => {
        set.delete(handler)
        if (set.size === 0) listeners.delete(event)
      }
    },
    disconnect() {
      return invoke('disconnect', {}) as Promise<{ ok: true }>
    },
    getContext() {
      return invoke('context.get', {}) as Promise<{ appDir?: string; [key: string]: unknown }>
    },
    userinfo() {
      return invoke('userinfo.get', {}) as Promise<Record<string, unknown>>
    },
    respondToolInteraction(input) {
      return invoke('chat.respondToolInteraction', input)
    },
    agent: nest('agent'),
    session: nest('session'),
    catalog: nest('catalog'),
    knowledgeBase: nest('knowledgeBase')
  }
}
