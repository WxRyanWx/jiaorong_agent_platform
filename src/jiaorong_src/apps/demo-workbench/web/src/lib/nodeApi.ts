/**
 * 前端调本机 Egg 的薄封装。
 * HttpChatPage 只走这里，不要 import { connect } from 'jiaorong-app-sdk'。
 * 对话请求走 HTTP。地址只信宿主 context.nodeBase，不要写死端口。
 */

type SdkResult<T> = {
  ok?: boolean
  code?: string
  message?: string
  data?: T
}

let nodeBase = ''

function notRunning(message: string): Error {
  const error = new Error(message)
  ;(error as Error & { code?: string }).code = 'JIAORONG_NOT_RUNNING'
  return error
}

export function getNodeBase(): string {
  return nodeBase
}

export function setNodeBase(next: string): void {
  const value = next.trim().replace(/\/+$/, '')
  if (value) nodeBase = value
}

export function clearNodeBase(): void {
  nodeBase = ''
}

/** 宿主推下来的实际口。换账号或 Node 重启后端口会变。 */
export function applyHostNodeBase(raw: unknown): 'updated' | 'cleared' | 'unchanged' {
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
    return 'cleared'
  }
  if (next === nodeBase) return 'unchanged'
  nodeBase = next
  return 'updated'
}

/** 宿主已选好的实际口。还没下发就抛 JIAORONG_NOT_RUNNING，让 boot 重试。 */
export async function resolveNodeBaseFromHost(): Promise<string> {
  const jr = window.jiaorong
  if (!jr?.invoke) throw notRunning('window.jiaorong 不存在')
  const raw = await jr.invoke('context.get', {})
  if (applyHostNodeBase(raw) === 'cleared' || !nodeBase) {
    throw notRunning('Node 服务尚未就绪')
  }
  return nodeBase
}

/** POST /api/sdk → Node 调 SDK，原样返回 data。 */
export async function invokeSdk<T>(method: string, args?: unknown): Promise<T> {
  if (!nodeBase) throw notRunning('Node 服务尚未就绪')
  let res: Response
  try {
    res = await fetch(`${nodeBase}/api/sdk`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, args: args ?? {} })
    })
  } catch (error) {
    const next = new Error(error instanceof Error ? error.message : '无法连接 Node 服务')
    ;(next as Error & { code?: string }).code = 'JIAORONG_NOT_RUNNING'
    throw next
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

/**
 * GET /api/events。Node 推 event: sdk。
 * 同时听 unnamed message，避免代理把自定义事件名吃掉。
 */
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
