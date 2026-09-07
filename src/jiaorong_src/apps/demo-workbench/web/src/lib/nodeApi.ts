/**
 * 前端调本机 Egg 的薄封装。
 * 对话请求走 HTTP。地址来自 connect() 之后的 getContext().nodeBase。
 */
import { connect, type JiaorongClient } from 'jiaorong-app-sdk'
import { APP_ID } from '../constants'

type SdkResult<T> = {
  ok?: boolean
  code?: string
  message?: string
  data?: T
}

type NodeBaseChange = 'updated' | 'cleared' | 'unchanged'

let nodeBase = ''
let client: JiaorongClient | null = null
const nodeBaseListeners = new Set<(change: Exclude<NodeBaseChange, 'unchanged'>) => void>()

function notRunning(message: string): Error {
  const error = new Error(message)
  ;(error as Error & { code?: string }).code = 'JIAORONG_NOT_RUNNING'
  return error
}

export function getNodeBase(): string {
  return nodeBase
}

export function onNodeBaseChange(
  handler: (change: Exclude<NodeBaseChange, 'unchanged'>) => void
): () => void {
  nodeBaseListeners.add(handler)
  return () => {
    nodeBaseListeners.delete(handler)
  }
}

export function applyHostNodeBase(raw: unknown): NodeBaseChange {
  const ctx = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const next =
    typeof ctx.nodeBase === 'string' && ctx.nodeBase.trim()
      ? ctx.nodeBase.trim().replace(/\/+$/, '')
      : typeof ctx.nodePort === 'number' && ctx.nodePort > 0
        ? `http://127.0.0.1:${Math.floor(ctx.nodePort)}`
        : ''
  if (!next) {
    if (!nodeBase) return 'unchanged'
    nodeBase = ''
    for (const handler of nodeBaseListeners) handler('cleared')
    return 'cleared'
  }
  if (next === nodeBase) return 'unchanged'
  nodeBase = next
  for (const handler of nodeBaseListeners) handler('updated')
  return 'updated'
}

/** 挂载 SDK 后读宿主选好的 Node 地址。还没 listen 完就抛 JIAORONG_NOT_RUNNING。 */
export async function resolveNodeBaseFromHost(): Promise<string> {
  if (!client) {
    client = await connect({ appId: APP_ID })
    client.on('context', (payload) => {
      applyHostNodeBase(payload)
    })
  }
  const ctx = await client.getContext()
  if (applyHostNodeBase(ctx) === 'cleared' || !nodeBase) {
    throw notRunning('Node 服务尚未就绪')
  }
  return nodeBase
}

export async function disconnectNodeHost(): Promise<void> {
  const current = client
  client = null
  nodeBase = ''
  await current?.disconnect()
}

export async function invokeSdk<T>(method: string, args?: unknown): Promise<T> {
  if (!nodeBase) throw notRunning('Node 服务尚未就绪')
  let res: Response
  try {
    res = await fetch(`${nodeBase}/api/sdk`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, args: args ?? {} })
    })
  } catch {
    throw notRunning('无法连接 Node 服务')
  }

  let body: SdkResult<T> | null = null
  try {
    body = (await res.json()) as SdkResult<T>
  } catch {
    body = null
  }
  if (!res.ok || body?.ok === false) {
    const error = new Error(body?.message || `HTTP 请求失败（${res.status}）`)
    ;(error as Error & { code?: string }).code = body?.code || 'GENERATION_FAILED'
    throw error
  }
  return body?.data as T
}

export function openSdkEvents(onEvent: (event: string, payload: unknown) => void): () => void {
  if (!nodeBase) return () => {}
  const source = new EventSource(`${nodeBase}/api/events`)

  const handle = (event: Event) => {
    try {
      const parsed = JSON.parse((event as MessageEvent).data) as {
        event?: string
        payload?: unknown
      }
      if (parsed.event) onEvent(parsed.event, parsed.payload)
    } catch {
      // 忽略半包或心跳
    }
  }

  source.addEventListener('sdk', handle)
  source.onmessage = handle
  return () => source.close()
}
