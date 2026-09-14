/** HTTP 桥：页面 POST `/api/sdk`，SSE `/api/events`，由应用 Node 再调宿主 SDK。 */

import { JiaorongError, toJiaorongError } from './errors'
import type { JiaorongHostBridge } from './bridge'
import type { JiaorongUserInfo } from './types'

/** HTTP SDK 通用出参。 */
type HttpSdkResult = {
  /** 是否成功。 */
  ok?: boolean
  /** 错误码。 */
  code?: string
  /** 消息或文案。 */
  message?: string
  /** 业务数据。 */
  data?: unknown
}

/** 共享 SSE 连接。 */
type SharedSse = {
  /** 来源。 */
  source: EventSource
  /** 监听回调。 */
  listeners: Map<string, Set<(payload: unknown) => void>>
  /** 引用计数。 */
  refCount: number
}

/** 按 base URL 缓存的 SSE。 */
const sseByBase = new Map<string, SharedSse>()

/** 去掉 HTTP base 末尾斜杠。 */
function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

/** HTTP SDK 调宿主 method。 */
async function httpInvoke(baseUrl: string, method: string, args?: unknown): Promise<unknown> {
  /** HTTP 响应。 */
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

  /** 响应/请求体。 */
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

/** 占用一条共享 SSE。 */
function retainSse(baseUrl: string): SharedSse {
  /** 已有记录。 */
  const existing = sseByBase.get(baseUrl)
  if (existing) {
    existing.refCount += 1
    return existing
  }

  /** 监听回调。 */
  const listeners = new Map<string, Set<(payload: unknown) => void>>()
  /** 来源。 */
  const source = new EventSource(`${baseUrl}/api/events`)
  /** 共享的 JiaorongClient。 */
  const shared: SharedSse = { source, listeners, refCount: 1 }
  source.onmessage = (event) => {
    /** 解析结果。 */
    let parsed: { event?: string; payload?: unknown } | null = null
    try {
      parsed = JSON.parse(event.data) as { event?: string; payload?: unknown }
    } catch {
      return
    }
    if (!parsed?.event) return
    /** 事件回调。 */
    const handlers = listeners.get(parsed.event)
    if (!handlers) return
    /** 一条回调。 */
    for (const handler of handlers) handler(parsed.payload)
  }
  source.addEventListener('sdk', (event) => {
    /** 解析结果。 */
    let parsed: { event?: string; payload?: unknown } | null = null
    try {
      parsed = JSON.parse((event as MessageEvent).data) as { event?: string; payload?: unknown }
    } catch {
      return
    }
    if (!parsed?.event) return
    /** 事件回调。 */
    const handlers = listeners.get(parsed.event)
    if (!handlers) return
    /** 一条回调。 */
    for (const handler of handlers) handler(parsed.payload)
  })
  sseByBase.set(baseUrl, shared)
  return shared
}

/** 释放 SSE 引用。 */
function releaseSse(baseUrl: string): void {
  /** 共享的 JiaorongClient。 */
  const shared = sseByBase.get(baseUrl)
  if (!shared) return
  shared.refCount -= 1
  if (shared.refCount > 0) return
  shared.source.close()
  sseByBase.delete(baseUrl)
}

/**
 * 把应用 Node 的 HTTP/SSE 包成宿主桥，给 `connect({ runtime: 'http' })` 用。
 * @param baseUrl 如 `http://127.0.0.1:8787`
 */
export function createHttpBridge(baseUrl: string): JiaorongHostBridge {
  /** 根地址。 */
  const base = trimBase(baseUrl)
  if (!base) {
    throw new JiaorongError('VALIDATION_ERROR', '需要提供 httpBase')
  }

  return {
    invoke(method, args) {
      return httpInvoke(base, method, args)
    },
    on(event, handler) {
      /** 共享的 JiaorongClient。 */
      const shared = retainSse(base)
      /** 集合。 */
      let set = shared.listeners.get(event)
      if (!set) {
        set = new Set()
        shared.listeners.set(event, set)
      }
      set.add(handler)
      /** 是否已释放 SSE。 */
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
