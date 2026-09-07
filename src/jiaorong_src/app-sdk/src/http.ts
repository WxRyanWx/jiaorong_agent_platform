import { JiaorongError, toJiaorongError } from './errors'
import type { JiaorongHostBridge } from './bridge'
import type { JiaorongUserInfo } from './types'

type HttpSdkResult = {
  ok?: boolean
  code?: string
  message?: string
  data?: unknown
}

type SharedSse = {
  source: EventSource
  listeners: Map<string, Set<(payload: unknown) => void>>
  refCount: number
}

const sseByBase = new Map<string, SharedSse>()

function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

async function httpInvoke(baseUrl: string, method: string, args?: unknown): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(`${baseUrl}/api/sdk`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, args: args ?? {} })
    })
  } catch (error) {
    throw new JiaorongError(
      'JIAORONG_NOT_RUNNING',
      error instanceof Error ? error.message : '无法连接 Node 服务'
    )
  }

  let body: HttpSdkResult | null = null
  try {
    body = (await res.json()) as HttpSdkResult
  } catch {
    body = null
  }

  if (!res.ok || body?.ok === false) {
    throw toJiaorongError({
      code: body?.code || 'GENERATION_FAILED',
      message: body?.message || `HTTP 请求失败（${res.status}）`
    })
  }
  return body?.data
}

function retainSse(baseUrl: string): SharedSse {
  const existing = sseByBase.get(baseUrl)
  if (existing) {
    existing.refCount += 1
    return existing
  }

  const listeners = new Map<string, Set<(payload: unknown) => void>>()
  const source = new EventSource(`${baseUrl}/api/events`)
  const shared: SharedSse = { source, listeners, refCount: 1 }
  source.onmessage = (event) => {
    let parsed: { event?: string; payload?: unknown } | null = null
    try {
      parsed = JSON.parse(event.data) as { event?: string; payload?: unknown }
    } catch {
      return
    }
    if (!parsed?.event) return
    const handlers = listeners.get(parsed.event)
    if (!handlers) return
    for (const handler of handlers) handler(parsed.payload)
  }
  source.addEventListener('sdk', (event) => {
    let parsed: { event?: string; payload?: unknown } | null = null
    try {
      parsed = JSON.parse((event as MessageEvent).data) as { event?: string; payload?: unknown }
    } catch {
      return
    }
    if (!parsed?.event) return
    const handlers = listeners.get(parsed.event)
    if (!handlers) return
    for (const handler of handlers) handler(parsed.payload)
  })
  sseByBase.set(baseUrl, shared)
  return shared
}

function releaseSse(baseUrl: string): void {
  const shared = sseByBase.get(baseUrl)
  if (!shared) return
  shared.refCount -= 1
  if (shared.refCount > 0) return
  shared.source.close()
  sseByBase.delete(baseUrl)
}

export function createHttpBridge(baseUrl: string): JiaorongHostBridge {
  const base = trimBase(baseUrl)
  if (!base) {
    throw new JiaorongError('VALIDATION_ERROR', '需要提供 httpBase')
  }

  return {
    invoke(method, args) {
      return httpInvoke(base, method, args)
    },
    on(event, handler) {
      const shared = retainSse(base)
      let set = shared.listeners.get(event)
      if (!set) {
        set = new Set()
        shared.listeners.set(event, set)
      }
      set.add(handler)
      let released = false
      return () => {
        if (released) return
        released = true
        set.delete(handler)
        if (set.size === 0) shared.listeners.delete(event)
        releaseSse(base)
      }
    },
    userinfo() {
      return httpInvoke(base, 'userinfo.get', {}) as Promise<JiaorongUserInfo>
    }
  }
}
