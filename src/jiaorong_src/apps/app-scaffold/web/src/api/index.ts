/**
 * 脚手架 ↔ 包内 Node。页面 window.initRendererBridge(port) 给 Node 调 jiaorong；业务走 HTTP /rpc。
 */

export type NodeClient = {
  invoke(method: string, args?: unknown): Promise<unknown>
  on(event: string, handler: (payload: any) => void): () => void
  disconnect(): Promise<{ ok: true }>
  getContext(): Promise<{ appDir?: string; [key: string]: unknown }>
  userinfo(): Promise<Record<string, unknown>>
  respondToolInteraction(input: unknown): Promise<unknown>
  agent: Record<string, (input?: unknown) => Promise<any>>
  session: Record<string, (input?: unknown) => Promise<any>>
  catalog: Record<string, (input?: unknown) => Promise<any>>
  knowledgeBase: Record<string, (input?: unknown) => Promise<any>>
}

let active: NodeClient | null = null

/** 连 Node WS，让后端可以 request 本页 jiaorong / 自定义方法。 */
export function startRendererBridge(port: number, apisCustom?: any) {
  if (typeof window.initRendererBridge !== 'function') {
    return Promise.reject(new Error('window.initRendererBridge 不存在'))
  }
  return Promise.resolve(window.initRendererBridge(port, apisCustom))
}

/** File 只能在本页解析成本机路径。 */
export function getPathForFile(file: File) {
  try {
    return window.jiaorong?.getPathForFile?.(file) || ''
  } catch {
    return ''
  }
}

export function setActiveNodeClient(client: NodeClient | null) {
  active = client
}

export function invokeViaNode(method: string, args?: unknown) {
  if (!active) {
    return Promise.reject(
      Object.assign(new Error('页面未连接应用后端'), { code: 'JIAORONG_NOT_RUNNING' })
    )
  }
  return active.invoke(method, args)
}

function nest(invoke: (method: string, args?: unknown) => Promise<unknown>, prefix: string) {
  return new Proxy(function (input?: unknown) {
    return invoke(prefix, input)
  }, {
    get(_t, key) {
      if (typeof key !== 'string' || key === 'then') return undefined
      return nest(invoke, prefix ? `${prefix}.${key}` : key)
    }
  }) as Record<string, (input?: unknown) => Promise<any>>
}

export function createNodeClient(port: number): NodeClient {
  const invoke = async (method: string, args?: unknown) => {
    const res = await fetch(`http://127.0.0.1:${port}/rpc`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method, args: args ?? {} })
    })
    const json = (await res.json()) as {
      ok?: boolean
      data?: unknown
      error?: { code?: string; message?: string }
    }
    if (!json?.ok) {
      const error = json?.error
      throw Object.assign(new Error(error?.message || '请求失败'), {
        code: error?.code || 'GENERATION_FAILED'
      })
    }
    return json.data
  }
  const sa = nest(invoke, '')
  return {
    invoke,
    on(event, handler) {
      return window.jiaorong?.on?.(event, handler) ?? (() => undefined)
    },
    disconnect: () => invoke('disconnect', {}) as Promise<{ ok: true }>,
    getContext: () => invoke('context.get', {}) as Promise<{ appDir?: string; [key: string]: unknown }>,
    userinfo: () => invoke('userinfo.get', {}) as Promise<Record<string, unknown>>,
    respondToolInteraction: (input: unknown) => invoke('chat.respondToolInteraction', input),
    agent: sa.agent,
    session: sa.session,
    catalog: sa.catalog,
    knowledgeBase: sa.knowledgeBase
  }
}

export function hostArgs(appId?: string) {
  const resolvedAppId = appId?.trim() || resolveHostAppId()
  return resolvedAppId ? { appId: resolvedAppId } : {}
}

export function resolveHostAppId(explicit?: string): string {
  if (explicit?.trim()) return explicit.trim()
  try {
    const url = new URL(window.location.href)
    if (url.protocol === 'jiaorong-app:') return url.hostname.trim()
    return url.searchParams.get('jiaorongAppId')?.trim() || ''
  } catch {
    return ''
  }
}

export function rememberDroppedFiles(paths: string[], appId?: string) {
  return invokeViaNode('dialog.rememberDroppedFiles', { ...hostArgs(appId), files: paths })
}

export function selectFiles(appId?: string) {
  return invokeViaNode('dialog.selectFiles', hostArgs(appId))
}

export function readFilePreview(path: string, appId?: string) {
  return invokeViaNode('dialog.readFilePreview', { ...hostArgs(appId), path })
}

export function queryKnowledgeBase(
  method: 'knowledgeBase.query' | 'knowledgeBase.queryDirectory',
  args: Record<string, unknown>
) {
  return invokeViaNode(method, args)
}

export function capturePageArea(rect: { x: number; y: number; width: number; height: number }) {
  return invokeViaNode('capture.pageArea', rect)
}

export function writeClipboardImage(pngBase64: string) {
  return invokeViaNode('clipboard.writeImage', { pngBase64 })
}

export function openDevtools() {
  return invokeViaNode('devtools.open')
}
