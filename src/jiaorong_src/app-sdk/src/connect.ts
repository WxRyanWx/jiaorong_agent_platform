/** 连接宿主：web / node / http 三种 runtime，同 appId 共享一份底层 client。 */

import { resolveNodeBridge, resolveWebBridge } from './bridge'
import { createClient, type JiaorongClient } from './client'
import { JiaorongError } from './errors'
import { createHttpBridge } from './http'

/** 连接运行时：web / node / http。 */
export type JiaorongRuntime = 'web' | 'node' | 'http'

/** connect 选项。 */
export type ConnectOptions = {
  /** 当前应用 id。 */
  appId: string
  /** 当前应用运行时。 */
  runtime?: JiaorongRuntime
  /** `runtime: 'http'` 时必填，例如 `http://127.0.0.1:8787`。 */
  httpBase?: string
  /** 超时毫秒。 */
  timeoutMs?: number
}

/** 应用 id 合法格式。 */
const APP_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
/** 底层共享 client。 */
const sharedClients = new Map<string, JiaorongClient>()
/** 共享 client 引用计数。 */
const clientRefs = new Map<string, number>()
/** 正在建立的连接，避免并发重复 connect。 */
const inflight = new Map<string, Promise<JiaorongClient>>()

/** 是否在交融 webview 里。 */
export function isJiaorongWeb() {
  return Boolean(resolveWebBridge())
}

/** 是否在交融注入的 Node 里。 */
export function isJiaorongNode() {
  return Boolean(resolveNodeBridge())
}

/** 包一层共享 client，disconnect 只减引用。 */
function createHolder(cacheKey: string, shared: JiaorongClient): JiaorongClient {
  /** 取消订阅函数列表。 */
  const offs: Array<() => void> = []
  /** 等待断开的回调。 */
  const waiters = new Set<(error: JiaorongError) => void>()
  return {
    ...shared,
    on(event, handler) {
      /** once 的取消函数。 */
      const off = shared.on(event, handler)
      offs.push(off)
      return () => {
        off()
        /** 下标。 */
        const index = offs.indexOf(off)
        if (index >= 0) offs.splice(index, 1)
      }
    },
    off(event, handler) {
      shared.off(event, handler)
    },
    once(event, handler) {
      /** once 的取消函数。 */
      const off = shared.once(event, handler)
      offs.push(off)
      return () => {
        off()
        /** 下标。 */
        const index = offs.indexOf(off)
        if (index >= 0) offs.splice(index, 1)
      }
    },
    waitForTurn(input) {
      return new Promise((resolve, reject) => {
        /** 取消回调。 */
        const onCancel = (error: JiaorongError) => reject(error)
        waiters.add(onCancel)
        void shared.waitForTurn(input).then(
          (result) => {
            waiters.delete(onCancel)
            resolve(result)
          },
          (error) => {
            waiters.delete(onCancel)
            reject(error)
          }
        )
      })
    },
    async disconnect() {
      /** 一个取消订阅函数。 */
      for (const off of offs) off()
      offs.length = 0
      /** 一个断开等待回调。 */
      for (const rejectWaiter of waiters) {
        rejectWaiter(new JiaorongError('DISCONNECTED', '连接已断开，已取消等待本轮结束'))
      }
      waiters.clear()
      /** 下一步值。 */
      const next = (clientRefs.get(cacheKey) ?? 1) - 1
      if (next > 0) {
        clientRefs.set(cacheKey, next)
        return { ok: true as const }
      }
      clientRefs.delete(cacheKey)
      sharedClients.delete(cacheKey)
      return shared.disconnect()
    }
  }
}

/** 增加共享连接引用计数。 */
function retainShared(cacheKey: string, shared: JiaorongClient): JiaorongClient {
  clientRefs.set(cacheKey, (clientRefs.get(cacheKey) ?? 0) + 1)
  return createHolder(cacheKey, shared)
}

/** 打开或复用共享 JiaorongClient。 */
function openSharedClient(
  cacheKey: string,
  runtime: JiaorongRuntime,
  appId: string,
  timeoutMs?: number,
  httpBase?: string
): JiaorongClient {
  if (runtime === 'http') {
    /** 根地址。 */
    const base = httpBase?.trim()
    if (!base) {
      throw new JiaorongError('VALIDATION_ERROR', 'runtime 为 http 时必须提供 httpBase')
    }
    /** JiaorongClient 或桥客户端。 */
    const client = createClient(createHttpBridge(base), appId, {
      timeoutMs,
      onDisconnect: () => {
        sharedClients.delete(cacheKey)
        clientRefs.delete(cacheKey)
      }
    })
    sharedClients.set(cacheKey, client)
    return client
  }

  if (runtime === 'node') {
    /** 宿主桥。 */
    const bridge = resolveNodeBridge()
    if (!bridge) {
      throw new JiaorongError(
        'JIAORONG_NOT_RUNNING',
        '交融客户端未注入 Node 连接。请先启动并登录客户端；从侧栏打开本应用，或在应用已安装后于本机执行 node server.js。'
      )
    }
    /** JiaorongClient 或桥客户端。 */
    const client = createClient(bridge, appId, {
      timeoutMs,
      onDisconnect: () => {
        sharedClients.delete(cacheKey)
        clientRefs.delete(cacheKey)
      }
    })
    sharedClients.set(cacheKey, client)
    return client
  }

  /** 宿主桥。 */
  const bridge = resolveWebBridge()
  if (!bridge) {
    throw new JiaorongError('NOT_IN_JIAORONG', 'window.jiaorong 不存在。请从交融侧栏打开本应用。')
  }
  /** JiaorongClient 或桥客户端。 */
  const client = createClient(bridge, appId, {
    timeoutMs,
    onDisconnect: () => {
      sharedClients.delete(cacheKey)
      clientRefs.delete(cacheKey)
    }
  })
  sharedClients.set(cacheKey, client)
  return client
}

/**
 * 建立 SDK 连接。页面默认 `runtime: 'web'`，Node 必须 `'node'`。
 * @param opts appId 必填
 */
export async function connect(opts: ConnectOptions): Promise<JiaorongClient> {
  /** 当前应用 id。 */
  const appId = opts.appId?.trim()
  if (!appId) {
    throw new JiaorongError('VALIDATION_ERROR', '需要提供 appId')
  }
  if (!APP_ID_RE.test(appId)) {
    throw new JiaorongError('VALIDATION_ERROR', 'appId 只能包含小写字母、数字和连字符')
  }

  /** 当前应用运行时。 */
  const runtime = opts.runtime ?? 'web'
  if (runtime !== 'web' && runtime !== 'node' && runtime !== 'http') {
    throw new JiaorongError('VALIDATION_ERROR', 'runtime 必须是 web、node 或 http')
  }

  /** HTTP SDK 根。 */
  const httpBase = opts.httpBase?.trim()
  /** 缓存键。 */
  const cacheKey = runtime === 'http' ? `http:${appId}:${httpBase ?? ''}` : `${runtime}:${appId}`
  /** 已有记录。 */
  const existing = sharedClients.get(cacheKey)
  if (existing) return retainShared(cacheKey, existing)

  /** 待处理项。 */
  let pending = inflight.get(cacheKey)
  if (!pending) {
    pending = Promise.resolve().then(() =>
      openSharedClient(cacheKey, runtime, appId, opts.timeoutMs, httpBase)
    )
    inflight.set(cacheKey, pending)
    void pending.finally(() => {
      if (inflight.get(cacheKey) === pending) inflight.delete(cacheKey)
    })
  }
  /** 共享的 JiaorongClient。 */
  const shared = await pending
  return retainShared(cacheKey, shared)
}
