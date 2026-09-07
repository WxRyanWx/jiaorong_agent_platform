import { resolveNodeBridge, resolveWebBridge } from './bridge'
import { createClient, type JiaorongClient } from './client'
import { JiaorongError } from './errors'
import { createHttpBridge } from './http'

export type JiaorongRuntime = 'web' | 'node' | 'http'

export type ConnectOptions = {
  appId: string
  runtime?: JiaorongRuntime
  /** `runtime: 'http'` 时必填，例如 `http://127.0.0.1:8787`。 */
  httpBase?: string
  timeoutMs?: number
}

const APP_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const sharedClients = new Map<string, JiaorongClient>()
const clientRefs = new Map<string, number>()
const inflight = new Map<string, Promise<JiaorongClient>>()

export function isJiaorongWeb() {
  return Boolean(resolveWebBridge())
}

export function isJiaorongNode() {
  return Boolean(resolveNodeBridge())
}

function createHolder(cacheKey: string, shared: JiaorongClient): JiaorongClient {
  const offs: Array<() => void> = []
  const waiters = new Set<(error: JiaorongError) => void>()
  return {
    ...shared,
    on(event, handler) {
      const off = shared.on(event, handler)
      offs.push(off)
      return () => {
        off()
        const index = offs.indexOf(off)
        if (index >= 0) offs.splice(index, 1)
      }
    },
    off(event, handler) {
      shared.off(event, handler)
    },
    once(event, handler) {
      const off = shared.once(event, handler)
      offs.push(off)
      return () => {
        off()
        const index = offs.indexOf(off)
        if (index >= 0) offs.splice(index, 1)
      }
    },
    waitForTurn(input) {
      return new Promise((resolve, reject) => {
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
      for (const off of offs) off()
      offs.length = 0
      for (const rejectWaiter of waiters) {
        rejectWaiter(new JiaorongError('DISCONNECTED', '连接已断开，已取消等待本轮结束'))
      }
      waiters.clear()
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

function retainShared(cacheKey: string, shared: JiaorongClient): JiaorongClient {
  clientRefs.set(cacheKey, (clientRefs.get(cacheKey) ?? 0) + 1)
  return createHolder(cacheKey, shared)
}

function openSharedClient(
  cacheKey: string,
  runtime: JiaorongRuntime,
  appId: string,
  timeoutMs?: number,
  httpBase?: string
): JiaorongClient {
  if (runtime === 'http') {
    const base = httpBase?.trim()
    if (!base) {
      throw new JiaorongError('VALIDATION_ERROR', 'runtime 为 http 时必须提供 httpBase')
    }
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
    const bridge = resolveNodeBridge()
    if (!bridge) {
      throw new JiaorongError(
        'JIAORONG_NOT_RUNNING',
        'Node 运行时未由交融宿主注入。请在 app.json 声明 node，并从侧栏打开本应用。'
      )
    }
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

  const bridge = resolveWebBridge()
  if (!bridge) {
    throw new JiaorongError(
      'NOT_IN_JIAORONG',
      'window.jiaorong 不存在。请从交融侧栏打开本应用。'
    )
  }
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

export async function connect(opts: ConnectOptions): Promise<JiaorongClient> {
  const appId = opts.appId?.trim()
  if (!appId) {
    throw new JiaorongError('VALIDATION_ERROR', '需要提供 appId')
  }
  if (!APP_ID_RE.test(appId)) {
    throw new JiaorongError(
      'VALIDATION_ERROR',
      'appId 只能包含小写字母、数字和连字符'
    )
  }

  const runtime = opts.runtime ?? 'web'
  if (runtime !== 'web' && runtime !== 'node' && runtime !== 'http') {
    throw new JiaorongError('VALIDATION_ERROR', 'runtime 必须是 web、node 或 http')
  }

  const httpBase = opts.httpBase?.trim()
  const cacheKey = runtime === 'http' ? `http:${appId}:${httpBase ?? ''}` : `${runtime}:${appId}`
  const existing = sharedClients.get(cacheKey)
  if (existing) return retainShared(cacheKey, existing)

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
  const shared = await pending
  return retainShared(cacheKey, shared)
}
